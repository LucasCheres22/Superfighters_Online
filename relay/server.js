// Relay do ONLINE (Superfighters): salas por codigo com ate 8 jogadores. Nao simula o jogo: so repassa mensagens.
// Vagas (seat): 0 = anfitriao; convidados entram nas vagas 1..7 na ordem de chegada.
// Cada mensagem recebida ganha o campo "from" (vaga de quem mandou). Se a mensagem tiver "to" (inteiro 0..7), vai so pra essa vaga;
// senao vai pra todos os outros da sala. Mensagens "sys" vem so do servidor (clientes nao conseguem forjar).
// Rodar local:  npm install  ;  node server.js        (porta: PORT, padrao 8787)
// Rodar no Render / atras do ngrok: ver render.yaml e docs/03_COOP_ONLINE.md.
//
// ENDURECIMENTO (qualquer pessoa na internet pode abrir um WebSocket aqui, entao nada do que chega e confiavel):
//  - nunca derruba o processo por causa de um cliente (erro de socket, URL invalida, mensagem grande, JSON ruim);
//  - Origin: navegadores so conectam a partir de sites permitidos (o do jogo e localhost);
//  - limites por IP: conexoes simultaneas, conexoes por minuto, salas criadas, tentativas de entrar em sala que nao existe;
//  - limite de taxa e de bytes por conexao (token bucket) + expulsao de quem insiste em inundar;
//  - so tipos de mensagem conhecidos e com formato valido; "start" e "lobby" so valem se vierem do anfitriao;
//  - sala travada durante a partida (ninguem entra no meio do lockstep);
//  - pagina de saude nao revela nada.
// Variaveis de ambiente (opcionais): PORT, ALLOWED_ORIGINS (lista separada por virgula), TRUST_PROXY_HOPS (padrao 1),
// MAX_ROOMS, MAX_CONN_PER_IP, MAX_ROOMS_PER_IP.
"use strict";
var http = require("http");
var WebSocket = require("ws");

function envInt(name, def) { var v = parseInt(process.env[name], 10); return isFinite(v) && v >= 0 ? v : def; }
var PORT = envInt("PORT", 8787);
var MAX_MSG = 8 * 1024;                     // maior mensagem aceita (o maior caso real e o "start" com 8 jogadores, ~1.5 KB)
var MAX_SEATS = 8;
var MAX_ROOMS = envInt("MAX_ROOMS", 200);
var MAX_CONN_PER_IP = envInt("MAX_CONN_PER_IP", 16);     // 8 jogadores na mesma casa cabem folgado
var MAX_ROOMS_PER_IP = envInt("MAX_ROOMS_PER_IP", 4);
var CONN_PER_MIN_PER_IP = 90;               // conexoes novas por minuto por IP
var JOIN_FAILS_BEFORE_BAN = 12;             // tentativas de entrar em sala inexistente/cheia/travada por minuto antes do bloqueio
var BAN_MS = 5 * 60 * 1000;
var TRUST_PROXY_HOPS = envInt("TRUST_PROXY_HOPS", 1); // quantos proxies (ngrok/Render) ficam na frente; 0 = nenhum
var RL_MSG_RATE = 150, RL_MSG_BURST = 300;  // mensagens por segundo / rajada por conexao (o jogo manda ~62/s)
var RL_BYTE_RATE = 32 * 1024, RL_BYTE_BURST = 128 * 1024;
var RL_STRIKES = 200;                       // infracoes de taxa numa janela de 10 s antes de derrubar a conexao
var IDLE_MS = 5 * 60 * 1000;                // conexao sem nenhuma mensagem por 5 min e encerrada (o cliente manda ping a cada 2 s)

var rooms = new Map();                      // codigo -> { host: ws, seats: [ws|null x8], locked: bool, ip: string }
var ips = new Map();                        // ip -> { conns, rooms, stamps: [ms], fails: [ms], banUntil }

