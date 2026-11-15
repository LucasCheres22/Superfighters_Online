// Relay do ONLINE (Superfighters): salas por codigo com ate 8 jogadores. Nao simula o jogo: so repassa mensagens.
// Vagas (seat): 0 = anfitriao; convidados entram nas vagas 1..7 na ordem de chegada.
// Cada mensagem recebida ganha o campo "from" (vaga de quem mandou). Se a mensagem tiver "to" (numero), vai so pra essa vaga;
// senao vai pra todos os outros da sala. Mensagens "sys" vem so do servidor (clientes nao conseguem forjar).
// Rodar local:  npm install  ;  node server.js        (porta: PORT, padrao 8787)
// Rodar no Render: ver render.yaml na raiz do projeto.
"use strict";
var http = require("http");
var WebSocket = require("ws");

var PORT = parseInt(process.env.PORT, 10) || 8787;
var MAX_MSG = 16 * 1024;          // limite de tamanho por mensagem (inputs sao minusculos)
var MAX_SEATS = 8;
var rooms = new Map();            // codigo -> { host: ws, seats: [ws|null x8] }

// HTTP simples: health check do Render e teste manual no navegador.
var server = http.createServer(function (req, res) {
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end("superfighters relay ok - salas ativas: " + rooms.size + "\n");
});

var wss = new WebSocket.Server({ server: server, maxPayload: MAX_MSG });

function open(ws) { return ws && ws.readyState === WebSocket.OPEN; }
function sendRaw(ws, text) { if (open(ws)) ws.send(text); }
function sys(ws, ev, extra) { sendRaw(ws, JSON.stringify(Object.assign({ type: "sys", ev: ev }, extra || {}))); }
function occupiedSeats(room) { var out = []; room.seats.forEach(function (w, i) { if (w) out.push(i); }); return out; }
function eachPeer(room, fn) { room.seats.forEach(function (w, i) { if (w) fn(w, i); }); }

wss.on("connection", function (ws, req) {
  var url = new URL(req.url, "http://relay");
  var code = (url.searchParams.get("room") || "").toUpperCase().trim();
  var role = url.searchParams.get("role");
  if (!/^[A-Z0-9]{3,16}$/.test(code) || (role !== "host" && role !== "guest")) {
    sys(ws, "erro", { motivo: "parametros_invalidos" }); ws.close(); return;
  }

  var room;
  if (role === "host") {
    var prev = rooms.get(code);
    if (prev && open(prev.host)) { sys(ws, "erro", { motivo: "codigo_em_uso" }); ws.close(); return; }
    room = { host: ws, seats: Array(MAX_SEATS).fill(null) };
    room.seats[0] = ws; rooms.set(code, room);
    ws.seat = 0;
    sys(ws, "esperando", { seat: 0, seats: [0] });
  } else {
    room = rooms.get(code);
    if (!room || !open(room.host)) { sys(ws, "erro", { motivo: "sala_nao_encontrada" }); ws.close(); return; }
    var seat = room.seats.indexOf(null, 1);
    if (seat < 0) { sys(ws, "erro", { motivo: "sala_cheia" }); ws.close(); return; }
    room.seats[seat] = ws; ws.seat = seat;
    sys(ws, "welcome", { seat: seat, seats: occupiedSeats(room) });
    eachPeer(room, function (w) { if (w !== ws) sys(w, "peer_join", { seat: seat }); });
  }
  ws.room = code; ws.role = role; ws.isAlive = true;
  ws.on("pong", function () { ws.isAlive = true; });

  ws.on("message", function (data) {
    var r = rooms.get(ws.room); if (!r || r.seats[ws.seat] !== ws) return;
    var msg; try { msg = JSON.parse(data.toString()); } catch (e) { return; }
    if (!msg || typeof msg !== "object" || msg.type === "sys") return;
    msg.from = ws.seat;
    var out = JSON.stringify(msg);
    if (typeof msg.to === "number") { if (msg.to !== ws.seat && r.seats[msg.to]) sendRaw(r.seats[msg.to], out); return; }
    eachPeer(r, function (w, i) { if (i !== ws.seat) sendRaw(w, out); });
  });

  ws.on("close", function () {
    var r = rooms.get(ws.room); if (!r) return;
    if (ws.seat === 0 && r.host === ws) { // anfitriao saiu: a sala acaba pra todos
      eachPeer(r, function (w, i) { if (i !== 0) { sys(w, "room_closed"); } });
      rooms.delete(ws.room);
      eachPeer(r, function (w, i) { if (i !== 0) { try { w.close(); } catch (e) {} } });
    } else if (r.seats[ws.seat] === ws) {
      r.seats[ws.seat] = null;
      eachPeer(r, function (w) { sys(w, "peer_left", { seat: ws.seat }); });
    }
  });
});

// Keep-alive: derruba conexoes mortas (celular que caiu da rede etc.) pra liberar a vaga.
var beat = setInterval(function () {
  wss.clients.forEach(function (ws) {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false; try { ws.ping(); } catch (e) {}
  });
}, 20000);
wss.on("close", function () { clearInterval(beat); });

server.listen(PORT, function () { console.log("relay ouvindo na porta " + PORT); });
