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

  SF.net = {
    // true so se a biblioteca PeerJS (carregada de um CDN, so com internet) terminou de carregar
    available: function () { return typeof Peer !== "undefined"; },
    isHost: function () { return isHost; },
    connected: function () { return !!(conn && conn.open); },
    // cria uma sala; onCode(codigo) assim que a sala estiver pronta pra compartilhar, onConnected() quando o outro jogador entrar
    host: function (onCode, onConnected, onError) {
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
    close: function () { clearInterval(pingTimer); try { if (conn) conn.close(); } catch (e) {} try { if (peer) peer.destroy(); } catch (e) {} conn = null; peer = null; isHost = false; rttSamples = []; }
  };
})();