// Origens de navegador permitidas: o site do jogo na Vercel, localhost e o que vier em ALLOWED_ORIGINS.
var EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
var ORIGIN_RES = [/^https:\/\/superfighters[a-z0-9-]*\.vercel\.app$/, /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/];
function originOk(origin) {
  if (!origin) return true; // cliente que nao e navegador (testes, curl): nao manda Origin; os limites por IP protegem do resto
  origin = String(origin).toLowerCase();
  if (EXTRA_ORIGINS.indexOf(origin) >= 0) return true;
  return ORIGIN_RES.some(function (re) { return re.test(origin); });
}

function clientIp(req) {
  var xff = req.headers["x-forwarded-for"];
  if (TRUST_PROXY_HOPS > 0 && xff) {
    var parts = String(xff).split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    var i = parts.length - TRUST_PROXY_HOPS; // o proxy de confianca ACRESCENTA o IP real no fim; o comeco da lista o cliente pode forjar
    if (i >= 0 && parts[i]) return parts[i].slice(0, 64);
  }
  return String(req.socket.remoteAddress || "?");
}
function ipInfo(ip) { var r = ips.get(ip); if (!r) { r = { conns: 0, rooms: 0, stamps: [], fails: [], banUntil: 0 }; ips.set(ip, r); } return r; }
function prune(arr, now, windowMs) { while (arr.length && now - arr[0] > windowMs) arr.shift(); }
function noteJoinFail(ip) { var r = ipInfo(ip), now = Date.now(); r.fails.push(now); prune(r.fails, now, 60000); if (r.fails.length >= JOIN_FAILS_BEFORE_BAN) r.banUntil = now + BAN_MS; }
// limpa registros de IPs sem atividade (evita crescer sem limite)
setInterval(function () {
  var now = Date.now();
  ips.forEach(function (r, ip) { prune(r.stamps, now, 60000); prune(r.fails, now, 60000); if (!r.conns && !r.rooms && !r.stamps.length && !r.fails.length && now > r.banUntil) ips.delete(ip); });
}, 60000).unref();

