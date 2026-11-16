// Partida ONLINE (NAO existe no original - Superfighters so tem multiplayer local; ADICIONADO a pedido do usuario).
// Transporte: WebSocket num relay nosso (relay/server.js), com salas de ate 8 jogadores. window.SF_RELAY_URL define o endereco
// (ex.: "wss://superfighters-relay.onrender.com"). O relay so repassa mensagens; a simulacao roda em cada PC (lockstep).
// Cada jogador tem uma "vaga" (seat 0..7): 0 = anfitriao. Toda mensagem recebida traz "from" (vaga de quem mandou).
window.SF = window.SF || {};
(function () {
  "use strict";
  var ws = null, mySeat = -1, hostFlag = false, joined = false, seats = [];
  var msgCbs = [], inputCbs = [], peerCbs = [], closeCbs = [];
  var rttSamples = {}, pingTimer = null;
  var pendingJoin = null, pendingErr = null; // callbacks da tentativa de entrar (host/join) ate a sala confirmar

  function relayBase() { var u = window.SF_RELAY_URL; return u ? String(u).replace(/\/+$/, "") : null; }
  function randCode(n) { var s = "", abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; for (var i = 0; i < n; i++) s += abc[(Math.random() * abc.length) | 0]; return s; }
  function rawSend(obj) { if (ws && ws.readyState === 1) try { ws.send(JSON.stringify(obj)); } catch (e) {} }
  function sendPing() { rawSend({ type: "ping", t: performance.now() }); }
  function addSeat(s) { if (seats.indexOf(s) < 0) seats.push(s); seats.sort(function (a, b) { return a - b; }); }
  function removeSeat(s) { seats = seats.filter(function (x) { return x !== s; }); delete rttSamples[s]; }
  function fire(list, arg1, arg2) { list.slice().forEach(function (cb) { try { cb(arg1, arg2); } catch (e) { if (window.console) console.error(e); } }); }

  function onSys(msg) {
    if (msg.ev === "esperando") { // anfitriao: sala criada, vaga 0
      mySeat = 0; hostFlag = true; joined = true; seats = [0]; startPing();
      var ok = pendingJoin; pendingJoin = pendingErr = null; if (ok) ok(0);
    } else if (msg.ev === "welcome") { // convidado: entrou numa vaga
      mySeat = msg.seat; hostFlag = false; joined = true; seats = (msg.seats || []).slice().sort(function (a, b) { return a - b; });
      if (seats.indexOf(mySeat) < 0) addSeat(mySeat);
      startPing();
      var ok2 = pendingJoin; pendingJoin = pendingErr = null; if (ok2) ok2(mySeat);
    } else if (msg.ev === "peer_join") { addSeat(msg.seat); fire(peerCbs, "join", msg.seat); }
    else if (msg.ev === "peer_left") { removeSeat(msg.seat); fire(peerCbs, "leave", msg.seat); }
    else if (msg.ev === "room_closed") { endRoom("host_left"); }
    else if (msg.ev === "erro") {
      var err = pendingErr; pendingJoin = pendingErr = null;
      if (err) err(msg.motivo || "erro_relay"); else endRoom(msg.motivo || "erro_relay");
    }
  }
  function endRoom(reason) {
    if (!joined && !ws) return;
    var wasJoined = joined; joined = false; stopPing();
    try { if (ws) ws.close(); } catch (e) {}
    ws = null; mySeat = -1; hostFlag = false; seats = []; rttSamples = {};
    if (wasJoined) fire(closeCbs, reason);
  }
  function startPing() { stopPing(); sendPing(); pingTimer = setInterval(sendPing, 2000); }
  function stopPing() { clearInterval(pingTimer); pingTimer = null; }

  function onMessage(ev) {
    var msg = null; try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "sys") { onSys(msg); return; }
    var from = msg.from;
    if (msg.type === "ping") { rawSend({ type: "pong", t: msg.t, to: from }); return; }
    if (msg.type === "pong") { var arr = rttSamples[from] || (rttSamples[from] = []); arr.push(performance.now() - msg.t); if (arr.length > 6) arr.shift(); return; }
    if (msg.type === "input") { fire(inputCbs, from, msg); return; }
    if (msg.type === "start" && SF.net.onStart) { SF.net.onStart(msg.cfg, msg.seed, from); return; }
    fire(msgCbs, msg, from);
  }

  function openSocket(code, role, onJoin, onError) {
    var base = relayBase();
    if (!base) { onError && onError("sem_relay"); return false; }
    var url = base.replace(/^http/, "ws") + "/?room=" + encodeURIComponent(code) + "&role=" + role;
    try { ws = new WebSocket(url); } catch (e) { onError && onError("relay_invalido"); return false; }
    pendingJoin = onJoin || null; pendingErr = onError || null;
    // sem resposta em 25 s (servidor dormindo no plano gratis do Render, rede travada): desiste em vez de ficar preso
    var sock = ws;
    setTimeout(function () { if (ws === sock && pendingErr && sock.readyState !== 1) { var e = pendingErr; pendingJoin = pendingErr = null; try { sock.close(); } catch (x) {} e("tempo_esgotado"); } }, 25000);
    ws.onmessage = onMessage;
    ws.onerror = function () { if (pendingErr) { var e = pendingErr; pendingJoin = pendingErr = null; e("relay_falhou"); } };
    ws.onclose = function () { if (pendingErr) { var e = pendingErr; pendingJoin = pendingErr = null; e("conexao_fechada"); } else endRoom("conexao_caiu"); };
    return true;
  }

  // RTT (ms) por par: o pior dos melhores (o atraso do lockstep precisa cobrir o jogador mais lento). null sem amostras ainda.
  function rtt() {
    var worst = null;
    Object.keys(rttSamples).forEach(function (s) {
      var arr = rttSamples[s]; if (!arr || !arr.length) return;
      var best = Math.min.apply(null, arr); if (worst === null || best > worst) worst = best;
    });
    return worst;
  }

  SF.net = {
    available: function () { return !!relayBase(); },
    // acorda o relay antes de criar/entrar na sala (plano gratis do Render dorme sem uso e leva ~1 min pra acordar)
    warm: function () { var b = relayBase(); if (!b) return; try { fetch(b.replace(/^ws/, "http") + "/", { mode: "no-cors", cache: "no-store" }).catch(function () {}); } catch (e) {} },
    isHost: function () { return hostFlag; },
    connected: function () { return joined && !!ws && ws.readyState === 1; },
    mySeat: function () { return mySeat; },
    seats: function () { return seats.slice(); },
    // cria a sala; onCode(codigo) quando estiver pronta, onError(motivo) se falhar
    host: function (onCode, onError) {
      var code = randCode(5);
      if (!openSocket(code, "host", function () { onCode(code); }, onError)) return;
    },
    // entra na sala pelo codigo; onJoined(vaga) quando o relay aceitar, onError(motivo) se falhar
    join: function (code, onJoined, onError) {
      openSocket(code.toUpperCase().trim(), "guest", onJoined, onError);
    },
    // mensagem de aplicacao pra todos da sala (cada um recebe com from = vaga de quem mandou)
    send: function (obj) { rawSend(obj); },
    sendTo: function (seat, obj) { var o = Object.assign({}, obj, { to: seat }); rawSend(o); },
    sendInput: function (t, k) { rawSend({ type: "input", t: t, k: k }); },
    sendStart: function (cfg, seed) { rawSend({ type: "start", cfg: cfg, seed: seed }); },
    onMsg: function (cb) { msgCbs.push(cb); },     // cb(msg, from)
    onInput: function (cb) { inputCbs.push(cb); }, // cb(from, msg) - msg = {t, k}
    onPeer: function (cb) { peerCbs.push(cb); },   // cb("join"|"leave", vaga)
    onClose: function (cb) { closeCbs.push(cb); }, // cb(motivo) - a sala acabou/caiu (inclui anfitriao saiu)
    onStart: null, // setado por quem usa (menu.js): function(cfg, seed, from)
    rtt: rtt,
    close: function () {
      stopPing(); pendingJoin = pendingErr = null;
      try { if (ws) ws.close(); } catch (e) {}
      ws = null; joined = false; mySeat = -1; hostFlag = false; seats = []; rttSamples = {};
    }
  };
})();
