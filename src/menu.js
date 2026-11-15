// Menus recriados a partir do original (MenuMain.as + Code/Data/Menu/*.as): mesmas telas, ordem, teclas e arte (PNGs exportados do SWF).
// Palco 800x600. Cada painel e um PNG exportado; as partes dinamicas (retrato, nome, time, dificuldade, mapa, marcadores) sao quadros dos
// "toggles" originais desenhados nas posicoes da lista de objetos do SWF (tools/swfdump.js). Fundo = partida de demonstracao com bots.
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var KEY = "sf_html5_cfg", YELLOW = "#ffff7e", WHITE = "#ffffff";
  var cfg = { sfxVol: 1, music: true, quality: 0, effects: 1, mouse: false };
  try { var saved = JSON.parse(localStorage.getItem(KEY) || "{}"); for (var k in saved) cfg[k] = saved[k]; } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} }

  var mc = $("mc"), g = mc.getContext("2d"), gameCanvas = $("c"), wrap = $("wrap");
  g.imageSmoothingEnabled = false;
  var menuOn = true;

  // ---------- tamanho: palco 4:3 ajustado a janela ----------
  function fit() {
    var w = innerWidth, h = innerHeight, s = Math.min(w, h * 4 / 3); s = Math.max(320, Math.floor(s));
    wrap.style.width = s + "px"; wrap.style.height = Math.round(s * 3 / 4) + "px";
    [mc, gameCanvas].forEach(function (c) { c.style.width = s + "px"; c.style.height = Math.round(s * 3 / 4) + "px"; });
  }
  addEventListener("resize", fit); fit();

  // ---------- imagens ----------
  var imgs = {};
  function img(path) { var i = imgs[path]; if (!i) { i = new Image(); i.src = path; imgs[path] = i; } return i; }
  function ready(i) { return i.complete && i.naturalWidth > 0; }
  var tintCv = document.createElement("canvas"), tintG = tintCv.getContext("2d");
  // desenha um quadro de sprite do menu: (x,y) = posicao da instancia, (sx,sy) = escala; a origem de cada quadro vem de SF.menuOrg
  function spr(id, fr, x, y, sx, sy, color) {
    var im = img("assets/menu/" + id + "/" + fr + ".png"); if (!ready(im)) return;
    var o = (SF.menuOrg[id] && SF.menuOrg[id][fr]) || [0, 0]; sx = sx == null ? 1 : sx; sy = sy == null ? sx : sy;
    var src = im;
    if (color) {
      tintCv.width = im.naturalWidth; tintCv.height = im.naturalHeight; tintG.clearRect(0, 0, tintCv.width, tintCv.height); tintG.drawImage(im, 0, 0);
      tintG.globalCompositeOperation = "multiply"; tintG.fillStyle = color; tintG.fillRect(0, 0, tintCv.width, tintCv.height); tintG.globalCompositeOperation = "destination-in"; tintG.drawImage(im, 0, 0); tintG.globalCompositeOperation = "source-over"; src = tintCv; // multiplica (branco vira a cor, preto continua preto) como o colorTransform do original
    }
    g.save(); g.translate(x, y); g.scale(sx, sy); g.drawImage(src, o[0], o[1]); g.restore();
  }
  function shape(id, x, y) { var im = img("assets/menu/shapes/" + id + ".png"); if (ready(im)) g.drawImage(im, x, y); }
  function black(x, y, w, h) { g.fillStyle = "#000"; g.fillRect(x, y, w, h); }
  function marker(x, y, flip) { spr(2084, 1, x, y, flip ? -2 : 2, flip ? -2 : 2); } // seta 4x7 (x2); a da direita vem espelhada
  function text(str, x, y, color, size, align) { g.font = (size || 16) + "px sfpixel, monospace"; g.textAlign = align || "left"; g.fillStyle = color || WHITE; g.fillText(str, x, y); }

  // ---------- estado do menu (espelha MenuMain: first_choise > mode_selection > vs_player_setup > no_bots > bot_setup > map_selection) ----------
  // first_choise.LoadData do original: sem o SharedObject "startedBefore" (1a vez) o marcador comeca em TUTORIAL e aparece o balao "New to Superfighters?"
  var firstRun = false; try { if (!localStorage.getItem("sf_html5_started")) { firstRun = true; localStorage.setItem("sf_html5_started", "1"); } } catch (e) {}
  var CHAR_N = 8;
  var MAPS = { 2: "storage", 3: "rooftops", 4: "police", 5: "hazardous", 6: "backstreets", 7: "testing", 10: "survival01" };
  var GMODE_KILLS = { 1: 9999, 2: 3, 3: 5, 4: 10, 5: 2, 6: 3, 7: 5 }; // INFINITE / FIRST TO 3,5,10 / BEST OF 3,5,10 (melhor de N = primeiro a ceil(N/2))
  var S = null, screen = "first", hist = [], msg = "", msgT = 0;
  function newPlate(canTeam, team) { return { ch: 0, team: team || 0, row: 0, diff: 1, canTeam: canTeam }; }
  function reset() { S = { first: firstRun ? 2 : 0, prompt: firstRun, players: 1, mode: 0, modePos: 0, plates: [], cur: 0, nb: 1, minB: 1, maxB: 7, bots: [], bcur: 0, mapPos: 0, level: 8, gmode: 1, setup: { pos: 0, kp: 0, player: 1 }, wait: null }; firstRun = false; }
  reset();
  function snd(k) { try { SF.api.play(k, 0.5); } catch (e) {} }
  function go(s) { hist.push(screen); screen = s; snd("accept"); }
  function back() { if (!hist.length) return; screen = hist.pop(); snd("cancel"); }
  function notice(t) { msg = t; msgT = 150; }

  function startPlates() {
    var canTeam = S.mode === 0; S.plates = [];
    for (var i = 1; i <= S.players; i++) S.plates.push(newPlate(canTeam, canTeam ? 0 : 1));
    S.cur = 0;
  }
  function startBots() { S.bots = []; for (var i = 0; i < S.nb; i++) S.bots.push(newPlate(true, 0)); S.bcur = 0; }
  function limit() { return S.mode === 2 ? 9999 : GMODE_KILLS[S.gmode] || 9999; }
  var lastGame = null;
  function launch(again) { // StartNewGame
    if (!again) {
      var roster = [];
      S.plates.forEach(function (p, i) { roster.push({ bot: false, slot: i + 1, char: p.ch, team: p.canTeam ? p.team : 0 }); });
      if (S.mode === 0) S.bots.forEach(function (b) { roster.push({ bot: true, char: b.ch, team: b.team, diff: b.diff }); });
      var anyTeam = roster.some(function (r) { return r.team > 0; });
      var level = S.mode === 2 ? 10 : S.level === 8 ? [2, 3, 4, 5, 6, 7][(Math.random() * 6) | 0] : S.level;
      lastGame = { demo: false, roster: roster, p2: S.players === 2, map: MAPS[level] || "rooftops", mode: S.mode === 2 ? "survival" : (anyTeam ? "tdm" : "dm"), kills: limit(), difficulty: 1, bots: 0 };
    }
    lastGame.music = cfg.music; lastGame.sfxVol = cfg.sfxVol; lastGame.keys2 = cfg.keys2; lastGame.mouse = cfg.mouse;
    hideMenu(); SF.stop(); SF.start(lastGame);
  }
  function startTutorial() {
    if (!(SF.maps.tutorial && SF.maps.tutorial.art)) { notice("TUTORIAL: MAPA AINDA NAO CONVERTIDO"); return; }
    lastGame = { demo: false, roster: [{ bot: false, slot: 1, char: 0, team: 0 }, { bot: true, char: 0, team: 0, diff: 0 }], map: "tutorial", mode: "dm", kills: 9999 };
    launch(true);
  }

  // ---------- ONLINE: versus de ate 8 jogadores (nao existe no original; relay em relay/server.js, transporte em src/net.js) ----------
  // Fluxo: HOSPEDAR / ENTRAR COM CODIGO -> SALA (vagas 1 a 8; o anfitriao aperta INICIAR com 2+ jogadores) ->
  // ESCOLHA (cada um escolhe o personagem; o anfitriao escolhe a fase e os pontos pra vencer) -> JOGAR (anfitriao) -> partida.
  var ON_CHARS = ["ALEATORIO", "JOHNNY", "BORIS", "AGENT", "BILLY", "SCOTT", "FUNNYMAN", "MAC", "JEFF"]; // indice = char (0 = aleatorio), mesma ordem de CHARS no game.js
  var ON_MAPS = [8, 2, 3, 4, 5, 6, 7];                       // niveis (8 = aleatoria), mesmos do seletor de fase
  var ON_KILLS = [[3, "3"], [5, "5"], [10, "10"], [9999, "INFINITO"]];
  var on = null; // sessao online: { code, seat, host, phase: "lobby" | "pick" | "playing" | "ended", level, kills, picks: {vaga: char} }
  function mapLabel(level) { return level === 8 ? "ALEATORIA" : (MAPS[level] || "?").toUpperCase(); }
  function killsLabel(k) { for (var i = 0; i < ON_KILLS.length; i++) if (ON_KILLS[i][0] === k) return ON_KILLS[i][1]; return String(k); }
  function sendLobby() { if (on && on.host) SF.net.send({ type: "lobby", phase: on.phase === "pick" ? "pick" : "lobby", level: on.level, kills: on.kills }); }
  function sendPick() { if (on) SF.net.send({ type: "pick", char: on.picks[on.seat] || 0 }); }
  function coopShow(title, lines, controls) {
    $("ovtable").innerHTML = ""; $("ovbtns").innerHTML = ""; $("ovtitle").textContent = title; $("ovextra").textContent = "";
    var box = $("coopui"); box.innerHTML = ""; box.style.display = "block";
    lines.forEach(function (t) { var d = document.createElement("div"); d.textContent = t; box.appendChild(d); });
    var act = document.createElement("div"); act.className = "actions"; controls.forEach(function (el) { act.appendChild(el); }); box.appendChild(act);
    overlay(true);
  }
  function coopHide() { $("coopui").style.display = "none"; }
  function mkBtn(label, fn, primary) { var b = document.createElement("button"); b.textContent = label; if (primary) b.className = "primary"; b.onclick = fn; return b; }
  function addLine(box, text) { var d = document.createElement("div"); d.textContent = text; box.appendChild(d); }
  function optionRow(items, selected, onPick) { // botoes em linha; o escolhido fica destacado
    var row = document.createElement("div"); row.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;margin:2px 0 6px";
    items.forEach(function (it) { var b = mkBtn(it.label, function () { onPick(it.value); }, it.value === selected); b.style.padding = "3px 6px"; b.style.fontSize = "11px"; row.appendChild(b); });
    return row;
  }
  function leaveOnline() { try { SF.net.close(); } catch (e) {} on = null; coopHide(); showMenu(); }
  function coopFail(msg) { try { SF.net.close(); } catch (e) {} on = null; coopShow("COOP ONLINE", [msg], [mkBtn("VOLTAR", openCoopMenu, true)]); }
  function openCoopMenu() {
    coopShow("COOP ONLINE", ["Versus online de ate 8 jogadores, em outros PCs e redes, pela internet.", "Cada um abre o jogo e entra pelo codigo da sala."],
      [mkBtn("HOSPEDAR PARTIDA", coopHost, true), mkBtn("ENTRAR COM CODIGO", coopJoinPrompt), mkBtn("CANCELAR", function () { coopHide(); overlay(false); })]);
  }
  function relayFail(e) {
    var m = { sala_cheia: "A sala esta cheia (8 jogadores).", sala_nao_encontrada: "Nao encontrou a sala. Confira o codigo e se o anfitriao ja criou a sala.", codigo_em_uso: "Esse codigo ja esta em uso. Tente de novo." };
    return m[e] || ("Nao foi possivel conectar ao servidor (" + (e && e.type ? e.type : e) + "). Verifique a conexao e tente de novo.");
  }
  function coopHost() {
    if (!SF.net.available()) { coopFail("Sem conexao com o servidor de partidas (endereco do relay nao configurado)."); return; }
    coopShow("COOP ONLINE", ["Criando sala..."], []);
    SF.net.host(function (code) { on = { code: code, seat: 0, host: true, phase: "lobby", level: 8, kills: 5, picks: {} }; renderOnline(); },
      function (e) { coopFail(relayFail(e)); });
  }
  function coopJoinPrompt() {
    var input = document.createElement("input"); input.maxLength = 12; input.placeholder = "CODIGO";
    input.addEventListener("keydown", function (e) { e.stopPropagation(); if (e.key === "Enter" && input.value.trim()) coopJoin(input.value.trim()); });
    var row = document.createElement("div"); row.appendChild(input);
    coopShow("COOP ONLINE", ["Digite o codigo que o anfitriao te passou:"], []);
    $("coopui").insertBefore(row, $("coopui").querySelector(".actions"));
    var act = $("coopui").querySelector(".actions");
    act.appendChild(mkBtn("ENTRAR", function () { if (input.value.trim()) coopJoin(input.value.trim()); }, true));
    act.appendChild(mkBtn("CANCELAR", function () { coopHide(); overlay(false); }));
    setTimeout(function () { input.focus(); }, 0);
  }
  function coopJoin(code) {
    if (!SF.net.available()) { coopFail("Sem conexao com o servidor de partidas (endereco do relay nao configurado)."); return; }
    coopShow("COOP ONLINE", ["Conectando..."], []);
    SF.net.join(code, function (seat) {
      on = { code: code.toUpperCase().trim(), seat: seat, host: false, phase: "lobby", level: 8, kills: 5, picks: {} };
      sendPick(); renderOnline();
    }, function (e) { coopFail(relayFail(e)); });
  }
  // a sala mudou (alguem entrou/saiu): o anfitriao manda a etapa atual pro recem-chegado e todos mandam o proprio personagem
  SF.net.onPeer(function (ev, seat) {
    if (!on) return;
    if (ev === "leave") delete on.picks[seat];
    if (ev === "join") { if (on.host) sendLobby(); sendPick(); }
    if (on.phase === "lobby" || on.phase === "pick") renderOnline();
  });
  SF.net.onMsg(function (msg, from) {
    if (!on) return;
    if (msg.type === "lobby" && !on.host) { // etapa/fase escolhida pelo anfitriao
      if (on.phase === "playing" || on.phase === "ended") SF.stop(); // o anfitriao voltou pra sala
      on.phase = msg.phase === "pick" ? "pick" : "lobby"; on.level = msg.level; on.kills = msg.kills;
      renderOnline();
    } else if (msg.type === "pick") {
      on.picks[from] = msg.char || 0;
      if (on.phase === "lobby" || on.phase === "pick") renderOnline();
    }
  });
  SF.net.onStart = function (shared, seed) { if (on && !on.host) beginOnlineMatch(shared, seed); }; // convidado: o anfitriao apertou JOGAR
  SF.net.onClose(function (motivo) { // a sala acabou (anfitriao saiu ou a rede caiu). Na partida quem avisa e o SF.onNetDrop
    if (!on || on.phase === "playing") return;
    on = null; coopShow("SALA ENCERRADA", [motivo === "host_left" ? "O anfitriao saiu da sala." : "A conexao com a sala caiu."], [mkBtn("MENU PRINCIPAL", toMenu, true)]);
  });
  function renderOnline() {
    if (!on) return;
    var occ = SF.net.seats(), box = $("coopui");
    $("ovtitle").textContent = on.phase === "pick" ? "ESCOLHA DA PARTIDA" : "SALA ONLINE";
    $("ovextra").textContent = "Codigo: " + on.code + "   |   VERSUS - ate 8 jogadores";
    var rows = ['<table class="compact"><tr><th>Vaga</th><th>Jogador</th><th>Personagem</th></tr>'];
    for (var s = 0; s < 8; s++) {
      var here = occ.indexOf(s) >= 0, you = s === on.seat;
      var who = here ? "P" + (s + 1) + (you ? " (voce)" : "") + (s === 0 ? " - anfitriao" : "") : "- vazio -";
      rows.push('<tr class="' + (you ? "you" : "") + '"><td>' + (s + 1) + "</td><td>" + who + "</td><td>" + (here ? ON_CHARS[on.picks[s] || 0] : "-") + "</td></tr>");
    }
    $("ovtable").innerHTML = rows.join("") + "</table>";
    box.innerHTML = ""; box.style.display = "block";
    var btns = [];
    if (on.phase === "lobby") {
      addLine(box, occ.length < 2 ? "Aguardando jogadores entrarem com o codigo " + on.code + "..." : (on.host ? "Todos na sala. Quando quiserem, aperte INICIAR." : "Aguardando o anfitriao iniciar a partida..."));
      if (on.host) btns.push(["INICIAR", startPick, true, occ.length < 2]);
    } else if (on.phase === "pick") {
      addLine(box, "Seu personagem:");
      box.appendChild(optionRow(ON_CHARS.map(function (l, i) { return { label: l, value: i }; }), on.picks[on.seat] || 0, function (v) { on.picks[on.seat] = v; sendPick(); renderOnline(); }));
      if (on.host) {
        addLine(box, "Fase:");
        box.appendChild(optionRow(ON_MAPS.map(function (l) { return { label: mapLabel(l), value: l }; }), on.level, function (v) { on.level = v; sendLobby(); renderOnline(); }));
        addLine(box, "Pontos para vencer:");
        box.appendChild(optionRow(ON_KILLS.map(function (k) { return { label: k[1], value: k[0] }; }), on.kills, function (v) { on.kills = v; sendLobby(); renderOnline(); }));
        btns.push(["JOGAR", startOnlineMatch, true, occ.length < 2]);
        btns.push(["VOLTAR", backToLobby]);
      } else {
        addLine(box, "Fase: " + mapLabel(on.level) + "   |   Pontos para vencer: " + killsLabel(on.kills));
        addLine(box, "Aguardando o anfitriao escolher a partida...");
      }
    } else if (on.phase === "ended") {
      addLine(box, on.host ? "Partida encerrada." : "Partida encerrada. Aguardando o anfitriao voltar para a sala...");
      if (on.host) btns.push(["VOLTAR A SALA", backToLobby, true]);
    }
    btns.push(["SAIR DA SALA", leaveOnline]);
    buttons(btns);
    overlay(true);
  }
  function startPick() { if (!on || !on.host) return; on.phase = "pick"; sendLobby(); renderOnline(); }
  function backToLobby() { if (!on || !on.host) return; SF.stop(); on.phase = "lobby"; sendLobby(); renderOnline(); }
  function startOnlineMatch() { // anfitriao: monta o roster com as escolhas de todos e manda a partida pra sala
    if (!on || !on.host || SF.net.seats().length < 2) return;
    var seed = (Math.random() * 0xffffffff) >>> 0;
    var level = on.level === 8 ? [2, 3, 4, 5, 6, 7][(Math.random() * 6) | 0] : on.level;
    var roster = SF.net.seats().map(function (s) { return { bot: false, seat: s, slot: s + 1, name: "P" + (s + 1), char: on.picks[s] || 0, team: 0 }; });
    var shared = { demo: false, roster: roster, p2: false, map: MAPS[level] || "rooftops", mode: "dm", kills: on.kills, difficulty: 1, bots: 0 };
    SF.net.sendStart(shared, seed);
    beginOnlineMatch(shared, seed);
  }
  function beginOnlineMatch(shared, seed) { // cada PC: a mesma partida, com o proprio jogador marcado como "local" (teclado daqui)
    var c = JSON.parse(JSON.stringify(shared));
    c.net = true; c.seed = seed;
    c.roster.forEach(function (r) { if (!r.bot) r.net = r.seat === on.seat ? "local" : "remote"; });
    c.music = cfg.music; c.sfxVol = cfg.sfxVol; c.keys2 = cfg.keys2; c.mouse = cfg.mouse; // preferencias sao de cada PC
    on.phase = "playing"; coopHide(); overlay(false); hideMenu(); SF.stop(); SF.start(c);
  }
  $("coopBtn").onclick = openCoopMenu;

  // ---------- fundo: partida de demonstracao com bots (isMenuDemo do original) ----------
  function startDemo() {
    var ids = Object.keys(MAPS).filter(function (l) { return +l < 10 && SF.maps[MAPS[l]] && SF.maps[MAPS[l]].art; }).map(function (l) { return MAPS[l]; });
    var roster = []; for (var i = 0; i < 4; i++) roster.push({ bot: true, char: 0, team: 0, diff: 1 });
    SF.start({ demo: true, roster: roster, p2: false, map: ids[(Math.random() * ids.length) | 0] || "rooftops", mode: "dm", kills: 9999, music: false, sfxVol: 0, keys2: cfg.keys2 });
    gameCanvas.style.display = "block";
  }
  // tema do menu (2501_superfighters_theme): toca SO no menu, em loop. Some ao entrar numa partida (hideMenu).
  // O navegador pode bloquear o autoplay antes do primeiro toque: entao tenta de novo no primeiro teclado/clique com o menu aberto.
  var menuTheme = null;
  function playTheme() {
    if (!cfg.music) return;
    if (!menuTheme) { menuTheme = new Audio("assets/sounds/2501_superfighters_theme.mp3"); menuTheme.loop = true; menuTheme.volume = 0.18; }
    var p = menuTheme.play(); if (p && p.catch) p.catch(function () {});
  }
  function stopTheme() { if (menuTheme) menuTheme.pause(); }
  addEventListener("keydown", function () { if (menuOn && menuTheme && menuTheme.paused && cfg.music) playTheme(); });
  addEventListener("mousedown", function () { if (menuOn && menuTheme && menuTheme.paused && cfg.music) playTheme(); });
  function showMenu() { menuOn = true; mc.style.display = "block"; lastT = 0; $("overlay").classList.remove("on"); reset(); screen = "first"; hist = []; startDemo(); playTheme(); }
  function hideMenu() { menuOn = false; mc.style.display = "none"; gameCanvas.style.filter = "none"; stopTheme(); }

  // ---------- desenho de cada tela ----------
  var TEAMC = ["#e6e6e6", "#0040ff", "#ff0000", "#ffff00", "#00ff00"];
  function plateAt(x, y, p, kind, selRow, active, type) { // type: 1/2 = PLAYER n, 3 = COM
    if (kind === "p") spr(2144, p.canTeam ? 1 : 2, x, y); else shape(2149, x, y);
    black(x + 15, y + 4, 104, kind === "p" ? 128 : 142);
    spr(2143, type, x + 67, y + 14, 2, 2);
    spr(2136, p.ch === 0 ? 15 : p.ch, x + 65, y + 57, 1, 1);
    spr(2131, p.ch === 0 ? 15 : p.ch, x + 67, y + 100, 2, 2, active && selRow === 0 ? YELLOW : WHITE);
    spr(2114, p.team ? p.team : 5, x + 67, y + 119, 2, 2, active && selRow === 1 ? YELLOW : TEAMC[p.team]);
    if (kind === "c") spr(2158, p.diff + 1, x + 66.4, y + 139, 2, 2, active && selRow === 2 ? YELLOW : WHITE);
    var rows = kind === "c" ? 3 : p.canTeam ? 2 : 1;
    if (active && selRow < rows) { var yy = y + 98.5 + 20 * selRow; marker(x + 13, yy, false); marker(x + (kind === "c" ? 121 : 122), yy, true); }
  }
  function keyName(c) {
    if (!c) return "-"; var m = { Space: "SPACE", Comma: ",", Period: ".", Slash: "/", Quote: "'", Semicolon: ";" };
    return (m[c] || c.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Arrow/, "").replace(/^Numpad/, "NUM ")).toUpperCase();
  }
  var KEYS8 = ["up", "down", "left", "right", "melee", "fire", "throw", "powerup"], KEYY = [238, 258, 278, 298, 328, 348, 368, 388];
  var credits = [["JOHAN HJARPE", "Design, Art"], ["ALEXANDER SIIGUR", "Program"], ["HZLANCER", "Music"], ["mythologicinteractive.com", ""]];
  // ---------- fundo: demo do jogo + bg_noise do original (sprite 2076) ----------
  // No original o menu e uma partida de demonstracao (isMenuDemo): _game_window com escala 0.95 em (80,110) (MenuMain.StartMenuGame),
  // e por cima o bg_noise: grade (textura 2065, 25% de alfa, rolando -49px em 24 quadros) + EFFECT_MC (retangulo 800x600 com
  // mistura MULTIPLY que vai verde -> vermelho -> azul -> verde num ciclo de 900 quadros a 30 fps). Nada de filtro CSS/hue-rotate.
  var GRID_XS = [0, 98, 196, 294, 391, 489, 587, 685, 783], GRID_YS = [120, 218, 316, 414, 512];
  var clock = 0, lastT = 0; // quadros (30 fps) do bg_noise; so avancam com o menu aberto (o original guarda _last_bgNoiseFrame)
  function tintAt(fr) { // fr 1..900; chaves lidas dos quadros do EFFECT_MC: 1-200 verde, 300-500 vermelho, 600-800 azul, 900 verde
    var G = [16, 255, 16], R = [255, 16, 16], B = [16, 16, 255], a, b, t;
    if (fr <= 200) return G; if (fr <= 300) { a = G; b = R; t = (fr - 200) / 100; } else if (fr <= 500) return R;
    else if (fr <= 600) { a = R; b = B; t = (fr - 500) / 100; } else if (fr <= 800) return B; else { a = B; b = G; t = (fr - 800) / 100; }
    return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
  }
  function drawBackdrop() {
    var now = performance.now(); clock += lastT ? Math.min(0.1, (now - lastT) / 1000) * 30 : 0; lastT = now;
    g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.fillStyle = "#000"; g.fillRect(0, 0, 800, 600);
    var k = 0.95 * 800 / gameCanvas.width; g.imageSmoothingEnabled = true; g.drawImage(gameCanvas, 80, 110, gameCanvas.width * k, gameCanvas.height * k); g.imageSmoothingEnabled = false;
    var gi = img("assets/menu/shapes/2065.png");
    if (ready(gi)) { // textura 98x98; cada um dos 45 blocos 98x98 do bg_noise leva a sua copia (morph: a textura desliza -49px,-49px em 24 quadros)
      var f = Math.floor(clock) % 24, off = 49 * (f === 23 ? 1 : f / 23); if (!SF._gridPat) SF._gridPat = g.createPattern(gi, "repeat");
      g.fillStyle = SF._gridPat; g.globalAlpha = 0.25;
      GRID_YS.forEach(function (y) { GRID_XS.forEach(function (x) { g.save(); g.beginPath(); g.rect(x, y, 98, 98); g.clip(); g.translate(x - off, y - off); g.fillRect(off, off, 98, 98); g.restore(); }); });
      g.globalAlpha = 1;
    }
    var c = tintAt(Math.floor(clock) % 900 + 1); g.globalCompositeOperation = "multiply"; g.fillStyle = "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; g.fillRect(0, 0, 800, 600); g.globalCompositeOperation = "source-over";
    try { SF.drawDemoOverheads(g, 80, 110, k); } catch (e) {} // sinais COM acima da tinta (dynamic_gui_mc do original)
  }
  function drawFrame() {
    drawBackdrop();
    shape(2077, 0, 0);
    shape(2097, 401, 578);
    var f = S, i;
    shape(2079, 13.95, 417.3); shape(2080, 11.95, 415.3); // creditos: ficam no overlay o tempo todo (os paineis grandes cobrem)
    // first_choise NAO e escondido ao abrir MODE (mode_selection) nem SET UP (set_up_main/set_up): continua desenhado por baixo (MenuMain.CheckNextMenu); so VS/STAGE/SURVIVAL o escondem
    if (screen === "first" || screen === "mode" || screen === "setup" || screen === "keys") {
      // (painel + opcoes + balao): textos do original (2079 = sombra preta, 2080 = branco; a fonte tem o A de "HJARPE" com trema)
      var im = img("assets/menu/2094/1.png");
      if (ready(im)) { // painel preto + opcoes (colunas 0-174) e, so na 1a vez, o balao "New to Superfighters? Start here!" (colunas 188+)
        var o = SF.menuOrg[2094][1]; g.drawImage(im, 0, 0, 175, im.naturalHeight, o[0], o[1], 175, im.naturalHeight);
        if (f.prompt) g.drawImage(im, 188, 0, im.naturalWidth - 188, im.naturalHeight, o[0] + 188, o[1], im.naturalWidth - 188, im.naturalHeight);
      }
      for (i = 0; i < 4; i++) if (i !== f.first) black(148, 195 + 32 * i - 7, 9, 14);
      marker(152.5, 195 + 32 * f.first, false);
    }
    if (screen === "mode") {
      spr(2102, 1, 18.6, 59.5, 1, 1);
      var my = [135.5, 167, 197];
      for (i = 0; i < 3; i++) if (i !== f.modePos) black(355.6 - 4, 59.5 + my[i] - 7, 9, 14);
      marker(355.6, 59.5 + my[f.modePos], false);
    } else if (screen === "players") {
      var xs = f.players === 1 ? [342] : [265, 419];
      f.plates.forEach(function (p, n) { plateAt(xs[n], 123, p, "p", p.row, n === f.cur, n + 1); });
    } else if (screen === "nobots") {
      var fr = (f.minB === 1 ? 2 : 0) + (f.maxB === 7 ? 1 : 2), base = img("assets/menu/2171/" + fr + ".png");
      if (ready(base)) g.drawImage(base, 290, 240);
      spr(2168, 1, [322, 347, 374, 399, 426, 451, 478, 505][f.nb], 285, 1, 1, YELLOW);
    } else if (screen === "bots") {
      var n7 = f.players !== 2;
      spr(n7 ? 2161 : 2162, 1, 0, 0, 1, 1);
      var pos = n7 ? [[108, 273], [263, 273], [418, 273], [573, 273], [108, 435], [263, 435], [418, 435]] : [[185, 273], [340, 273], [495, 273], [185, 435], [340, 435], [495, 435]];
      f.bots.forEach(function (b, n) { if (n < pos.length) plateAt(pos[n][0], pos[n][1], b, "c", b.row, n === f.bcur, 3); });
    } else if (screen === "map") {
      var vs = f.mode === 0, lvl = vs ? f.level : 10;
      spr(2236, vs ? 1 : 2, 0, 0, 1, 1);
      spr(2235, lvl, 2, 0, 1, 1); // previa do mapa (toggle_map_pic)
      // os rotulos FIGHT!/MAP/GAME MODE/RESET ja vem no PNG; refaz so setas e valores (cada toggle e um quadro do original)
      [[326, 354.5], [379, 382.5], [546.5, 382.5], [379, 404.5], [546.5, 404.5], [326, 429.5]].forEach(function (m) { black(m[0] - 5, m[1] - 8, 10, 16); });
      black(402, 368, 140, 48);
      spr(2187, lvl, 463, 375, 1, 1, f.mapPos === 1 ? YELLOW : WHITE);
      spr(2198, vs ? f.gmode : 10, 431.6, 399, 1, 1, !vs ? "#555555" : f.mapPos === 2 ? YELLOW : WHITE);
      if (f.mapPos === 0) marker(326, 354.5, false); else if (f.mapPos === 3) marker(326, 429.5, false);
      else if (f.mapPos === 1) { marker(379, 382.5, false); marker(546.5, 382.5, true); }
      else if (f.mapPos === 2 && vs) { marker(379, 404.5, false); marker(546.5, 404.5, true); }    } else if (screen === "setup") {
      var st = f.setup, lv = ["LOW", "MEDIUM", "HIGH"];
      spr(2272, 1, 0, 0, 1, 1);
      black(430, 170, 112, 90);
      ["GRAPHIC QUALITY", "EFFECT QUALITY", "SOUND VOLUME", "EDIT CONTROLS"].forEach(function (l, n) { if (n !== st.pos) { black(285, 185.5 + 30 * n - 9, 146, 18); text(l, 428, 185.5 + 30 * n + 5, WHITE, 16, "right"); } }); // so a linha escolhida fica amarela (o PNG vem todo amarelo)
      [lv[cfg.quality === 0 ? 2 : cfg.quality === 1 ? 1 : 0], lv[cfg.effects], Math.round(cfg.sfxVol * 100) + " %"].forEach(function (v, n) { text(v, 449, 191 + n * 30, st.pos === n ? YELLOW : WHITE, 16); });
      for (i = 0; i < 4; i++) { var qy = 185.5 + 30 * i; if (i !== st.pos) { black(262, qy - 7, 9, 14); black(526, qy - 7, 9, 14); } }
      if (st.pos < 3) { marker(268.5, 185.5 + 30 * st.pos, true); marker(531, 185.5 + 30 * st.pos, false); } else marker(268.5, 275.5, true);
    } else if (screen === "keys") {
      var kk = f.setup, pp = "p" + kk.player;
      spr(2315, 1, 0, 0, 1, 1);
      black(285, 168, 230, 30); text("PLAYER " + kk.player, 400, 188, kk.kp === 0 ? YELLOW : WHITE, 16, "center");
      black(405, 230, 130, 170);
      KEYS8.forEach(function (a, n) { var codes = (cfg.keys2 && cfg.keys2[pp] && cfg.keys2[pp][a]) || SF.defaultKeys[pp][a]; text(f.wait === n ? "..." : keyName(codes[0]), 411, KEYY[n] + 12, kk.kp === n + 2 ? YELLOW : WHITE, 16); });
      black(270, 180, 12, 340); black(520, 180, 14, 40);
      var yy2 = kk.kp === 0 ? 186.5 : kk.kp === 1 ? 216.5 : kk.kp === 10 ? 501.5 : KEYY[kk.kp - 2] + 8.5;
      if (kk.kp === 0) { marker(275, yy2, true); marker(525, yy2, false); } else marker(275, yy2, true);
      black(330, 495, 180, 20); text("RESET TO DEFAULT", 420, 509, kk.kp === 10 ? YELLOW : WHITE, 16, "center");
    }
    if (msgT > 0) { msgT--; black(160, 330, 480, 44); text(msg, 400, 358, YELLOW, 16, "center"); }
  }

  var hue = 0;
  function loop() {
    if (menuOn) { gameCanvas.style.filter = "none"; drawFrame(); } else lastT = 0;
    $("coopBtn").style.display = menuOn && screen === "first" && !$("overlay").classList.contains("on") ? "block" : "none";
    requestAnimationFrame(loop);
  }

  // ---------- teclas do menu (MenuKey: setas, Enter/Espaco, Esc/Backspace) ----------
  function press(k) {
    var f = S, p, b, st, kk, vs;
    if (screen === "first") {
      if (k === "up") f.first = (f.first + 3) % 4; else if (k === "down") f.first = (f.first + 1) % 4;
      else if (k === "enter") {
        if (f.first === 0 || f.first === 1) { f.players = f.first + 1; f.modePos = 0; go("mode"); }
        else if (f.first === 2) startTutorial(); else { f.setup.pos = 0; go("setup"); }
      }
    } else if (screen === "mode") {
      if (k === "up") f.modePos = (f.modePos + 2) % 3; else if (k === "down") f.modePos = (f.modePos + 1) % 3;
      else if (k === "back") back();
      else if (k === "enter") {
        if (f.modePos === 1) { notice("STAGE MODE: AINDA NAO IMPLEMENTADO"); return; }
        f.mode = f.modePos === 0 ? 0 : 2; startPlates(); go("players");
      }
    } else if (screen === "players") {
      p = f.plates[f.cur];
      if (k === "left" || k === "right") { var d = k === "left" ? -1 : 1; if (p.row === 0) p.ch = (p.ch + d + CHAR_N + 1) % (CHAR_N + 1); else if (p.canTeam) p.team = (p.team + d + 5) % 5; }
      else if (k === "up" || k === "down") { if (p.canTeam) p.row = 1 - p.row; }
      else if (k === "enter") {
        if (f.cur < f.players - 1) { f.cur++; snd("accept"); }
        else if (f.mode === 0) { f.minB = f.players === 1 ? 1 : 0; f.maxB = f.players === 1 ? 7 : 6; f.nb = f.minB; go("nobots"); }
        else { f.mapPos = 0; go("map"); }
      } else if (k === "back") { if (f.cur > 0) { f.cur--; snd("cancel"); } else back(); }
    } else if (screen === "nobots") {
      if (k === "left") { f.nb--; if (f.nb < f.minB) f.nb = f.maxB; } else if (k === "right") { f.nb++; if (f.nb > f.maxB) f.nb = f.minB; }
      else if (k === "back") back();
      else if (k === "enter") { startBots(); if (f.nb === 0) { f.mapPos = 0; go("map"); } else go("bots"); }
    } else if (screen === "bots") {
      b = f.bots[f.bcur];
      if (k === "left" || k === "right") { var dd = k === "left" ? -1 : 1; if (b.row === 0) b.ch = (b.ch + dd + CHAR_N + 1) % (CHAR_N + 1); else if (b.row === 1) b.team = (b.team + dd + 5) % 5; else b.diff = (b.diff + dd + 3) % 3; }
      else if (k === "up") b.row = (b.row + 2) % 3; else if (k === "down") b.row = (b.row + 1) % 3;
      else if (k === "enter") {
        if (f.bcur < f.bots.length - 1) { var nx = f.bots[f.bcur + 1]; nx.team = b.team; nx.diff = b.diff; f.bcur++; snd("accept"); } else { f.mapPos = 0; go("map"); }
      } else if (k === "back") { if (f.bcur > 0) { f.bcur--; snd("cancel"); } else back(); }
    } else if (screen === "map") {
      vs = f.mode === 0;
      if (k === "up") { f.mapPos--; if (!vs && f.mapPos === 2) f.mapPos--; if (f.mapPos < 0) f.mapPos = 3; }
      else if (k === "down") { f.mapPos++; if (!vs && f.mapPos === 2) f.mapPos++; if (f.mapPos > 3) f.mapPos = 0; }
      else if (k === "left" || k === "right") {
        var d3 = k === "left" ? -1 : 1;
        if (f.mapPos === 1 && vs) { f.level += d3; if (f.level > 8) f.level = 2; if (f.level < 2) f.level = 8; }
        else if (f.mapPos === 2 && vs) { f.gmode += d3; if (f.gmode > 7) f.gmode = 1; if (f.gmode < 1) f.gmode = 7; }
      } else if (k === "enter") { if (f.mapPos === 0) launch(); else if (f.mapPos === 3) { reset(); hist = []; screen = "first"; snd("cancel"); } }
      else if (k === "back") back();
    } else if (screen === "setup") {
      st = f.setup;
      if (k === "up") st.pos = (st.pos + 3) % 4; else if (k === "down") st.pos = (st.pos + 1) % 4;
      else if (k === "left" || k === "right") {
        var d4 = k === "left" ? -1 : 1;
        if (st.pos === 0) cfg.quality = (cfg.quality + d4 + 3) % 3; else if (st.pos === 1) cfg.effects = (cfg.effects + d4 + 3) % 3;
        else if (st.pos === 2) { cfg.sfxVol = Math.max(0, Math.min(1, Math.round((cfg.sfxVol + d4 * 0.1) * 10) / 10)); try { SF.setSfxVolume(cfg.sfxVol); } catch (e) {} }
        save();
      } else if (k === "enter") { if (st.pos === 3) { st.kp = 0; st.player = 1; go("keys"); } }
      else if (k === "back") { save(); back(); }
    } else if (screen === "keys") {
      kk = f.setup;
      if (k === "up") kk.kp = (kk.kp + 10) % 11; else if (k === "down") kk.kp = (kk.kp + 1) % 11;
      else if (k === "left" || k === "right") { if (kk.kp === 0) kk.player = 3 - kk.player; }
      else if (k === "enter") { if (kk.kp >= 2 && kk.kp <= 9) f.wait = kk.kp - 2; else if (kk.kp === 10) { delete cfg.keys2; save(); snd("accept"); } }
      else if (k === "back") { save(); back(); }
    }
  }
  var KMAP = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Enter: "enter", Space: "enter", Escape: "back", Backspace: "back", NumpadEnter: "enter" };
  addEventListener("keydown", function (e) {
    if (!menuOn || $("overlay").classList.contains("on")) return; // overlay aberto (sala online, pausa, fim de partida): os botoes do overlay recebem as teclas
    if (document.activeElement && document.activeElement.tagName === "INPUT") return; // digitando no campo de codigo (COOP ONLINE) - nao navega o menu por baixo
    if (S.wait != null) { // capturando uma tecla nova
      e.preventDefault(); e.stopPropagation();
      var kk = S.setup, pp = "p" + kk.player;
      if (e.code !== "Escape") {
        cfg.keys2 = cfg.keys2 || {};
        [1, 2].forEach(function (s) { KEYS8.forEach(function (a) { var cur = (cfg.keys2["p" + s] && cfg.keys2["p" + s][a]) || SF.defaultKeys["p" + s][a];
          if (cur.indexOf(e.code) >= 0 && !(s === kk.player && a === KEYS8[S.wait])) { cfg.keys2["p" + s] = cfg.keys2["p" + s] || {}; cfg.keys2["p" + s][a] = cur.filter(function (c) { return c !== e.code; }); } }); });
        cfg.keys2[pp] = cfg.keys2[pp] || {}; cfg.keys2[pp][KEYS8[S.wait]] = [e.code]; save(); snd("accept");
      }
      S.wait = null; return;
    }
    var k = KMAP[e.code]; if (!k) return; e.preventDefault(); press(k);
  }, true);

  // ---------- pausa e fim de partida ----------
  function overlay(on) { $("overlay").classList.toggle("on", on); }
  function buttons(list) {
    var box = $("ovbtns"); box.innerHTML = "";
    list.forEach(function (b) { var el = document.createElement("button"); el.textContent = b[0]; if (b[2]) el.className = "primary"; el.onclick = b[1]; el.disabled = !!b[3]; box.appendChild(el); });
  }
  function toMenu() { SF.stop(); try { SF.net.close(); } catch (e) {} on = null; showMenu(); }
  SF.onNetDrop = function () { // COOP ONLINE: o outro PC caiu/saiu no meio da partida (nao da pra continuar sem ele)
    $("ovtitle").textContent = "CONEXAO PERDIDA"; $("ovextra").textContent = "O outro jogador saiu ou a rede caiu.";
    $("ovtable").innerHTML = ""; coopHide(); buttons([["Menu principal", toMenu, true]]); overlay(true);
  };
  SF.onPause = function (p) {
    if (!p) { overlay(false); return; }
    $("ovtitle").textContent = "PAUSADO"; $("ovextra").textContent = ""; $("ovtable").innerHTML = "";
    buttons([["Continuar", function () { SF.setPaused(false); overlay(false); }, true], ["Menu principal", toMenu]]); overlay(true);
  };
  SF.hideMenu = hideMenu; // usado pelos testes (partida iniciada direto pela API): fecha o menu pra ele nao engolir as teclas
  SF.onEnd = function (r) {
    $("ovtitle").textContent = r.title.toUpperCase(); $("ovextra").textContent = r.extra;
    var html = "<table><tr><th>Jogador</th><th>Abates</th><th>Mortes</th></tr>";
    r.rows.forEach(function (p) { html += '<tr class="' + (p.you ? "you" : "") + '"><td>' + p.name + (p.team ? " (time " + p.team + ")" : "") + "</td><td>" + p.kills + "</td><td>" + p.deaths + "</td></tr>"; });
    $("ovtable").innerHTML = html + "</table>";
    if (on) { // ONLINE: a sala continua aberta; o anfitriao decide voltar pra sala (os convidados seguem)
      on.phase = "ended";
      var box = $("coopui"); box.innerHTML = ""; box.style.display = "block";
      addLine(box, on.host ? "Partida encerrada. Voltar pra sala para escolher outra partida?" : "Partida encerrada. Aguardando o anfitriao voltar pra sala...");
      buttons(on.host ? [["VOLTAR A SALA", backToLobby, true], ["SAIR DA SALA", leaveOnline]] : [["SAIR DA SALA", leaveOnline]]);
      overlay(true); return;
    }
    coopHide();
    buttons([["Jogar de novo", function () { overlay(false); launch(true); }, true], ["Menu principal", toMenu]]); overlay(true);
  };
  // ---------- inicio ----------
  var started = false;
  // boot: so inicia a demonstracao de fundo se NAO houver partida online em andamento (senao o startDemo, que chega
  // com atraso, sobrescrevia a sessao de rede e um dos PCs saia do lockstep sem aviso).
  function boot() { if (started) return; started = true; if (!(SF.net && SF.net.connected && SF.net.connected())) startDemo(); playTheme(); requestAnimationFrame(loop); } // tema do menu ja no carregamento (se o navegador deixar; senao no 1o toque)
  var fontsReady = (document.fonts && document.fonts.ready) || Promise.resolve();
  fontsReady.then(boot); setTimeout(boot, 1500);
})();
