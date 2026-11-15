// Relay do COOP ONLINE (Superfighters): salas por codigo e encaminhamento de mensagens entre o host e o convidado.
// Nao simula o jogo: so repassa o que cada lado manda (input por tick, start, ping/pong). O lockstep continua no cliente.
// Rodar local:  npm install  ;  node server.js        (porta: PORT, padrao 8787)
// Rodar no Render: ver render.yaml na raiz do projeto.
"use strict";
var http = require("http");
var WebSocket = require("ws");

var PORT = parseInt(process.env.PORT, 10) || 8787;
var MAX_MSG = 16 * 1024;          // limite de tamanho por mensagem (inputs sao minusculos)
var rooms = new Map();            // codigo -> { host: ws|null, guest: ws|null }

// HTTP simples: health check do Render e teste manual no navegador.
var server = http.createServer(function (req, res) {
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end("superfighters relay ok - salas ativas: " + rooms.size + "\n");
});

var wss = new WebSocket.Server({ server: server, maxPayload: MAX_MSG });

function sys(ws, ev, extra) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(Object.assign({ type: "sys", ev: ev }, extra || {})));
}
function otherOf(ws, room) {
  return ws.role === "host" ? room.guest : room.host;
}

wss.on("connection", function (ws, req) {
  var url = new URL(req.url, "http://relay");
  var code = (url.searchParams.get("room") || "").toUpperCase().trim();
  var role = url.searchParams.get("role");
  if (!/^[A-Z0-9]{3,16}$/.test(code) || (role !== "host" && role !== "guest")) {
    sys(ws, "erro", { motivo: "parametros_invalidos" }); ws.close(); return;
  }

  if (role === "host") {
    var prev = rooms.get(code);
    if (prev && prev.host && prev.host.readyState === WebSocket.OPEN) { sys(ws, "erro", { motivo: "codigo_em_uso" }); ws.close(); return; }
    rooms.set(code, { host: ws, guest: null });
  } else {
    var room = rooms.get(code);
    if (!room || !room.host || room.host.readyState !== WebSocket.OPEN) { sys(ws, "erro", { motivo: "sala_nao_encontrada" }); ws.close(); return; }
    if (room.guest) { sys(ws, "erro", { motivo: "sala_cheia" }); ws.close(); return; }
    room.guest = ws;
  }

  ws.role = role; ws.room = code; ws.isAlive = true;
  ws.on("pong", function () { ws.isAlive = true; });

  var cur = rooms.get(code);
  if (role === "guest") { sys(cur.host, "paired"); sys(ws, "paired"); }
  else sys(ws, "esperando");

  ws.on("message", function (data) {
    var r = rooms.get(ws.room); if (!r) return;
    var dst = otherOf(ws, r);
    if (dst && dst.readyState === WebSocket.OPEN) dst.send(data.toString());
  });

  ws.on("close", function () {
    var r = rooms.get(ws.room); if (!r) return;
    if (ws.role === "host") {
      sys(r.guest, "peer_left"); rooms.delete(ws.room);
    } else {
      sys(r.host, "peer_left"); r.guest = null;
    }
  });
});

// Keep-alive: derruba conexoes mortas (celular que caiu da rede etc.) pra liberar a sala.
var beat = setInterval(function () {
  wss.clients.forEach(function (ws) {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false; try { ws.ping(); } catch (e) {}
  });
}, 20000);
wss.on("close", function () { clearInterval(beat); });

server.listen(PORT, function () { console.log("relay ouvindo na porta " + PORT); });
