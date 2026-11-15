// Coop online (NAO existe no original - Superfighters so tem multiplayer local; ADICIONADO a pedido do usuario).
// Transporte: WebRTC P2P (DataChannel) via PeerJS; o servidor publico da PeerJS so serve de "sinalizacao" (troca o
// endereco inicial dos dois PCs) - depois disso o trafego do jogo vai direto de um PC pro outro, sem passar por nenhum
// servidor nosso. Requer internet; funciona na maioria das redes (STUN publico do Google fura NAT comum), mas pode
// falhar atras de firewalls/NAT muito restritivos (nao ha servidor TURN configurado para esses casos).
window.SF = window.SF || {};
(function () {
  "use strict";
  var peer = null, conn = null, isHost = false;
  // listas (nao so 1 callback): quem usa isso e o menu.js (fluxo de sala/handshake) E o game.js (input tick a tick
  // durante a partida) ao mesmo tempo - os dois precisam ser avisados de "chegou input"/"caiu a conexao".
  var inputCbs = [], closeCbs = [];
  var PREFIX = "sfhtml5-";
  // Ping/pong pra medir o atraso real da conexao (RTT): o jogo usa isso pra ajustar o atraso de input do lockstep
  // (game.js) ao minimo necessario em vez de um valor fixo "seguro" (numa conexao rapida/local, o atraso fica bem
  // menor - so cresce de verdade quando a rede realmente exige).
  var rttSamples = [], pingTimer = null;

  function randCode(n) { var s = "", abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; for (var i = 0; i < n; i++) s += abc[(Math.random() * abc.length) | 0]; return s; }
  function sendPing() { SF.net.send({ type: "ping", t: performance.now() }); }

  function wireConn(c, onConnected, onError) {
    conn = c;
    conn.on("open", function () {
      onConnected && onConnected();
      rttSamples = []; clearInterval(pingTimer);
      sendPing(); sendPing(); sendPing(); // algumas amostras logo de cara (ainda no menu, antes da partida comecar)
      pingTimer = setInterval(sendPing, 2000); // continua medindo durante a partida (adapta se a rede piorar/melhorar)
    });
    conn.on("data", function (msg) {
      if (!msg) return;
      if (msg.type === "input") inputCbs.forEach(function (cb) { cb(msg.t, msg.k); });
      else if (msg.type === "start" && SF.net.onStart) SF.net.onStart(msg.cfg, msg.seed);
      else if (msg.type === "msg" && SF.net.onMsg) SF.net.onMsg(msg.text);
      else if (msg.type === "ping") SF.net.send({ type: "pong", t: msg.t });
      else if (msg.type === "pong") { rttSamples.push(performance.now() - msg.t); if (rttSamples.length > 6) rttSamples.shift(); }
    });
    conn.on("close", function () { conn = null; clearInterval(pingTimer); closeCbs.forEach(function (cb) { cb(); }); });
    conn.on("error", function (e) { if (onError) onError(e); });
  }

  // ---------- transporte por RELAY (WebSocket num servidor nosso: relay/server.js) ----------
  // Usado quando window.SF_RELAY_URL esta definido (ex.: "wss://superfighters-relay.onrender.com"). Nao depende da PeerJS
  // nem de NAT: os dois lados so abrem uma conexao de saida pro relay. Mesma interface de conexao usada pelo wireConn.
  var relayWs = null;
  function relayBase() { var u = window.SF_RELAY_URL; return u ? String(u).replace(/\/+$/, "") : null; }
  function RelayConn(ws) {
    var self = this, handlers = { open: [], data: [], close: [], error: [] };
    this.open = false;
    this.on = function (ev, cb) { if (handlers[ev]) handlers[ev].push(cb); };
    this.emit = function (ev, arg) { (handlers[ev] || []).forEach(function (cb) { try { cb(arg); } catch (e) {} }); };
    this.send = function (obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };
    this.close = function () { try { ws.close(); } catch (e) {} };
    ws.onmessage = function (ev) {
      var msg = null; try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg && msg.type === "sys") {
        if (msg.ev === "paired" && !self.open) { self.open = true; self.emit("open"); }
        else if (msg.ev === "peer_left") { if (self.open) { self.open = false; self.emit("close"); } }
        else if (msg.ev === "erro") { self.emit("error", msg.motivo || "erro_relay"); }
        return;
      }
      self.emit("data", msg);
    };
    ws.onerror = function () { self.emit("error", "relay_falhou"); };
    ws.onclose = function () { if (self.open) { self.open = false; } self.emit("close"); };
  }
  function relayOpen(code, role) {
    var base = relayBase(); if (!base) return null;
    var url = base.replace(/^http/, "ws") + "/?room=" + encodeURIComponent(code) + "&role=" + role;
    try { return new WebSocket(url); } catch (e) { return null; }
  }

  SF.net = {
    // true se da pra jogar online: relay configurado, ou a biblioteca PeerJS (CDN, so com internet) carregou
    available: function () { return !!relayBase() || typeof Peer !== "undefined"; },
    isHost: function () { return isHost; },
    connected: function () { return !!(conn && conn.open); },
    // cria uma sala; onCode(codigo) assim que a sala estiver pronta pra compartilhar, onConnected() quando o outro jogador entrar
    host: function (onCode, onConnected, onError) {
      if (relayBase()) {
        isHost = true; var code = randCode(5), ws = relayOpen(code, "host");
        if (!ws) { onError && onError("relay_invalido"); return; }
        relayWs = ws; var c = new RelayConn(ws); wireConn(c, onConnected, onError);
        ws.addEventListener("open", function () { onCode(code); });
        return;
      }
      if (typeof Peer === "undefined") { onError && onError("sem_internet"); return; }
      isHost = true;
      var code = randCode(5);
      try { peer = new Peer(PREFIX + code, { debug: 0 }); } catch (e) { onError && onError(e); return; }
      peer.on("open", function () { onCode(code); });
      peer.on("connection", function (c) { wireConn(c, onConnected, onError); });
      peer.on("error", function (e) { onError && onError(e); });
    },
    // entra numa sala pelo codigo que o anfitriao compartilhou
    join: function (code, onConnected, onError) {
      if (relayBase()) {
        isHost = false; var cd = code.toUpperCase().trim(), ws = relayOpen(cd, "guest");
        if (!ws) { onError && onError("relay_invalido"); return; }
        relayWs = ws; wireConn(new RelayConn(ws), onConnected, onError);
        return;
      }
      if (typeof Peer === "undefined") { onError && onError("sem_internet"); return; }
      isHost = false;
      try { peer = new Peer({ debug: 0 }); } catch (e) { onError && onError(e); return; }
      peer.on("open", function () { wireConn(peer.connect(PREFIX + code.toUpperCase().trim(), { reliable: true }), onConnected, onError); });
      peer.on("error", function (e) { onError && onError(e); });
    },
    send: function (obj) { if (conn && conn.open) try { conn.send(obj); } catch (e) {} },
    sendInput: function (t, k) { this.send({ type: "input", t: t, k: k }); },
    sendStart: function (cfg, seed) { this.send({ type: "start", cfg: cfg, seed: seed }); },
    onInput: function (cb) { inputCbs.push(cb); },
    onClose: function (cb) { closeCbs.push(cb); },
    onStart: null, // setado por quem usa (menu.js): function(cfg, seed)
    onMsg: null,
    // RTT medido (ms) - o menor das ultimas amostras (mais representativo da rede real, sem os picos de engasgo);
    // null enquanto nao chegou nenhuma resposta ainda (ex: logo apos conectar).
    rtt: function () { return rttSamples.length ? Math.min.apply(null, rttSamples) : null; },
    close: function () { clearInterval(pingTimer); try { if (conn) conn.close(); } catch (e) {} try { if (peer) peer.destroy(); } catch (e) {} try { if (relayWs) relayWs.close(); } catch (e) {} conn = null; peer = null; relayWs = null; isHost = false; rttSamples = []; }
  };
})();