// HTTP simples: health check do Render e teste manual no navegador. Nao revela nada sobre as salas.
var server = http.createServer(function (req, res) {
  var ok = req.url === "/" || req.url === "";
  res.writeHead(ok ? 200 : 404, { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff", "cache-control": "no-store" });
  res.end(ok ? "superfighters relay ok\n" : "nao encontrado\n");
});
server.on("clientError", function (err, socket) { try { socket.destroy(); } catch (e) {} });

var wss = new WebSocket.Server({
  server: server, maxPayload: MAX_MSG, perMessageDeflate: false,
  verifyClient: function (info, cb) {
    var ip = clientIp(info.req), r = ipInfo(ip), now = Date.now();
    if (!originOk(info.origin)) return cb(false, 403, "origem nao permitida");
    if (now < r.banUntil) return cb(false, 429, "bloqueado por excesso de tentativas");
    r.stamps.push(now); prune(r.stamps, now, 60000);
    if (r.stamps.length > CONN_PER_MIN_PER_IP) return cb(false, 429, "muitas conexoes");
    if (r.conns >= MAX_CONN_PER_IP) return cb(false, 429, "muitas conexoes abertas");
    info.req.sfIp = ip;
    cb(true);
  }
});
wss.on("error", function (e) { console.error("wss erro:", e && e.message); });

function open(ws) { return ws && ws.readyState === WebSocket.OPEN; }
function sendRaw(ws, text) { try { if (open(ws)) ws.send(text); } catch (e) {} }
function sys(ws, ev, extra) { sendRaw(ws, JSON.stringify(Object.assign({ type: "sys", ev: ev }, extra || {}))); }
function occupiedSeats(room) { var out = []; room.seats.forEach(function (w, i) { if (w) out.push(i); }); return out; }
function eachPeer(room, fn) { room.seats.forEach(function (w, i) { if (w) fn(w, i); }); }
function closeNow(ws, code, why) { try { ws.close(code || 1000, why || ""); } catch (e) {} }
function isInt(v, lo, hi) { return typeof v === "number" && v % 1 === 0 && v >= lo && v <= hi; }

// formato de cada tipo de mensagem (so passa o que o jogo realmente usa). "host" = so o anfitriao pode mandar.
function validMsg(m) {
  if (!m || typeof m !== "object" || Array.isArray(m) || typeof m.type !== "string") return false;
  if (m.to !== undefined && !isInt(m.to, 0, MAX_SEATS - 1)) return false;
  switch (m.type) {
    case "input": return isInt(m.t, 0, 1e9) && m.k && typeof m.k === "object" && !Array.isArray(m.k);
    case "ping": case "pong": return typeof m.t === "number" && isFinite(m.t);
    case "hash": return isInt(m.t, 0, 1e9) && isInt(m.h, 0, 0xffffffff);
    case "pick": return isInt(m.char, 0, 31);
    case "lobby": return (m.phase === "lobby" || m.phase === "pick") && isInt(m.level, 0, 99) && isInt(m.kills, 0, 99999);
    case "start": return m.cfg && typeof m.cfg === "object" && isInt(m.seed, 0, 0xffffffff);
    default: return false;
  }
}
var HOST_ONLY = { start: 1, lobby: 1 };

// token bucket por conexao: mensagens/s e bytes/s
function allow(ws, bytes) {
  var rl = ws.rl, now = Date.now(), dt = (now - rl.t) / 1000; rl.t = now;
  if (now - rl.win > 10000) { rl.win = now; rl.strikes = 0; }
  rl.msgs = Math.min(RL_MSG_BURST, rl.msgs + dt * RL_MSG_RATE); rl.bytes = Math.min(RL_BYTE_BURST, rl.bytes + dt * RL_BYTE_RATE);
  if (rl.msgs < 1 || rl.bytes < bytes) { if (++rl.strikes > RL_STRIKES) closeNow(ws, 1008, "flood"); return false; }
  rl.msgs -= 1; rl.bytes -= bytes; return true;
}

function releaseRoom(ws) { // o anfitriao deixou a sala: libera a cota de salas do IP dele
  var r = ips.get(ws.ip); if (r && ws.role === "host" && r.rooms > 0) r.rooms--;
}

wss.on("connection", function (ws, req) {
  ws.ip = req.sfIp || clientIp(req); var info = ipInfo(ws.ip); info.conns++;
  ws.on("error", function () {}); // sem isso um erro de protocolo (ex.: mensagem acima do limite) derruba o processo inteiro
  var counted = true;
  ws.on("close", function () { if (counted) { counted = false; var r = ips.get(ws.ip); if (r && r.conns > 0) r.conns--; } });

  var code = "", role = null;
  try {
    var url = new URL(req.url, "http://relay");
    code = (url.searchParams.get("room") || "").toUpperCase().trim(); role = url.searchParams.get("role");
  } catch (e) { sys(ws, "erro", { motivo: "parametros_invalidos" }); closeNow(ws, 1008); return; }
  if (!/^[A-Z0-9]{4,16}$/.test(code) || (role !== "host" && role !== "guest")) { sys(ws, "erro", { motivo: "parametros_invalidos" }); closeNow(ws, 1008); return; }

  var room;
  if (role === "host") {
    var prev = rooms.get(code);
    if (prev && open(prev.host)) { sys(ws, "erro", { motivo: "codigo_em_uso" }); closeNow(ws, 1008); return; }
    if (rooms.size >= MAX_ROOMS) { sys(ws, "erro", { motivo: "servidor_cheio" }); closeNow(ws, 1013); return; }
    if (info.rooms >= MAX_ROOMS_PER_IP) { sys(ws, "erro", { motivo: "muitas_salas" }); closeNow(ws, 1008); return; }
    info.rooms++;
    room = { host: ws, seats: Array(MAX_SEATS).fill(null), locked: false };
    room.seats[0] = ws; rooms.set(code, room);
    ws.seat = 0;
    sys(ws, "esperando", { seat: 0, seats: [0] });
  } else {
    room = rooms.get(code);
    if (!room || !open(room.host)) { noteJoinFail(ws.ip); sys(ws, "erro", { motivo: "sala_nao_encontrada" }); closeNow(ws, 1008); return; }
    if (room.locked) { noteJoinFail(ws.ip); sys(ws, "erro", { motivo: "sala_em_partida" }); closeNow(ws, 1008); return; }
    var seat = room.seats.indexOf(null, 1);
    if (seat < 0) { noteJoinFail(ws.ip); sys(ws, "erro", { motivo: "sala_cheia" }); closeNow(ws, 1008); return; }
    room.seats[seat] = ws; ws.seat = seat;
    sys(ws, "welcome", { seat: seat, seats: occupiedSeats(room) });
    eachPeer(room, function (w) { if (w !== ws) sys(w, "peer_join", { seat: seat }); });
  }
  ws.room = code; ws.role = role; ws.isAlive = true; ws.lastMsg = Date.now();
  ws.rl = { t: Date.now(), msgs: RL_MSG_BURST, bytes: RL_BYTE_BURST, strikes: 0, win: Date.now() };
  ws.on("pong", function () { ws.isAlive = true; });

  ws.on("message", function (data, isBinary) {
    try {
      if (isBinary) return;
      var r = rooms.get(ws.room); if (!r || r.seats[ws.seat] !== ws) return;
      ws.lastMsg = Date.now();
      if (!allow(ws, data.length)) return;
      var msg; try { msg = JSON.parse(data.toString()); } catch (e) { return; }
      if (!validMsg(msg)) return;
      if (HOST_ONLY[msg.type] && ws.seat !== 0) return;       // convidado nao pode mandar start/lobby
      if (msg.type === "start") r.locked = true;               // partida comecou: ninguem entra no meio
      else if (msg.type === "lobby") r.locked = false;         // anfitriao voltou pra sala/escolha
      msg.from = ws.seat;
      var out = JSON.stringify(msg);
      if (typeof msg.to === "number") { if (msg.to !== ws.seat && r.seats[msg.to]) sendRaw(r.seats[msg.to], out); return; }
      eachPeer(r, function (w, i) { if (i !== ws.seat) sendRaw(w, out); });
    } catch (e) { console.error("erro ao tratar mensagem:", e && e.message); }
  });

  ws.on("close", function () {
    try {
      releaseRoom(ws);
      var r = rooms.get(ws.room); if (!r) return;
      if (ws.seat === 0 && r.host === ws) { // anfitriao saiu: a sala acaba pra todos
        eachPeer(r, function (w, i) { if (i !== 0) { sys(w, "room_closed"); } });
        rooms.delete(ws.room);
        eachPeer(r, function (w, i) { if (i !== 0) closeNow(w, 1000, "sala encerrada"); });
      } else if (r.seats[ws.seat] === ws) {
        r.seats[ws.seat] = null;
        eachPeer(r, function (w) { sys(w, "peer_left", { seat: ws.seat }); });
      }
    } catch (e) { console.error("erro ao fechar:", e && e.message); }
  });
});

// Keep-alive: derruba conexoes mortas (celular que caiu da rede etc.) e as ociosas, pra liberar a vaga.
var beat = setInterval(function () {
  var now = Date.now();
  wss.clients.forEach(function (ws) {
    if (ws.isAlive === false || (ws.lastMsg && now - ws.lastMsg > IDLE_MS)) return ws.terminate();
    ws.isAlive = false; try { ws.ping(); } catch (e) {}
  });
}, 20000);
wss.on("close", function () { clearInterval(beat); });

// Rede de seguranca: um erro inesperado nunca deve derrubar a sala de todo mundo.
process.on("uncaughtException", function (e) { console.error("erro nao tratado:", e && e.stack || e); });
process.on("unhandledRejection", function (e) { console.error("promessa rejeitada:", e); });

server.listen(PORT, function () { console.log("relay ouvindo na porta " + PORT); });
