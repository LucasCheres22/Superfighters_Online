// Superfighters HTML5 - motor do prototipo. Sem dependencias, roda em file://.
(function () {
  "use strict";
  var canvas = document.getElementById("c"), ctx = canvas.getContext("2d");
  var map = SF.maps.warehouse, P = SF.player;
  var cfg = { mode: "dm", bots: 3, difficulty: 1, kills: 10, map: "warehouse", char: "johnny", sfxVol: 1, music: true };
  var running = false, paused = false, ended = false, rafId = 0, surv = null, music = null;
  var TEAM_COLORS = { 1: "#4aa3ff", 2: "#ff5a4a", 3: "#ffe94a", 4: "#4aff6a" };
  var BOT_NAMES = { johnny: "Johnny", boris: "Boris", agent: "Agent", billy: "Billy", scott: "Scott", funnyman: "Funnyman", mac: "Mac", jeff: "Jeff", blood: "Blood", burnt: "Burnt" };
  var VIEW_W = 960, VIEW_H = 720; canvas.width = VIEW_W; canvas.height = VIEW_H; // viewport 4:3 como o palco 800x600 do original
  ctx.imageSmoothingEnabled = false;
  // O jogo original roda a 24 fps; cooldowns/velocidades dos dados estao em "frames originais".
  // Nosso loop e 60Hz, entao tempo de combate avanca DT = 24/60 por tick.
  var DT = 0.4, S = 1.6, SHOULDER_X = 0, SHOULDER_Y = -11, MAXFALL = 20; // MAXFALL: velocidade maxima de queda (px do port por frame original)
  // Ajustes so do movimento dos personagens (animacoes dos sprites, tiros e granadas nao sao afetados). Corrida x RK; gravidade x GK com
  // velocidade de pulo/queda x sqrt(GK), entao a altura do pulo nao muda e ele dura mais tempo.
  var RK = 1, GK = 1, JK = 1; // RK = SF.player.runScale; GK = SF.player.gravityScale; JK = sqrt(GK) (mantem a altura do pulo)
  var CHARS = ["johnny", "boris", "agent", "billy", "scott", "funnyman", "mac", "jeff"];

  // fonte pixel 04b03 (extraida do SWF); sem ela o canvas cai em monospace
  try { var pxFont = new FontFace("sfpixel", "url(" + SF.fonts.a + ")"); pxFont.load().then(function () { document.fonts.add(pxFont); }); } catch (e) {}
  // ---------- sprites ----------
  // Os clipes START_* (sacar a arma: rifle, shotgun, uzi...) vieram do SWF sem ponto de registro (ox=oy=0), entao eram
  // desenhados com o canto superior esquerdo nos pes do personagem - o corpo inteiro ficava afundado no chao e deslocado.
  // Corrige uma vez: pes no centro-base do quadro (igual aos outros clipes de corpo inteiro, ex. AIM_TURN: ox~w/2, oy=h).
  (function () {
    for (var cn in SF.chars) { var ch0 = SF.chars[cn];
      for (var kn in ch0) if (kn.indexOf("START_") === 0 && ch0[kn].ANIM) { var m0 = SF.sprites[ch0[kn].ANIM]; if (!SF.place && m0 && m0.ox === 0 && m0.oy === 0 && m0.h >= 10) { m0.ox = m0.w / 2; m0.oy = m0.h; } } }
  })();
  var imgs = {};
  function frameImg(id, n) {
    var k = id + "/" + n, im = imgs[k];
    if (!im) {
      var path = "assets/sprites/" + id + "/" + n + ".png"; im = new Image(); im.src = path; imgs[k] = im;
      im.onerror = function () { setTimeout(function () { delete imgs[k]; }, 500); }; // tenta de novo
    }
    return im.complete && im.naturalWidth ? im : null;
  }
  function spr(id, frame, x, y, flip, rot, scale) {
    var m = SF.sprites[id]; if (!m) return false;
    var im = frameImg(id, Math.min(m.n, Math.max(1, Math.floor(frame)))); if (!im) return false;
    ctx.save(); ctx.translate(x, y); ctx.scale(flip * scale, scale); if (rot) ctx.rotate(rot);
    var dbgT = SF.debugLog ? ctx.getTransform() : null; // depuracao (F9): matriz real da peca no canvas
    ctx.drawImage(im, -m.ox, -m.oy); ctx.restore();
    if (SF.debugLog) SF.debugLog.push({ id: id, frame: Math.min(m.n, Math.max(1, Math.floor(frame))), x: x, y: y, flip: flip, rot: rot || 0, scale: scale, m: m, t: { a: dbgT.a, b: dbgT.b, c: dbgT.c, d: dbgT.d, e: dbgT.e, f: dbgT.f } });
    return true;
  }

  // arma vazia no chao: o frame 1 do sprite traz a arma (escura) + os colchetes BRANCOS do indicador de municao.
  // Versao sem os colchetes: pixels claros viram transparentes (so a arma fica). Cache por sprite.
  var cleanCache = {};
  function cleanSprite(id) {
    if (cleanCache[id] !== undefined) return cleanCache[id];
    var im = frameImg(id, 1); if (!im) return null;
    var c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
    var g = c.getContext("2d"); g.drawImage(im, 0, 0); var img = g.getImageData(0, 0, c.width, c.height), d = img.data;
    for (var i = 0; i < d.length; i += 4) if (d[i] > 170 && d[i + 1] > 170 && d[i + 2] > 170) d[i + 3] = 0;
    g.putImageData(img, 0, 0); cleanCache[id] = c; return c;
  }
  function sprClean(id, x, y, flip, scale) {
    var m = SF.sprites[id], c = cleanSprite(id); if (!m || !c) return false;
    ctx.save(); ctx.translate(x, y); ctx.scale(flip * scale, scale); ctx.drawImage(c, -m.ox, -m.oy); ctx.restore(); return true;
  }

  // ---------- audio ----------
  var sounds = {};
  function snd(name) {
    if (!sounds[name]) { var a = new Audio(); a.src = "assets/sounds/" + name + ".mp3"; a.preload = "auto"; sounds[name] = a; }
    return sounds[name];
  }
  var SOUND_FILES = { ambient: "2502_ambient_loop_1", gun00: "2530_gun00", gun01: "2531_gun01", uzi00: "2557_uzi00", uzi01: "2558_uzi01", rifle00: "2545_rifle00", rifle01: "2546_rifle01",
    shotgun00: "2552_shotgun00", shotgun01: "2553_shotgun01", shotgun02: "2554_shotgun02", magnum: "2536_magnum", sniper00: "2555_sniper00", sniper01: "2556_sniper01",
    punch00: "2539_punch00", punch01: "2540_punch01", punch02: "2541_punch02", punch03: "2542_punch03", cut00: "2517_cut00", cut01: "2518_cut01", cut02: "2519_cut02", katana: "2567_katana_01",
    outofammo_light: "2538_outofammo_light", outofammo_heavy: "2537_outofammo_heavy", hit1: "2503_bullet_hit_1", hit2: "2504_bullet_hit_2", hit3: "2505_bullet_hit_3",
    jump: "2535_jump_00", gib: "2527_gib_00", pickup: "2544_rifle_draw", wilhelm: "2506_wilhelm", metal: "2561_bullet_hitmetal_01", theme: "2501_superfighters_theme",
    explosion0: "2521_explosion00", explosion1: "2522_explosion01", explosion2: "2523_explosion02", explosion3: "2524_explosion03", bazooka: "2512_bazooka",
    gsafe: "2566_grenade_safe", health: "2526_getHealth_00", wood1: "2514_bustwood_1", wood2: "2515_bustwood_2", woodhit: "2559_wood_impact00",
    swing1: "2569_svisch4", swing2: "2570_svisch6", kick: "2541_punch02", aim_small: "2511_aim_small", aim_big: "2510_aim_big", rifle_draw: "2544_rifle_draw", shotgun_aim: "2568_shotgun_aim", bazooka_aim: "2560_bazooka_aim", dive: "2520_dive_catch", roll: "2547_roll",
    heartbeat: "2534_heartbeat", shell0: "2548_shellbounce00", shell1: "2549_shellbounce01", accept: "2509_accept_02", cancel: "2516_cancel_02", flame: "2569_svisch4", glass1: "2528_glass_1", fireplosion: "2525_fireplosion" };
  function play(key, vol) {
    if (cfg.sfxVol <= 0 || (vol != null && vol * cfg.sfxVol <= 0)) return;
    var f = SOUND_FILES[key] || key; var a = snd(f).cloneNode();
    a.volume = Math.min(1, (vol == null ? 0.5 : vol) * cfg.sfxVol); var p = a.play(); if (p && p.catch) p.catch(function () {});
  }
  function playAny(list) { play(list[(rand() * list.length) | 0]); }

  // ---------- input ----------
  var keys = {}, mouse = { x: 480, y: 270, down: false };
  // Controles do original (Options.as): P1 = setas + N melee / M atirar / virgula granada / ponto powerup; P2 = WASD + 1 2 3 4.
  // Pular = cima, agachar = baixo (no original nao ha tecla propria). cfg.keys2 = { p1: {acao: [codes]}, p2: {...} }.
  var DEFAULT_KEYS = {
    p1: { up: ["ArrowUp"], down: ["ArrowDown"], left: ["ArrowLeft"], right: ["ArrowRight"], melee: ["KeyN"], fire: ["KeyM"], throw: ["Comma"], powerup: ["Period"] },
    p2: { up: ["KeyW"], down: ["KeyS"], left: ["KeyA"], right: ["KeyD"], melee: ["Digit1"], fire: ["Digit2"], throw: ["Digit3"], powerup: ["Digit4"] }
  };
  SF.defaultKeys = DEFAULT_KEYS;
  function codesFor(slot, act) {
    var s = "p" + slot, u = cfg.keys2 && cfg.keys2[s] && cfg.keys2[s][act];
    return (u || DEFAULT_KEYS[s][act] || []).slice();
  }
  function held(slot, act) { var c = codesFor(slot, act); for (var i = 0; i < c.length; i++) if (keys[c[i]]) return true; return false; }
  function isBound(code) {
    for (var s = 1; s <= 2; s++) for (var a in DEFAULT_KEYS["p" + s]) if (codesFor(s, a).indexOf(code) >= 0) return true;
    return false;
  }
  addEventListener("keydown", function (e) { keys[e.code] = true;
    if (running && !paused && isBound(e.code)) e.preventDefault();
    if (e.code === "F3") debugCol = !debugCol;
    if (e.code === "Escape" && running && !ended && !cfg.demo) { paused = !paused; if (SF.onPause) SF.onPause(paused); } if (["Space", "ArrowUp", "ArrowDown"].indexOf(e.code) >= 0) e.preventDefault(); });
  addEventListener("keyup", function (e) { keys[e.code] = false; });
  canvas.addEventListener("mousemove", function (e) { var r = canvas.getBoundingClientRect(); mouse.x = (e.clientX - r.left) * canvas.width / r.width; mouse.y = (e.clientY - r.top) * canvas.height / r.height; });
  canvas.addEventListener("mousedown", function (e) { if (e.button === 2) mouse.right = true; else mouse.down = true; e.preventDefault(); });
  addEventListener("mouseup", function (e) { if (e.button === 2) mouse.right = false; else mouse.down = false; });
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  // ---------- estado ----------
  var players = [], bullets = [], fires = [], particles = [], pickups = [], tick = 0, started = false, msgs = [];
  var solids = map.platforms.slice(), props = [], grenades = [], blasts = [], pending = [], shake = 0;
  var COLORS = ["#e8e8e8", "#d94a3a", "#3a8fd9", "#d9b43a", "#4ad96a"];
  // RNG determinístico (mulberry32): COOP ONLINE roda a mesma simulacao nos dois PCs (lockstep) - para os dois chegarem
  // ao mesmo resultado (quem um bot ataca, dano critico, spawn de item...) os dois precisam sortear os MESMOS numeros,
  // entao toda a logica do jogo usa rand() (seedada igual nos dois lados) em vez de Math.random() puro.
  var rngState = 1;
  function rand() { rngState = (rngState + 0x6D2B79F5) >>> 0; var t = rngState; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function seedRng(s) { rngState = s >>> 0; }

  function makePlayer(i, human) {
    var s = spawnList[i % spawnList.length], dup = Math.floor(i / spawnList.length);
    var sx = s[0] + (dup ? (dup % 2 ? 1 : -1) * Math.ceil(dup / 2) * 14 : 0); // 2+ jogadores no mesmo ponto: espalha um pouco pros lados
    sx = Math.max(P.width, Math.min(map.width - P.width, sx));
    return { id: i, name: "P" + i, team: 0, skill: 1, char: CHARS[i % CHARS.length], recoil: 0, anim: 0, gren: 3, kx: 0, human: human, color: COLORS[i % COLORS.length], x: sx, y: groundTopBase(sx, s[1] - 10), vx: 0, vy: 0, face: 1, onGround: false,
      health: P.health, dead: false, respawn: 0, weapon: null, melee: "fists", ammo: 0, cd: 0, kills: 0, deaths: 0, aim: 0, hurt: 0,
      atk: null, stun: 0, stunA: 1, fall: false, kd: 0, stag: 0, rot: 0, rotV: 0, rotI: 0, push: 0, pushDelay: 0, imm: 0, lock: 0, gone: false,
      sprint: 0, energy: P.energyMax, lastTapDir: 0, lastTapT: -99,
      ai: { jumpCd: 0, think: 0, tx: 0, ty: 0, wantShoot: false, aimErr: 0 } };
  }
  function spawnPickup(sp) { pickups.push({ x: sp[0], y: sp[1], type: sp[2], respawn: 0, base: sp }); }
  function addBot(i, charName, team, skill) {
    var b = makePlayer(i, false); b.char = charName; b.name = BOT_NAMES[charName] || charName; b.team = team; b.skill = skill; giveWeapon(b, "pistol"); players.push(b); return b;
  }
  function reset() {
    // cfg.seed (COOP ONLINE): os dois PCs recebem a mesma semente do anfitriao antes de comecar, pra sortear os mesmos numeros.
    seedRng(cfg.seed != null ? cfg.seed : ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0));
    netActive = !!cfg.net; netLocalIn = {}; netRemoteIn = {}; captureTick = 1;
    RK = P.runScale || 1; GK = P.gravityScale || 1; JK = Math.sqrt(GK); // fixos em data/weapons.js (SF.player)
    map =SF.maps[cfg.map] || SF.maps.rooftops || SF.maps.warehouse; if (map.art) loadArt(map.art); if (map.front) loadArt(map.front); canvas.width = VIEW_W; canvas.height = VIEW_H; ctx.imageSmoothingEnabled = false; solids = map.platforms.slice();
    buildNav(); computeSpawns(); // antes dos props entrarem em solids
    SF.navStats = { nodes: nav.nodes.length, edges: nav.nodes.reduce(function (s, n) { return s + n.adj.length; }, 0) };
    var teamMode = cfg.mode === "tdm", nb = cfg.mode === "survival" ? 0 : cfg.bots;
    if (cfg.roster) { // lista de jogadores vinda do menu: [{bot, slot, char (0 = aleatorio), team (0 = solo, 1-4), diff (0-2)}]
      players = []; var used = [];
      cfg.roster.forEach(function (r) { if (r.char) used.push(CHARS[r.char - 1]); });
      var rnd = CHARS.filter(function (c) { return used.indexOf(c) < 0; }).sort(function () { return rand() - 0.5; });
      cfg.roster.forEach(function (r, i) {
        var pl = makePlayer(i, !r.bot), ch = r.char ? CHARS[r.char - 1] : (rnd.length ? rnd.pop() : CHARS[(rand() * CHARS.length) | 0]);
        pl.char = ch; pl.team = r.team || 0;
        if (r.bot) { pl.name = BOT_NAMES[ch] || ch; pl.skill = r.diff == null ? 1 : r.diff; }
        else { pl.slot = r.slot || 1; pl.name = "P" + pl.slot; if (pl.slot === 2) { pl.elev = 0; pl.faceKey = 1; } pl.net = r.net || null; }
        giveWeapon(pl, "pistol"); players.push(pl);
      });
      if (!players.some(function (q) { return q.human; })) players[0].human = false;
    } else {
    players = [makePlayer(0, true)]; players[0].char = SF.chars[cfg.char] ? cfg.char : "johnny"; players[0].name = "Voce"; players[0].team = teamMode ? 1 : 0;
    players[0].slot = 1;
    if (cfg.p2) { // vale tambem na sobrevivencia (cooperativo)
      var p2 = makePlayer(1, true); p2.slot = 2; p2.elev = 0; p2.faceKey = 1; p2.team = teamMode ? 1 : 0; p2.name = "P2"; players[0].name = "P1";
      p2.char = CHARS.filter(function (c) { return c !== players[0].char; })[0] || "boris"; players.push(p2);
    }
    players.forEach(function (h) { giveWeapon(h, "pistol"); }); // como no original: todos comecam com pistola (e punhos no slot corpo a corpo)
    var pool = CHARS.filter(function (c) { return !players.some(function (h) { return h.char === c; }); }).sort(function () { return rand() - 0.5; });
    if (!pool.length) pool = CHARS.slice();
    var first = players.length;
    for (var i = first; i < first + nb; i++) addBot(i, pool[(i - first) % pool.length], teamMode ? ((i - first) % 2 === 0 ? 2 : 1) : 0, cfg.difficulty);
    }    surv = cfg.mode === "survival" ? { wave: 0, timer: 60, kills: 0 } : null; tick = 0; msgs = [];
    bullets = []; fires = []; particles = []; pickups = []; grenades = []; blasts = []; pending = []; props = []; solids = map.platforms.slice();    decor = []; wsTimer = 24; portalCd = {}; gnodes = []; mapBtn = {}; glassQ = []; addGlass(cfg.map); setupRamps();
    (map.weaponSpawns || []).forEach(spawnPickup);
    hangReset(); (map.props || []).forEach(function (d) { addProp(d[0], d[1], d[2], false); });
    // mapas convertidos do SWF: objetos [tipos separados por virgula, x, y, rot]; um tipo e sorteado, caem ate o chao
    (map.decor || []).slice().sort(function (a, b) { return b[2] - a[2]; }).forEach(function (d) {
      var types = d[0].split(","), t = types[(rand() * types.length) | 0];
      if (t === "NONE") return;
      if (t === "CRATE_HANGING") hangAdd(d);
      else if (PROP_FOR[t]) addProp(PROP_FOR[t], d[1], groundTopW(d[1], d[2] - 6, SF.props[PROP_FOR[t]].w / 2), true); // largura conta: monte de caixas empilha em vez de ficar sobreposto
      else if (DECOR_FOR[t]) { var id = SF.spriteAlias[DECOR_FOR[t][0]], m = id && SF.sprites[id]; if (m) decor.push({ id: id, x: d[1], y: groundTop(d[1], d[2] - 6) - (m.h - m.oy) * S + 0, flip: DECOR_FOR[t][1] || 1 }); }
    });
    players.forEach(function (p) { giveWeapon(p, "pistol"); });
    // elevadores: plataformas-nuvem que se movem (entram em solids depois dos props, que nao devem assentar sobre elas)
    camLast = null; var t0 = camTarget(); cam.cx = t0.cx; cam.cy = t0.cy; cam.s = t0.s; placeCam(); // camera ja enquadrada ao iniciar
    liftObjs = (map.lifts || []).map(function (l) {
      var rect = [l.x - l.w / 2, l.y - l.h / 2, l.w, l.h, "cloud"], o = { def: l, rect: rect, cx: l.x, cy: l.y, dx: 0, dy: 0 }; rect.lift = o; solids.push(rect); return o;
    });
    if (!cfg.demo) players.forEach(function (p) { p.imm = 48; }); // SetStartImmunity() do original: 48 frames de imunidade so no INICIO da partida
  }
  var liftObjs = [];
  // Elevador do original: manivela (circulo com motor) + biela de comprimento 1.5A presa a um ponto a 0.5A do centro,
  // com o elevador guiado por uma junta prismatica. A = amplitude. Posicao exata abaixo; periodo = 2*pi/omega segundos.
  function liftOffset(l, t) {
    var A = l.amp, th = l.om * t / 60, off = -2 * A + 0.5 * A * Math.cos(th) + Math.sqrt(2.25 * A * A - 0.25 * A * A * Math.sin(th) * Math.sin(th));
    return l.vert ? { x: 0, y: off } : { x: off, y: 0 };
  }
  function updateLifts() {
    liftObjs.forEach(function (o) {
      o.prevTop = o.rect[1]; o.prevLeft = o.rect[0]; // posicao antes de mover neste tick (usado no fix de tunelamento em collide())
      var off = liftOffset(o.def, tick), nx = o.def.x + off.x, ny = o.def.y + off.y;
      o.dx = nx - o.cx; o.dy = ny - o.cy; o.cx = nx; o.cy = ny; o.rect[0] = nx - o.def.w / 2; o.rect[1] = ny - o.def.h / 2;
    });
    players.forEach(function (p) { // quem esta em cima e carregado (horizontal: barra contra paredes solidas para nao atravessar)
      if (p.dead || !p.standOn || !p.standOn.lift) return;
      var o = p.standOn.lift, nx = p.x + o.dx;
      for (var k = 0; k < solids.length; k++) { var r = solids[k]; if (thinR(r) || r === p.standOn) continue;
        if (nx - P.width / 2 < r[0] + r[2] && nx + P.width / 2 > r[0] && p.y - P.height < r[1] + r[3] && p.y > r[1]) { nx = o.dx > 0 ? r[0] - P.width / 2 : r[0] + r[2] + P.width / 2; break; } }
      // elevador horizontal: o personagem e carregado sem apertar nada, entao nada virava o sprite pra acompanhar -
      // ficava "de costas" pro lado que estava realmente indo. So vira se estiver parado/livre (nao atropela luta ativa).
      if (Math.abs(o.dx) > 0.02 && !p.atk && !p.act && !p.aiming && !busy(p)) p.face = o.dx > 0 ? 1 : -1;
      p.x = nx; p.y = p.standOn[1];
    });
  }
  function acidKill(p) {
    if (p.dead || ended) return;
    p.dead = true; p.gone = true; p.respawn = 150; p.deaths++; p.health = 0; play("gib", 0.6); say(p.name + " caiu no acido");
    for (var i = 0; i < 14; i++) particles.push({ x: p.x, y: p.y - 10, vx: (rand() - 0.5) * 3, vy: -rand() * 4, life: 40, c: "#7dff3a", g: 0.15, r: 3 });
    checkWin();
  }
  var decor = [], wsTimer = 24, portalCd = {};
  // ---------- pecas animadas da arte do mapa (data/map_anim.js, gerado por tools/mapanim.ps1) ----------
  // No original cada mapa e um quadro do MovieClip "levels"; ventiladores, nuvens, goteira e botoes sao MovieClips FILHOS desse quadro
  // (nao quadros do mapa), tocados por MapGraphic.Update(game_speed): 1 quadro por frame original, mais lento no slowmo.
  var mapBtn = {}; // botoes ja apertados nesta partida (nome -> true)
  function mapLevel() { var A = SF.mapAnim, m = A && map.art && /level_(\d+)\.png$/.exec(map.art.src); return m ? A.levels[m[1]] : null; }
  function lvx(x) { return map.art.x + (x - SF.mapAnim.box[0]) * 1.6; }
  function lvy(y) { return map.art.y + (y - SF.mapAnim.box[1]) * 1.6; }
  // BUTTON_01 (Area de Testes / Survival): ButtonInMeleeRange do original - soco sem acertar ninguem, de frente pro botao, a mais de 4
  // e ate 14 px na horizontal e ate 10 px na vertical (meio do corpo). Ativar destroi o alcapao (hatch) daquele lado e o botao trava.
  function tryButton(p, dir) {
    var L = mapLevel(); if (!L || !L.btns) return false;
    for (var i = 0; i < L.btns.length; i++) { var b = L.btns[i]; if (mapBtn[b.name]) continue;
      var bx = lvx(b.at[0] + 0.5), by = lvy(b.at[1] + 0.5), dx = bx - p.x, ad = Math.abs(dx);
      if (dx * dir > 0 && ad <= 14 * 1.6 && ad > 4 * 1.6 && Math.abs((p.y - 12.8) - by) <= 10 * 1.6) {
        mapBtn[b.name] = true; play("outofammo_light", 0.6);
        var hatch = null; solids.forEach(function (r) { if (r.prop || r.lift || Math.abs(r[2] - 107.2) > 3 || Math.abs(r[3] - 20.8) > 3) return;
          if (!hatch || (b.name === "btn_left" ? r[0] < hatch[0] : r[0] > hatch[0])) hatch = r; });
        if (hatch) { var hi = solids.indexOf(hatch); if (hi >= 0) solids.splice(hi, 1); }
        return true; } }
    return false;
  }
  function drawMapAnim(under) {
    var A = SF.mapAnim, L = mapLevel(); if (!L) return;
    var t = tick * DT, a = map.art, im, i;
    if (under) {
      if (L.back) drawArt({ src: L.back, x: a.x, y: a.y, w: a.w, h: a.h });
      if (L.clouds) { im = loadArt(A.clouds); if (im.complete && im.naturalWidth) { // bitmap ladrilhado rolando pra esquerda dentro da janela
        var C = A.clouds, wx = lvx(L.clouds[0]), wy = lvy(L.clouds[1] + C.oy), off = C.tile * (1 - (t % C.frames) / C.frames);
        ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, C.w * 1.6, C.h * 1.6); ctx.clip();
        for (i = -1; i * C.tile + off < C.w; i++) ctx.drawImage(im, wx + (i * C.tile + off) * 1.6, wy, im.naturalWidth * 1.6, im.naturalHeight * 1.6);
        ctx.restore(); } }
      return;
    }
    if (L.fans) { im = loadArt(A.fan); if (im.complete && im.naturalWidth) { var fi = Math.floor(t % 17) % 16; // 17 quadros: o 17o repete o 1o
      L.fans.forEach(function (f) { ctx.save(); ctx.translate(lvx(f[0]), lvy(f[1])); ctx.rotate(fi * A.fan.step * Math.PI / 180); ctx.drawImage(im, A.fan.o[0] * 1.6, A.fan.o[1] * 1.6, im.naturalWidth * 1.6, im.naturalHeight * 1.6); ctx.restore(); }); } }
    if (L.pour) { var pi = Math.floor((t % (A.pour.src.length * A.pour.hold)) / A.pour.hold); im = loadArt({ src: A.pour.src[pi] });
      if (im.complete && im.naturalWidth) A.pour.grid.forEach(function (g) { ctx.drawImage(im, lvx(L.pour[0] + g[0] + A.pour.o[pi][0]), lvy(L.pour[1] + g[1] + A.pour.o[pi][1]), im.naturalWidth * 1.6, im.naturalHeight * 1.6); }); }
    if (L.btns) L.btns.forEach(function (b) { var k = mapBtn[b.name] ? 1 : 0; im = loadArt({ src: A.btn.src[k] }); if (!(im.complete && im.naturalWidth)) return;
      ctx.save(); ctx.translate(lvx(b.at[0]), lvy(b.at[1])); ctx.scale(b.flip, b.flip); ctx.drawImage(im, A.btn.o[k][0] * 1.6, A.btn.o[k][1] * 1.6, im.naturalWidth * 1.6, im.naturalHeight * 1.6); ctx.restore(); });
  }
  // TABLE/TABLE_SMALL viraram props (fisica ao chutar, ver SF.props.push) em vez de decoracao fixa.
  var PROP_FOR = { CRATE: "crate", BARREL: "barrel_plain", BARREL_EXPLOSIVE: "barrel", GASCAN: "gascan", TABLE: "table", TABLE_SMALL: "table_small", COMFY_CHAIR: "comfy_chair" };
  var DECOR_FOR = { CHAIR: ["chair"], CHAIR_R: ["chair", -1], COMP: ["comp"], COMP_SCREEN: ["comp_screen"],
    DESK: ["desk"], DESK_1: ["desk_1"], FILECAB: ["filecab_01"], PAPER: ["paper"], LAMP_1: ["lamp_1"] };
  // props solidos e destrutiveis. base = y do chao onde apoiam
  function addProp(type, x, y, settled) {
    var def = SF.props[type]; if (!def) return;
    var base = settled ? y : y, rect = [x - def.w / 2, base - def.h, def.w, def.h], pr = { type: type, def: def, x: x, y: base, hp: def.hp, rect: rect, dying: false, vx: 0, vy: 0, air: false };
    rect.prop = pr; rect[4] = "solid"; solids.push(rect); props.push(pr);
  }
  // fisica dos props leves (SF.props.push: barris, mesas) ao serem chutados: desliza com atrito, bloqueado por
  // paredes/outros solidos, reassenta no chao (groundTop) - sem cair de verdade (sem vy), so pra nao flutuar/atravessar degraus.
  // poltrona (def.fly): lancada por explosao/chute/soco vira projetil - gravidade, quica, e voando derruba e fere quem atingir
  // (CrushDamage 25 do original). Unidades como pr.vx: px por frame original (x DT por tick).
  // um passo de voo de um prop (dt = fracao do tick). Colisao X (parede lateral), teto e apoio, como antes, mas por passo.
  function flyStep(pr, dt) {
    var half = pr.def.w / 2, H = pr.def.h, k, r, x0 = pr.x, y0 = pr.y;
    var nx = x0 + pr.vx * dt;
    for (k = 0; k < solids.length; k++) { r = solids[k]; if (r === pr.rect || thinR(r) || r[4] === "cloud" || r.lift) continue;
      if (nx - half < r[0] + r[2] && nx + half > r[0] && y0 - 2 > r[1] && y0 - H < r[1] + r[3]) {
        if (x0 + half <= r[0] + 0.5) nx = r[0] - half;
        else if (x0 - half >= r[0] + r[2] - 0.5) nx = r[0] + r[2] + half;
        else nx = x0;
        pr.vx *= -0.35; } }
    nx = Math.max(half, Math.min(map.width - half, nx));
    var ny = y0 + pr.vy * dt;
    if (pr.vy < 0) for (k = 0; k < solids.length; k++) { r = solids[k]; if (r === pr.rect || r.lift || thinR(r)) continue;
      if (nx - half < r[0] + r[2] && nx + half > r[0] && y0 - H >= r[1] + r[3] - 0.5 && ny - H < r[1] + r[3]) { ny = r[1] + r[3] + H; pr.vy = 0; break; } }
    var gt = groundTopW(nx, y0 - 4, half, pr.rect);
    if (pr.vy >= 0 && ny >= gt) { // pousou
      ny = gt; if (pr.vy > 2.5) {
        // CheckBodyImpact do original: velocidade relativa >= 2 m/s causa dano de impacto = velocidade (m/s) x resistencia; px/frame orig / 1.6 x 24/30 = m/s
        var imp = pr.vy / S * 0.8; if (imp >= 2 && !pr.def.indestructible) hitProp(pr, imp, false, false);
        pr.vy = -pr.vy * 0.32; pr.vx *= 0.75; play("woodhit", 0.35); } else { pr.vy = 0; pr.air = false; pr.rot = 0; pr.hit = null; }
    }
    pr.x = nx; pr.y = ny; pr.rect[0] = pr.x - half; pr.rect[1] = pr.y - H;
    if (pr.vy !== 0 && ny < gt - 1.5) pr.air = true; // ainda caindo (saiu da beirada / perdeu o apoio)
  }
  // piso/parede rigidos nao podem ficar com um objeto preso dentro: se a caixa estiver sobreposta a um bloco rigido
  // (entrou por um canto, foi empurrada, nasceu ali), e tirada pela face mais proxima (cima, baixo, lado).
  function unstickProp(pr) {
    var half = pr.def.w / 2, H = pr.def.h, r, it, k, best, bs, dx, dy, X0, X1, Y0, Y1;
    for (it = 0; it < 3; it++) { best = null; bs = 1e9; X0 = pr.x - half; X1 = pr.x + half; Y0 = pr.y - H; Y1 = pr.y;
      for (k = 0; k < solids.length; k++) { r = solids[k]; if (r === pr.rect || thinR(r) || r[4] === "cloud" || r.lift) continue;
        dx = Math.min(X1, r[0] + r[2]) - Math.max(X0, r[0]); dy = Math.min(Y1, r[1] + r[3]) - Math.max(Y0, r[1]);
        if (dx <= 0 || dy <= 0) continue;
        var cands = [[Y1 - r[1], "up"], [r[1] + r[3] - Y0, "down"], [X1 - r[0], "left"], [r[0] + r[2] - X0, "right"]];
        for (var c = 0; c < 4; c++) if (cands[c][0] < bs) { bs = cands[c][0]; best = { r: r, dir: cands[c][1] }; } }
      if (!best) return;
      if (best.dir === "up") { pr.y = best.r[1]; if (pr.vy > 0) pr.vy = 0; pr.air = false; }
      else if (best.dir === "down") { pr.y = best.r[1] + best.r[3] + H; if (pr.vy < 0) pr.vy = 0; }
      else if (best.dir === "left") { pr.x = best.r[0] - half; pr.vx = 0; }
      else { pr.x = best.r[0] + best.r[2] + half; pr.vx = 0; }
      pr.rect[0] = pr.x - half; pr.rect[1] = pr.y - H; }
  }
  // Sub-passos: um objeto que anda mais de ~3 px por passo podia atravessar um piso fino (ou um degrau de 4.8 px) sem bater.
  // Quebrando o movimento do tick em passos curtos, o corpo sempre encontra a face antes de passar por ela.
  function flyProp(pr) {
    var half = pr.def.w / 2, H = pr.def.h;
    pr.vx = pr.vx || 0; pr.vy = (pr.vy || 0) + P.gravity * DT * GK; if (pr.vy > MAXFALL) pr.vy = MAXFALL;
    var mag = Math.max(Math.abs(pr.vx), Math.abs(pr.vy)) * DT, n = Math.max(1, Math.min(16, Math.ceil(mag / 2.5)));
    for (var s = 0; s < n; s++) { flyStep(pr, DT / n); if (pr.dying || !pr.air) break; }
    unstickProp(pr);
    if (pr.air) pr.rot = (pr.rot || 0) + pr.vx * 0.06 * DT;
    if (!pr.air) { pr.vx *= 0.88; if (Math.abs(pr.vx) < 0.05) pr.vx = 0; return; }
    // voando: atingir um personagem derruba (e fere se o prop tem crush: poltrona 25; caixas no original tem CrushDamage 0 = so derruba)
    if (Math.hypot(pr.vx, pr.vy) > 4) { pr.hit = pr.hit || [];
      players.forEach(function (o) {
        if (o.dead || o.gone || o.ride || pr.hit.indexOf(o) >= 0 || (o === pr.by && tick - (pr.t0 || 0) < 20)) return; // quem arremessou so e atingido depois de ~20 ticks
        if (o.x + P.width / 2 < pr.x - half - 2 || o.x - P.width / 2 > pr.x + half + 2 || o.y < pr.y - H - 2 || o.y - P.height > pr.y + 2) return;
        var dir = pr.vx >= 0 ? 1 : -1, cr = pr.def.crush != null ? pr.def.crush : (pr.def.fly ? 25 : 0); pr.hit.push(o);
        if (cr > 0) damage(o, cr, pr.by || null, false, false, { dir: dir });
        if (!o.dead) knock(o, dir * 3, -2.5, -dir);
        play("woodhit", 0.5); shake = Math.max(shake, 3); pr.vx *= 0.5;
      }); }
  }
  // ---------- POLTRONA (COMFY_CHAIR) - corpo rigido como no original (b2Body com circulo + caixa, Wood) ----------
  // Forma: circulo de raio r (6.5 px orig x S) no centro (cx,cy) + caixa hx x hy deslocada oy pra baixo.
  // Integracao por tick (mesmas unidades dos outros props: px por tick, DT). Contato por pontos amostrados no contorno:
  // cada ponto dentro de um bloco rigido gera um contato (normal = face de saida mais proxima); impulso com restituicao e
  // atrito de Coulomb (mu) aplicado no ponto de contato, o que faz a poltrona rolar, girar e quicar como no original.
  function chairPoints(pr) {
    var d = pr.def, c = Math.cos(pr.rot), s = Math.sin(pr.rot), pts = [], i, a, lx, ly;
    // pontos de contato: as duas quinas da base da caixa (+ meio da base) e o topo do circulo. Pontos fixos, nao o contorno inteiro
    // (com o contorno inteiro, cada ponto no chao somava atrito e a poltrona parava de uma vez).
    // o circulo tambem tem pontos: quando a poltrona gira (rot grande) a parte de baixo passa a ser o circulo, nao a caixa
    for (i = 0; i < 8; i++) { a = i * Math.PI / 4; pts.push([pr.cx + Math.cos(a) * d.r, pr.cy + Math.sin(a) * d.r]); }
    [[-d.hx, d.oy + d.hy], [d.hx, d.oy + d.hy], [0, d.oy + d.hy]].forEach(function (q) {
      lx = q[0]; ly = q[1]; pts.push([pr.cx + lx * c - ly * s, pr.cy + lx * s + ly * c]); });
    return pts;
  }
  function chairContacts(pr) {
    var d = pr.def, invM = 1, invI = 1 / 70, e = d.e, mu = d.mu, grounded = false, it, k, ct, contacts;
    for (it = 0; it < 4; it++) { // a cada iteracao a geometria e reamostrada: a penetracao vai a zero antes do impulso
      contacts = chairDetect(pr); if (!contacts.length) break;
      for (k = 0; k < contacts.length; k++) { ct = contacts[k];
        if (ct.dep > 0) { pr.cx += ct.nx * ct.dep; pr.cy += ct.ny * ct.dep; } // separa pela normal (sem atravessar)
        var rx = ct.px - pr.cx, ry = ct.py - pr.cy, vpx = pr.vx - pr.w * ry, vpy = pr.vy + pr.w * rx, vn = vpx * ct.nx + vpy * ct.ny;
        if (vn < 0) { var rn = rx * ct.ny - ry * ct.nx, jn = -(1 + e) * vn / (invM + rn * rn * invI);
          pr.vx += jn * ct.nx * invM; pr.vy += jn * ct.ny * invM; pr.w += rn * jn * invI;
          vpx = pr.vx - pr.w * ry; vpy = pr.vy + pr.w * rx;
          var tx = -ct.ny, ty = ct.nx, vt = vpx * tx + vpy * ty, rt = rx * ty - ry * tx, jt = -vt / (invM + rt * rt * invI), lim = mu * Math.abs(jn);
          jt = Math.max(-lim, Math.min(lim, jt));
          pr.vx += jt * tx * invM; pr.vy += jt * ty * invM; pr.w += rt * jt * invI; }
        if (ct.ny < -0.5) grounded = true; }
    }
    return grounded;
  }
  function chairDetect(pr) {
    var d = pr.def, pts = chairPoints(pr), contacts = [], k, j, q, r, px, py, dT, dB, dL, dR, mn, nx, ny, dep;
    for (k = 0; k < pts.length; k++) { px = pts[k][0]; py = pts[k][1];
      for (j = 0; j < solids.length; j++) { r = solids[j]; if (r === pr.rect || r.lift) continue;
        if (thinR(r) || r[4] === "cloud") { // nuvem/plataforma fina: so pousa por cima (cai de cima, nao sobe por baixo)
          if (pr.vy >= 0 && px > r[0] && px < r[0] + r[2] && py >= r[1] && py < r[1] + 6) contacts.push({ px: px, py: py, nx: 0, ny: -1, dep: py - r[1] + 0.01, r: r });
          continue; }
        if (px > r[0] && px < r[0] + r[2] && py > r[1] && py < r[1] + r[3]) {
          dT = py - r[1]; dB = r[1] + r[3] - py; dL = px - r[0]; dR = r[0] + r[2] - px; mn = Math.min(dT, dB, dL, dR);
          if (mn === dT) { nx = 0; ny = -1; dep = dT; } else if (mn === dB) { nx = 0; ny = 1; dep = dB; } else if (mn === dL) { nx = -1; ny = 0; dep = dL; } else { nx = 1; ny = 0; dep = dR; }
          contacts.push({ px: px, py: py, nx: nx, ny: ny, dep: dep, r: r }); } } }
    return contacts;
  }
  function chairStep(pr) {
    var d = pr.def, G = P.gravity * DT * GK, s, n, dt, hitG = false;
    if (pr.cx == null) { pr.cx = pr.x; pr.cy = pr.y - (d.oy + d.hy); pr.rot = pr.rot || 0; pr.w = pr.w || 0; pr.vx = pr.vx || 0; pr.vy = pr.vy || 0; }
    pr.vy += G; if (pr.vy > MAXFALL) pr.vy = MAXFALL;
    pr.vx *= 0.998; pr.w *= 0.985; // amortecimento leve (ar e atrito de rolamento)
    var mag = Math.max(Math.abs(pr.vx), Math.abs(pr.vy)) * DT, sub = Math.max(1, Math.min(10, Math.ceil(mag / 2)));
    for (s = 0; s < sub; s++) { dt = DT / sub;
      pr.cx += pr.vx * dt; pr.cy += pr.vy * dt; pr.rot += pr.w * dt;
      if (chairContacts(pr)) hitG = true;
      pr.cx = Math.max(d.hx, Math.min(map.width - d.hx, pr.cx)); }
    // sincroniza com o resto do motor (rect para bala/soco/jogador, x/y base para o resto)
    pr.x = pr.cx; pr.y = pr.cy + (d.oy + d.hy); pr.rect[0] = pr.cx - d.hx; pr.rect[1] = pr.cy - d.r; pr.rect[2] = 2 * d.hx; pr.rect[3] = (d.oy + d.hy) + d.r;
    pr.air = !hitG;
    if (hitG && Math.abs(pr.vx) < 0.05 && Math.abs(pr.w) < 0.002) { pr.vx = 0; pr.w = 0; }
    // golpe da poltrona (CheckCollisionWithBody do original): so derruba quem ela ESMAGA (cai em cima do personagem,
    // de cima pra baixo) ou quem leva um IMPACTO FORTE (explosao/chute, velocidade > STRONG). Empurrao leve nao derruba.
    // Dano (CrushDamage 25) acompanha a queda por cima e o impacto forte. pr.hit = quem ja foi atingido NESTE contato.
    var spd = Math.hypot(pr.vx, pr.vy), now = [], STRONG = 7;
    players.forEach(function (o) {
      if (o.dead || o.gone || o.ride) return;
      if (o.x + P.width / 2 < pr.rect[0] - 2 || o.x - P.width / 2 > pr.rect[0] + pr.rect[2] + 2 || o.y < pr.rect[1] - 2 || o.y - P.height > pr.rect[1] + pr.rect[3] + 2) return;
      now.push(o);
      if ((pr.hit || []).indexOf(o) >= 0 || (o === pr.by && tick - (pr.t0 || 0) < 20)) return;
      var above = pr.vy > 0.5 && pr.cy < o.y - P.height * 0.5; // caiu em cima: o centro da poltrona esta na parte de cima do corpo
      var strong = spd > STRONG;
      if (!above && !strong) return; // empurrao: nada acontece
      var dir = pr.vx > 0 ? 1 : pr.vx < 0 ? -1 : (o.x >= pr.cx ? 1 : -1); pr.hit = (pr.hit || []).concat([o]);
      if (d.crush > 0) damage(o, d.crush, pr.by || null, false, false, { dir: dir });
      if (!o.dead) knock(o, dir * (1 + spd * 0.4), -2.5, -dir);
      play("woodhit", 0.5); shake = Math.max(shake, 3); pr.vx *= 0.7;
    });
    pr.hit = (pr.hit || []).filter(function (o) { return now.indexOf(o) >= 0; }); // so mantem quem ainda esta em contato
  }
  function updateProps() {
    props.forEach(function (pr) {
      if (pr.dying) return;
      if (pr.def.chair) { chairStep(pr); return; } // poltrona: corpo rigido proprio (ver chairStep)
      if (pr.def.geladeira) geladeiraCrush(pr.x, pr.y - pr.def.h / 2, pr.def.w / 2, pr.def.h / 2); // geladeira no chao mata quem esta caido
      // sem apoio (caixa de baixo destruida, alcapao do Testing Floor aberto): cai de verdade em vez de ficar flutuando
      if (!pr.air && !pr.vy) { var gs = groundTopW(pr.x, pr.y - 4, pr.def.w / 2, pr.rect); if (gs > pr.y + 2.5) { pr.air = true; pr.vy = 0; pr.by = null; pr.t0 = tick; pr.hit = []; } }
      if (pr.air || pr.vy) { flyProp(pr); return; }
      unstickProp(pr); // objeto parado sobreposto a outro bloco (ex.: caixas do mapa que nascem encostadas): separa pela face mais proxima
      if (!(pr.def.push || pr.def.slide) || !pr.vx) return;
      var half = pr.def.w / 2, nx = pr.x + pr.vx * DT;
      for (var k = 0; k < solids.length; k++) { var r = solids[k]; if (r === pr.rect || thinR(r)) continue;
        if (nx - half < r[0] + r[2] && nx + half > r[0] && pr.y - 2 > r[1] && pr.y - pr.def.h < r[1] + r[3]) { nx = pr.vx > 0 ? r[0] - half : r[0] + r[2] + half; pr.vx = 0; break; } }
      nx = Math.max(half, Math.min(map.width - half, nx));
      pr.x = nx; pr.rect[0] = pr.x - half;
      var gy = groundTopW(pr.x, pr.y - 4, half, pr.rect);
      if (gy > pr.y + 2.5) { pr.air = true; pr.vy = 0; pr.t0 = tick; pr.hit = pr.hit || []; } // saiu da beirada: cai de verdade (antes teleportava pro chao de baixo)
      else if (gy !== pr.y) { pr.y = gy; pr.rect[1] = pr.y - pr.def.h; }
      pr.vx *= 0.88; if (Math.abs(pr.vx) < 0.05) pr.vx = 0;
    });
  }
  // ---------- lampadas penduradas (AddHangingLamp do Maps.as; dados em data/anim_decor.js) ----------
  // Visual + reacao simples: pendulo (g=10 m/s2, 30 px/m) com balanco inicial deterministico (no original e ApplyForce com Math.random);
  // tiro quebra (frame 2 do clipe hanging_lamp + faiscas, a corda fica), explosao quebra e balanca. NAO e o corpo fisico do original (sem chute).
  var lamps = [];
  function lampReset() {
    lamps = []; var L = SF.lamps && SF.lamps[cfg.map];
    if (!L || !map.art || !SF.mapAnim) return;
    L.forEach(function (d, i) { lamps.push({ x0: lvx(d[0]), y0: lvy(d[1]), D: d[2] * 1.6, Dm: d[2] / 30, th: 0, om: (((i * 7 + d[0]) % 11) - 5) / 5 * 0.012, broken: false, hp: 5 }); });
  }
  function lampPos(l) { var s = Math.sin(l.th), c = Math.cos(l.th), q = l.D + 4 * 1.6; return { x: l.x0 + s * q, y: l.y0 + c * q }; }
  function lampBreak(l) {
    if (l.broken) return; l.broken = true; play("glass1", 0.4); var p = lampPos(l);
    for (var i = 0; i < 5; i++) particles.push({ x: p.x, y: p.y + 4, vx: (rand() * 10 - 5) * 0.5 * DT, vy: -rand() * 2 * DT, life: 30, c: "#ffe27a", g: 0.2, r: 2 });
  }
  function lampUpdate() {
    for (var i = 0; i < lamps.length; i++) { var l = lamps[i];
      l.om += -(10 / 900) / l.Dm * Math.sin(l.th) * DT; l.om *= 1 - 0.003 * DT; l.th += l.om * DT; }
  }
  function lampBullet(b) {
    for (var i = 0; i < lamps.length; i++) { var l = lamps[i], p = lampPos(l); if (Math.abs(b.x - p.x) > 8 || Math.abs(b.y - p.y) > 9) continue;
      l.om += (b.vx > 0 ? 1 : -1) * 0.03; if (l.broken) return false; l.hp -= b.w.damage || 6; if (l.hp <= 0) lampBreak(l); return true; }
    return false;
  }
  function lampBlast(x, y, R) {
    lamps.forEach(function (l) { var p = lampPos(l), d = Math.hypot(p.x - x, p.y - y); if (d > R) return;
      l.om += (p.x >= x ? 1 : -1) * 0.08 * (1 - d / R); lampBreak(l); });
  }
  function lampDraw() {
    var rope = SF.spriteAlias.rope_segment_01, id = SF.spriteAlias.hanging_lamp;
    lamps.forEach(function (l) { var s = Math.sin(l.th), c = Math.cos(l.th), st = 3 * S;
      for (var d = 0; d < l.D; d += st) spr(rope, 1, l.x0 + s * (d + st / 2), l.y0 + c * (d + st / 2), 1, -l.th, S);
      var p = lampPos(l); if (!spr(id, l.broken ? 2 : 1, p.x, p.y, 1, -l.th, S)) { ctx.fillStyle = "#ddd"; ctx.fillRect(p.x - 6, p.y - 5, 12, 10); } });
  }
  // ---------- caixas grandes penduradas (CRATE_HANGING + HOLDER + corda; dados em data/map_extras.js) ----------
  // Original: caixa + holder colados, presos ao teto por 2 juntas de distancia no mesmo ponto = haste rigida => pendulo fisico em volta da
  // ancora (Box2D, g=10 m/s2, passo 1/30 por frame, 30 px/m). Aqui: theta/omega integrados por tick (DT frames), sem Math.random (so rand()).
  // Chute (impulso 1.6) / golpe / explosao balancam; tiro/explosao/golpe no holder (hp 6) CORTA a corda: a caixa cai e, se tocar em alguem
  // em pe com velocidade >= 2 m/s, derruba (Fall) - o original nao da dano (CrushDamage=0; ver SF.hang.crush). Pousou: vira prop pesado.
  var hangs = [], HANG_G = 10 / 900, HANG_K2 = (0.9 * 0.9 + (14 / 30) * (14 / 30)) / 12; // g (m/frame2); k2 = (w2+h2)/12 da caixa (m2)
  function hangReset() { hangs = []; lampReset(); }
  function hangAdd(d) {
    var X = SF.hang, list = X && X.maps && X.maps[cfg.map], ex = null, i;
    if (list) for (i = 0; i < list.length; i++) if (Math.abs(list[i].x - d[1]) < 4 && Math.abs(list[i].y - d[2]) < 4) ex = list[i];
    if (!ex) { if (SF.props.crate_hanging) addProp("crate_hanging", d[1], groundTop(d[1], d[2] - 6), true); return; } // sem corda (ex. Area de Testes): caixa pesada solta
    var h = { x0: ex.x, y0: ex.y - ex.rope, D: ex.rope, th: 0, om: 0, state: "hang", hp: X.holderHp, w: X.w, h: X.h, crush: ex.crush != null ? ex.crush : X.crush,
      cx: ex.x, cy: ex.y, vx: 0, vy: 0, dx: 0, dy: 0, hit: [], rect: [ex.x - X.w / 2, ex.y - X.h / 2, X.w, X.h, "solid"] };
    h.prevTop = h.rect[1]; h.prevLeft = h.rect[0]; h.rect.lift = h; // lift: carrega quem esta em cima (updateLifts) e evita tunelamento (collide)
    h.rect.prop = { dying: false, hp: 1, x: ex.x, y: ex.y, def: { indestructible: true, w: X.w, h: X.h } }; // tiro bate na caixa (indestrutivel)
    solids.push(h.rect); hangs.push(h);
    hangImpulse(h, (rand() * 10 - 5) / 30); // ApplyForce(random*10-5, ...) do original no 1o frame: balanco leve inicial
  }
  function hangImpulse(h, J) { // impulso horizontal J (N*s) no centro da caixa -> variacao da velocidade angular (rad/frame)
    var Dm = h.D / 48; h.om += Dm * J * Math.cos(h.th) / (SF.hang.mass * (Dm * Dm + HANG_K2)) / 30;
  }
  function hangBlocked(h, cx, cy) { // a caixa pendurada bate na geometria fixa do mapa
    var pl = map.platforms, w2 = h.w / 2, h2 = h.h / 2;
    for (var k = 0; k < pl.length; k++) { var r = pl[k]; if (thinR(r)) continue;
      if (cx - w2 < r[0] + r[2] && cx + w2 > r[0] && cy - h2 < r[1] + r[3] && cy + h2 > r[1]) return true; }
    return false;
  }
  function hangCut(h) {
    if (h.state !== "hang") return;
    h.state = "fall"; h.hit = []; h.vx = h.om * h.D * Math.cos(h.th); h.vy = -h.om * h.D * Math.sin(h.th);
    play(rand() < 0.5 ? "wood1" : "wood2", 0.5);
    var X = SF.hang, hx = h.x0 + Math.sin(h.th) * (h.D - X.holderOff), hy = h.y0 + Math.cos(h.th) * (h.D - X.holderOff), id = SF.spriteAlias.crate_debris_03;
    if (id) for (var i = 0; i < 3; i++) particles.push({ x: hx, y: hy, vx: (rand() - 0.5) * 4 * 1.6 * DT, vy: (-1 - rand() * 3) * 1.6 * DT, life: 500, g: 0.45 * DT * DT * 1.6, spr: id, rot: rand() * 6, vr: (rand() - 0.5) * 0.5, phys: true, bounce: 0.3, snd: "woodhit" });
  }
  // ESMAGAMENTO da geladeira: quem esta CAIDO (fall ou kd) e tocado pela caixa grande morre na hora (gib). Vale para a
  // geladeira pendurada, caindo, ou ja no chao (prop). cx/cy = centro, w2/h2 = meia largura/altura.
  function geladeiraCrush(cx, cy, w2, h2) {
    players.forEach(function (o) {
      // so conta como CAIDO quem ja esta no chao (kd, ou fall depois de pousar). Quem esta no ar caindo (ex.: pulou/caiu de cima
      // da geladeira) nao morre ao encostar nela: ela so pousa em cima.
      if (o.dead || o.gone || o.ride || !(o.kd > 0 || (o.fall && o.onGround))) return;
      // quem pousou EM CIMA da geladeira (standOn = a propria geladeira) nao esta caido no chao: fica em cima dela, vivo
      if (o.standOn && ((o.standOn.prop && o.standOn.prop.def && o.standOn.prop.def.geladeira) || (o.standOn.lift && o.standOn[4] === "solid"))) return;
      if (o.x + P.width / 2 < cx - w2 || o.x - P.width / 2 > cx + w2 || o.y < cy - h2 || o.y - P.height > cy + h2) return;
      damage(o, 999, null, false, false, { dir: o.x >= cx ? 1 : -1, gib: true, ignoreImm: true });
      shake = Math.max(shake, 4); play("woodhit", 0.6);
    });
  }
  function hangFall(h) {
    var w2 = h.w / 2, h2 = h.h / 2, k, r, ox = h.cx;
    h.vy += HANG_G * 48 * DT; if (h.vy > MAXFALL) h.vy = MAXFALL;
    h.cx += h.vx * DT;
    for (k = 0; k < solids.length; k++) { r = solids[k]; if (r === h.rect || thinR(r)) continue;
      if (h.cx - w2 < r[0] + r[2] && h.cx + w2 > r[0] && h.cy - h2 < r[1] + r[3] && h.cy + h2 > r[1] + 3) { h.cx = ox; h.vx *= -0.3; break; } } // parede ao lado: quica
    var pb = h.cy + h2, best = null; h.cy += h.vy * DT; var nb = h.cy + h2;
    for (k = 0; k < solids.length; k++) { r = solids[k]; if (r === h.rect || r.lift) continue;
      if (h.cx - w2 < r[0] + r[2] && h.cx + w2 > r[0] && r[1] >= pb - 3 && r[1] <= nb && (best === null || r[1] < best)) best = r[1]; }
    h.th += h.om * DT;
    // GELADEIRA (caixa grande) caindo de cima: qualquer toque minimo em quem esta de pe DERRUBA (sem dano).
    // Quem ja esta caido e tocado pela geladeira e ESMAGADO (morte por esmagamento) - ver geladeiraCrush.
    if (h.vy > 0.5) players.forEach(function (o) {
      if (o.dead || o.gone || o.ride || o.fall || o.kd > 0 || h.hit.indexOf(o) >= 0 || o.standOn === h.rect) return;
      if (o.x + P.width / 2 < h.cx - w2 || o.x - P.width / 2 > h.cx + w2 || o.y < h.cy - h2 || o.y - P.height > h.cy + h2) return;
      var dir = o.x > h.cx ? 1 : o.x < h.cx ? -1 : (h.vx >= 0 ? 1 : -1); h.hit.push(o);
      // cai LITERALMENTE em cima (centro da geladeira sobre o personagem): esmaga na hora (morte por esmagamento)
      if (Math.abs(o.x - h.cx) <= w2 - 6) { damage(o, 999, null, false, false, { dir: dir, gib: true, ignoreImm: true }); play("woodhit", 0.6); shake = Math.max(shake, 4); return; }
      knock(o, dir * (1 + Math.abs(h.vx) / 1.6), -2, -dir); // toque de cima leve/lateral: derruba no chao (sem dano)
      play("woodhit", 0.6); shake = Math.max(shake, 3);
    });
    geladeiraCrush(h.cx, h.cy, w2, h2);
    if (best !== null) { // pousou
      h.cy = best - h2; shake = Math.max(shake, 3); play("woodhit", 0.5);
      var i = solids.indexOf(h.rect); if (i >= 0) solids.splice(i, 1);
      if (SF.props.crate_hanging) { addProp("crate_hanging", h.cx, best, true); h.state = "done"; }
      else { h.state = "rest"; h.th = 0; h.rect[1] = best - h2; solids.push(h.rect); }
    }
  }
  function hangUpdate() {
    for (var i = 0; i < hangs.length; i++) { var h = hangs[i]; if (h.state === "done" || h.state === "rest") continue;
      h.prevTop = h.rect[1]; h.prevLeft = h.rect[0]; var ox = h.cx, oy = h.cy;
      if (h.state === "hang") geladeiraCrush(h.cx, h.cy, h.w / 2, h.h / 2); // geladeira pendurada balancando tambem esmaga quem esta caido
      if (h.state === "hang") {
        var Dm = h.D / 48, oth = h.th;
        h.om += -HANG_G * Dm * Math.sin(h.th) / (Dm * Dm + HANG_K2) * DT; h.om *= 1 - 0.0015 * DT; h.th += h.om * DT; // pendulo fisico (+ amortecimento minimo da junta)
        h.cx = h.x0 + h.D * Math.sin(h.th); h.cy = h.y0 + h.D * Math.cos(h.th);
        if (hangBlocked(h, h.cx, h.cy)) { h.th = oth; h.om *= -0.3; h.cx = ox; h.cy = oy; play("woodhit", 0.2); }
      } else hangFall(h);
      if (h.state === "done") continue;
      h.rect[0] = h.cx - h.w / 2; h.rect[1] = h.cy - h.h / 2; h.dx = h.cx - ox; h.dy = h.cy - oy;
    }
  }
  function hangDraw() {
    var X = SF.hang, rope = SF.spriteAlias.rope_segment_01, hold = SF.spriteAlias.crate_hanging_holder, cr = SF.spriteAlias.crate_hanging;
    hangs.forEach(function (h) { if (h.state === "done") return;
      var s = Math.sin(h.th), c = Math.cos(h.th);
      if (h.state === "hang") {
        var len = h.D - X.attach, st = 3 * S; // segmentos 1x3 a cada 3 px (Rope.as)
        for (var d = 0; d < len; d += st) spr(rope, 1, h.x0 + s * (d + st / 2), h.y0 + c * (d + st / 2), 1, -h.th, S);
      }
      if (!spr(cr, 1, h.cx, h.cy, 1, -h.th, S)) { ctx.fillStyle = "#8a6a3a"; ctx.fillRect(h.cx - h.w / 2, h.cy - h.h / 2, h.w, h.h); }
      if (h.state === "hang") spr(hold, 1, h.x0 + s * (h.D - X.holderOff), h.y0 + c * (h.D - X.holderOff), 1, -h.th, S);
    });
  }
  function hangHolder(h) { var o = SF.hang.holderOff; return { x: h.x0 + Math.sin(h.th) * (h.D - o), y: h.y0 + Math.cos(h.th) * (h.D - o) }; }
  function hangBullet(b) { // tiro no holder (9x6 px do original) corta a corda; true = a bala parou nele
    for (var i = 0; i < hangs.length; i++) { var h = hangs[i]; if (h.state !== "hang") continue;
      var q = hangHolder(h); if (Math.abs(b.x - q.x) < 8.2 && Math.abs(b.y - q.y) < 5.8) { h.hp -= b.w.damage || 6; if (h.hp <= 0) hangCut(h); return true; } }
    return false;
  }
  function hangBlast(x, y, R) { // explosao: corta a corda de quem estiver no raio e empurra a caixa (AffectedByExplosions)
    var E = SF.explosion;
    hangs.forEach(function (h) { if (h.state === "done" || h.state === "rest") return;
      var dx = h.cx - x, dy = h.cy - y, d = Math.hypot(dx, dy); if (d > R || rayHitsWall(x, y, h.cx, h.cy)) return;
      var f = d <= R / 2 ? 1 : 1 - (d - R / 2) / (R / 2), a = Math.atan2(dy, dx), pw = E.power * 0.6;
      if (h.state === "hang") { hangCut(h); }
      h.vx += Math.cos(a) * pw * f * 1.6 * 0.5; h.vy = Math.min(h.vy + Math.sin(a) * pw * f * 1.6 * 0.6, -1 * 1.6 * f);
    });
  }
  function hangKick(p, dir, rng) { // chute (impulso 1.6 do original) balanca a caixa; true se acertou alguma
    var hit = false;
    hangs.forEach(function (h) { if (h.state !== "hang") return; var dx = h.cx - p.x;
      if (dx * dir > -4 && Math.abs(dx) < rng + h.w / 2 + 2 && p.y > h.cy - h.h / 2 - 4 && p.y - P.height < h.cy + h.h / 2) { hangImpulse(h, dir * 1.6); hit = true; play("woodhit", 0.4); } });
    return hit;
  }
  function hangMelee(p, dir, range, dmg) { // soco/arma: EMPURRA a geladeira (balanca forte); se alcancar o holder, gasta o hp dele (6)
    hangs.forEach(function (h) { if (h.state !== "hang") return; var dx = h.cx - p.x;
      if (dx * dir > -4 && Math.abs(dx) < range + h.w / 2 && p.y > h.cy - h.h / 2 - 6 && p.y - P.height < h.cy + h.h / 2) {
        hangImpulse(h, dir * 1.8); play("woodhit", 0.4);
        var q = hangHolder(h); if (Math.abs(q.x - p.x) < range + 8 && q.y < p.y && q.y > p.y - P.height - 8) { h.hp -= dmg || 3; if (h.hp <= 0) hangCut(h); } } });
  }
  // armas aparecem sozinhas: a cada 72 frames originais (3s), num ponto livre, sorteando pelo peso (WeaponSpawn.as)
  // tipos de item na ordem do original (WeaponSpawn.as: case 0..16) e os pesos _weaponSpawnChance
  var ITEM_TYPES = ["pistol", "rifle", "shotgun", "sniper", "bazooka", "molotovs", "grenades", "flamethrower", "sword", "machete", "axe", "slowmo_05", "slowmo_10", "pills", "medkit", "magnum", "uzi"];
  var ITEM_CHANCE = [11, 9, 7, 2, 2, 4, 6, 5, 2, 3, 3, 4, 3, 2, 2, 2, 6];
  function spawnRandomWeapon() {
    // "livre" = sem NENHUM item por perto (nao so os que o proprio spawn automatico colocou) - sem isso, uma arma largada
    // por um jogador perto de um ponto de spawn (ou pego do WeaponSpawn.as: PutToSleep/LinkedWeapon por ponto) nao
    // impedia uma nova arma de nascer bem em cima, empilhando (o "arma em cima de arma" reclamado).
    // item nao nasce em rampa/escada (regra do usuario): ponto sobre a superficie da escadinha ou dentro da caixa dela e descartado
    var pts = weaponPoints, free = pts.filter(function (sp) { return !onRampOrStair(sp[0], sp[1]) && !pickups.some(function (k) { return Math.abs(k.x - sp[0]) < 40 && Math.abs(k.y - sp[1]) < 40; }); });
    if (!free.length) return;
    var sp = free[(rand() * free.length) | 0], bag = [];
    if (sp[2] && typeof sp[2][0] === "number") { // ORIGINAL (WeaponSpawn.as): array de 30 (0/1) = tipos permitidos neste ponto; cada tipo entra
      // no sorteio com o peso _weaponSpawnChance[j] (os pesos mudam a chance de cada item)
      for (var j = 0; j < ITEM_TYPES.length; j++) if (sp[2][j] === 1) for (var n = 0; n < ITEM_CHANCE[j]; n++) bag.push(ITEM_TYPES[j]);
    } else sp[2].forEach(function (a) { for (var n = 0; n < a[1]; n++) bag.push(a[0]); }); // mapas de mods (formato antigo)
    if (!bag.length) return;
    var type = bag[(rand() * bag.length) | 0];
    pickups.push({ x: sp[0], y: groundTop(sp[0], sp[1] - 6) - 4, type: type, respawn: 0, base: null, point: sp });
  }
  // dois slots como no original: p.melee (punhos/machete/machado/espada) e p.weapon (arma de fogo, ou null)
  function giveWeapon(p, type) { var w = SF.weapons[type]; if (!w) return; if (w.melee) p.melee = type; else { p.weapon = type; p.ammo = w.ammo; p.cd = 0; } }
  function say(t) { msgs.push({ t: t, life: 180 }); if (msgs.length > 5) msgs.shift(); }

  // ---------- fisica ----------
  var STEP = 7, debugCol = false;
  // plataforma "fina" = so colide por cima (nuvem). Mapas convertidos marcam r[4]; os antigos usam a regra de altura.
  function thinR(r) { return r[4] === "cloud" || (r[4] === undefined && r[3] <= 14 && r[2] < 940); }
  // topo do chao logo abaixo de (x, y): usado para assentar spawns, armas e props
  // Elevadores (r.lift) NAO contam: itens, props, granadas e destrocos atravessam o elevador (so jogadores sobem nele; balas ja o ignoram).
  function groundTop(x, y) {
    var best = null;
    for (var i = 0; i < solids.length; i++) { var r = solids[i]; if (r.lift) continue; if (x >= r[0] && x <= r[0] + r[2] && r[1] >= y && (best === null || r[1] < best)) best = r[1]; }
    return best === null ? y : best;
  }
  // como groundTop, mas para um corpo com largura (half = meia largura): apoia em qualquer solido que se sobreponha a ele,
  // entao uma caixa sobre duas outras (como o monte do Testing Floor) fica em cima delas em vez de cair no meio.
  function groundTopW(x, y, half, self) {
    var best = null, hw = half * 0.5; // so o miolo do corpo precisa estar apoiado (senao tombaria no original)
    for (var i = 0; i < solids.length; i++) { var r = solids[i]; if (r.lift || r === self) continue;
      if (x + hw > r[0] && x - hw < r[0] + r[2] && r[1] >= y && (best === null || r[1] < best)) best = r[1]; }
    return best === null ? y : best;
  }
  // como groundTop, mas so olha a geometria FIXA do mapa (map.platforms), nunca elevadores/props. Usado para posicionar jogadores
  // (spawn/respawn): um elevador que esteja passando por ali no momento nao deve "roubar" o piso real logo abaixo dele, senao o
  // jogador nasce sobre uma plataforma que se move embora no tick seguinte (bug de spawn inconsistente).
  function groundTopBase(x, y) {
    var best = null, pl = map.platforms;
    for (var i = 0; i < pl.length; i++) { var r = pl[i]; if (x >= r[0] && x <= r[0] + r[2] && r[1] >= y && (best === null || r[1] < best)) best = r[1]; }
    return best === null ? y : best;
  }
  function onLadder(p) {
    var L = map.ladders || [];
    for (var i = 0; i < L.length; i++) if (p.x > L[i][0] && p.x < L[i][0] + L[i][2] && p.y > L[i][1] - 3 && p.y - P.height < L[i][1] + L[i][3]) return true;
    return false;
  }
  // Colisao do personagem em SUB-PASSOS (pratica padrao contra tunelamento): o movimento do tick e quebrado em passos de
  // no maximo 2 px. Cada passo resolve X e Y separadamente (collideCore). Se um passo bater (parede, teto ou pouso) o
  // resto do movimento daquele eixo e descartado, como o original faz ao bater. Sem isso, um corpo rapido podia passar por
  // um piso fino ou por uma coluna de escada de 4.8 px.
  function collide(p) {
    var vx0 = p.vx, vy0 = p.vy, n = Math.max(1, Math.min(12, Math.ceil(Math.max(Math.abs(vx0), Math.abs(vy0)) / 2)));
    var mx = vx0 / n, my = vy0 / n, hitX = false, hitY = false, k;
    for (k = 0; k < n; k++) {
      p.vx = mx; p.vy = my;
      collideCore(p);
      if (p.vx === 0 && mx !== 0) { hitX = true; mx = 0; }
      if (p.vy === 0 && my !== 0) { hitY = true; my = 0; }
      if (mx === 0 && my === 0) break;
    }
    p.vx = hitX ? 0 : vx0; p.vy = hitY ? 0 : vy0;
  }
  // ESCADINHA (rampa): o desenho e uma rampa continua, mas a colisao antiga eram colunas de 4.8 px (uma parede por coluna).
  // Para o PERSONAGEM a escadinha vira uma rampa: as colunas sao marcadas (rampCol) e ignoradas, e o pe segue a linha que
  // passa pelo topo da primeira e da ultima coluna. Caixas, barris e balas continuam usando as colunas (mesmo perfil).
  var ramps = [];
  function setupRamps() {
    ramps = [];
    var S = (SF.stairs && SF.stairs[cfg.map]) || [];
    S.forEach(function (b) {
      var cols = map.platforms.filter(function (r) { return r[2] <= 5.5 && r[0] >= b[0] - 1 && r[0] + r[2] <= b[2] + 1 && r[1] < b[3] && r[1] + r[3] > b[1]; })
        .sort(function (a, c) { return a[0] - c[0]; });
      if (cols.length < 2) return;
      cols.forEach(function (c) { c.rampCol = true; });
      var f = cols[0], l = cols[cols.length - 1], R = [f[0], f[1], 0, 0, "ramp"];
      R.x0 = f[0]; R.y0 = f[1]; R.x1 = l[0] + l[2]; R.y1 = l[1]; ramps.push(R);
    });
  }
  function rampY(R, x) { return R.y0 + (x - R.x0) * (R.y1 - R.y0) / (R.x1 - R.x0); }
  // ponto (x,y) esta sobre uma rampa/escada: dentro da caixa de SF.stairs do mapa, ou na faixa logo acima/abaixo da superficie da rampa
  function onRampOrStair(x, y) {
    var S = (SF.stairs && SF.stairs[cfg.map]) || [];
    for (var s = 0; s < S.length; s++) { var b = S[s]; if (x >= b[0] - 6 && x <= b[2] + 6 && y >= b[1] - 30 && y <= b[3] + 6) return true; }
    var LD = map.ladders || []; for (var l = 0; l < LD.length; l++) { var L = LD[l]; if (x >= L[0] - 6 && x <= L[0] + L[2] + 6 && y >= L[1] - 6 && y <= L[1] + L[3] + 6) return true; } // escada de subir (ladder)
    for (var q = 0; q < ramps.length; q++) { var R = ramps[q];
      if (x >= R.x0 - 6 && x <= R.x1 + 6) { var sy = rampY(R, Math.max(R.x0, Math.min(R.x1, x))); if (y >= sy - 30 && y <= sy + 12) return true; } }
    return false;
  }
  function collideCore(p) {
    var w = P.width, h = P.height, i, r, prevStand = p.standOn;
    p.x += p.vx;
    for (i = 0; i < solids.length; i++) {
      r = solids[i]; if (thinR(r) || r.rampCol || r.noPlayer) continue; // plataformas finas/nuvens: so de cima; colunas da escadinha: ver ramps; arma vazia: sem colisao com personagem
      if (p.x - w / 2 < r[0] + r[2] && p.x + w / 2 > r[0] && p.y - h < r[1] + r[3] && p.y > r[1]) {
        if (p.onGround && p.vx !== 0 && p.y - r[1] <= STEP) { p.y = r[1]; continue; } // sobe degrau/rampa
        if (p.vx > 0) p.x = r[0] - w / 2; else if (p.vx < 0) p.x = r[0] + r[2] + w / 2; p.vx = 0;
      }
    }
    if (p.x < w / 2) { p.x = w / 2; p.vx = 0; } else if (p.x > map.width - w / 2) { p.x = map.width - w / 2; p.vx = 0; }
    var prevY = p.y; p.y += p.vy; p.onGround = false; p.standOn = null;
    for (i = 0; i < solids.length; i++) {
      r = solids[i]; if (r.rampCol || r.noPlayer) continue;
      if (p.x - w / 2 < r[0] + r[2] && p.x + w / 2 > r[0]) {
        var thin = thinR(r);
        // elevador: aceita o limite de pouso usando o topo de ANTES OU DEPOIS de mover neste tick. So com r[1] atual, um elevador
        // subindo mais rapido que a queda do jogador varre por ele sem nunca satisfazer prevY<=r[1] (cai direto, sai do mapa); so
        // com o topo antigo, o jogador ja apoiado e ejetado no instante em que o elevador inverte e passa a descer (prevY fica
        // "abaixo" do topo antigo). Aceitando qualquer um dos dois cobre a aproximacao e o repouso nos dois sentidos de movimento.
        var oldTop = (r.lift && r.lift.prevTop != null) ? r.lift.prevTop : r[1];
        if (thin && p.dropRect === r && p.y > r[1] + r[3]) p.dropRect = null; // ja saiu por baixo da nuvem que atravessou (_jumpDownPosYDisable)
        if (p.vy >= 0 && p.y >= r[1] && (prevY <= r[1] + 0.01 || prevY <= oldTop + 0.01)) { if (!(thin && p.drop)) { p.y = r[1]; p.vy = 0; p.onGround = true; p.standOn = r; } else p.dropRect = r; }
        // UpdateAirMovement do original: plataforma-nuvem pousa com o PE DENTRO da espessura dela, sem precisar vir de cima.
        // Caindo (CollisionFeetSides+CanLandInMid+CollisionFeetMid): qualquer profundidade; subindo (CollisionFeetMidUp(-2)): pe 2 px
        // (x1.6) ou mais abaixo do topo. E isso que deixa o pulo (pico 21.97 px) alcancar o andar de cima (22 px): o pico fica 0.03 px
        // abaixo do topo, mas ja dentro da nuvem. Nao vale pra elevador (corpo dinamico no original) nem pra nuvem que se esta atravessando.
        else if (thin && r[4] === "cloud" && !r.lift && !r.prop && !p.drop && p.dropRect !== r && !p.climb && p.y > r[1] && p.y <= r[1] + r[3] && (p.vy >= 0 || p.y - 3.2 >= r[1])) { p.y = r[1]; p.vy = 0; p.onGround = true; p.standOn = r; }
        else if (!thin && p.vy < 0 && p.y - h < r[1] + r[3] && prevY - h >= r[1] + r[3] - 0.01) { p.y = r[1] + r[3] + h; p.vy = 0; }
      }
    }
    // escadinha: pe sobre a rampa (pousa vindo de cima, ou segue a rampa quem ja estava nela - sobe ou desce sem pular)
    for (i = 0; i < ramps.length; i++) { var R = ramps[i];
      if (p.x > R.x0 - w / 2 && p.x < R.x1 + w / 2) {
        var sy = rampY(R, Math.max(R.x0, Math.min(R.x1, p.x)));
        if (p.vy >= 0 && ((p.y >= sy - 0.01 && prevY <= sy + 0.5) || (prevStand === R && p.y >= sy - STEP))) { p.y = sy; p.vy = 0; p.onGround = true; p.standOn = R; break; }
      } }
    unstickPlayer(p);
  }
  // nenhum personagem pode ficar DENTRO de um bloco rigido (afundar no piso ou atravessar parede): se ficar, sai pela face mais
  // proxima - em cima (pousa), ou para o lado. Cobre carona de foguete, empurrao, elevador e qualquer outro caminho.
  function unstickPlayer(p) {
    var w = P.width / 2, h = P.height, it, k, r, best, bs, dx, dy, c;
    for (it = 0; it < 3; it++) { best = null; bs = 1e9;
      // (caixa suspensa e elevador usam .lift; so os ELEVADORES sao "cloud" e atravessaveis - a caixa suspensa e solida, entao entra aqui)
      for (k = 0; k < solids.length; k++) { r = solids[k]; if (r[4] === "cloud" || thinR(r) || r.rampCol || r.noPlayer) continue;
        dx = Math.min(p.x + w, r[0] + r[2]) - Math.max(p.x - w, r[0]); dy = Math.min(p.y, r[1] + r[3]) - Math.max(p.y - h, r[1]);
        if (dx <= 0.5 || dy <= 0.5) continue;
        var cands = [[p.y - r[1], "top"], [p.x + w - r[0], "left"], [r[0] + r[2] - (p.x - w), "right"]];
        for (c = 0; c < 3; c++) if (cands[c][0] < bs) { bs = cands[c][0]; best = { r: r, dir: cands[c][1] }; } }
      if (!best) return;
      if (best.dir === "top") { p.y = best.r[1]; if (p.vy >= 0) { p.vy = 0; p.onGround = true; p.standOn = best.r; } }
      else if (best.dir === "left") { p.x = best.r[0] - w; p.vx = 0; }
      else { p.x = best.r[0] + best.r[2] + w; p.vx = 0; } }
  }
  function rayHitsWall(x1, y1, x2, y2) {
    var steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 6);
    for (var s = 1; s <= steps; s++) {
      var x = x1 + (x2 - x1) * s / steps, y = y1 + (y2 - y1) * s / steps;
      for (var i = 0; i < solids.length; i++) { var r = solids[i]; if (r[4] === "cloud") continue; if (x > r[0] && x < r[0] + r[2] && y > r[1] && y < r[1] + r[3]) return true; }
    }
    return false;
  }

  // ---------- combate ----------
  // opt.gib = explode em pedacos (explosoes); opt.dir = direcao do golpe/tiro (o corpo cai para esse lado)
  function damage(target, amount, by, crit, quiet, opt) {
    if (target.dead || ended) return;
    if (by && by !== target && target.team && by.team === target.team) return; // sem fogo amigo
    if (target.imm > 0 && !(opt && (opt.gib || opt.ignoreImm))) return; // imunidade curta ao levantar/inicio da partida (nunca bloqueia morte por sair do mapa)
    target.health -= amount; target.hurt = 8; target.barTimer = 150;
    if (!quiet) blood(target, crit ? 10 : 5);
    if (!quiet) play("hit" + (1 + ((rand() * 3) | 0)), 0.4);
    if (target.health <= 0) {
      target.dead = true; target.charred = !!(opt && opt.fire); target.burn = 0; target.respawn = 150; target.deaths++; if (by && by !== target) by.kills++;
      target.atk = null; target.stun = 0; target.stag = 0;
      var dir = opt && opt.dir ? opt.dir : by && by !== target ? (target.x >= by.x ? 1 : -1) : -target.face;
      if (opt && opt.gib) {
        target.gone = true; play(target.human ? "wilhelm" : "gib", 0.6);
        for (var j = 0; j < 20; j++) particles.push({ x: target.x, y: target.y - 18, vx: (rand() - 0.5) * 8 * 1.6 * DT, vy: -rand() * 6 * 1.6 * DT, life: 70, c: "#a01818", g: 0.3 * DT * DT * 1.6 });
        for (var gi = 1; gi <= 5; gi++) { var gid = SF.spriteAlias["char_gib_0" + gi]; if (gid) particles.push({ x: target.x, y: target.y - 18, vx: (dir * 1.5 + (rand() - 0.5) * 6) * 1.6 * DT, vy: (-2 - rand() * 5) * 1.6 * DT, life: 900, g: 0.45 * DT * DT * 1.6, spr: gid, rot: 0, vr: (rand() - 0.5) * 0.5, phys: true, bounce: 0.3, snd: "woodhit" }); }
        for (var gb = 0; gb < 10; gb++) particles.push({ x: target.x, y: target.y - 18, vx: (rand() - 0.5) * 6 * 1.6 * DT, vy: (-1 - rand() * 5) * 1.6 * DT, g: 0.4 * DT * DT * 1.6, life: 400, spr: SF.spriteAlias.blood_particle_big, rot: 0, vr: 0, phys: true, stick: true, c: "#a01818", r: 2 });
      } else { // como no original: o corpo e arremessado, gira caindo e fica deitado (KNOCKDOWN parado no quadro 4)
        if (target.human) play("wilhelm", 0.5);
        if (opt && opt.bullet && target.onGround && rand() < 0.33) { target.dk = 0.01; target.lock = -dir; } // ajoelha e depois tomba (DeathKneel)
        else knock(target, dir * 2, -1.5, -dir); // sem isso o cadaver ficava dead sem fall/kd e nao era desenhado (drawBody: "corpo ainda no ar sem FALL: nada")
      }
      say((by && by !== target ? by.name + " eliminou " + target.name : target.name + " morreu"));
      if (lastStanding() && !cfg.demo) startSlowmo(SF.slowmo.killStay, SF.slowmo.fadeOut);
      if (surv && by && by.human && by !== target) surv.kills++;
      checkWin();
      if (target.weapon) dropGunAt(target.weapon, target.x, target.y, target.ammo, target.face);
      if (target.melee && target.melee !== "fists") pickups.push({ x: target.x + 8, y: target.y, type: target.melee, respawn: 0, base: null, fall: true, vy: 0 });
      target.weapon = null; target.melee = "fists";
    }
  }
  function blood(o, n) { for (var i = 0; i < n; i++) particles.push({ x: o.x, y: o.y - 20, vx: (rand() - 0.5) * 4 * DT, vy: -rand() * 4 * DT, life: 40 / DT, c: "#a01818", g: 0.2 * DT * DT }); }

  // ---------- reacoes: atordoado (STUN), cambaleando (STAGGER), caindo (FALL_F/B) e derrubado (KNOCKDOWN) ----------
  function ov(v) { return v * 1.6 * DT * JK; } // velocidade do original (px do nivel/frame) -> px do port/tick
  function busy(p) { return p.fall || p.kd > 0 || p.stun > 0 || p.stag > 0; }
  function knock(o, vx, vy, faceDir) { // Fall(): o personagem e arremessado e gira no ar
    o.fall = true; o.kd = 0; o.stun = 0; o.stag = 0; o.atk = null; o.climb = false; o.onGround = false; o.y -= 1; o.aiming = 0; o.seq = null; o.act = null; o.jkick = null; o.kneel = false;
    o.kx = ov(vx); o.vy = ov(vy); if (faceDir) o.lock = faceDir; if (!o.lock) o.lock = o.face;
    var fwd = (o.lock === 1 && vx >= 0) || (o.lock === -1 && vx < 0); // FallingFoward()
    o.fallF = fwd; o.rot = 0; o.rotV = fwd ? 10 : -10; o.rotI = fwd ? 2 : -2;
  }
  function updateReactions(o) { // roda todo tick para vivos e corpos
    var M = SF.melee;
    if (o.imm > 0) o.imm -= DT;
    if (o.dk > 0) { o.dk += DT; if (o.dk > 6) { o.dk = 0; knock(o, o.lock * 1.7, -1.5, o.lock); } return; } // fim do DEATH_KNEEL: cai para frente
    if (o.fall) {
      o.rot += o.rotV * DT; if (Math.abs(o.rotV) < 36) o.rotV += o.rotI * DT;
      if (o.onGround && o.vy >= 0) { o.fall = false; o.kd = 1; o.rot = 0; o.kx = 0; play("woodhit", 0.3); } // PlayerLands -> KNOCKDOWN
    } else if (o.kd > 0) {
      if (o.dead) o.kd = Math.min(4, o.kd + DT); // morto: fica deitado
      else { var before = o.kd; o.kd += DT; if (before < M.riseFrame && o.kd >= M.riseFrame) o.imm = M.immunity; if (o.kd > M.knockdownFrames + 1) o.kd = 0; }
    }
    if (o.stun > 0) o.stun -= DT;
    if (o.stag > 0) { o.stag -= DT; if (o.onGround) o.kx = ov(o.lock * M.staggerSpeed); if (o.stag <= 0) o.kx = 0; }
    // pushback (CurrentPushbackPower do original) decai sozinho se parar de levar tiro: sem isso, qualquer sequencia espacada de
    // acertos soma ate 100 e cambaleia/derruba, nao so rajadas rapidas como no original.
    if (o.push > 0) { if (o.pushDelay > 0) o.pushDelay -= DT; else { o.push = Math.max(0, o.push - M.pushDecay * DT); } }
  }
  // tiro acertou: acumula "pushback"; critico ou pushback >= 100 -> 25% cai, senao cambaleia (BulletDamage do original)
  function bulletReaction(o, w, dir, crit) {
    if (o.dead) return;
    o.push += w.pushback || 0; o.pushDelay = SF.melee.pushDelay; // reinicia o atraso antes do pushback comecar a cair
    if (!(crit || o.push >= 100)) return;
    o.push = 0; o.lock = -dir; o.atk = null;
    if (!o.onGround || o.kd > 0 || rand() < 0.25) { knock(o, dir * 2, -2, -dir); shake = Math.max(shake, 2); }
    else { o.stag = SF.melee.staggerMin + rand() * SF.melee.staggerRand; o.stun = 0; }
  }
  // Disarm() do original: todo soco/golpe (PunchPlayer) desarma quem apanhou. Mirando com arma de fogo, ela cai no chao com a
  // municao que restava (AbortAiming forcado); segurando granada/molotov, ela e solta na hora, sem a forca de um arremesso (DropThrowable).
  function disarm(o) {
    if (o.aiming === 1 && o.weapon) {
      dropGunAt(o.weapon, o.x, o.y, o.ammo, o.face);
      o.weapon = null; o.aiming = 0; o.seq = null; o.drawT = 0; o.turnT = 0; o.pendFire = false; o.backT = 0;
    } else if (o.aiming === 2) {
      var ang = (o.face > 0 ? o.pitch : 180 - o.pitch) * Math.PI / 180; o.aiming = 0;
      throwGrenade(o, ang, o.fuse, 0.08);
    }
  }
  // ---------- corpo a corpo: combo de 3 golpes guiado pelos quadros da animacao ----------
  function meleeAnim(p) { var ch = SF.chars[p.char], w = SF.weapons[p.melee] || SF.weapons.fists; return ch[w.anim + "_0" + p.atk.n] || ch["PUNCH_0" + p.atk.n]; }
  function startMelee(p, dir) { p.atk = { n: 1, f: 0, hit: false, delay: 0, dir: dir || p.face }; p.lock = p.atk.dir; }
  function canPunch(p, o) {
    if (o === p || o.dead || o.fall || o.kd > 0 || o.imm > 0) return false;
    if (o.team && o.team === p.team) return false;
    var w = SF.weapons[p.melee] || SF.weapons.fists, M = SF.melee, dir = p.atk.dir, range = (w.range[p.atk.n - 1] + 4) * 1.6;
    var dx = o.x - p.x; if (Math.abs(dx) > range || dx * dir < -4) return false; // InMeleeRange + na frente
    var dy = p.y - o.y; if (dy < M.vRange[0] * 1.6 || dy > M.vRange[1] * 1.6) return false;
    return !rayHitsWall(p.x, p.y - 17, o.x, o.y - 17);
  }
  // vidro na frente do golpe (qualquer arma branca ou soco) quebra: mesma fila do pouso/tiro (glassQ)
  function punchGlass(p, dir, range) {
    var x0 = dir > 0 ? p.x : p.x - range, x1 = x0 + range;
    for (var k = 0; k < solids.length; k++) { var r = solids[k]; if (!r.glass) continue;
      if (x1 > r[0] - 1 && x0 < r[0] + r[2] + 1 && p.y > r[1] - 1 && p.y - P.height < r[1] + r[3] + 1 && glassQ.indexOf(r) < 0) glassQ.push(r); }
  }
  function meleeStrike(p) { // MeleeStrike(): no quadro de acerto
    var w = SF.weapons[p.melee] || SF.weapons.fists, M = SF.melee, n = p.atk.n, dir = p.atk.dir;
    p.atk.hit = true; play(rand() < 0.5 ? "swing1" : "swing2", 0.35);
    if (w.blade) fx("trace_" + p.melee + "_0" + n, p.x, p.y, 0, dir, S);
    var hits = players.filter(function (o) { return canPunch(p, o); });
    hits.forEach(function (o) {
      o.lock = -dir; // vira para quem bateu
      if (w.blade || n >= 2) blood(o, w.blade ? 6 : n * 2);
      for (var i = 0; i < 4; i++) particles.push({ x: o.x - dir * 3, y: o.y - 20, vx: dir * rand() * 2 * DT, vy: (rand() - 0.5) * 2 * DT, life: 8 / DT, c: "#fff6c0", g: 0, r: 3 });
      var wasAir = !o.onGround;
      damage(o, w.damage[n - 1], p, false, true, { dir: dir });
      if (o.dead) return;
      disarm(o); // PunchPlayer do original: todo soco/golpe desarma quem apanhou (arma cai no chao, granada na mao e solta)
      if (n === 3) knock(o, dir * M.knockX, M.knockY, -dir); // 3o golpe derruba
      else if (wasAir) knock(o, dir * 2, -1, -dir);
      else { o.stun = M.stunBase[n - 1] + rand() * M.stunRand; o.stunA = o.stunA === 1 ? 2 : 1; o.atk = null; o.stag = 0; }
    });
    if (hits.length) { playAny(w.hitSound); p.atk.delay = M.hitStop; shake = Math.max(shake, n === 3 ? 4 : 2); }
    else { // sem jogador: acerta caixas/barris na frente
      var range = (w.range[n - 1] + 4) * 1.6; hangMelee(p, dir, range, w.damage[n - 1]); tryButton(p, dir);
      punchGlass(p, dir, range);
      props.forEach(function (pr) { if (pr.dying) return; var dx = pr.x - p.x; if (dx * dir > -4 && Math.abs(dx) < range + pr.def.w / 2 && p.y > pr.y - pr.def.h - 6 && p.y - P.height < pr.y) { hitProp(pr, w.damage[n - 1], false, true); if (pr.def.geladeira && !pr.dying) pr.vx = dir * SF.melee.kickVx * 1.5; /* geladeira: soco empurra forte */ if (pr.def.fly) { pr.vx = dir * SF.melee.kickVx * 1.4; pr.by = p; pr.t0 = tick; } /* soco direto: recuo maior que o tiro */ if (pr.def.slide && !pr.dying) pr.vx = dir * SF.melee.kickVx * 0.4; /* caixa pequena: o soco empurra um pouco (~5 px), sem sair do alcance do proximo soco */ if (pr.def.push && !pr.dying) pr.vx = dir * SF.melee.kickVx * 0.8; /* barril/mesa: o soco empurra (barril explosivo so empurra, nao quebra) */ play("woodhit", 0.4); } });
    }
  }
  function updateMelee(p, press, turn) {
    var M = SF.melee, a = p.atk;
    if (!a) return;
    var id = meleeAnim(p).ANIM, nf = SF.sprites[id] ? SF.sprites[id].n : 9;
    // encadeia o combo: no original so vale apertar a partir do comboFrame; aqui um aperto ate comboBuffer quadros antes fica guardado
    if (press && a.n < 3 && a.f >= M.comboFrame[a.n - 1] - (M.comboBuffer || 0)) a.queued = true;
    if (a.queued && Math.floor(a.f) >= M.comboFrame[a.n - 1]) { a.n++; a.f = 0; a.hit = false; a.delay = 0; a.queued = false; }
    if (!a.hit && turn && Math.floor(a.f) < M.hitFrame[a.n - 1]) { a.dir = turn; p.lock = turn; } // pode virar antes do golpe sair
    if (a.delay > 0) { a.delay -= DT; return; } // hit-stop: a animacao segura 1 quadro no impacto
    a.f += DT;
    if (!a.hit && Math.floor(a.f) >= M.hitFrame[a.n - 1]) meleeStrike(p);
    if (a.hit && a.n === 3) { var prog = Math.min(1, a.f / nf); p.kx = ov(M.glide * a.dir * (1 - prog)); } // 3o golpe desliza para frente
    if (a.f >= nf + 1) { p.atk = null; p.kx = 0; }
  }
  function teamKills(t) { var s = 0; players.forEach(function (p) { if (p.team === t) s += p.kills; }); return s; }
  var TEAM_NAMES = { 1: "Time Azul", 2: "Time Vermelho", 3: "Time Amarelo", 4: "Time Verde" };
  function checkWin() {
    if (ended || cfg.mode === "survival" || !(cfg.kills > 0) || cfg.kills >= 9999) return;
    var sc = {}, who = {};
    players.forEach(function (p) { var k = p.team ? "t" + p.team : "p" + p.id; sc[k] = (sc[k] || 0) + p.kills; who[k] = who[k] || p; });
    for (var k in sc) if (sc[k] >= cfg.kills) {
      var w = who[k], title = w.team ? TEAM_NAMES[w.team] + " venceu!" : ((w.human && !cfg.p2 && !cfg.roster ? "Voce" : w.name) + (w.human && !cfg.p2 && !cfg.roster ? " venceu!" : " venceu!"));
      var mine = players.some(function (p) { return p.human && (w.team ? p.team === w.team : p === w); });
      finish(title, mine); return;
    }
  }  function results() {
    return players.slice().sort(function (a, b) { return b.kills - a.kills || a.deaths - b.deaths; }).map(function (p) { return { name: p.name, kills: p.kills, deaths: p.deaths, team: p.team, you: p.human, char: p.char }; });
  }
  function finish(title, youWon, extra) { if (ended) return; ended = true; if (SF.onEnd) SF.onEnd({ title: title, won: youWon, rows: results(), extra: extra || "", mode: cfg.mode }); }
  // ---------- armas: pontos do braco lidos do SWF (AIM_POSITION / FIRE_CENTER / MUZZLE_CENTER / SHELL_CENTER, px do nivel) ----------
  var ARM = {
    PISTOL: { fire: [8.1, -3.5], aim: [12.5, -3.5], muz: [12.5, -3.5], shell: [6.5, -3.5], flash: "muzzle_flash_pistol", casing: "empty_shell_small", bullet: "bullet_pistol" },
    MAGNUM: { fire: [8.1, -3.5], aim: [13.5, -3.5], muz: [12.5, -3.5], shell: [6.5, -3.5], flash: "muzzle_flash_pistol", casing: "empty_shell_small", bullet: "bullet_magnum" },
    UZI: { fire: [12.5, -4], aim: [13.5, -4], muz: [13.5, -4], shell: [7.5, -4.5], flash: "muzzle_flash_pistol", casing: "empty_shell_small", bullet: "bullet_uzi" },
    RIFLE: { fire: [16, -1], aim: [16, -1], muz: [18.5, -1], shell: [7, -1.4], flash: "muzzle_flash_rifle", casing: "empty_shell_big", bullet: "bullet_rifle" },
    SHOTGUN: { fire: [13.5, -1], aim: [16, -1], muz: [15.5, -1], shell: [5.5, -0.5], flash: "muzzle_flash_shotgun", casing: "empty_shell_shotgun", bullet: "bullet_shotgun" },
    SNIPER: { fire: [18.5, -1], aim: [18.5, -1], muz: [21.5, -1], shell: [7, -2], laser: [10, -3.5], flash: "muzzle_flash_sniper", casing: "empty_shell_big", bullet: "bullet_sniper" },
    BAZOOKA: { fire: [11.5, -3], aim: [13.5, -3], muz: [13.5, -3], shell: [7, -3], flash: "muzzle_flash_bazooka" },
    FLAMETHROWER: { fire: [17, -0.5], aim: [16, -0.5], muz: [16, -0.5], shell: [6.5, -0.5] },
    GRENADE: { fire: [11, -1], aim: [11, -1], muz: [11, -1], shell: [0, 0] }
  };
  function armOf(p) { var w = p.aiming === 2 ? null : p.weapon && SF.weapons[p.weapon]; return ARM[(w && w.anim) || (p.aiming === 2 ? "GRENADE" : "PISTOL")] || ARM.PISTOL; }
  // ponto do braco em coordenadas do mundo: ombro + rotacao pela mira (formula do AimLazer do original)
  // pivo do braco = translate do ANIM_WPN do estado AIM_x no SWF (data/placements.js; pistola -3,-12 / fuzil -4,-12): com o ombro fixo
  // antigo (0,-11) o braco/cabeca ficavam 3px a direita e 1px abaixo do original. Sem dados (ou granada), usa o ombro fixo.
  function shoulderOf(p) {
    var w = p.aiming === 2 ? null : p.weapon && SF.weapons[p.weapon], pl = SF.place && SF.place[p.char], a = w && w.anim && pl && pl["AIM_" + w.anim], t = a && a.ANIM_WPN;
    return t || [SHOULDER_X, SHOULDER_Y];
  }
  function armPoint(p, pt) {
    var sh = shoulderOf(p), a = p.aim, f = p.face, bx = p.x + sh[0] * S * f, by = p.y + sh[1] * S;
    return { x: bx + S * (Math.cos(a) * pt[0] + Math.cos(a + Math.PI / 2) * pt[1] * f), y: by + S * (Math.sin(a) * pt[0] + Math.sin(a + Math.PI / 2) * pt[1] * f) };
  }
  function fx(name, x, y, rot, flip, scale) { var id = SF.spriteAlias[name], m = id && SF.sprites[id]; if (!m) return; particles.push({ x: x, y: y, vx: 0, vy: 0, g: 0, life: m.n / DT, anim: id, nf: m.n, age: 0, rot: rot || 0, flip: flip || 1, sc: scale || 1 }); }
  // um tiro da sequencia (sem recarga: quem controla o ritmo e a sequencia em updateSeq)
  function shootOne(p) {
    var w = p.weapon && SF.weapons[p.weapon], aimAngle = p.aim; if (!w || w.melee) return false;
    if (p.ammo <= 0) { play(w.empty); return false; }
    p.ammo--; p.recoil = 4;
    // arma vazia: descarta sozinha no chao e libera o slot (sem isso o jogador tinha que descartar na mao pra poder
    // pegar outra do chao, mesmo com 0 balas)
    if (p.ammo <= 0) pending.push({ t: 1, fn: function () { dropWeapon(p); } });
    // recuo: empurra o atirador para tras, proporcional ao "pushback" da arma (NAO existe fisicamente no original, so visual/senti-
    // mento; so se aplica no chao, senao empurraria o pulo/queda de forma estranha). Pistola e lanca-chamas nao tem recuo (a pedido).
    if (p.onGround && !w.rocket && p.weapon !== "pistol" && p.weapon !== "flamethrower") p.kx += -Math.cos(aimAngle) * (w.pushback || 10) * P.recoilKick * DT;
    var arm = armOf(p), o = armPoint(p, arm.fire), ox = o.x, oy = o.y;
    if (w.flame) { // labareda: nao e bala, vive em fires[]
      if (!(p.flameSnd > tick)) { p.flameSnd = tick + 8; playAny(w.sound); }
      var fa = aimAngle + (rand() - 0.5) * 2 * w.spread * Math.PI / 180, fs = w.speed * (0.85 + rand() * 0.3);
      fires.push({ kind: "flame", x: ox, y: oy, vx: Math.cos(fa) * fs, vy: Math.sin(fa) * fs, dist: 0, range: w.range, owner: p, w: w, hit: [], age: 0, f0: (rand() * 4) | 0 });
      return true;
    }
    playAny(w.sound);
    for (var n = 0; n < w.pellets; n++) { // velocidade do original (px do nivel/frame) x1.6
      var a = aimAngle + (rand() - 0.5) * 2 * w.spread * Math.PI / 180, sp = w.speed * 1.6;
      bullets.push({ x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, owner: p, w: w, dist: 0, age: 0, avoid: [], spr: arm.bullet });
    }
    var mz = armPoint(p, arm.muz); if (arm.flash) fx(arm.flash, mz.x, mz.y, Math.atan2(Math.sin(aimAngle), Math.abs(Math.cos(aimAngle))), p.face, S);
    fx("smoke_weapon_muzzle", mz.x, mz.y - 2, 0, 1, S * 0.8);
    if (arm.casing && !w.rocket) { var sh = armPoint(p, arm.shell), cid = SF.spriteAlias[arm.casing]; // capsula ejetada com fisica
      if (cid) particles.push({ x: sh.x, y: sh.y, vx: (-p.face * (0.6 + rand() * 0.8)) * 1.6 * DT, vy: (-1.5 - rand() * 1.2) * 1.6 * DT, g: 0.35 * DT * DT * 1.6, life: 360, spr: cid, rot: 0, vr: (rand() - 0.5) * 0.5, phys: true, bounce: 0.45, snd: "shellbounce" }); }
    return true;
  }
  // caixa atingivel conforme a postura (no original e o CollisionMC de cada animacao)
  function hitbox(o) {
    if (o.gone) return null;
    if (o.dead) return o.fall ? { x1: o.x - 9, x2: o.x + 9, y1: o.y - 26, y2: o.y - 6 } : { x1: o.x - 13, x2: o.x + 13, y1: o.y - 9, y2: o.y };
    if (o.fall) return { x1: o.x - 9, x2: o.x + 9, y1: o.y - 26, y2: o.y - 6 };
    if (o.kd > 0) return { x1: o.x - 13, x2: o.x + 13, y1: o.y - (o.kd > 9 ? 22 : 10), y2: o.y };
    if (o.act && (o.act.type === "roll" || o.act.type === "dive")) return { x1: o.x - 8, x2: o.x + 8, y1: o.y - 16, y2: o.y };
    if (o.kneel) return { x1: o.x - 7, x2: o.x + 7, y1: o.y - 22, y2: o.y };
    return { x1: o.x - P.width / 2, x2: o.x + P.width / 2, y1: o.y - P.height, y2: o.y };
  }
  // ---------- vidros quebraveis (AddGlass / SOLID_GLASS_01 do original: PlayerFragile, Strength 0) ----------
  // Quebram ao serem pisados/atingidos: pouso em cima, corpo arremessado/rolando/mergulhando que bate de lado, tiro, explosao.
  // Viram fragmentos (particulas) e saem da lista de colisao. glassQ evita mexer em solids durante os loops que o percorrem.
  var glassQ = [];
  function addGlass(key) {
    var G = (SF.glass && SF.glass[key]) || [];
    G.forEach(function (g) { var vert = Math.abs(g[0] - g[2]) < 0.5, rect;
      if (vert) { var y0 = Math.min(g[1], g[3]), len = Math.abs(g[3] - g[1]); rect = [g[0] - 1.5, y0, 3, len, "solid"]; }
      else { var x0 = Math.min(g[0], g[2]), wid = Math.abs(g[2] - g[0]); rect = [x0, g[1] - 1.5, wid, 3, "solid"]; }
      rect.glass = true; solids.push(rect); });
  }
  function processGlass() {
    while (glassQ.length) { var r = glassQ.pop(), i = solids.indexOf(r); if (i < 0) continue; solids.splice(i, 1);
      play("glass1", 0.5); shake = Math.max(shake, 1.5);
      for (var q = 0; q < 14; q++) { var sp = 1 + rand() * 3; particles.push({ x: r[0] + rand() * Math.max(3, r[2]), y: r[1] + rand() * Math.max(3, r[3]), vx: (rand() - 0.5) * sp * 1.6 * DT, vy: -rand() * sp * 1.6 * DT, life: 40 + rand() * 30, c: q % 2 ? "#bfeeff" : "#7fc8ea", g: 0.3 * DT * DT * 1.6, r: 2 }); } }
  }
  function updateBullets() {
    for (var i = bullets.length - 1; i >= 0; i--) {
      var b = bullets[i], steps = 4, dead = false, bdir = b.vx >= 0 ? 1 : -1;
      b.age += DT;
      if (b.w.rocket) { // trajetoria do original (UpdateRockets): oscila +-4 graus por update, metade da velocidade com alguem preso, e quem carrega gira com cima/baixo
        var rang = Math.atan2(b.vy, b.vx), rsp = b.w.speed * 1.6 * (b.rider ? 0.5 : 1);
        if (b.rider && b.rider.human) { var rsl = b.rider.slot || 1; if (held(rsl, "up")) rang -= 20 * DT * Math.PI / 180; if (held(rsl, "down")) rang += 20 * DT * Math.PI / 180; }
        rang += (rand() * 8 - 4) * DT * Math.PI / 180;
        b.vx = Math.cos(rang) * rsp; b.vy = Math.sin(rang) * rsp;
      }
      for (var s = 0; s < steps && !dead; s++) {
        var dx = b.vx * DT / steps, dy = b.vy * DT / steps; b.x += dx; b.y += dy; b.dist += Math.hypot(dx, dy);
        if (b.dist > 2600 || b.x < -50 || b.x > map.width + 50 || b.y < -200 || b.y > map.height + 50) { dead = true; break; }
        if (hangBullet(b) || lampBullet(b)) { dead = true; break; }
        for (var k = 0; k < solids.length; k++) { var r = solids[k]; if (r[4] === "cloud" || r.noPlayer) continue; // arma vazia no chao: a bala passa
          if (r.glass && b.x > r[0] - 1 && b.x < r[0] + r[2] + 1 && b.y > r[1] - 1 && b.y < r[1] + r[3] + 1) { glassQ.push(r); continue; } // vidro: quebra e a bala segue
          if (b.x > r[0] && b.x < r[0] + r[2] && b.y > r[1] && b.y < r[1] + r[3]) { dead = true; if (r.prop) { hitProp(r.prop, b.w.rocket ? 0 : b.w.damage, false, true, true);
              if (r.prop.def.fly && !b.w.rocket) { r.prop.vx += bdir * (b.w.pellets > 1 ? 0.6 : 1.5); r.prop.by = b.owner; r.prop.t0 = tick; } // tiro: recuo leve na poltrona
              play(r.prop ? "woodhit" : "metal", 0.2); }
            if (!b.w.rocket) { fx("bullet_impact", b.x - dx, b.y - dy, Math.atan2(-b.vy, -b.vx), 1, S);
              for (var q = 0; q < 3; q++) particles.push({ x: b.x - dx, y: b.y - dy, vx: (-bdir * rand() * 2 + (rand() - 0.5)) * DT * 1.6, vy: (-rand() * 2) * DT * 1.6, life: 30, c: "#ffd070", g: 0.3 * DT * DT * 1.6, r: 2 }); }
            break; } }
        if (dead) break;
        for (var j = 0; j < players.length; j++) { var o = players[j];
          if (o === b.owner || o === b.rider || b.avoid.indexOf(o) >= 0 || (!o.dead && o.team && o.team === b.owner.team)) continue;
          var hb = hitbox(o); if (!hb || b.x < hb.x1 || b.x > hb.x2 || b.y < hb.y1 || b.y > hb.y2) continue;
          if (!o.dead && (o.imm > 0 || (o.act && (o.act.type === "roll" || o.act.type === "dive") && rand() < 0.9))) { b.avoid.push(o); continue; } // BulletWillHit: imune / rolando esquiva 90%
          if (b.w.rocket) { // foguete (RocketWillHit/StuckToRocket do original): acerta alguem vivo -> carona; corpo, quem ja carrega ou outro foguete -> explode
            if (o.dead || b.rider) { dead = true; break; }
            if (o.ride) { o.ride.boom = true; dead = true; break; }
            b.rider = o; o.ride = b; o.rideT = 0; o.act = null; o.atk = null; o.aiming = 0; o.kneel = false; o.sprint = 0; o.jkick = null; o.climb = false;
            o.fall = false; o.kd = 0; o.dk = 0; o.kx = 0; o.vx = 0; o.vy = 0; o.grabbed = null; o.stun = 0; o.stag = 0;
            play("hit" + (1 + ((rand() * 3) | 0)), 0.5); shake = Math.max(shake, 4);
            break;
          }
          bleed(o, b.x, b.y, b.vx, b.vy);
          if (o.dead) { knock(o, bdir * 2, -1.5, null); dead = true; break; } // corpo tambem e empurrado pelo tiro
          var crit = rand() * 100 < b.w.critChance;
          damage(o, b.w.damage + (crit ? b.w.critDamage : 0), b.owner, crit, true, { dir: bdir, bullet: true }); bulletReaction(o, b.w, bdir, crit); play("hit" + (1 + ((rand() * 3) | 0)), 0.4); dead = true; break;
        }
      }
      if (b.rider) { // carona: o personagem vai junto com o foguete; 150 de tempo (RocketRideTimer) e ele explode
        var rd0 = b.rider; if (rd0.dead) { rd0.ride = null; b.rider = null; } else { rd0.x = b.x; rd0.y = b.y + P.height / 2; unstickPlayer(rd0); b.rideT = (b.rideT || 0) + DT; if (b.rideT > 150) b.boom = true; }
      }
      if (b.boom) dead = true;
      if (!dead && b.w.rocket && tick % 2 === 0) particles.push({ x: b.x, y: b.y, vx: (rand() - 0.5) * 0.6, vy: (rand() - 0.5) * 0.6, life: 28, c: "#9a9a9a", g: -0.02, r: 4 });
      if (dead) { if (b.w.rocket) explode(b.x, b.y, b.owner);
        if (b.rider) { var rdr = b.rider; b.rider = null; rdr.ride = null; if (!rdr.dead && !rdr.fall) knock(rdr, bdir * 3, -3, bdir); } // solta quem carregava (explosao ja o derrubou se forte)
        bullets.splice(i, 1); }
    }
  }
  // sangue do original: particulas que voam na direcao do tiro e grudam no chao/paredes
  function bleed(o, x, y, vx, vy) {
    var sp = Math.hypot(vx, vy) || 1, nx = vx / sp, ny = vy / sp, ids = [SF.spriteAlias.blood_particle_small, SF.spriteAlias.blood_particle_big];
    for (var i = 0; i < 4; i++) { var s2 = (1 + rand() * 2) * 1.6 * DT;
      particles.push({ x: x, y: y, vx: nx * s2 + (rand() - 0.5) * DT, vy: ny * s2 - rand() * 1.5 * DT, g: 0.4 * DT * DT * 1.6, life: 240, spr: ids[i & 1], rot: 0, vr: 0, phys: true, stick: true, c: "#a01818", r: 2 }); }
  }
  // ---------- explosoes, props, granadas ----------
  // Forma da explosao [ORIG Explosions.TriggerExplosionAt]: 36 raios de r=33 px (x S) em passos de 3 px; cada raio para na 1a parede/objeto.
  // A energia dos raios bloqueados (m = soma de r - distancia) e redistribuida aos livres: power = min(m/livres*0.25, r/2) e r cresce
  // por esse tanto. Resultado: explosao em sala fechada alcanca mais longe, e NAO atravessa parede (quem esta do outro lado nao leva).
  var BN = 36, BCOS = [], BSIN = [];
  for (var bi = 0; bi < BN; bi++) { BCOS.push(Math.cos(bi * 2 * Math.PI / BN)); BSIN.push(Math.sin(bi * 2 * Math.PI / BN)); }
  function blastSolid(px, py) {
    for (var i = 0; i < solids.length; i++) { var r = solids[i]; if (r.glass) continue; if (px >= r[0] && px < r[0] + r[2] && py >= r[1] && py < r[1] + r[3]) return r; }
    return null;
  }
  function blastShape(x, y) {
    var st = 3 * S, r = 33 * S, dist = [], blk = [], hits = [], m = 0, np = BN, i, d, q;
    if (blastSolid(x, y)) { // origem dentro de parede/objeto: procura um ponto livre a +-5 px (como o original)
      var ok = false; for (var ox = -5 * S; ox <= 5 * S && !ok; ox += 5 * S) for (var oy = -5 * S; oy <= 5 * S && !ok; oy += 5 * S) if (!blastSolid(x + ox, y + oy)) { x += ox; y += oy; ok = true; }
    }
    for (i = 0; i < BN; i++) { blk[i] = false; dist[i] = r; hits[i] = null;
      for (d = st; d <= r; d += st) { q = blastSolid(x + BCOS[i] * d, y + BSIN[i] * d); if (q) { blk[i] = true; dist[i] = d + st; hits[i] = q; m += r - (d - st); np--; break; } } }
    var power = 0;
    if (m > 0) {
      power = np > 0 ? m / np * 0.25 : r * 0.5; if (power > r * 0.5) power = r * 0.5;
      for (i = 0; i < BN; i++) if (!blk[i]) {
        for (d = r + st; d <= r + power; d += st) { q = blastSolid(x + BCOS[i] * d, y + BSIN[i] * d); if (q) { blk[i] = true; dist[i] = d + st; hits[i] = q; break; } }
        if (!blk[i]) dist[i] = r + power;
      }
    }
    var ex = [], ey = []; for (i = 0; i < BN; i++) { ex.push(x + BCOS[i] * dist[i]); ey.push(y + BSIN[i] * dist[i]); }
    return { x: x, y: y, r: r + power, ex: ex, ey: ey, hits: hits, dist: dist };
  }
  function inBlast(sh, px, py) { // ponto dentro do poligono dos 36 raios
    var inside = false, n = BN, j = n - 1;
    for (var i = 0; i < n; i++) { if ((sh.ey[i] > py) !== (sh.ey[j] > py) && px < (sh.ex[j] - sh.ex[i]) * (py - sh.ey[i]) / (sh.ey[j] - sh.ey[i]) + sh.ex[i]) inside = !inside; j = i; }
    return inside;
  }
  // empurra um prop (impulso do original: dv = 5 m/s = 6.25 px/frame orig, x S). Qualquer prop, nao so a poltrona, voa e cai.
  function launchProp(pr, vx, vy, owner) {
    pr.vx = vx; pr.vy = vy; pr.air = true; pr.by = owner || null; pr.t0 = tick; pr.hit = [];
  }
  function explode(x, y, owner) {
    var E = SF.explosion, sh = blastShape(x, y), R = sh.r; x = sh.x; y = sh.y;
    play("explosion" + ((rand() * 4) | 0), 0.7); shake = Math.max(shake, 12); hangBlast(x, y, R); lampBlast(x, y, R);
    blasts.push({ x: x, y: y, life: 18, max: 18, r: R });
    solids.forEach(function (r) { if (!r.glass) return; var cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2; if (Math.hypot(cx - x, cy - y) <= R && inBlast(sh, cx, cy)) glassQ.push(r); }); // explosao quebra vidro
    for (var i = 0; i < 26; i++) { var a = rand() * 6.283, sp = 1 + rand() * 4, ri = Math.round(a / (2 * Math.PI / BN)) % BN, lim = sh.dist[ri] / R;
      particles.push({ x: x, y: y, vx: Math.cos(a) * sp * Math.min(1, lim + 0.2), vy: Math.sin(a) * sp * Math.min(1, lim + 0.2) - 1, life: 20 + rand() * 25, c: i % 3 ? "#ff9a2a" : "#555", g: 0.02, r: 3 + rand() * 4 }); }
    players.forEach(function (p) {
      if (p.dead || p.gone) return;
      var cx = p.x, cy = p.y - 17; if (!inBlast(sh, cx, cy)) return; // so quem esta dentro da forma (parede protege)
      var dx = cx - x, dy = cy - y, d = Math.hypot(dx, dy);
      var f = d <= R / 2 ? 1 : Math.max(0, 1 - (d - R / 2) / (R / 2)), a = Math.atan2(dy, dx); if (f <= 0) return;
      if (!(p.imm > 0)) { p.kx += Math.cos(a) * E.power * f * DT; p.vy = Math.min(p.vy + Math.sin(a) * E.power * f * 2.2 * DT, -3 * DT); }
      var dmg = E.damage * f; // ExplosionHit(angulo, 5*f, 20*f): dano > 10 derruba, <= 10 so cambaleia; abate com 20 (centro) vira pedacos
      damage(p, dmg, owner, false, false, { gib: dmg >= E.damage * 0.5, dir: dx >= 0 ? 1 : -1 });
      if (!p.dead && !(p.imm > 0)) { if (dmg > E.damage * 0.5) knock(p, (dx >= 0 ? 1 : -1) * 3, -3, dx >= 0 ? -1 : 1); else if (!p.fall) p.stag = SF.melee.staggerMin + rand() * SF.melee.staggerRand; }
    });
    // objetos: raio que bate num prop o empurra (impulso (1-d/r0)*4 limitado a 1 x massa x 5); centro dentro da forma = dano 25 (x escala) e impulso radial
    var rayHit = [], rayDmg = [], r0 = 33 * S;
    for (var k = 0; k < BN; k++) { var q = sh.hits[k]; if (q && q.prop) { var ix = rayHit.indexOf(q.prop); if (ix < 0) { rayHit.push(q.prop); rayDmg.push(0); ix = rayHit.length - 1; } rayDmg[ix] += 1; } }
    props.forEach(function (pr) {
      if (pr.dying) return;
      var cx = pr.x, cy = pr.y - pr.def.h / 2, ri = rayHit.indexOf(pr), inside = inBlast(sh, cx, cy);
      if (!inside && ri < 0) return;
      var dx = cx - x, dy = cy - 4 - y, d = Math.hypot(dx, dy), f = 0, ea = Math.atan2(dy, dx);
      if (inside) f = d <= R / 2 ? 1 : Math.max(0, 1 - (d * 2 - R) / R);
      if (ri >= 0) f = Math.max(f, Math.min(1, (1 - d / r0) * 4) * Math.min(1, 0.4 + rayDmg[ri] * 0.1)); // so os raios bateram no corpo: (1-d/r)*4 do original, mais forte quanto mais raios
      var dmg = (inside ? E.propDamage : 0) + (ri >= 0 ? rayDmg[ri] * E.propDamage * 0.1 : 0);
      if (dmg > 0) hitProp(pr, dmg, true, true);
      if (f > 0 && !pr.dying) launchProp(pr, Math.cos(ea) * 6.25 * S * f * 0.9, Math.min(Math.sin(ea) * 6.25 * S * f * 0.9, -2.2 * S * f), owner);
    });
  }
  // instant: tiro, soco/chute/arma branca (qualquer golpe que acerta) ou reacao em cadeia de outra explosao - um barril/lata
  // explosivo ou de gasolina detona de uma vez so (uma batida), nao precisa esvaziar a vida aos poucos.
  // Caixas e outros props seguem perdendo vida normalmente.
  // barril explosivo so reage a BALA (bullet), GRANADA/EXPLOSAO (byBlast) - soco, chute, arma branca, fogo e queda nao o acionam.
  function hitProp(pr, dmg, byBlast, instant, bullet) {
    if (pr.dying || pr.def.indestructible) return; // balde/barril de ferro e poltrona nunca quebram (BodyData indestructible do original)
    if ((pr.def.explosive || pr.def.gas) && !byBlast && !bullet) return; // barril explosivo e galao: so bala/explosao
    if (instant && (pr.def.explosive || pr.def.gas)) pr.hp = 0; else pr.hp -= dmg;
    if (pr.hp > 0) return;
    pr.dying = true;
    pending.push({ t: pr.def.explosive ? (byBlast ? 8 : 2) : 0, fn: function () { destroyProp(pr); } });
  }
  function destroyProp(pr) {
    var i = props.indexOf(pr); if (i >= 0) props.splice(i, 1);
    i = solids.indexOf(pr.rect); if (i >= 0) solids.splice(i, 1);
    play(rand() < 0.5 ? "wood1" : "wood2", 0.5);
    pr.def.debris.forEach(function (name) { var id = SF.spriteAlias[name]; if (id) for (var dn = 0; dn < 2; dn++) particles.push({ x: pr.x + (rand() - 0.5) * pr.def.w * 0.6, y: pr.y - pr.def.h / 2, vx: (rand() - 0.5) * 5 * 1.6 * DT, vy: (-1.5 - rand() * 4) * 1.6 * DT, life: 700, g: 0.45 * DT * DT * 1.6, spr: id, rot: rand() * 6, vr: (rand() - 0.5) * 0.5, phys: true, bounce: 0.3, snd: "woodhit" }); });
    if (pr.def.explosive) explode(pr.x, pr.y - pr.def.h / 2, null);
    if (pr.def.gas) gasBurst(pr.x, pr.y - pr.def.h / 2, null); // galao: onDestruction -> fireburst + TriggerFireAt("GASCAN"), sem explosao
  }
  // ---------- galao de gasolina (Fires.as TriggerFireAt("GASCAN") + FireNodeData do original) ----------
  // 18 labaredas saem em circulo (vel 2.2~2.6 px/frame), desaceleram (x0.9/frame) e depois caem (+0.2/frame); ao pousar viram fogo
  // no chao por 96 frames (_burn_timer); labaredas pousadas a menos de 3 px se fundem (a de maior tempo prevalece). Quem esta a <=16 px
  // do galao e sem parede no meio pega fogo na hora (BurnState = 100). Unidades: px do port = original x1.6; tick = DT frames.
  var gnodes = [];
  function fireBlocked(x1, y1, x2, y2) {
    var n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 4));
    for (var i = 1; i < n; i++) { var qx = x1 + (x2 - x1) * i / n, qy = y1 + (y2 - y1) * i / n;
      for (var k = 0; k < solids.length; k++) { var r = solids[k]; if (r[4] === "cloud" || r.prop || thinR(r)) continue; if (qx > r[0] && qx < r[0] + r[2] && qy > r[1] && qy < r[1] + r[3]) return true; } }
    return false;
  }
  function gasBurst(x, y, owner) {
    play("fireplosion", 0.5); shake = Math.max(shake, 3);
    for (var i = 0; i < 18; i++) { var ang = Math.PI * 2 / 18 * i, sp = (2.2 + rand() * 0.4) * 1.6;
      gnodes.push({ x: x + Math.cos(ang) * 3 * 1.6, y: y + Math.sin(ang) * 3 * 1.6, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - rand() * 0.5 * 1.6, slow: true, owner: owner }); }
    players.forEach(function (o) { if (o.dead || o.gone) return; var dx = o.x - x, dy = (o.y - 17) - y;
      if (Math.hypot(dx, dy) <= 16 * 1.6 && !fireBlocked(x, y, o.x, o.y - 17)) ignite(o, owner); });
  }
  function updateGasNodes() {
    for (var i = gnodes.length - 1; i >= 0; i--) {
      var g = gnodes[i];
      g.vx *= Math.pow(0.9, DT);
      if (g.slow) { g.vy *= Math.pow(0.9, DT); if (Math.hypot(g.vx, g.vy) <= 2 * 1.6) g.slow = false; } else g.vy += 0.2 * 1.6 * DT;
      var ox = g.x, oy = g.y, landed = false;
      g.x += g.vx * DT; g.y += g.vy * DT;
      for (var k = 0; k < solids.length; k++) { var r = solids[k]; if (r[4] === "cloud" || thinR(r)) continue;
        if (g.x > r[0] && g.x < r[0] + r[2] && g.y > r[1] && g.y < r[1] + r[3]) { g.x = ox; g.y = oy; if (g.vy >= 0 && oy <= r[1] + 3) landed = true; g.vx = 0; if (g.vy < 0) g.vy = 0; g.slow = false; break; } }
      if (!landed && g.vy > 0) { var gt = groundTop(g.x, oy - 2); if (g.y >= gt && oy <= gt + 2) { g.y = gt; landed = true; } }
      if (g.x < 0 || g.x > map.width || g.y > map.height + 50) { gnodes.splice(i, 1); continue; }
      if (tick % 3 === 0) particles.push({ x: g.x, y: g.y, vx: 0, vy: -0.3, life: 14, c: "#ff9a2a", g: -0.005, r: 2 });
      if (landed) { gnodes.splice(i, 1); var life = 96 / DT, merged = false;
        for (var f = 0; f < fires.length; f++) { var pf = fires[f]; if (pf.kind === "patch" && Math.abs(pf.x - g.x) < 3 * 1.6 && Math.abs(pf.y - g.y) < 4) { if (pf.life < life) { pf.life = life; pf.max = Math.max(pf.max, life); } merged = true; break; } }
        if (!merged) addPatch(g.x, g.y, life, g.owner); }
    }
  }
  function throwGrenade(p, aim, fuse, weak) { // weak (0-1): forca reduzida, usada so no Disarm (DropThrowable: cai aos pes, nao e arremessada)
    if (p.gren <= 0) return; p.gren--;
    var G = SF.grenade, spd = weak != null ? weak : 1;
    grenades.push({ x: p.x + Math.cos(aim) * 8, y: p.y - 22 + Math.sin(aim) * 8, vx: (Math.cos(aim) * G.speed * DT + p.vx * 0.5) * spd, vy: (Math.sin(aim) * G.speed - 3.2) * DT * spd, t: fuse != null ? fuse : G.fuse / DT, owner: p, rot: 0, mol: p.gtype === "molotov" });
  }
  // ---------- fogo: poças (molotov), labaredas (lanca-chamas) e jogadores em chamas ----------
  function ignite(o, by) { var F = SF.fire; if (o.dead) return; if (by && by !== o && o.team && by.team === o.team) return; o.burn = Math.max(o.burn || 0, F.ignite); o.burnBy = by; }
  function addPatch(x, y, life, owner) { fires.push({ kind: "patch", x: x, y: y, life: life, max: life, owner: owner, f0: (rand() * 5) | 0, big: rand() < 0.6 }); }
  function molotovBreak(x, y, owner) {
    play("glass1", 0.5); play("fireplosion", 0.5); shake = Math.max(shake, 5);
    for (var i = -6; i <= 6; i++) { var px = x + i * 6 + (rand() - 0.5) * 4; if (px < 0 || px > map.width) continue;
      var gy = groundTop(px, y - 10); if (gy - y > 60) continue; // sem chao por perto: nao acende no ar
      addPatch(px, gy, SF.fire.patchLife * (0.7 + rand() * 0.6), owner); }
    for (var k = 0; k < 14; k++) particles.push({ x: x, y: y, vx: (rand() - 0.5) * 5, vy: -rand() * 4, life: 20 + rand() * 20, c: k % 2 ? "#ff9a2a" : "#ffd24a", g: 0.15, r: 3 });
  }
  function updateFires() {
    var F = SF.fire;
    for (var i = fires.length - 1; i >= 0; i--) {
      var f = fires[i], j, k, r, o;
      if (f.kind === "patch") {
        if (--f.life <= 0) { fires.splice(i, 1); continue; }
        for (j = 0; j < players.length; j++) { o = players[j];
          if (!o.dead && Math.abs(o.x - f.x) < 12 && o.y > f.y - 16 && o.y - P.height < f.y) ignite(o, f.owner); }
        props.forEach(function (pr) { if (!pr.dying && Math.abs(pr.x - f.x) < pr.def.w / 2 + 6 && f.y > pr.y - pr.def.h - 4 && f.y < pr.y + 6) hitProp(pr, F.propDamage); });
        if (tick % 6 === 0 && rand() < 0.5) particles.push({ x: f.x + (rand() - 0.5) * 8, y: f.y - 8, vx: (rand() - 0.5) * 0.4, vy: -0.6 - rand() * 0.6, life: 30, c: "#6a6a6a", g: -0.01, r: 3 });
        continue;
      }
      // labareda: anda em 2 passos, para na parede, atravessa jogadores (cada um so e atingido uma vez por labareda)
      var dead = false;
      for (var s = 0; s < 2 && !dead; s++) {
        f.x += f.vx * DT / 2; f.y += f.vy * DT / 2; f.vy -= 0.01; f.dist += Math.hypot(f.vx, f.vy) * DT / 2;
        if (f.dist > f.range || f.x < 0 || f.x > map.width || f.y < 0 || f.y > map.height) { dead = true; break; }
        for (k = 0; k < solids.length; k++) { r = solids[k]; if (r[4] === "cloud") continue;
          if (f.x > r[0] && f.x < r[0] + r[2] && f.y > r[1] && f.y < r[1] + r[3]) { dead = true; if (r.prop) hitProp(r.prop, F.flameProp);
            if (rand() < 0.08) { var gy2 = groundTop(f.x, f.y - 4); if (gy2 - f.y < 40) addPatch(f.x, gy2, 90, f.owner); } break; } }
        if (dead) break;
        for (j = 0; j < players.length; j++) { o = players[j];
          if (o === f.owner || o.dead || f.hit.indexOf(o) >= 0) continue;
          if (f.x > o.x - P.width / 2 - 2 && f.x < o.x + P.width / 2 + 2 && f.y > o.y - P.height && f.y < o.y) { f.hit.push(o); damage(o, f.w.damage, f.owner, false, true); ignite(o, f.owner); } }
      }
      f.age++; if (dead) fires.splice(i, 1);
    }
    players.forEach(function (o) { // quem esta em chamas leva dano periodico e para de queimar com o tempo
      if (!(o.burn > 0) || o.dead) return;
      o.burn--; o.hurt = Math.max(o.hurt, 1);
      if (o.burn % 10 === 0) damage(o, F.burnDamage, o.burnBy || null, false, true, { fire: true });
      if (tick % 5 === 0) particles.push({ x: o.x + (rand() - 0.5) * 8, y: o.y - 10 - rand() * 20, vx: 0, vy: -0.7, life: 24, c: "#555", g: -0.01, r: 3 });
    });
  }
  function drawFires(front) {
    var A = SF.spriteAlias, big = A.fire_big, air = A.fire_effect_flamethrower_air, bf = A.fire_01;
    if (front) gnodes.forEach(function (g) { if (!spr(A.fire_effect_air, 1, g.x, g.y, 1, 0, S)) { ctx.fillStyle = "#f80"; ctx.fillRect(g.x - 2, g.y - 2, 4, 4); } }); // labaredas do galao no ar
    fires.forEach(function (f) {
      if (!front && f.kind === "patch") { var fade = Math.min(1, f.life / 40), fr = 1 + (((tick >> 1) + f.f0) % 5); ctx.globalAlpha = fade;
        if (!spr(f.big ? big : A.fire_02, fr, f.x, f.y, 1, 0, S)) { ctx.fillStyle = "#f80"; ctx.fillRect(f.x - 5, f.y - 8, 10, 8); } ctx.globalAlpha = 1; }
      else if (front && f.kind === "flame") { var t = Math.min(1, f.dist / f.range), sc = S * (1.5 + t * 2.4); // azul -> amarelo -> laranja, como nos quadros do original
        ctx.globalAlpha = Math.min(1, 1.3 - t); ctx.globalCompositeOperation = "lighter";
        var ok2 = t < 0.2 ? spr(air, 1 + Math.floor(t / 0.2 * 4), f.x, f.y, 1, f.f0, sc) : spr(bf, 1 + Math.floor((t - 0.2) / 0.8 * 9.9), f.x, f.y, 1, f.f0, sc);
        if (!ok2) { ctx.fillStyle = "#fa2"; ctx.fillRect(f.x - 3, f.y - 3, 6, 6); } ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; }
    });
    if (front) players.forEach(function (o) { if (!(o.burn > 0) || o.dead) return;
      spr(bf, 1 + ((tick >> 1) % 10), o.x, o.y - 6, 1, 0, S * 1.6); spr(bf, 1 + (((tick >> 1) + 4) % 10), o.x, o.y - 22, 1, 0, S * 1.6); });
  }
  function updateGrenades() {
    var G = SF.grenade;
    for (var i = grenades.length - 1; i >= 0; i--) {
      var g = grenades[i], k, r;
      g.vy += G.gravity * DT * DT; g.rot += g.vx * 0.1;
      // sub-passos (<= 2 px): a granada nao atravessa piso fino nem coluna de escada numa so passada
      var gn = Math.max(1, Math.min(12, Math.ceil(Math.max(Math.abs(g.vx), Math.abs(g.vy)) / 2))), gs;
      for (gs = 0; gs < gn; gs++) {
        var gvx = g.vx / gn, gvy = g.vy / gn;
        g.x += gvx; for (k = 0; k < solids.length; k++) { r = solids[k]; if (thinR(r) || r.lift) continue; if (g.x > r[0] && g.x < r[0] + r[2] && g.y > r[1] && g.y < r[1] + r[3]) { g.x -= gvx; g.vx = -g.vx * G.bounce; g.hit = true; break; } }
        g.y += gvy; for (k = 0; k < solids.length; k++) { r = solids[k]; if (r.lift) continue; var thin = thinR(r);
          if (g.x > r[0] && g.x < r[0] + r[2] && g.y > r[1] && g.y < r[1] + r[3] && (!thin || (gvy > 0 && g.y - gvy <= r[1] + 1))) { g.y -= gvy; g.hit = true; if (Math.abs(g.vy) > 1.5) play("metal", 0.15); g.vy = -g.vy * G.bounce; g.vx *= 0.85; break; } }
      }
      // granada presa dentro de um bloco rigido (nasceu/foi empurrada la): sai pela face mais proxima
      for (k = 0; k < solids.length; k++) { r = solids[k]; if (r.lift || thinR(r)) continue;
        if (g.x > r[0] && g.x < r[0] + r[2] && g.y > r[1] && g.y < r[1] + r[3]) { var dT = g.y - r[1], dB = r[1] + r[3] - g.y, dL = g.x - r[0], dR = r[0] + r[2] - g.x; var mn = Math.min(dT, dB, dL, dR);
          if (mn === dT) { g.y = r[1]; if (g.vy > 0) g.vy = -g.vy * G.bounce; } else if (mn === dB) { g.y = r[1] + r[3]; if (g.vy < 0) g.vy = -g.vy * G.bounce; } else if (mn === dL) { g.x = r[0]; g.vx = -Math.abs(g.vx) * G.bounce; } else { g.x = r[0] + r[2]; g.vx = Math.abs(g.vx) * G.bounce; } } }
      if (g.x < 0 || g.x > map.width) { g.vx *= -G.bounce; g.x = Math.max(0, Math.min(map.width, g.x)); }
      if (g.mol && g.hit) { grenades.splice(i, 1); molotovBreak(g.x, g.y, g.owner); continue; } // molotov quebra no primeiro impacto
      if (--g.t <= 0 || g.y > map.height + 50) { grenades.splice(i, 1); if (g.y <= map.height + 50) (g.mol ? molotovBreak : explode)(g.x, g.y, g.owner); }
    }
  }

  // ---------- navegacao dos bots ----------
  // O grafo e gerado da geometria do mapa ao iniciar (vale p/ mapas convertidos e mods). As arestas de salto e queda
  // sao descobertas simulando a propria fisica do jogador (collide), entao o que o bot "sabe" fazer e o que o jogador faz.
  var nav = { nodes: [] };
  function nodeFree(x, y) { // ha teto/solido sobre o ponto? (largura estreita p/ nao rejeitar rampas)
    for (var i = 0; i < solids.length; i++) { var r = solids[i]; if (thinR(r)) continue;
      if (x - 2 < r[0] + r[2] && x + 2 > r[0] && y - P.height < r[1] + r[3] && y - 3 > r[1]) return false; }
    return true;
  }
  function groundNear(x, y, tol) {
    for (var i = 0; i < solids.length; i++) { var r = solids[i]; if (x >= r[0] && x <= r[0] + r[2] && Math.abs(r[1] - y) <= tol) return true; }
    return false;
  }
  function nodeNear(x, y, mdx, mdy) {
    var best = -1, bs = 1e9, N = nav.nodes;
    for (var i = 0; i < N.length; i++) { var dx = Math.abs(N[i].x - x), dy = Math.abs(N[i].y - y); if (dx > mdx || dy > mdy) continue; var s = dx * dx + dy * dy * 3; if (s < bs) { bs = s; best = i; } }
    return best;
  }
  function nodeAny(x, y) { // no mais proximo sem limite (preferindo o nivel vertical)
    var best = 0, bs = 1e18, N = nav.nodes;
    for (var i = 0; i < N.length; i++) { var dx = N[i].x - x, dy = N[i].y - y, s = dx * dx + dy * dy * 4; if (s < bs) { bs = s; best = i; } }
    return best;
  }
  function addEdge(i, j, t, cost, extra) {
    if (i === j) return; var adj = nav.nodes[i].adj;
    for (var k = 0; k < adj.length; k++) if (adj[k].to === j) { if (adj[k].cost <= cost) return; adj.splice(k, 1); break; }
    var e = { to: j, from: i, t: t, cost: cost }; for (var key in extra) e[key] = extra[key]; adj.push(e);
  }
  function simBody(n, vx, jump, dropTicks) {
    var s = { x: n.x, y: n.y, vx: 0, vy: 0, onGround: true, drop: false, kx: 0 }, air = false;
    for (var t = 0; t < 150; t++) {
      s.drop = t < dropTicks; s.vx = vx; s.vy += P.gravity * DT * DT * GK; if (s.vy > MAXFALL * DT * JK) s.vy = MAXFALL * DT * JK;
      if (t === 0 && jump) s.vy = -P.jumpPower * DT * JK;
      collide(s);
      if (!s.onGround) air = true; else if (air && t > 2) return s;
      if (s.y > map.height + 60) return null;
    }
    return null;
  }
  function buildNav() {
    var N = [], i, j, r;
    nav = { nodes: N };
    function addNode(x, y, extra) {
      for (var k = 0; k < N.length; k++) if (Math.abs(N[k].x - x) < 5 && Math.abs(N[k].y - y) < 3) return k;
      if (map.killY && y - 17 > map.killY) return -1; // dentro do acido: nao navegavel
      var nd = { x: x, y: y, adj: [], cloud: false }; for (var key in extra) nd[key] = extra[key]; N.push(nd); return N.length - 1;
    }
    var step = 22, count = 0;
    solids.forEach(function (r) { count += Math.ceil(r[2] / step); }); if (count > 1800) step = 22 * Math.ceil(count / 1800);
    solids.forEach(function (r) {
      var xs = [];
      if (r[2] < 14) xs.push(r[0] + r[2] / 2); else { for (var x = r[0] + 5; x < r[0] + r[2] - 5; x += step) xs.push(x); xs.push(r[0] + r[2] - 5); }
      xs.forEach(function (x) { if (nodeFree(x, r[1])) { var covered = false;
        for (var k = 0; k < solids.length; k++) { var q = solids[k]; if (q !== r && !thinR(q) && x > q[0] && x < q[0] + q[2] && r[1] - 3 > q[1] && r[1] - 3 < q[1] + q[3]) { covered = true; break; } }
        if (!covered) addNode(x, r[1], { cloud: thinR(r) }); } });
    });
    var base = N.length, hasN = [];
    // caminhar: nos vizinhos no mesmo piso ou degraus
    for (i = 0; i < N.length; i++) hasN[i] = { "-1": false, "1": false };
    for (i = 0; i < N.length; i++) for (j = i + 1; j < N.length; j++) {
      var dx = N[j].x - N[i].x, dy = N[j].y - N[i].y; if (Math.abs(dx) > 26 || Math.abs(dy) > STEP + 0.5) continue;
      if (Math.abs(dx) > 8 && !groundNear((N[i].x + N[j].x) / 2, (N[i].y + N[j].y) / 2, STEP + 1)) continue;
      var c = Math.hypot(dx, dy); addEdge(i, j, "walk", c, {}); addEdge(j, i, "walk", c, {});
      hasN[i][dx > 0 ? "1" : "-1"] = true; hasN[j][dx > 0 ? "-1" : "1"] = true;
    }
    function landEdge(i, s, t, dir, cost, extra) {
      if (!s) return; var j = nodeNear(s.x, s.y, 14, 9); if (j < 0 || j === i) return;
      addEdge(i, j, t, cost + Math.abs(N[j].x - N[i].x) * 0.2, extra);
    }
    for (i = 0; i < base; i++) {
      var n = N[i], d;
      for (d = -1; d <= 1; d += 2) if (!hasN[i][d]) landEdge(i, simBody(n, d * P.runSpeed * DT * RK, false, 0), "drop", d, 6, { dir: d }); // sair do beiral
      for (d = -1; d <= 1; d++) landEdge(i, simBody(n, d * P.runSpeed * DT * RK, true, 0), "jump", d, 45, { dir: d });
      if (n.cloud) for (d = -1; d <= 1; d++) landEdge(i, simBody(n, d * P.runSpeed * DT * RK, false, Math.round(20 / JK)), "drop", d, 8, { dir: d, cloud: true });
    }
    // escadas
    // escadas: so subida (a descida usa quedas/saltos). O retangulo da escada pode comecar acima do chao, entao liga o no de chao
    // sob o pe da escada ao no de chao do patamar de cima (a escada e agarrada com o corpo, nao so com os pes).
    (map.ladders || []).forEach(function (L) {
      var cx = L[0] + L[2] / 2, B = -1, T = -1, bs = 1e9, ts = 1e9, k, q, s;
      for (k = 0; k < base; k++) { q = N[k];
        if (Math.abs(q.x - cx) <= 30 && q.y >= L[1] + L[3] - 14 && q.y <= L[1] + L[3] + 50) { s = Math.abs(q.x - cx) + Math.abs(q.y - (L[1] + L[3])) * 0.3; if (s < bs) { bs = s; B = k; } } }
      if (B < 0) return;
      for (k = 0; k < base; k++) { q = N[k];
        if (Math.abs(q.x - cx) <= 44 && q.y >= L[1] - 12 && q.y <= L[1] + 50 && q.y < N[B].y - 20) { s = q.y * 2 + Math.abs(q.x - cx); if (s < ts) { ts = s; T = k; } } }
      if (T < 0) return;
      addEdge(B, T, "ladder", (N[B].y - N[T].y) * 1.3, { up: true, lx: cx });
    });
    // elevadores: duas estacoes (extremos do curso). Embarcar/desembarcar so quando o elevador esta na estacao (ver navInput)
    (map.lifts || []).forEach(function (l, li) {
      var A = l.amp, top = l.y - l.h / 2, st = l.vert ? [[l.x, top], [l.x, top - A]] : [[l.x, top], [l.x - A, top]], ids = [];
      st.forEach(function (s) { ids.push(addNode(s[0], s[1], { lift: true })); });
      st.forEach(function (s, k) {
        for (var q = 0; q < base; q++) { var g = N[q]; var gap = Math.max(0, Math.abs(g.x - s[0]) - l.w / 2);
          if (Math.abs(g.y - s[1]) <= 20 && gap <= 48) { addEdge(q, ids[k], "lift_on", 55 + gap, { li: li, k: k }); addEdge(ids[k], q, "lift_off", 6 + gap * 0.5, { li: li, k: k }); } }
      });
      addEdge(ids[0], ids[1], "lift_ride", 70, { li: li }); addEdge(ids[1], ids[0], "lift_ride", 70, { li: li });
    });
    // portais
    (map.portals || []).forEach(function (pt) {
      var a = pt[0], b = pt[1], f = nodeNear(a[0] + a[2] / 2, a[1] + a[3], 40, 30), t = nodeNear(b[0] + b[2] / 2, b[1] + b[3], 40, 30);
      if (f >= 0 && t >= 0) addEdge(f, t, "portal", 8, { px: a[0] + a[2] / 2 });
    });
  }
  // Mapas com elevadores (ainda nao suportados) tem ilhas que o grafo nao conecta: so nascem jogadores/armas na maior regiao conectada.
  var spawnList = [], weaponPoints = [];
  function reachSet(s) { var N = nav.nodes, seen = {}, q = [s]; seen[s] = true; while (q.length) { var u = q.pop(); N[u].adj.forEach(function (e) { if (!seen[e.to]) { seen[e.to] = true; q.push(e.to); } }); } return seen; }
  function computeSpawns() {
    var sp = map.spawns, idx = sp.map(function (s) { return nodeAny(s[0], groundTop(s[0], s[1] - 10)); }), sets = {};
    idx.forEach(function (n) { if (!sets[n]) sets[n] = reachSet(n); });
    var bestI = 0, bestC = -1, list = [];
    idx.forEach(function (a, i) { var c = 0; idx.forEach(function (b) { if (sets[a][b] && sets[b][a]) c++; }); if (c > bestC) { bestC = c; bestI = i; } });
    var base = idx[bestI]; idx.forEach(function (b, j) { if (sets[base][b] && sets[b][base]) list.push(sp[j]); });
    spawnList = list.length >= 2 ? list : sp;
    // pontos de ARMAS/ITENS: os do original (data/item_spawns.js, exatos: todos os WeaponSpawnData de Maps.as, sem filtro).
    // Mapas sem essa lista (os de mods) usam map.spawnPoints, como antes.
    if (SF.itemSpawns && SF.itemSpawns[cfg.map]) weaponPoints = SF.itemSpawns[cfg.map];
    else { weaponPoints = (map.spawnPoints || []).filter(function (w) { var n = nodeAny(w[0], groundTop(w[0], w[1] - 6)); return sets[base][n]; });
      if (!weaponPoints.length) weaponPoints = map.spawnPoints || []; }
  }
  // Escolhe onde (re)nascer: original nao tem protecao de spawn em DM/TDM (Revive() nao da imunidade), entao nascer colado num
  // inimigo e ficar sendo morto de novo e so azar ali; aqui evitamos isso escolhendo, entre os pontos de spawn, um dos mais longe
  // de qualquer inimigo vivo (com um pouco de sorteio entre os melhores, pra nao ficar 100% previsivel).
  function pickSafeSpawn(p) {
    if (spawnList.length <= 1) return spawnList[0] || map.spawns[0];
    var foes = players.filter(function (o) { return o !== p && !o.dead && !o.gone && (!p.team || o.team !== p.team); });
    if (!foes.length) return spawnList[(rand() * spawnList.length) | 0];
    var scored = spawnList.map(function (s) {
      var d = Infinity; foes.forEach(function (o) { d = Math.min(d, Math.hypot(o.x - s[0], o.y - s[1])); }); return { s: s, d: d };
    }).sort(function (a, b) { return b.d - a.d; });
    var topN = Math.max(1, Math.ceil(scored.length * 0.4));
    return scored[(rand() * topN) | 0].s;
  }
  function findPath(si, gi) { // Dijkstra com fila binaria
    var N = nav.nodes, n = N.length, dist = new Array(n), prev = new Array(n), heap = [[0, si]], i;
    for (i = 0; i < n; i++) dist[i] = 1e18; dist[si] = 0;
    function push(v) { heap.push(v); var k = heap.length - 1; while (k > 0) { var pr = (k - 1) >> 1; if (heap[pr][0] <= heap[k][0]) break; var t = heap[pr]; heap[pr] = heap[k]; heap[k] = t; k = pr; } }
    function pop() { var top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; var k = 0; for (;;) { var l = 2 * k + 1, r = l + 1, m = k;
      if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; var t = heap[m]; heap[m] = heap[k]; heap[k] = t; k = m; } } return top; }
    while (heap.length) {
      var cur = pop(), u = cur[1]; if (cur[0] > dist[u]) continue; if (u === gi) break;
      var adj = N[u].adj; for (i = 0; i < adj.length; i++) { var e = adj[i], nd = dist[u] + e.cost; if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = e; push([nd, e.to]); } }
    }
    if (dist[gi] >= 1e18) return null;
    var path = []; for (var v = gi; v !== si; v = prev[v].from) path.unshift(prev[v]); return path;
  }
  var navStats = {};
  function navStat(t, ok) { var s = navStats[t] || (navStats[t] = { ok: 0, fail: 0 }); if (ok) s.ok++; else s.fail++; }
  // segue o caminho ate (tx, ty); preenche inp. Retorna false se nao ha rota.
  function navInput(p, tx, ty, inp) {
    var a = p.ai, N = nav.nodes; if (!N.length) return false;
    a.nr = (a.nr || 0) - 1;
    if (!a.path || ((a.nr <= 0 || Math.hypot(tx - a.gx, ty - a.gy) > 50) && p.onGround && !p.climb)) { // nao replaneja no ar nem na escada
      var si = nodeAny(p.x, p.y), gi = nodeAny(tx, ty); a.gx = tx; a.gy = ty; a.nr = 40; a.pi = 0; a.go = false;
      a.path = si === gi ? [] : findPath(si, gi);
    }
    if (!a.path) return false;
    function mv(x) { if (x > p.x + 3) inp.right = true; else if (x < p.x - 3) inp.left = true; }
    var e = a.path[a.pi];
    while (e && Math.abs(p.x - N[e.to].x) < 9 && Math.abs(p.y - N[e.to].y) < 14 && p.onGround) { navStat(e.t, 1); a.pi++; a.go = false; e = a.path[a.pi]; }
    if (!e) { mv(tx); return true; }
    var F = N[e.from], T = N[e.to];
    if (p.onGround && !p.climb && e.t.indexOf("lift") !== 0 && Math.hypot(p.x - F.x, p.y - F.y) > 45 && Math.hypot(p.x - T.x, p.y - T.y) > 45) { navStat(e.t, 0); a.nr = 0; } // saiu da rota
    if (e.t === "walk") mv(T.x);
    else if (e.t === "jump") {
      if (p.onGround) { if (!a.go && Math.abs(p.x - F.x) > 4) mv(F.x); else { a.go = true; inp.jump = true; if (e.dir > 0) inp.right = true; else if (e.dir < 0) inp.left = true; } }
      else if (e.dir > 0) inp.right = true; else if (e.dir < 0) inp.left = true;
    } else if (e.t === "drop") {
      if (p.onGround) { if (!a.go && Math.abs(p.x - F.x) > 4) mv(F.x); else { a.go = true; if (e.cloud) inp.drop = true; if (e.dir > 0) inp.right = true; else if (e.dir < 0) inp.left = true; } }
      else if (e.dir > 0) inp.right = true; else if (e.dir < 0) inp.left = true;
    } else if (e.t === "ladder") {
      if (p.y <= T.y + 5) { mv(T.x); if (Math.abs(p.x - T.x) <= 3) inp.right = inp.left = false; } // chegou no topo: sai para o patamar
      else if (!p.climb && Math.abs(p.x - e.lx) > 3) mv(e.lx);
      else inp.jump = true;
    } else if (e.t === "lift_on" || e.t === "lift_ride" || e.t === "lift_off") {
      var LO = liftObjs[e.li], atK = function (node) { return LO && Math.abs(LO.rect[1] - node.y) < 6 && Math.abs(LO.cx - node.x) < 8; };
      if (!LO) a.nr = 0;
      else if (e.t === "lift_on") { if (atK(T)) { mv(LO.cx); if (p.onGround && T.y < p.y - 3) inp.jump = true; } else mv(F.x); }                       // espera no beiral; sobe quando o elevador chega
      else if (e.t === "lift_ride") { mv(LO.cx); a.rt = (a.rt || 0) + 1; if (a.rt > 900) { a.nr = 0; a.rt = 0; } }  // fica no centro ate o outro extremo
      else { if (atK(F)) { mv(T.x); if (p.onGround && T.y < p.y - 3) inp.jump = true; } else mv(LO.cx); }                  // desce quando chega
    } else if (e.t === "portal") mv(e.px);
    // travado numa parede/caixa: pula
    if ((inp.left || inp.right) && p.onGround && Math.abs(p.x - (a.lx || 0)) < 0.4) { a.st = (a.st || 0) + 1; if (a.st > 25) inp.jump = true; if (a.st > 110) { a.nr = 0; a.st = 0; } } else a.st = 0;
    a.lx = p.x; return true;
  }

  // ---------- IA ----------
  function botInput(p) {
    var a = p.ai, best = null, bd = 1e9;
    players.forEach(function (o) { if (o !== p && !o.dead && !(o.team && o.team === p.team)) { var d = Math.hypot(o.x - p.x, o.y - p.y); if (d < bd) { bd = d; best = o; } } });
    var inp = { left: false, right: false, jump: false, drop: false, shoot: false, melee: false, aim: p.aim };
    if (!best) return inp;
    // arma de fogo com municao -> atira; sem ela (ou colado no alvo) -> corpo a corpo com o slot melee
    var gun = p.weapon && p.ammo > 0 ? SF.weapons[p.weapon] : null, mw = SF.weapons[p.melee] || SF.weapons.fists;
    var mReach = (mw.range[0] + 4) * 1.6, dx = best.x - p.x, dy = (best.y - 18) - (p.y - 22);
    var close = Math.abs(dx) < mReach + 30 && Math.abs(best.y - p.y) < 20;
    var useMelee = !gun || (close && (p.melee !== "fists" || rand() < 0.5 || a.meleeMode)); a.meleeMode = useMelee && close;
    var w = useMelee ? { melee: true, range: mReach } : gun;
    var clear = !rayHitsWall(p.x, p.y - 22, best.x, best.y - 18), reach = w.melee ? w.range + 20 : w.range * 0.9;
    var fighting = clear && bd < reach && Math.abs(best.y - p.y) < 70;
    // objetivo de navegacao: cura se ferido, arma se precisa, senao o inimigo
    var goal = null;
    if (p.health < 45) { var mk = nearestPickupKind(p, "medkit", 700); if (mk) goal = mk; }
    if (!goal && !gun && !fighting) goal = nearestPickup(p, 700);
    if (!goal && p.gren === 0 && !fighting && rand() < 0.002) goal = nearestPickupKind(p, "grenades", 400);
    a.jumpCd--;
    var ce = a.path && a.path[a.pi], midEdge = p.climb || !p.onGround || a.go || (ce && ce.t.indexOf("lift") === 0 && p.standOn && p.standOn.lift); // escalando/saltando/caindo: termina a manobra antes de lutar a pe
    if (fighting && !goal && !midEdge) { // luta no mesmo piso: mantem distancia ideal e se esquiva
      var idealRange = w.melee ? mReach * 0.7 : Math.min(w.range * 0.6, 220);
      if (Math.abs(dx) > idealRange) { if (dx > 0) inp.right = true; else inp.left = true; }
      else if (Math.abs(dx) < idealRange * 0.4 && !w.melee) { if (dx > 0) inp.left = true; else inp.right = true; }
      if (p.onGround && a.jumpCd <= 0 && (p.vx === 0 && (inp.left || inp.right) || rand() < 0.01)) { inp.jump = true; a.jumpCd = 40; }
    } else {
      var tgt = goal ? { x: goal.x, y: goal.y + 4 } : { x: best.x, y: best.y };
      if (!navInput(p, tgt.x, tgt.y, inp)) { if (tgt.x > p.x + 4) inp.right = true; else if (tgt.x < p.x - 4) inp.left = true; if (p.onGround && a.jumpCd <= 0 && tgt.y < p.y - 40) { inp.jump = true; a.jumpCd = 40; } }
    }
    a.aimErr += (rand() - 0.5) * 0.02 * [2.4, 1, 0.35][p.skill]; a.aimErr *= 0.98;
    inp.aim = Math.atan2(dy, dx) + a.aimErr;
    if (w.melee) { // aperta o golpe quando o alvo esta no alcance e continua o combo (borda: alterna o botao)
      var inReach = Math.abs(dx) <= mReach && Math.abs(best.y - p.y) < 18 && !best.fall && !(best.kd > 0);
      if (p.atk) inp.melee = (tick & 1) === 0 && rand() < [0.35, 0.7, 0.95][p.skill];
      else if (inReach && clear) { inp.melee = (tick & 1) === 0 && rand() < [0.25, 0.5, 0.8][p.skill]; if (dx > 0) inp.right = true; else inp.left = true; }
    } else if (clear && bd < w.range && rand() < [0.3, 0.6, 0.9][p.skill]) inp.shoot = true;
    if (p.gren > 0 && clear && bd > 120 && bd < 300 && rand() < 0.008) { inp.grenade = true; inp.aim = Math.atan2(dy - bd * 0.25, dx); }
    return inp;
  }
  function nearestPickup(p, maxd) { var best = null, bd = maxd; pickups.forEach(function (k) { if (k.respawn > 0 || SF.items[k.type]) return; var d = Math.hypot(k.x - p.x, k.y - p.y); if (d < bd) { bd = d; best = k; } }); return best; }
  function nearestPickupKind(p, kind, maxd) { var best = null, bd = maxd; pickups.forEach(function (k) { if (k.respawn > 0 || k.type !== kind) return; var d = Math.hypot(k.x - p.x, k.y - p.y); if (d < bd) { bd = d; best = k; } }); return best; }

  // ---------- sobrevivencia: ondas de bots, sem respawn ----------
  function updateSurvival() {
    var alive = players.filter(function (p) { return !p.human && !p.dead; }).length;
    if (alive === 0 && surv.timer > 0 && --surv.timer === 0) {
      surv.wave++;
      players = players.filter(function (p) { return p.human || !p.dead; });
      var n = Math.min(7, 2 + surv.wave), skill = surv.wave >= 6 ? 2 : surv.wave >= 3 ? 1 : 0;
      for (var i = 0; i < n; i++) {
        var b = addBot(100 + surv.wave * 10 + i, CHARS[(rand() * CHARS.length) | 0], 0, skill), s = pickSafeSpawn(b);
        b.x = s[0]; b.y = groundTopBase(s[0], s[1] - 10); b.char = b.char === players[0].char ? "boris" : b.char; b.name = b.name + " " + (i + 1);
      }
      say("Onda " + surv.wave + "!"); surv.timer = -1;
    } else if (alive > 0) surv.timer = -1;
    else if (alive === 0 && surv.timer < 0) surv.timer = 150;
  }

  // ---------- camera adaptativa (Cam.as + PlayersKeeper.GetCamArea) ----------
  // Enquadra todos os jogadores vivos (x +-15, y -30..0 em px do nivel), ajusta p/ 4:3, soma 160x120 de folga, limita ao mapa e
  // usa zoom = altura da tela / altura da area. Recalcula todo tick e se aproxima em 8 quadros originais (1/8 do que falta por quadro).
  var cam = { cx: 0, cy: 0, s: 1, vx: 0, vy: 0 };
  function camTarget() {
    var U = 1.6, list = players.filter(function (p) { return !p.dead; }); if (!list.length) list = camLast || players; camLast = list;
    var x1 = 1e9, x2 = -1e9, y1 = 1e9, y2 = -1e9;
    list.forEach(function (p) { x1 = Math.min(x1, p.x - 15 * U); x2 = Math.max(x2, p.x + 15 * U); y1 = Math.min(y1, p.y - 30 * U); y2 = Math.max(y2, p.y); });
    var w = x2 - x1, h = y2 - y1, wa = w / 4, ha = h / 3, d;
    if (wa < ha) { d = (ha - wa) * 4; x1 -= d / 2; w += d; } else if (wa > ha) { d = (wa - ha) * 3; y1 -= d / 2; h += d; }
    x1 -= 80 * U; y1 -= 60 * U; w += 160 * U; h += 120 * U;
    if (map.showAll) { x1 = 0; y1 = 0; w = map.width; h = map.height; }
    w = Math.min(w, map.width); h = Math.min(h, map.height);
    x1 = Math.max(0, Math.min(x1, map.width - w)); y1 = Math.max(0, Math.min(y1, map.height - h));
    return { cx: x1 + w / 2, cy: y1 + h / 2, s: canvas.height / h };
  }
  var camLast = null;
  function placeCam() { // topo-esquerdo da vista, sem sair do mapa (se o mapa for menor que a vista, centraliza)
    var vw = canvas.width / cam.s, vh = canvas.height / cam.s;
    cam.vx = map.width > vw ? Math.max(0, Math.min(cam.cx - vw / 2, map.width - vw)) : (map.width - vw) / 2;
    cam.vy = map.height > vh ? Math.max(0, Math.min(cam.cy - vh / 2, map.height - vh)) : (map.height - vh) / 2;
  }
  function updateCam(snap) {
    var t = camTarget(), k = snap ? 1 : 1 - Math.pow(7 / 8, DT);
    cam.cx += (t.cx - cam.cx) * k; cam.cy += (t.cy - cam.cy) * k; cam.s += (t.s - cam.s) * k; placeCam();
  }

  // ---------- teclas virtuais, postura de mira, chute, rolamento, arremesso e pegar arma ----------
  // le o teclado/mouse real deste PC para o slot do jogador (uso normal e, no COOP ONLINE, so pro jogador local - ver virtualKeys)
  function readLocalKeys(p) {
    var sl = p.slot || 1, k = { left: held(sl, "left"), right: held(sl, "right"), up: held(sl, "up"), down: held(sl, "down"), melee: held(sl, "melee"), fire: held(sl, "fire"), throw: held(sl, "throw"), pow: held(sl, "powerup") };
    if (sl === 1 && cfg.mouse) { // opcional (SET UP): mouse mira, botao esquerdo = Fire, direito = Throw
      k.fire = k.fire || mouse.down; k.throw = k.throw || mouse.right;
      k.mouseAim = Math.atan2(cam.vy + mouse.y / cam.s - (p.y - 22), cam.vx + mouse.x / cam.s - p.x);
    }
    return k;
  }
  var EMPTY_KEYS = { left: false, right: false, up: false, down: false, melee: false, fire: false, throw: false, pow: false };
  function virtualKeys(p) {
    if (p.human) {
      // COOP ONLINE (lockstep): nunca le o teclado "ao vivo" aqui dentro do update() - cada tick usa o input que foi
      // CAPTURADO e trocado com o outro PC antes (ver netCapture()/frame()); sem isso os dois lados simulariam com
      // teclas de instantes diferentes e o jogo desincronizaria (cada PC veria um resultado diferente da luta).
      if (netActive) return (p.net === "remote" ? netRemoteIn[tick] : p.net === "local" ? netLocalIn[tick] : null) || EMPTY_KEYS;
      return readLocalKeys(p);
    }
    var b = botInput(p); p.binp = b; return { left: b.left, right: b.right, up: !!b.jump, down: false, melee: !!b.melee, fire: false, throw: false, bot: true, drop: !!b.drop };
  }
  // bot: Fire = segura para desenhar, solta quando alinhado; sem alvo por um tempo, guarda a arma
  function botKeys(p, k) {
    var b = p.binp, a = p.ai, M = SF.melee;
    if (p.aiming === 1) {
      var ready = p.drawT <= 0 && p.turnT <= 0 && !p.seq && !(p.cd > 0);
      k.fire = !(b.shoot && ready); a.idleAim = b.shoot ? 0 : (a.idleAim || 0) + 1;
      if (a.idleAim > 30 && !p.seq) holster(p);
    } else if (p.aiming === 2) { a.hold = (a.hold || 0) + 1; k.throw = a.hold < 7; }
    else { a.hold = 0; a.idleAim = 0; k.fire = !!(b.shoot && p.weapon && p.ammo > 0 && !(p.cd > 0)); k.throw = !!b.grenade; }
    if (p.pow && b.shoot && rand() < 0.01) usePowerup(p);
    if (p.aiming) { // vira para o alvo e ajusta o pitch direto
      var want = Math.cos(b.aim) >= 0 ? 1 : -1, tgt = Math.atan2(Math.sin(b.aim), Math.abs(Math.cos(b.aim))) * 180 / Math.PI;
      p.pitch += Math.max(-25, Math.min(25, tgt - p.pitch));
      k.left = want < 0; k.right = want > 0;
    }
  }
  function startAim(p, mode) {
    var M = SF.melee, w = p.weapon && SF.weapons[p.weapon];
    p.aiming = mode; p.pitch = 0; p.pitchSpd = 0; p.seq = null; p.backT = 0; p.pendFire = false; p.kneel = false;
    if (mode === 1) { p.drawT = M.drawFrames; p.turnT = 0; play((w && w.aimSnd) || "aim_small", 0.4); }
    else { p.drawT = 0; p.turnT = 0; p.fuse = SF.grenade.fuse / DT; play("gsafe", 0.5); }
  }
  function holster(p) { // AbortAiming: guarda a arma; sem municao ela e descartada
    p.aiming = 0; p.seq = null; p.drawT = 0; p.turnT = 0; p.pendFire = false; p.backT = 0;
    if (p.weapon && p.ammo <= 0) p.weapon = null;
  }
  function updateAim(p, k, fireRel, meleeEdge, throwRel) {
    var M = SF.melee, w = p.weapon && SF.weapons[p.weapon];
    if (p.aiming === 1 && !w) { holster(p); return; }
    if (meleeEdge) { holster(p); return; } // Melee com a arma sacada: guarda
    if (k.mouseAim != null && !k.bot) {
      var want = Math.cos(k.mouseAim) >= 0 ? 1 : -1; if (want !== p.face) { p.face = want; p.turnT = M.turnFrames; }
      p.pitch = Math.atan2(Math.sin(k.mouseAim), Math.abs(Math.cos(k.mouseAim))) * 180 / Math.PI;
    } else {
      var dir = k.right && !k.left ? 1 : k.left && !k.right ? -1 : 0;
      if (dir && dir !== p.face && !(p.turnT > 0)) { p.face = dir; p.turnT = M.turnFrames; } // virar com a arma leva um instante
      if (!k.bot) { var d = (k.down ? 1 : 0) - (k.up ? 1 : 0); // AimUp / AimDown: comeca em 0.5 graus/frame e acelera
        if (d) { if (!p.pitchSpd) p.pitchSpd = M.pitchStart; p.pitch += d * p.pitchSpd * DT; p.pitchSpd += M.pitchAccel * DT; } else p.pitchSpd = 0; }
    }
    p.pitch = Math.max(-M.pitchMax, Math.min(M.pitchMax, p.pitch));
    if (p.drawT > 0) p.drawT -= DT;
    if (p.turnT > 0) p.turnT -= DT;
    var ready = p.drawT <= 0 && !(p.turnT > 0);
    if (p.aiming === 1) {
      if (fireRel) p.pendFire = true; // soltar antes da arma ficar pronta nao perde o tiro (FastTrigger)
      if (p.seq) updateSeq(p, w);
      else if (p.pendFire && ready && !(p.cd > 0)) { p.pendFire = false; p.seq = { left: w.burst || 1, t: 0 }; updateSeq(p, w); }
      else if (!p.pendFire && !k.fire && p.backT > 0) { p.backT -= DT; if (p.backT <= 0) holster(p); }
    } else { // granada: segurar arma o pavio (estoura na mao), soltar joga
      if (--p.fuse <= 0) { p.aiming = 0; p.gren--; explode(p.x, p.y - 17, p); return; }
      if (throwRel) {
        var ang = (p.face > 0 ? p.pitch : 180 - p.pitch) * Math.PI / 180; p.aiming = 0;
        throwGrenade(p, ang, p.fuse); startAct(p, "throw", p.face);
      }
    }
  }
  function updateSeq(p, w) { // WeaponSequencePart: rajada de 'burst' tiros separados por 'gap' frames, depois recarga e bombeada
    var s = p.seq; s.t -= DT;
    if (s.t > 0) return;
    if (s.left > 0) { if (shootOne(p)) { s.left--; s.t = w.gap || 2; } else s.left = 0; }
    if (s.left <= 0 && s.t <= 0) { p.cd = (w.cooldown || 0) + (w.lock || 0); p.seq = null; p.backT = SF.melee.backIdle; }
  }
  function startAct(p, type, dir) {
    p.act = { type: type, f: 0, dir: dir || p.face, hit: false }; p.face = p.act.dir; p.aiming = 0;
    if (type === "roll") { play("roll", 0.35); p.rollCd = SF.melee.rollCooldown + SF.melee.rollFrames; }
    else if (type === "dive") { play("dive", 0.4); p.rollCd = SF.melee.rollCooldown + SF.melee.diveFrames; p.energy = Math.max(0, p.energy - SF.melee.diveEnergy); }
  }
  function updateAct(p) {
    var a = p.act, M = SF.melee, dive = a.type === "dive", n = a.type === "roll" ? M.rollFrames : dive ? M.diveFrames : a.type === "kick" ? M.kickFrames : 2;
    a.f += DT;
    if (a.type === "roll") p.kx = M.rollSpeed * 1.6 * DT * RK * a.dir; // rola 2 px/frame para a frente
    else if (dive) {
      p.kx = M.diveSpeed * 1.6 * DT * RK * a.dir; // Dive() do original: mergulho rapido ao correr+agachar
      // CheckDivePlayerImpact do original: quem acerta de frente durante o mergulho e agarrado e arrastado junto (ver
      // o.grabbed no loop principal) ate o mergulho acabar - so entao cai derrubado (knock), nao na hora do toque.
      if (!a.hit) players.forEach(function (o) {
        if (a.hit || o === p || o.dead || o.fall || o.imm > 0 || o.grabbed || (o.team && o.team === p.team)) return;
        var dx = o.x - p.x, dy = p.y - o.y;
        if (Math.abs(dx) < 14 && dx * a.dir > 0 && dy > -22 && dy < 22) { a.hit = true; o.grabbed = p; o.grabbedDir = a.dir; o.lock = -a.dir; o.atk = null; o.act = null; o.aiming = 0; play("dive", 0.5); shake = Math.max(shake, 3); }
      });
    }
    if (a.f > n) { if (a.type === "roll" || dive) p.kx = 0; p.act = null;
      // Player.as (BotPositionInSight/landing): mergulho que termina no chao emenda Roll() na mesma direcao
      if (dive && p.onGround && !p.dead && !p.fall) startAct(p, "roll", a.dir);
    }
  }
  function tryKick(p) { // Kick() do original: derrubados e objetos a ate 16 px na frente (em pe, o golpe normal e soco)
    var M = SF.melee, dir = p.face, rng = M.kickRange * 1.6, hit = false;
    players.forEach(function (o) {
      if (o === p || (o.team && o.team === p.team) || o.gone) return;
      var down = o.kd > 0 || (o.dead && !o.fall);
      var dx = o.x - p.x, dy = p.y - o.y;
      if (!down || Math.abs(dx) > rng || dx * dir < -4 || dy > 14 * 1.6 || dy < -14 * 1.6) return;
      hit = true; o.lock = -dir;
      if (!o.dead) damage(o, M.kickDamage, p, false, true, { dir: dir });
      knock(o, dir * M.kickVx, M.kickVy, -dir); // BeingKicked: e arremessado de novo
      particles.push({ x: o.x, y: o.y - 8, vx: dir * 2 * DT, vy: -1 * DT, life: 8 / DT, c: "#fff6c0", g: 0, r: 3 });
    });
    if (hangKick(p, dir, rng)) hit = true; // caixa pendurada: balanca
    // objetos leves (barris, mesas - SF.props.push): chute so empurra (fisica), nao gasta vida deles; os outros (caixa, lata) continuam so levando dano
    props.forEach(function (pr) { if (pr.dying || pr.def.slide) return; /* caixa pequena: o soco (doMeleeKey -> meleeStrike) que empurra e quebra */ var dx = pr.x - p.x; if (dx * dir > -4 && Math.abs(dx) < rng + pr.def.w / 2 + 2 && p.y > pr.y - pr.def.h - 4 && p.y - P.height < pr.y) {
      if (pr.def.push) { pr.vx = dir * M.kickVx * 2.2; if (pr.def.fly) { pr.by = p; pr.t0 = tick; pr.vy = -2.5; pr.air = true; pr.hit = []; } } else hitProp(pr, M.kickDamage, false, true); hit = true; } });
    if (hit) { play("kick", 0.45); shake = Math.max(shake, 2); startAct(p, "kick", dir); }
    return hit;
  }
  function doMeleeKey(p, k, move) { // Melee(): Baixo+Melee pega arma; inimigo na frente = soco; senao chute; senao soco no ar
    if (k.down && grabWeapon(p)) return;
    var dir = move || p.face;
    startMelee(p, dir);
    if (!players.some(function (o) { return canPunch(p, o); })) { p.atk = null; if (tryKick(p)) return; startMelee(p, dir); }
    updateMelee(p, false, 0);
  }
  // larga a arma de fogo/corpo a corpo atual no chao (slot vazio, pronto pra pegar outra) - UpdateWeaponGrab do original:
  // o slot so e tomado automaticamente se estiver vazio; pra trocar com o slot ocupado precisa ser uma troca explicita
  // (Baixo+Melee), que aqui larga a antiga no mesmo lugar em vez de so sumir com ela.
  // respawn:10 (~0.17s) de carencia antes de poder ser pego de novo - sem isso, largar debaixo dos proprios pes fazia
  // pegar de volta na hora (auto-pickup do mesmo tick), inclusive "enchendo" uma arma vazia (ver Math.max do pickup antigo)
  // arma com balas: vira pickup que CAI com gravidade ate o chao (fall). Arma SEM balas: vira OBJETO de chao (prop
  // "wpn_<tipo>"): nao e pickup, nao da pra pegar de novo por engano; so pode ser empurrada/chutada.
  function dropWeapon(p) {
    if (!p.weapon) return;
    dropGunAt(p.weapon, p.x, p.y - 10, p.ammo, p.face, 10);
    p.weapon = null; p.ammo = 0;
  }
  // QUALQUER arma de fogo que sai da mao (morte, desarme, troca, esvaziar): com balas = pickup que cai; SEM balas = objeto de chao
  // (nunca vira pickup, entao nao da pra pegar de novo por engano).
  function dropGunAt(type, x, y, ammo, face, respawn) {
    if (!(ammo > 0)) { addWeaponProp(type, x, y, face); return; }
    pickups.push({ x: x, y: y, type: type, respawn: respawn || 0, base: null, ammo: ammo, fall: true, vy: 0 });
  }
  function dropMelee(p) { if (p.melee === "fists") return; pickups.push({ x: p.x, y: p.y - 10, type: p.melee, respawn: 10, base: null, fall: true, vy: 0 }); p.melee = "fists"; }
  function addWeaponProp(type, x, y, face) {
    // ORIGINAL (Player.as CheckAimDrop -> AddPolygon("wpn_"+tipo)): corpo fisico que so colide com o MUNDO (filtro mask 1),
    // nao com o personagem e nao e chutavel (Kickable=false); mostra o frame EMPTY do sprite (frame 2) sem indicador de municao.
    var key = "wpn_" + type, def = SF.props[key] || (SF.props[key] = { sprite: key, w: 30, h: 8, hp: 1e9, push: false, indestructible: true, emptyFrame: true, debris: [] });
    var pr = { type: key, def: def, x: x, y: y, hp: def.hp, rect: [x - def.w / 2, y - def.h, def.w, def.h], dying: false, vx: (face || 1) * 1.2, vy: 0, air: true, hit: [], t0: tick };
    pr.rect.prop = pr; pr.rect[4] = "solid"; pr.rect.noPlayer = true; solids.push(pr.rect); props.push(pr);
  }
  // pega um item/arma: automatico (qualquer jogador) se o slot estiver vazio/sem municao, igual ao original
  // (UpdateWeaponGrab); Baixo+Melee forca a troca mesmo com o slot ocupado, largando a arma atual no lugar (GrabWeapon).
  function tryPickup(p, it, auto) {
    var item = SF.items[it.type], kw = SF.weapons[it.type];
    if (item) {
      if (item.slowmo) { if (p.pow) return false; p.pow = item.slowmo; play("pickup", 0.4); it.respawn = it.base ? 900 : -1; return true; }
      // vida: ao pisar so pega se estiver machucado; com a barra cheia so leva se pegar de proposito (Baixo+Melee),
      // pra negar o item ao inimigo (gasta sem curar)
      if (item.heal) { if (p.health >= P.health && auto) return false; p.health = Math.min(P.health, p.health + item.heal); play("health", 0.5); it.respawn = it.base ? 1200 : -1; return true; }
      var gt = item.molotov ? "molotov" : "grenade";
      if (item.amount && (p.gren < item.max || (p.gtype || "grenade") !== gt)) { p.gren = item.max; p.gtype = gt; play("gsafe", 0.5); it.respawn = it.base ? 900 : -1; return true; }
      return false;
    }
    if (!kw) return false;
    if (auto && !kw.melee && it.ammo === 0) return false; // nao pega sozinho uma arma de fogo vazia (inutil; so com troca explicita)
    var slotFree = kw.melee ? p.melee === "fists" : (!p.weapon || p.ammo === 0 || p.weapon === "pistol" && it.type !== "pistol");
    if (auto && !slotFree) return false; // slot ocupado: so pega com troca explicita (auto=false)
    if (!auto && !slotFree) { if (kw.melee) dropMelee(p); else dropWeapon(p); } // troca: larga a atual no mesmo lugar antes de pegar a nova
    giveWeapon(p, it.type); if (!kw.melee && it.ammo != null) p.ammo = Math.max(it.ammo, 0);
    play("pickup", 0.4); it.respawn = it.base ? 900 : -1; return true;
  }
  function grabWeapon(p) {
    var best = null, bd = 1e9, rng = SF.melee.grabRange * 1.6;
    pickups.forEach(function (it) { if (it.respawn > 0) return; var dx = Math.abs(it.x - p.x), dy = Math.abs(it.y - p.y); if (dx < rng && dy < 24 && dx < bd) { bd = dx; best = it; } });
    return best ? tryPickup(p, best, false) : false;
  }
  // ---------- particulas e destrocos: gibs, pedacos de caixa/barril, capsulas e sangue batem no cenario (no original sao corpos Box2D) ----------
  function solidAt(x, y, prevY) {
    for (var k = 0; k < solids.length; k++) { var r = solids[k]; if (r.lift) continue; // destrocos/gibs atravessam elevador
      if (x > r[0] && x < r[0] + r[2] && y > r[1] && y < r[1] + r[3]) { if (thinR(r) && !(prevY != null && prevY <= r[1] + 0.5)) continue; return r; } }
    return null;
  }
  function updateParticles() {
    for (var i = particles.length - 1; i >= 0; i--) {
      var q = particles[i];
      if (--q.life <= 0) { particles.splice(i, 1); continue; }
      if (q.anim) { q.age += DT; q.x += q.vx; q.y += q.vy; continue; }
      if (q.stuck) continue;
      if (!q.phys) { q.x += q.vx; q.y += q.vy; q.vy += q.g; if (q.spr) q.rot += q.vr || 0; continue; }
      q.vy += q.g; if (q.vy > 9) q.vy = 9;
      var px = q.x, py = q.y; q.x += q.vx;
      if (solidAt(q.x, q.y, null)) { q.x = px; if (q.stick) { q.stuck = true; continue; } q.vx *= -(q.bounce || 0.35); q.vr = (q.vr || 0) * 0.6; }
      q.y += q.vy;
      var hit = solidAt(q.x, q.y, py);
      if (hit) {
        if (q.stick) { q.y = q.vy > 0 ? hit[1] - 0.5 : py; q.stuck = true; continue; }
        q.y = q.vy > 0 ? hit[1] - 0.5 : py;
        if (q.snd && Math.abs(q.vy) > 0.8 && rand() < 0.6) play(q.snd === "shellbounce" ? (rand() < 0.5 ? "shell0" : "shell1") : q.snd, 0.15);
        q.vy = Math.abs(q.vy) < 0.6 ? 0 : -q.vy * (q.bounce || 0.35); q.vx *= 0.7; q.vr = (q.vr || 0) * 0.6;
        if (Math.abs(q.vx) < 0.03) q.vx = 0;
      }
      if (q.spr) q.rot += q.vr || 0;
      if (q.y > map.height + 50) particles.splice(i, 1);
    }
    if (particles.length > 600) particles.splice(0, particles.length - 600);
  }
  // ---------- powerups e slowmotion (Slowmo.as): fator 0.2; o tempo do jogo desacelera, o relogio do slowmo corre em tempo real ----------
  var slow = { stay: 0, out: 0, outMax: 1, f: 1 };
  function startSlowmo(stayFrames, outFrames) { slow.stay = Math.max(slow.stay, stayFrames); slow.out = slow.outMax = outFrames; }
  function slowSpeed(realFrames) { // avanca o relogio (em frames reais de 24fps) e devolve a velocidade atual do jogo
    var F = SF.slowmo.factor;
    if (slow.stay > 0) { slow.stay -= realFrames; return F; }
    if (slow.out > 0) { slow.out -= realFrames; return F + (1 - F) * (1 - Math.max(0, slow.out) / slow.outMax); }
    return 1;
  }
  function usePowerup(p) {
    if (p.dead || !p.pow) return;
    startSlowmo(24 * p.pow, SF.slowmo.fadeOut); p.pow = 0; play("heartbeat", 0.6); say(p.name + " ativou slowmotion");
  }
  // ultimo abate da rodada (ActivateSlowmotion): quando so sobra um lado vivo, 2 s de camera lenta
  function lastStanding() {
    var sides = {}; players.forEach(function (q) { if (!q.dead) sides[q.team ? "t" + q.team : "p" + q.id] = 1; });
    return Object.keys(sides).length <= 1 && players.length > 1;
  }
  // voadora: KICK com faixa vertical maior; 50% cambaleia, senao cai (BeingKicked com jumpkick)
  function jumpKickHit(p) {
    var M = SF.melee, dir = p.face, rng = M.kickRange * 1.6;
    players.forEach(function (o) {
      if (p.jkick.hit || o === p || o.dead || o.fall || o.imm > 0 || (o.team && o.team === p.team)) return;
      var dx = o.x - p.x, dy = p.y - o.y;
      if (Math.abs(dx) > rng || dx * dir < -4 || dy > 16 * 1.6 || dy < -16 * 1.6) return;
      p.jkick.hit = true; o.lock = -dir; damage(o, M.jumpKickDamage, p, false, true, { dir: dir }); play("kick", 0.5); shake = Math.max(shake, 3);
      if (o.dead) return;
      if (rand() < 0.5) knock(o, dir * M.kickVx, M.kickVy, o.face); else { o.stag = M.staggerMin + rand() * M.staggerRand; o.kx = ov(dir * M.kickVx); }
    });
  }
  // indicador de mira do original: quadradinho a 8 passos de 2 px a frente do AIM_POSITION (para antes em parede/jogador); sniper tem laser
  function drawAim() {
    players.forEach(function (p) {
      if (p.dead || !p.aiming || p.drawT > 0) return;
      var arm = armOf(p), a = p.aim, st = armPoint(p, arm.aim), x = st.x, y = st.y, stepX = Math.cos(a) * 2 * S, stepY = Math.sin(a) * 2 * S;
      if (p.human) {
        for (var i = 0; i < 8; i++) { if (solidAt(x + stepX, y + stepY, null)) break; x += stepX; y += stepY; }
        ctx.fillStyle = "#000"; ctx.fillRect(x - 2.4, y - 2.4, 4.8, 4.8); ctx.fillStyle = "#fff"; ctx.fillRect(x - 1.6, y - 1.6, 3.2, 3.2);
      }
      if (p.aiming === 1 && arm.laser) { // LaserSight (sniper): pontos vermelhos ate bater em algo
        var l = armPoint(p, arm.laser), lx = l.x, ly = l.y, dx = Math.cos(a) * 4, dy = Math.sin(a) * 4;
        ctx.fillStyle = "rgba(255,40,40,0.7)";
        for (var n = 0; n < 400; n++) { lx += dx; ly += dy; if (solidAt(lx, ly, null) || lx < 0 || lx > map.width || ly < 0 || ly > map.height) break;
          if (players.some(function (o) { if (o === p || o.dead) return false; var hb = hitbox(o); return hb && lx > hb.x1 && lx < hb.x2 && ly > hb.y1 && ly < hb.y2; })) break;
          if (n % 2 === 0) ctx.fillRect(lx - 1, ly - 1, 2, 2); }
      }
    });
  }
  // ---------- loop ----------
  function update() {
    tick++; hangUpdate(); lampUpdate(); updateLifts();
    players.forEach(function (p) {
      if (p.ride) { if (p.dead) { p.ride.rider = null; p.ride = null; } else return; } // carona: a posicao vem do foguete (updateBullets), sem fisica
      if (p.dead) {
        if (!p.gone) { // corpo: continua caindo/deslizando e fica deitado
          p.vx = p.kx; p.drop = false; p.vy += P.gravity * DT * DT * GK; if (p.vy > MAXFALL * DT * JK) p.vy = MAXFALL * DT * JK;
          collide(p); p.kx *= p.onGround ? 0.85 : 0.994; updateReactions(p); if (p.y > map.height + 100) p.gone = true;
        }
        if (surv) { if (p.human && p.respawn-- === 0 && !players.some(function (h) { return h.human && !h.dead; })) finish("Fim de jogo", false, "Onda " + surv.wave + " - " + surv.kills + " abates"); return; }
        if (--p.respawn <= 0) { var s = pickSafeSpawn(p); p.x = s[0]; p.y = groundTopBase(s[0], s[1] - 10); p.vx = p.vy = p.kx = 0; p.health = P.health; p.dead = false; p.charred = false;
          p.atk = null; p.stun = 0; p.fall = false; p.kd = 0; p.stag = 0; p.rot = 0; p.push = 0; p.pushDelay = 0; p.imm = 0; p.lock = 0; p.gone = false; p.melee = "fists"; p.aiming = 0; p.act = null; p.jkick = null; p.kneel = false;
          p.sprint = 0; p.energy = P.energyMax; p.gren = 3; p.gtype = "grenade"; p.grabbed = null; giveWeapon(p, "pistol"); }
        return;
      }
      // mergulho (Dive): quem e atingido de frente e ARRASTADO junto com quem mergulhou ate o mergulho acabar, so
      // depois cai derrubado - em vez de so ser empurrado na hora do toque, fica "grudado" durante o resto do mergulho.
      if (p.grabbed) {
        var g = p.grabbed, M0 = SF.melee;
        if (!g.act || g.act.type !== "dive" || g.dead || g.gone) { knock(p, p.grabbedDir * M0.kickVx, M0.kickVy, -p.grabbedDir); p.grabbed = null; }
        else { p.x = g.x + p.grabbedDir * 11; p.y = g.y; p.vx = 0; p.vy = 0; p.kx = 0; p.onGround = g.onGround; }
        return;
      }
      // ----- teclas virtuais (humano: teclado/mouse; bot: traduzido da IA) e postura -----
      var k = virtualKeys(p), pk = p.k || {}, M = SF.melee;
      var edge = function (n) { return !!k[n] && !pk[n]; }, rel = function (n) { return !k[n] && !!pk[n]; };
      p.k = k;
      if (k.bot) botKeys(p, k);
      var gun = p.weapon && SF.weapons[p.weapon];
      var move = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      // sprint por double-tap (CONFIG SIMPLE do original: apertar a mesma direcao 2x vira sprint, RunSpeed() dobra ate soltar ou mudar de lado)
      if (!k.bot) {
        if (edge("right")) { if (move === 1 && p.lastTapDir === 1 && tick - (p.lastTapT || -99) <= M.doubleTap) p.sprint = 1; p.lastTapDir = 1; p.lastTapT = tick; }
        if (edge("left")) { if (move === -1 && p.lastTapDir === -1 && tick - (p.lastTapT || -99) <= M.doubleTap) p.sprint = -1; p.lastTapDir = -1; p.lastTapT = tick; }
      }
      if (p.act) updateAct(p);
      if (p.atk) updateMelee(p, edge("melee"), move);
      if (p.aiming) updateAim(p, k, rel("fire"), edge("melee"), rel("throw"));
      else if (!busy(p) && !p.atk && !p.act && p.onGround && !p.climb) {
        // !(p.cd > 0): em recarga (ex: shotgun), apertar Fire de novo nao volta a sacar/mirar a cada clique - sem isso,
        // clicar varias vezes repetia o saque/som/pose sem parar, mesmo sem tiro saindo (so 1 "comando" por vez).
        if ((edge("fire") || (p.aimASAP === 1 && k.fire)) && gun && !(p.cd > 0)) startAim(p, 1);
        else if (p.aimASAP === 2 && k.throw && p.gren > 0) startAim(p, 2);
        else if (edge("throw") && p.gren > 0) startAim(p, 2);
        else if (edge("melee")) doMeleeKey(p, k, move);
      }
      // _startAimASAP: Fire/Throw apertado no ar comeca a mirar assim que pousar (se ainda estiver segurando)
      if (!p.onGround && !p.aiming) { if (edge("fire") && gun) p.aimASAP = 1; else if (edge("throw") && p.gren > 0) p.aimASAP = 2; }
      if (p.aiming || (p.aimASAP === 1 && !k.fire) || (p.aimASAP === 2 && !k.throw)) p.aimASAP = 0;
      if (edge("pow")) usePowerup(p);
      // voadora (QueueJumpKick): Melee no ar; acerta quem estiver ate 16 px na frente e numa faixa vertical maior
      // QueueJumpKick do original: Melee no ar so ENFILEIRA a voadora; ela sai quando AirbornTimer >= 2.5 frames (P.jumpKickDelay) e 1x por salto.
      p.airT = (p.onGround || p.climb) ? 0 : (p.airT || 0) + DT; if (p.onGround || p.climb) p.jkq = false;
      if (edge("melee") && !p.onGround && !p.climb && !busy(p) && !p.aiming && !p.atk && !p.act && !p.jkick) p.jkq = true;
      if (p.jkq && p.airT >= (P.jumpKickDelay || 0) && !p.onGround && !p.climb && !busy(p) && !p.aiming && !p.atk && !p.act && !p.jkick) { p.jkq = false; p.jkick = { hit: false }; play("swing1", 0.35); }
      if (p.jkick) { if (p.onGround || p.climb || busy(p)) p.jkick = null; else if (!p.jkick.hit) jumpKickHit(p); }
      var free = !busy(p) && !p.atk && !p.act && !p.aiming;
      if (k.bot && move && free && p.skill > 0 && !p.sprint && p.energy > P.energyMin && rand() < (p.skill === 2 ? 0.02 : 0.008)) p.sprint = move;
      if (p.sprint && (!free || move !== p.sprint || !(p.energy > 0))) p.sprint = 0; // solta, muda de lado, trava ou sem energia: cancela
      p.energy = Math.max(0, Math.min(P.energyMax, (p.energy == null ? P.energyMax : p.energy) + (p.sprint ? -P.energyDrain : P.energyRegen) * DT));
      if (edge("down") && !k.bot) { if (tick - (p.lastDown || -99) <= M.doubleTap) p.dropT = M.doubleTap; p.lastDown = tick; }
      if (p.dropT > 0) p.dropT--;
      p.kneel = free && p.onGround && !p.climb && !!k.down;
      // Dive() do original: agachar (Baixo) + direcao ENQUANTO corre (double-tap/sprint) vira um mergulho mais rapido
      // que derruba quem acertar de frente; sem estar correndo continua so o rolamento normal (esquiva, nao derruba).
      if (p.kneel && move && !(p.rollCd > 0)) { startAct(p, p.sprint === move ? "dive" : "roll", move); p.sprint = 0; p.kneel = false; free = false; }
      if (p.rollCd > 0) p.rollCd -= DT;
      var locked = !free || p.kneel;
      if (busy(p) || p.atk) { k.left = k.right = k.up = k.down = false; move = 0; }
      if (locked && !p.climb) move = 0;
      if (!locked && move && (p.onGround || p.climb)) p.face = move; // no ar o personagem nao vira (MovePlayer do original), so se desloca
      p.aim = p.aiming ? (p.face > 0 ? p.pitch : 180 - p.pitch) * Math.PI / 180 : (p.face > 0 ? 0 : Math.PI);
      p.vx = move * P.runSpeed * DT * RK * (p.human ? 1 : [0.85, 1, 1.05][p.skill]) * (p.sprint && move === p.sprint ? P.sprintMult : 1) + p.kx; p.drop = k.bot ? !!k.drop : p.dropT > 0; p.kx *= p.onGround ? 0.924 : 0.994; /* 0.82/0.985 por frame original -> por tick */ if (Math.abs(p.kx) < 0.05 && !(p.act && (p.act.type === "roll" || p.act.type === "dive"))) p.kx = 0;
      var lad = onLadder(p), climbKey = !locked || p.climb ? (k.up || k.down) : false;
      if (p.aiming || p.act || p.atk || busy(p)) climbKey = false;
      if (lad && climbKey) p.climb = true; else if (!lad) p.climb = false; else if (move !== 0) p.climb = false;
      if (p.climb) { p.vy = (k.up ? -4.8 : k.down ? 4.8 : 0) * DT * RK; } // SlideSpeed 3 do original x1.6, por frame original
      else {
        p.vy += P.gravity * DT * DT * GK; if (p.vy > MAXFALL * DT * JK) p.vy = MAXFALL * DT * JK;
        // PlayerLands() do original: se a tecla de pulo continua apertada ao pousar, pula de novo na hora (sem buffer/coyote: apertar no ar nao conta).
        var landed = p.onGround && p.wasAir; p.wasAir = !p.onGround;
        var jumpReq = k.bot ? k.up : (edge("up") || (landed && !!k.up));
        if (jumpReq && p.onGround && free && !p.kneel) {
          if (move) p.face = move; p.vy = -P.jumpPower * DT * JK; play("jump", 0.25);
          if (!(p.energy > 0)) p.sprint = 0; // BeginJump: sem energia cancela o sprint
          p.energy = Math.max(0, (p.energy == null ? P.energyMax : p.energy) - (p.sprint ? P.jumpSprintEnergy : P.jumpEnergy)); // DrainEnergy JUMP 5 / SPRINT_JUMP 12
        }
      }
      var fallV = p.vy; collide(p); if (p.vx === 0 && !(p.act && (p.act.type === "roll" || p.act.type === "dive"))) p.kx = 0;
      // escada (StairBounce do original): pousar caindo forte (AirVelocityY >= FallTriggerSpeed 8.5) sobre a escada quica:
      // StairVelocityY = AirVelocityY*-0.7 limitado a [-4,-1]; StairVelocityX = tiltValue; o personagem vira de lado.
      if (p.onGround && !p.climb && fallV >= 8.5 * 1.6 * DT && SF.stairs && SF.stairs[cfg.map]) {
        var stv = fallV / (1.6 * DT), sIn = SF.stairs[cfg.map].filter(function (s) { return p.x > s[0] && p.x < s[2] && p.y >= s[1] && p.y <= s[3]; })[0];
        if (sIn) { var sy = -Math.min(4, Math.max(1, stv * 0.7)); p.vy = sy * 1.6 * DT; p.kx = sIn[4] * 1.6 * DT * 2; p.face = -p.face; p.onGround = false; p.standOn = null; play("woodhit", 0.3); }
      }
      if (p.standOn && p.standOn.glass && p.onGround) { glassQ.push(p.standOn); p.onGround = false; p.standOn = null; p.vy *= 0.6; } // PlayerLands no vidro: quebra e o corpo segue caindo (AirVelocityY*0.6)
      if (!p.onGround && !p.climb && !p.fall && p.vy / (1.6 * DT * JK) >= SF.melee.fallTrigger) knock(p, p.vx / (1.6 * DT * JK), p.vy / (1.6 * DT * JK), p.face); // caiu de muito alto: rola no ar e cai deitado
      updateReactions(p);
      // portais (Portals.as do original): so ativa andando de verdade PRA DENTRO dele (p.face apontando na direcao do
      // movimento, como quem entra por conta propria) - sem isso, qualquer coisa que te leve ate ali (levar um tiro,
      // ser chutado, cair, ser carregado por um elevador) tambem teleportava, bastava "estar" no lugar certo.
      // portalBlock: depois de sair por um portal, a entrada fica desativada ate o corpo estar COMPLETAMENTE fora da area de saida
      // (sem isso, o personagem nascendo dentro da area de entrada voltava pelo portal sempre, "regredindo" ao andar de baixo)
      if (p.portalBlock && !p.dead) { var pb = p.portalBlock; if (!(p.x + P.width / 2 > pb[0] && p.x - P.width / 2 < pb[0] + pb[2] && p.y > pb[1] && p.y - P.height < pb[1] + pb[3])) p.portalBlock = null; }
      if (map.portals && !busy(p) && !p.dead && !p.portalBlock && Math.abs(p.vx) > 0.25 && p.face === (p.vx > 0 ? 1 : -1)) {
        var pcx = p.x, pcy = p.y - 17; if (!(portalCd[p.id] > tick)) map.portals.forEach(function (pt) { var a = pt[0], b = pt[1];
        if (pcx > a[0] && pcx < a[0] + a[2] && pcy > a[1] && pcy < a[1] + a[3]) { p.x = b[0] + b[2] / 2; p.y = b[1] + b[3]; p.vy = 0; portalCd[p.id] = tick + 45; p.portalBlock = b; } }); }
      if (map.killY && p.y - 17 > map.killY) { acidKill(p); return; }
      if (p.y > map.height + 100) damage(p, 999, null, false, true, { ignoreImm: true }); // sair do mapa mata sempre, mesmo com imunidade de inicio de partida
      if (p.cd > 0) p.cd -= DT; if (p.hurt > 0) p.hurt--; if (p.barTimer > 0) p.barTimer--;
      { var mv0 = Math.abs(p.vx) > 0.1; if (mv0 && p.onGround) p.runT = (p.runT || 0) + DT; else if (!mv0) p.runT = 0; p.idleT = (p.idleT || 0) + DT; if (p.climb && Math.abs(p.vy) > 0.1) p.climbT = (p.climbT || 0) + DT; } if (p.recoil > 0) p.recoil--;
      // bots pegam armas sozinhos; humanos precisam de Baixo + Melee (GrabWeapon do original)
      // pega sozinho (qualquer jogador, nao so bot) se o slot estiver vazio - UpdateWeaponGrab do original; com o slot
      // ocupado precisa ser Baixo+Melee (grabWeapon, troca explicita que larga a arma atual no chao)
      if (free) pickups.forEach(function (it) { if (it.respawn <= 0 && Math.abs(it.x - p.x) < 16 && Math.abs(it.y - p.y) < 24) tryPickup(p, it, true); });
    });
    // itens largados (arma/melee que cai da mao) tem gravidade: caem ate o chao (ou o topo de um bloco) e param
    pickups.forEach(function (k) { if (!k.fall) return;
      k.vy = (k.vy || 0) + P.gravity * DT * GK; if (k.vy > MAXFALL) k.vy = MAXFALL;
      var gy = groundTop(k.x, k.y - 4); k.y += k.vy * DT;
      if (k.y >= gy) { k.y = gy; k.vy = 0; k.fall = false; } });
    pickups = pickups.filter(function (k) { return k.respawn >= 0; });
    if (weaponPoints && weaponPoints.length) { wsTimer -= DT; if (wsTimer <= 0) { wsTimer = 72; spawnRandomWeapon(); } } // ciclo de 72 frames (WeaponSpawn._spawnInterval)
    pickups.forEach(function (k) { if (k.respawn > 0) k.respawn--; });
    updateProps();
    updateCam();
    if (surv && !ended) updateSurvival();
    updateBullets(); updateGrenades(); updateFires(); updateGasNodes(); processGlass();
    for (var pi = pending.length - 1; pi >= 0; pi--) if (--pending[pi].t <= 0) { var pf = pending[pi].fn; pending.splice(pi, 1); pf(); }
    blasts.forEach(function (b) { b.life--; }); blasts = blasts.filter(function (b) { return b.life > 0; });
    if (shake > 0) shake *= 0.9;
    updateParticles();
    particles = particles.filter(function (q) { return q.life > 0; });
    msgs.forEach(function (m) { m.life--; }); msgs = msgs.filter(function (m) { return m.life > 0; });
  }

  // ---------- render ----------
  var artImgs = {};
  function loadArt(a) {
    var im = artImgs[a.src]; if (!im) { im = new Image(); im.onerror = function () { delete artImgs[a.src]; }; im.src = a.src; artImgs[a.src] = im; } return im;
  }
  function drawArt(a) {
    var im = loadArt(a);
    if (im.complete && im.naturalWidth) ctx.drawImage(im, a.x, a.y, a.w, a.h); else if (tick > 120 && a === map.art) { ctx.fillStyle = "#f55"; ctx.font = "16px sfpixel, monospace"; ctx.textAlign = "center"; ctx.fillText("A arte do mapa nao carregou (" + a.src + ")", canvas.width / 2, canvas.height / 2); }
  }
  function drawPlayer(p) {
    if (p.dead && p.gone) return;
    // morto queimado: o original troca o personagem pelo player_burnt (SF.chars.burnt), sem sangue
    if (p.charred && SF.chars.burnt) { drawBody(p, SF.chars.burnt, "burnt"); if (!p.dead) drawOverhead(p); return; }
    drawBody(p, SF.chars[p.char], p.char);
    // sangue (player_blood do original): mesmo estado com o personagem "blood" por cima, visivel com vida <= 25 e fora de fogo
    if (p.health <= 25 && !(p.burn > 0) && SF.chars.blood) drawBody(p, SF.chars.blood, "blood");
    if (!p.dead) drawOverhead(p);
  }
  function drawBody(p, ch, cname) {
    var w = p.weapon ? SF.weapons[p.weapon] : null, ok = false;
    var moving = Math.abs(p.vx) > 0.1, fl = (p.dead || busy(p) || p.atk) && p.lock ? p.lock : p.face;
    // relogios das animacoes em quadros originais (24fps = DT por tick). Os clipes RUN/IDLE/CLIMB/STAGGER do original sao em loop.
    var loopF = function (id, t) { return 1 + Math.floor(t) % SF.sprites[id].n; };
    var clip = function (id, f) { var n = SF.sprites[id] ? SF.sprites[id].n : 1; return Math.max(1, Math.min(n, Math.floor(f))); };
    if (p.imm > 0 && !p.dead && (Math.floor(p.imm * 2) % 3 === 0)) ctx.globalAlpha = 0.2; // pisca imune (como o original)
    if (p.ride && ch.ROCKET_RIDE_R) { // abracado ao foguete, girado pelo angulo dele (ROCKET_RIDE do original)
      var rb = p.ride, rr = (rb.vx >= 0 ? ch.ROCKET_RIDE_R : ch.ROCKET_RIDE_L) || ch.ROCKET_RIDE_R, rrn = SF.sprites[rr.ANIM] ? SF.sprites[rr.ANIM].n : 1;
      ctx.save(); ctx.translate(p.x, p.y - P.height / 2); ctx.rotate(Math.atan2(rb.vy, rb.vx)); spr(rr.ANIM, 1 + ((tick >> 1) % rrn), 0, 0, 1, 0, S); ctx.restore(); ok = true;
    } else if (p.fall && ch.FALL_F) { // FALL_F/FALL_B: um quadro girando em volta do centro do corpo
      var fid = (p.fallF ? ch.FALL_F : ch.FALL_B).ANIM; ctx.save(); ctx.translate(p.x, p.y - 17); ctx.rotate(p.rot * Math.PI / 180 * fl); spr(fid, 1, 0, 17, fl, 0, S); ctx.restore(); ok = true;
    } else if (p.kd > 0 && ch.KNOCKDOWN) { ok = spr(ch.KNOCKDOWN.ANIM, clip(ch.KNOCKDOWN.ANIM, p.kd), p.x, p.y, fl, 0, S); }
    else if (p.dk > 0 && ch.DEATH_KNEEL) { ok = spr(ch.DEATH_KNEEL.ANIM, clip(ch.DEATH_KNEEL.ANIM, 1 + p.dk), p.x, p.y, fl, 0, S); }
    else if (p.dead) { ok = true; } // corpo ainda no ar sem FALL: nada
    else if (p.stag > 0 && ch.STAGGER) { ok = spr(ch.STAGGER.ANIM, loopF(ch.STAGGER.ANIM, (SF.melee.staggerMin + SF.melee.staggerRand) - p.stag), p.x, p.y, fl, 0, S); }
    else if (p.stun > 0 && ch["STUN_0" + p.stunA]) { ok = spr(ch["STUN_0" + p.stunA].ANIM, 1, p.x, p.y, fl, 0, S); }
    else if (p.atk) { var mid = meleeAnim(p).ANIM; ok = spr(mid, clip(mid, Math.max(1, p.atk.f)), p.x, p.y, fl, 0, S); }
    else if (p.climb && ch.CLIMB) { spr(ch.CLIMB.ANIM, loopF(ch.CLIMB.ANIM, p.climbT || 0), p.x, p.y, 1, 0, S); ok = true; }
    else if (p.act) { var an = p.act, aid = { kick: ch.KICK, roll: ch.ROLL, dive: ch.DIVE, throw: ch.THROW }[an.type];
      if (aid) {
        var dy0 = 0;
        if (an.type === "dive") { // o clipe DIVE tem a origem no meio do corpo (nao nos pes): sobe metade da altura pra nao afundar no piso, + arco do salto do Dive() original
          var dm = SF.sprites[aid.ANIM]; dy0 = (dm.h - dm.oy) * S + Math.sin(Math.min(1, an.f / SF.melee.diveFrames) * Math.PI) * 5 * S; }
        ok = spr(aid.ANIM, clip(aid.ANIM, 1 + an.f), p.x, p.y - dy0, fl, 0, S);
      } }
    else if (p.aiming === 1 && w) { // sacar (START_x), virar (AIM_TURN) e mirar (corpo sem braco + braco girando com o pitch)
      var an2 = w.anim || "PISTOL", st = ch["START_" + an2], armc = ch["AIM_" + an2], bodyId = (an2 === "FLAMETHROWER" && ch.START_FLAMETHROWER && ch.START_FLAMETHROWER.d1) || ch.START_PISTOL.d1; // corpo de mira = sprite d1 (e o arquivo que voce edita no editor)
      if (p.drawT > 0 && st && st.ANIM) { // sacar: no original (frame START_x) o corpo d1 continua e a peca ANIM entra deslocada (translate do SWF, ver data/placements.js)
        var plc = SF.place && SF.place[cname], pls = plc && plc["START_" + an2], so = pls && pls.ANIM;
        if (so) spr(bodyId, 1, p.x, p.y, fl, 0, S);
        spr(st.ANIM, clip(st.ANIM, 1 + (SF.melee.drawFrames - p.drawT) / SF.melee.drawFrames * (SF.sprites[st.ANIM].n)), so ? p.x + fl * so[0] * S : p.x, so ? p.y + so[1] * S : p.y, fl, 0, S); ok = true;
      }
      else if (p.turnT > 0 && ch.AIM_TURN) ok = spr(ch.AIM_TURN.ANIM, 1, p.x, p.y, fl, 0, S);
      else { ok = spr(bodyId, 1, p.x, p.y, fl, 0, S);
        var shd = shoulderOf(p);
        ctx.save(); ctx.translate(p.x, p.y); ctx.scale(fl, 1); spr(armc.ANIM_WPN, p.recoil > 0 ? 2 : 1, shd[0] * S, shd[1] * S, 1, p.pitch * Math.PI / 180, S); ctx.restore(); ok = true; }
    }
    else if (p.aiming === 2 && ch.AIM_GRENADE) { // granada na mao: corpo + braco girando
      var gm = p.gtype === "molotov" && ch.AIM_MOLOTOV ? ch.AIM_MOLOTOV : ch.AIM_GRENADE;
      ok = spr(gm.ANIM || ch.AIM_GRENADE.ANIM, 1, p.x, p.y, fl, 0, S);
      if (ch.AIM_GRENADE.ANIM_WPN) { ctx.save(); ctx.translate(p.x, p.y); ctx.scale(fl, 1); spr(ch.AIM_GRENADE.ANIM_WPN, 1, SHOULDER_X * S, SHOULDER_Y * S, 1, p.pitch * Math.PI / 180, S); ctx.restore(); }
    }
    else if (p.kneel && ch.KNEEL) { ok = spr(ch.KNEEL.ANIM, 1, p.x, p.y, fl, 0, S); }
    else if (p.jkick && ch.JUMPKICK) { ok = spr(ch.JUMPKICK.ANIM, 1, p.x, p.y, fl, 0, S); }
    if (ok) { ctx.globalAlpha = 1; return; }
    // normal (arma guardada): parado, correndo ou no ar
    var key = !p.onGround ? "JUMP" : moving ? (p.sprint && ch.SPRINT ? "SPRINT" : "RUN") : "IDLE", id2 = ch[key].ANIM;
    spr(id2, key === "IDLE" ? loopF(id2, p.idleT) : (key === "RUN" || key === "SPRINT") ? loopF(id2, p.runT) : (p.vy < 0 ? 1 : 2), p.x, p.y, fl, 0, S);
    ctx.globalAlpha = 1;
  }
  // sinal do jogador (P1 / COM) tingido pela cor do time e barra de vida de 20px, como em PlayerBars.as
  var TEAM_RGB = { 1: [0, 64, 255], 2: [255, 0, 0], 3: [255, 255, 0], 4: [0, 255, 0] }, signCache = {};
  function signCanvas(frame, rgb) {
    var key = frame + "," + rgb.join(), c = signCache[key]; if (c) return c;
    var id = SF.spriteAlias.hud_sign, im = id && frameImg(id, frame); if (!im) return null;
    c = document.createElement("canvas"); c.width = im.width; c.height = im.height; var g = c.getContext("2d");
    g.drawImage(im, 0, 0); g.globalCompositeOperation = "multiply"; g.fillStyle = "rgb(" + rgb.join(",") + ")"; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = "destination-in"; g.drawImage(im, 0, 0); signCache[key] = c; return c;
  }
  function drawSign(p, x, y, sc) {
    var rgb = p.team ? TEAM_RGB[p.team] : [230, 230, 230], c = signCanvas(p.human ? (p.slot || 1) : 3, rgb), m = SF.sprites[SF.spriteAlias.hud_sign]; if (!c) return;
    ctx.drawImage(c, x - m.ox * sc, y - m.oy * sc, c.width * sc, c.height * sc);
  }
  var demoOverheads = false;
  // fundo do menu: no original os sinais (COM) ficam no _dynamic_gui_mc, ACIMA do bg_noise (multiplicacao verde/vermelho/azul), entao nao levam a tinta.
  // Em demo o render() pula os sinais; o menu (src/menu.js) chama isto depois de aplicar a tinta. (g,ox,oy,k) = destino, origem e escala canvas->destino.
  SF.drawDemoOverheads = function (g, ox, oy, k) {
    var main = ctx; ctx = g; demoOverheads = true; g.save(); g.translate(ox, oy); g.scale(k, k); g.scale(cam.s, cam.s); g.translate(-cam.vx, -cam.vy);
    try { players.forEach(function (p) { if (!p.dead) drawOverhead(p); }); } finally { g.restore(); demoOverheads = false; ctx = main; }
  };
  function drawOverhead(p) {
    if (cfg.demo && !demoOverheads) return;
    var ks = S * (0.5 + 0.5 / (cam.s * 1.6 * 600 / VIEW_H)); // como no original: sinal e barras crescem quando a camera se afasta
    drawSign(p, p.x, p.y - 42, ks);
    if (p.barTimer > 0) {
      var f = Math.max(0, Math.min(1, p.health / P.health)), bw = 20 * ks, bx = p.x - bw / 2, by = p.y - 36;
      ctx.globalAlpha = 0.5; ctx.fillStyle = "#000"; ctx.fillRect(bx, by, bw, 2 * ks);
      ctx.fillStyle = "rgb(" + Math.round(255 - 255 * f) + "," + Math.round(255 * f) + ",40)"; ctx.fillRect(bx, by, bw * f, 2 * ks); ctx.globalAlpha = 1;
    }
  }
  // buffer do mundo (escala inteira por px do nivel) e buffer do HUD (800x160 como o palco original)
  var buf = document.createElement("canvas"), bctx = buf.getContext("2d"); buf.width = 1500; buf.height = 1130;
  var hudBuf = document.createElement("canvas"), hctx = hudBuf.getContext("2d"); hudBuf.width = 800; hudBuf.height = 160;
  // painel de cada jogador na grade do gui_holder: colunas a cada 200 px, linhas em y=0 e y=75 (ate 8 jogadores)
  function drawHudAll() {
    var main = ctx; ctx = hctx; ctx.clearRect(0, 0, 800, 160); ctx.imageSmoothingEnabled = false;
    players.slice(0, 8).forEach(function (p, i) {
      var X = (i % 4) * 200 + 4, Y = (i < 4 ? 0 : 75) + 3; drawHud(p, X, Y, 1);
      ctx.font = "16px sfpixel, monospace"; ctx.textAlign = "left"; ctx.fillStyle = TEAM_COLORS[p.team] || "#ddd"; ctx.fillText("K " + p.kills, X + 142, Y + 14);
      ctx.fillStyle = "#999"; ctx.fillText("M " + p.deaths, X + 142, Y + 30);
    });
    ctx = main; ctx.imageSmoothingEnabled = true; ctx.drawImage(hudBuf, 0, 0, 800, 160, 0, 0, canvas.width, 160 * canvas.width / 800); ctx.imageSmoothingEnabled = false;
  }
  // ---------- HUD do jogador (painel 135x52 do original: gui_player) ----------
  // posicoes em px do painel: sinal (19,14.7); icones melee/ranged/throwable/powerup x=47/70/93/116, y=26.1; numeros (60,35.1) e (84,35.1);
  // barras de vida/energia a partir de (38,3.1) com 87 de largura; retrato do personagem em (18,39.6); gib_pic em (18.2,30.3)
  var ICON = { axe: 1, bazooka: 2, flamethrower: 3, grenades: 4, machete: 5, magnum: 6, molotov: 7, pistol: 8, rifle: 9, shotgun: 10, sniper: 11, sword: 12, uzi: 13 };
  function drawNum(n, x, y, H) {
    n = Math.max(0, Math.min(99, n | 0)); var id = SF.spriteAlias.hud_digit, t = (n / 10) | 0, u = n % 10;
    spr(id, t === 0 ? 10 : t, x, y, 1, 0, H); spr(id, u === 0 ? 10 : u, x + 10 * H, y, 1, 0, H);
  }
  // miniatura do HUD = o mesmo desenho do personagem (drawBody) no estado atual: pose, arma, pulo, corrida, ataque, direcao.
  // Usa um objeto herdado de p com x/y zerados (o desenho e feito na origem e movido com transform), na escala do HUD (H).
  function drawReplica(p, x, y, H) {
    var rep = Object.create(p), ch = SF.chars[p.charred ? "burnt" : p.char] || SF.chars[p.char];
    rep.x = 0; rep.y = 0; rep.face = p.face || 1; rep.lock = p.lock || rep.face;
    if (!ch) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(H / S, H / S);
    drawBody(rep, ch, p.charred ? "burnt" : p.char);
    ctx.restore();
  }
  function drawHud(p, X, Y, H) {
    var A = SF.spriteAlias, ch = SF.chars[p.char], w = p.weapon ? SF.weapons[p.weapon] : null;
    var panel = loadArt({ src: "assets/hud/panel.png" }); if (!(panel.complete && panel.naturalWidth)) return;
    ctx.drawImage(panel, X, Y, 135 * H, 52 * H);
    drawSign(p, X + 19 * H, Y + 14.7 * H, H);
    if (p.dead) spr(A.char_gib_05, 1, X + 18.2 * H, Y + 30.3 * H, 1, 0, H);
    else drawReplica(p, X + 18 * H, Y + 39.6 * H, H); // replica do personagem: mesma pose, arma e direcao do momento (drawBody), nao uma pose fixa
    if (ICON[p.melee]) spr(A.hud_icons, ICON[p.melee], X + 47 * H, Y + 26.1 * H, 1, 0, H); // slot corpo a corpo (punhos = vazio)
    if (w) { var frame = ICON[p.weapon] || ICON[(w.anim || "").toLowerCase()] || 9; spr(A.hud_icons, frame, X + 70 * H, Y + 26.1 * H, 1, 0, H); drawNum(p.ammo, X + 60 * H, Y + 35.1 * H, H); }
    if (p.pow) spr(A.hud_icons, p.pow >= 10 ? 16 : 15, X + 116 * H, Y + 26.1 * H, 1, 0, H);
    if (p.gren > 0) { spr(A.hud_icons, p.gtype === "molotov" ? 7 : 4, X + 93 * H, Y + 26.1 * H, 1, 0, H); drawNum(p.gren, X + 84 * H, Y + 35.1 * H, H); }
    var f = Math.max(0, Math.min(1, p.health / P.health)), bw = 87 * H;
    ctx.fillStyle = "rgb(" + Math.round(255 - 255 * f) + "," + Math.round(255 * f) + ",40)"; ctx.fillRect(X + 38 * H, Y + 3.1 * H, bw * f, 4 * H);
    ctx.fillStyle = "#fff"; ctx.fillRect(X + 38 * H, Y + 9.1 * H, bw, 4 * H);
  }
  function render() {
    // O mundo e desenhado num buffer com escala INTEIRA por pixel do nivel (pixel art nitido) e depois reduzido suavemente para a tela.
    var main = ctx, L = cam.s * 1.6, N = Math.max(1, Math.ceil(L - 0.02)), rw = canvas.width * N / L, rh = canvas.height * N / L;
    // o buffer precisa caber rw x rh (N/L pode chegar perto de 2x o tamanho da tela conforme o zoom da camera); sem isso,
    // em certos niveis de zoom o buffer ficava pequeno demais e cortava as bordas da cena (sprites "cortados" na tela).
    if (buf.width < rw || buf.height < rh) { buf.width = Math.ceil(rw); buf.height = Math.ceil(rh); }
    // Math.random() de proposito aqui (nao rand()): isso e so tremida visual da CAMERA, desenhada em render() a cada
    // frame real (nao a cada tick da simulacao) - se usasse o RNG seedado, os dois lados do COOP ONLINE consumiriam
    // numeros aleatorios em quantidades diferentes (frame rate real diverge) e toda a simulacao desincronizaria.
    var skx = shake > 0.5 ? (Math.random() - 0.5) * shake : 0, sky = shake > 0.5 ? (Math.random() - 0.5) * shake : 0;
    ctx = bctx; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false; ctx.save();
    ctx.fillStyle = map.bg; ctx.fillRect(0, 0, buf.width, buf.height);
    ctx.scale(N / 1.6, N / 1.6); ctx.translate(-cam.vx, -cam.vy); // camera: tudo abaixo e coordenada de mundo
    if (map.art) { drawMapAnim(true); drawArt(map.art); drawMapAnim(false);
      solids.forEach(function (r) { if (!r.glass) return; ctx.fillStyle = "rgba(170,230,255,0.55)"; ctx.fillRect(r[0], r[1], r[2], r[3]); ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.fillRect(r[0], r[1], Math.max(1, r[2] * 0.4), 1); }); // vidros (ainda inteiros)
    } // ceu+nuvens atras, arte parada, ventiladores/goteira/botoes na frente
    else {
      ctx.fillStyle = "#5a6270"; map.platforms.forEach(function (r) { ctx.fillRect(r[0], r[1], r[2], r[3]); });
      ctx.fillStyle = "#7a8494"; map.platforms.forEach(function (r) { ctx.fillRect(r[0], r[1], r[2], 2); });
    }
    decor.forEach(function (d) { spr(d.id, 1, d.x, d.y, d.flip, 0, S); });
    (map.spinners || []).forEach(function (s) { spr(SF.spriteAlias.windmill_propeller, 1, s[0], s[1], 1, tick * 0.04, S); });
    liftObjs.forEach(function (o) { if (!spr(SF.spriteAlias[o.def.spr], 1, o.cx, o.cy, 1, 0, S)) { ctx.fillStyle = "#9aa"; ctx.fillRect(o.rect[0], o.rect[1], o.rect[2], o.rect[3]); } });
    pickups.forEach(function (k) { if (k.respawn > 0) return;
      var wid = SF.spriteAlias["wpn_" + k.type]; if (wid && spr(wid, 1, k.x, k.y - 4, 1, 0, S)) return;
      ctx.fillStyle = "#e0c040"; ctx.fillRect(k.x - 7, k.y - 6, 14, 6); ctx.font = "9px monospace"; ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.fillText((SF.weapons[k.type] || SF.items[k.type]).name, k.x, k.y - 10); });
    props.forEach(function (pr) { var id = SF.spriteAlias[pr.def.sprite], hurt = pr.def.emptyFrame ? 1 : pr.hp < pr.def.hp * 0.5 ? 2 : 1; // arma vazia: so a arma (frame 1); o frame 2 sao so os colchetes do indicador de municao
      if (pr.def.emptyFrame && sprClean(id, pr.x, pr.y - pr.def.h / 2, 1, S)) return; // arma vazia: so a arma, sem os colchetes do indicador
      if (pr.def.chair && pr.cx != null) { ctx.save(); ctx.translate(pr.cx, pr.cy); ctx.rotate(pr.rot); spr(id, hurt, 0, 0, 1, 0, S); ctx.restore(); return; } // poltrona: gira com o corpo rigido
      if (pr.air && pr.rot) { ctx.save(); ctx.translate(pr.x, pr.y - pr.def.h / 2); ctx.rotate(pr.rot); spr(id, hurt, 0, 0, 1, 0, S); ctx.restore(); } // voando gira
      else if (!spr(id, hurt, pr.x, pr.y - pr.def.h / 2, 1, 0, S)) { ctx.fillStyle = "#8a6a3a"; ctx.fillRect(pr.rect[0], pr.rect[1], pr.rect[2], pr.rect[3]); } });
    hangDraw(); lampDraw(); drawFires(false); players.forEach(drawPlayer); drawFires(true); drawAim();
    var gid = SF.spriteAlias.wpn_grenade_thrown, mid = SF.spriteAlias.wpn_molotov_thrown;
    grenades.forEach(function (g) { if (!spr(g.mol && mid ? mid : gid, 1, g.x, g.y, 1, g.rot, S)) { ctx.fillStyle = "#4a6"; ctx.fillRect(g.x - 3, g.y - 3, 6, 6); } });
    ctx.fillStyle = "#ffe27a"; bullets.forEach(function (b) {
      if (b.w.rocket) { if (!spr(SF.spriteAlias.bazooka_rocket, 1 + ((tick >> 1) % 4), b.x, b.y, 1, Math.atan2(b.vy, b.vx), S)) ctx.fillRect(b.x - 4, b.y - 2, 8, 4); return; }
      ctx.fillRect(b.x - 2, b.y - 1, 4, 2); });
    blasts.forEach(function (b) { var t = 1 - b.life / b.max, r = b.r * (0.4 + 0.6 * Math.sqrt(t)), gr = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      gr.addColorStop(0, "rgba(255,255,200," + (1 - t) + ")"); gr.addColorStop(0.5, "rgba(255,150,30," + (0.8 * (1 - t)) + ")"); gr.addColorStop(1, "rgba(255,60,0,0)");
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, 7); ctx.fill(); });
    particles.forEach(function (q) {
      ctx.globalAlpha = q.life < 40 && (q.phys || q.spr) ? Math.max(0, q.life / 40) : 1;
      if (q.anim) spr(q.anim, 1 + Math.min(q.nf - 1, Math.floor(q.age)), q.x, q.y, q.flip || 1, q.rot, q.sc || S);
      else if (q.spr) { if (!spr(q.spr, 1, q.x, q.y, 1, q.rot, S)) { ctx.fillStyle = q.c || "#a01818"; var r0 = q.r || 2; ctx.fillRect(q.x - r0 / 2, q.y - r0 / 2, r0, r0); } }
      else { ctx.fillStyle = q.c; var r = q.r || 2; ctx.fillRect(q.x - r / 2, q.y - r / 2, r, r); }
    });
    ctx.globalAlpha = 1;
    if (map.front) drawArt(map.front);
    if (debugCol) {
      ctx.lineWidth = 1; solids.forEach(function (r) { ctx.strokeStyle = r[4] === "cloud" ? "#0f0" : "#f0f"; ctx.strokeRect(r[0] + 0.5, r[1] + 0.5, r[2], r[3]); });
      ctx.strokeStyle = "#fa0"; (map.ladders || []).forEach(function (r) { ctx.strokeRect(r[0], r[1], r[2], r[3]); });
      ctx.strokeStyle = "#0ff"; (map.portals || []).forEach(function (pt) { ctx.strokeRect(pt[0][0], pt[0][1], pt[0][2], pt[0][3]); });
      var CO = { walk: "#4f4", jump: "#ff4", drop: "#f84", ladder: "#4cf", portal: "#f4f" };
      nav.nodes.forEach(function (n) { n.adj.forEach(function (e) { if (e.t === "walk") return; var m = nav.nodes[e.to]; ctx.strokeStyle = CO[e.t]; ctx.beginPath(); ctx.moveTo(n.x, n.y - 2); ctx.lineTo(m.x, m.y - 2); ctx.stroke(); }); ctx.fillStyle = "#4f4"; ctx.fillRect(n.x - 1, n.y - 3, 2, 2); });
      ctx.fillStyle = "#ff0"; (map.spawnPoints || []).forEach(function (sp) { ctx.fillRect(sp[0] - 3, sp[1] - 3, 6, 6); });
    }
    ctx.restore(); ctx = main;
    ctx.fillStyle = map.bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(buf, 0, 0, rw, rh, skx, sky, canvas.width, canvas.height); // sem suavizacao: com ela, a ampliacao nao inteira borrava a ultima coluna dos sprites (pernas pareciam cortadas)
    // HUD com a fonte pixel 04b03 do original (sem acentos: a fonte extraida so tem os glifos usados no SWF)
    if (cfg.demo) return; // fundo do menu: so o mundo, sem HUD nem mira
    var me = players[0], cw = canvas.width, hy = (players.length > 4 ? 160 : 92) * cw / 800;
    drawHudAll();
    ctx.font = "16px sfpixel, monospace"; ctx.textAlign = "center"; ctx.fillStyle = "#ccc";
    if (surv) { ctx.fillStyle = "#fff"; ctx.fillText("ONDA " + Math.max(1, surv.wave) + "     ABATES " + surv.kills, cw / 2, hy); }
    else if (cfg.mode === "tdm") { ctx.textAlign = "right"; ctx.fillStyle = TEAM_COLORS[1]; ctx.fillText("AZUL " + teamKills(1), cw / 2 - 16, hy); ctx.textAlign = "left"; ctx.fillStyle = TEAM_COLORS[2]; ctx.fillText("VERMELHO " + teamKills(2), cw / 2 + 16, hy);
      ctx.textAlign = "center"; ctx.fillStyle = "#888"; ctx.fillText("LIMITE " + cfg.kills, cw / 2, hy + 20); }
    else ctx.fillText(cfg.kills >= 9999 ? "SEM LIMITE" : "LIMITE " + cfg.kills + " ABATES", cw / 2, hy);
    ctx.textAlign = "left"; msgs.forEach(function (m, i) { ctx.fillStyle = "rgba(255,255,255," + Math.min(1, m.life / 40) + ")"; ctx.fillText(m.t.toUpperCase(), 12, hy + 44 + i * 18); });
    if (me.dead) { ctx.textAlign = "center"; ctx.font = "32px sfpixel, monospace"; ctx.fillStyle = "#f55"; ctx.fillText("VOCE MORREU", cw / 2, canvas.height / 2); }
    // mira
    if (cfg.mouse) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 6, 0, 7); ctx.moveTo(mouse.x - 10, mouse.y); ctx.lineTo(mouse.x + 10, mouse.y); ctx.moveTo(mouse.x, mouse.y - 10); ctx.lineTo(mouse.x, mouse.y + 10); ctx.stroke(); }
  }

  // API para mods e testes (console do navegador: SF.api.players()[0] ...)
  // % de pares de spawns que o grafo de navegacao conecta (diagnostico de mapas/mods)
  function navReport() {
    var S = map.spawns.map(function (s) { return nodeAny(s[0], groundTop(s[0], s[1] - 10)); }), ok = 0, tot = 0;
    for (var i = 0; i < S.length; i++) for (var j = 0; j < S.length; j++) if (i !== j) { tot++; if (S[i] === S[j] || findPath(S[i], S[j])) ok++; }
    return { nodes: nav.nodes.length, edges: SF.navStats.edges, spawnPairsConnected: ok + "/" + tot };
  }
  // step(n): roda n ticks de simulacao sem renderizar (testes automaticos e ferramentas de mod). No COOP ONLINE passa
  // pelo mesmo caminho do frame() real (captura/espera o input do outro lado) - util pra testar sem depender de
  // requestAnimationFrame (que fica pausado com a aba/painel escondido).
  function step(n) { for (var i = 0; i < n && !ended; i++) { if (netActive) netTick(); else update(); } }
  // ---------- ambiente de depuracao (tecla F9) ----------
  // Captura ampliada de um personagem numa pose, com o nome de cada sprite desenhado, a caixa (w x h, ox/oy) e o ponto de
  // origem de cada peca, e grade de pixel. Nao altera a partida: o personagem e uma copia desenhada fora da tela.
  var DBG_POSES = {
    parado: {}, correndo: { onGround: true, vx: 2.5 }, pulando: { onGround: false, vy: -6 },
    mirando: { aiming: 1, pitch: 0, aim: 0, drawT: 0, turnT: 0, recoil: 0 },
    sacando: { aiming: 1, pitch: 0, aim: 0, drawT: 30, turnT: 0, recoil: 0 },
    recuo: { aiming: 1, pitch: 0, aim: 0, drawT: 0, turnT: 0, recoil: 2 },
    chutando: { act: { type: "kick", f: 2, dir: 1, hit: false } }, rolando: { act: { type: "roll", f: 3, dir: 1 } },
    mergulhando: { act: { type: "dive", f: 3, dir: 1, hit: false } }, caido: { fall: false, kd: 3 }
  };
  SF.debugOn = false; SF.debugPose = "mirando"; SF.debugZoom = 8; SF.debugLast = null;
  function dbgRender(name, zoom, opts) {
    var over = DBG_POSES[name] || {}, base = players.filter(function (q) { return q.human; })[0] || players[0];
    if (opts && opts.char) base = Object.assign({}, base, { char: opts.char }); // personagem escolhido no painel
    // pre-carrega todas as pecas do personagem (as imagens carregam de forma assincrona; sem isso a captura sai sem a peca)
    var ch0 = SF.chars[base.char], pending = 0;
    if (ch0) Object.keys(ch0).forEach(function (st) { var s = ch0[st]; if (!s || typeof s !== "object") return;
      Object.keys(s).forEach(function (pk) { var id = s[pk]; if (typeof id !== "number" || !SF.sprites[id]) return;
        for (var fr = 1; fr <= Math.min(2, SF.sprites[id].n); fr++) if (!frameImg(id, fr)) pending++; }); });
    var fake = {}; for (var k in base) fake[k] = base[k];
    for (var k2 in over) fake[k2] = over[k2];
    if (opts && opts.blood) fake.health = 20; else fake.health = 100;
    fake.imm = 0; fake.dead = false; fake.gone = false; fake.charred = false; fake.burn = 0; fake.hurt = 0; fake.lock = fake.face || 1;
    if (!fake.weapon && /mirando|sacando|recuo/.test(name)) { fake.weapon = "pistol"; fake.ammo = 10; }
    if (!fake.act && over.act === undefined) fake.act = null;
    fake.x = 60; fake.y = 90; fake.ride = null; fake.kneel = false; fake.jkick = null; fake.atk = null;
    var W = 120, H = 110, z = zoom || 8, off = document.createElement("canvas"), oc = off.getContext("2d");
    off.width = W * z; off.height = H * z; oc.imageSmoothingEnabled = false;
    var saveCtx = ctx, saveLog = SF.debugLog; SF.debugLog = [];
    ctx = oc; oc.setTransform(z, 0, 0, z, 0, 0); oc.fillStyle = "#26303c"; oc.fillRect(0, 0, W, H);
    try { drawPlayer(fake); } finally { ctx = saveCtx; }
    var parts = SF.debugLog; SF.debugLog = saveLog;
    // grade de pixel e caixas
    oc.setTransform(1, 0, 0, 1, 0, 0); oc.strokeStyle = "rgba(255,255,255,0.12)"; oc.lineWidth = 1;
    for (var gx = 0; gx <= W; gx++) { oc.beginPath(); oc.moveTo(gx * z + 0.5, 0); oc.lineTo(gx * z + 0.5, H * z); oc.stroke(); }
    for (var gy = 0; gy <= H; gy++) { oc.beginPath(); oc.moveTo(0, gy * z + 0.5); oc.lineTo(W * z, gy * z + 0.5); oc.stroke(); }
    var colors = ["#ff4d4d", "#4dff88", "#4da6ff", "#ffd24d", "#e066ff", "#4dfff3", "#ff8c4d", "#ffffff"];
    // cada peca: caixa = os 4 cantos da imagem (-ox..w-ox, -oy..h-oy) levados pela matriz real do canvas (ja em pixels do buffer)
    parts.forEach(function (pt, i) { var m = pt.m, t = pt.t, c = colors[i % colors.length];
      var TP = function (u, v) { return [t.a * u + t.c * v + t.e, t.b * u + t.d * v + t.f]; };
      var cs = [TP(-m.ox, -m.oy), TP(m.w - m.ox, -m.oy), TP(-m.ox, m.h - m.oy), TP(m.w - m.ox, m.h - m.oy)];
      var xs = cs.map(function (q) { return q[0]; }), ys = cs.map(function (q) { return q[1]; });
      var bx = Math.min.apply(null, xs), by = Math.min.apply(null, ys), bw = Math.max.apply(null, xs) - bx, bh = Math.max.apply(null, ys) - by;
      oc.strokeStyle = c; oc.lineWidth = 2; oc.strokeRect(bx, by, bw, bh);
      var o = TP(0, 0); oc.fillStyle = c; oc.fillRect(o[0] - 3, o[1] - 3, 6, 6);
      oc.font = "bold 12px monospace"; oc.textBaseline = "top"; oc.fillStyle = c; oc.fillText("#" + i + " " + pt.id, bx + 2, by + 2 + i * 13); });
    var lines = parts.map(function (pt, i) { var t = pt.t, o = [t.e / z, t.f / z]; return "#" + i + " sprite " + pt.id + " quadro " + pt.frame + " origem em (" + (o[0] - 60).toFixed(1) + "," + (o[1] - 90).toFixed(1) + ") " + (pt.flip < 0 ? "espelhado " : "") + "escala " + pt.scale.toFixed(2) + " caixa " + pt.m.w + "x" + pt.m.h + " ox " + pt.m.ox + " oy " + pt.m.oy; });
    SF.debugLast = { name: name, parts: lines, png: off.toDataURL("image/png"), pending: pending };
    if (pending) lines.unshift("AVISO: " + pending + " imagens ainda carregando; capture de novo em 1 s.");
    return SF.debugLast;
  }
  SF.debugCapture = function (name, zoom, opts) { return dbgRender(name || SF.debugPose, zoom || SF.debugZoom, opts || {}); };
  (function dbgPanel() {
    var box = null, img = null, info = null, sel = null;
    function build() {
      box = document.createElement("div"); box.id = "dbgPanel";
      box.style.cssText = "position:fixed;right:8px;top:8px;width:520px;max-height:92vh;overflow:auto;background:#0b0f15;color:#e6e9ee;border:2px solid #ffff7e;padding:10px;z-index:100000;font:12px monospace;display:none";
      var title = document.createElement("div"); title.textContent = "DEPURACAO (F9)"; title.style.cssText = "color:#ffff7e;font-weight:bold;margin-bottom:6px"; box.appendChild(title);
      sel = document.createElement("select"); Object.keys(DBG_POSES).forEach(function (k) { var o = document.createElement("option"); o.value = k; o.textContent = k; sel.appendChild(o); }); sel.value = SF.debugPose; sel.onchange = function () { SF.debugPose = sel.value; };
      var zoom = document.createElement("select"); [4, 6, 8, 10, 12].forEach(function (z) { var o = document.createElement("option"); o.value = z; o.textContent = "zoom " + z + "x"; if (z === SF.debugZoom) o.selected = true; zoom.appendChild(o); }); zoom.onchange = function () { SF.debugZoom = +zoom.value; };
      var chSel = document.createElement("select"); Object.keys(SF.chars).forEach(function (c) { var o = document.createElement("option"); o.value = c; o.textContent = c; chSel.appendChild(o); });
      var row = document.createElement("div"); row.style.cssText = "margin:4px 0"; row.appendChild(sel); row.appendChild(zoom); box.appendChild(row);
      var row2 = document.createElement("div"); row2.style.cssText = "margin:4px 0"; row2.appendChild(chSel); box.appendChild(row2);
      var b1 = document.createElement("button"); b1.textContent = "capturar"; b1.onclick = function () { show(SF.debugCapture(sel.value, +zoom.value, { char: chSel.value })); };
      var b2 = document.createElement("button"); b2.textContent = "capturar com sangue"; b2.onclick = function () { show(SF.debugCapture(sel.value, +zoom.value, { blood: true, char: chSel.value })); };
      var b3 = document.createElement("a"); b3.textContent = "baixar PNG"; b3.style.cssText = "margin-left:8px;color:#4dff88"; b3.download = "pose.png";
      box.appendChild(b1); box.appendChild(b2); box.appendChild(b3);
      img = document.createElement("img"); img.style.cssText = "width:100%;image-rendering:pixelated;margin-top:8px;background:#222"; box.appendChild(img);
      info = document.createElement("pre"); info.style.cssText = "white-space:pre-wrap;margin:6px 0 0"; box.appendChild(info);
      var hint = document.createElement("div"); hint.style.cssText = "color:#8d97a6;margin-top:6px"; hint.textContent = "Caixas coloridas = caixa de cada sprite; ponto = origem. Pose 'parado' usa o estado atual do humano."; box.appendChild(hint);
      document.body.appendChild(box);
      function show(r) { img.src = r.png; info.textContent = "pose: " + r.name + "\n" + r.parts.join("\n"); b3.href = r.png; }
    }
    window.addEventListener("keydown", function (e) { if (e.code !== "F9") return; e.preventDefault(); if (!box) build(); SF.debugOn = !SF.debugOn; box.style.display = SF.debugOn ? "block" : "none"; });
  })();

  SF.api = { ramps: function () { return ramps; }, dropWeapon: function (p) { dropWeapon(p); }, unstick: function (p) { unstickPlayer(p); return [p.x, p.y]; }, cam: function () { return cam; }, navStats: function () { return navStats; }, step: step, navReport: navReport, nav: function () { return nav; }, players: function () { return players; }, props: function () { return props; }, explode: explode, blastShape: blastShape, solids: function () { return solids; }, give: giveWeapon, throwGrenade: throwGrenade, say: say, play: play, draw: function () { render(); }, slow: function () { return slow; }, slowSpeed: slowSpeed,
    netDebug: function () { return { active: netActive, paused: paused, running: running, tick: tick, captureTick: captureTick, rtt: SF.net && SF.net.rtt(), delayTicks: netActive ? netDelay() : null, localKeys: Object.keys(netLocalIn), remoteKeys: Object.keys(netRemoteIn) }; },
    lamps: function () { return lamps; }, pickups: function () { return pickups; }, fires: function () { return fires; }, gasNodes: function () { return gnodes; }, hangs: function () { return hangs; }, bullets: function () { return bullets; }, hitProp: hitProp, mapBtn: function () { return mapBtn; }, solids: function () { return solids; } };

  // ---------- COOP ONLINE: lockstep ----------
  // Os dois PCs simulam o jogo inteiro (nao so um host); cada um so manda pro outro as TECLAS que apertou, tick a tick
  // (SF.net.sendInput). Pra isso dar certo os dois tem que executar cada tick com o MESMO par de teclas (local+remota),
  // entao: 1) cada tick usa rand() seedada igual (ver reset()); 2) o input de cada lado so e CONSUMIDO (netTickReady)
  // quando o do outro lado ja chegou - se a rede atrasar, o jogo congela esperando em vez de desincronizar.
  // netDelay() segura esse consumo um pouco pra tras (a captura continua rolando na hora real, so a simulacao fica
  // atrasada alguns ticks) pra dar tempo do pacote do outro PC chegar sem ficar travando toda hora. Esse atraso NAO e
  // fixo: cada lado mede o ping real (SF.net.rtt(), ping/pong em net.js) e usa so o minimo necessario pra cobrir a
  // ida-e-volta - numa conexao rapida (mesma cidade/wifi) fica bem pequeno (2 ticks = ~33ms, o piso) em vez de sempre
  // "pesado"; so cresce de verdade se a rede realmente for lenta. Cada lado ajusta o SEU PROPRIO atraso de forma
  // independente (nao precisa combinar com o outro PC - so afeta quanto ESSE lado espera antes de rodar cada tick).
  var netActive = false, netLocalIn = {}, netRemoteIn = {}, captureTick = 1, NET_MAXLEAD = 180;
  var NET_DELAY_MIN = 2, NET_DELAY_MAX = 30, NET_DELAY_MARGIN = 25; // ms de folga alem do ping, pra absorver variacao (jitter)
  function netDelay() {
    var rtt = (SF.net && SF.net.rtt()) || 150; // sem nenhuma amostra ainda (comeco da conexao): chute conservador
    var oneWayMs = rtt / 2 + NET_DELAY_MARGIN;
    return Math.max(NET_DELAY_MIN, Math.min(NET_DELAY_MAX, Math.ceil(oneWayMs / (1000 / 60))));
  }
  if (SF.net) {
    SF.net.onInput(function (t, k) { netRemoteIn[t] = k; });
    SF.net.onClose(function () {
      if (!netActive) return; netActive = false;
      if (running && !ended) { paused = true; if (SF.onPause) SF.onPause(true); }
      if (SF.onNetDrop) SF.onNetDrop();
    });
  }
  function netLocalPlayer() { for (var i = 0; i < players.length; i++) if (players[i].net === "local") return players[i]; return null; }
  function netCapture() {
    if (!netActive || paused || ended) return;
    if (captureTick - (tick + 1) >= NET_MAXLEAD) return; // trava antecipadamente se a conexao caiu/atrasou demais (nao deixa a fila crescer sem limite)
    var lp = netLocalPlayer(), k = lp ? readLocalKeys(lp) : EMPTY_KEYS;
    netLocalIn[captureTick] = k; SF.net.sendInput(captureTick, k); captureTick++;
  }
  function netTickReady() {
    if (!netActive) return true;
    var T = tick + 1;
    return captureTick - T >= netDelay() && netRemoteIn[T] !== undefined;
  }
  // 1 tick do COOP ONLINE: captura+manda o input local, e so simula se ja tiver os dois lados prontos (senao fica parado nesse tick)
  function netTick() {
    netCapture();
    if (paused || ended || !netTickReady()) return;
    update(); delete netLocalIn[tick]; delete netRemoteIn[tick];
  }
  var last = 0, acc = 0;
  function frame(t) {
    if (!running) return;
    acc += Math.min(100, t - last); last = t;
    var spd = slowSpeed(Math.min(100, t - (frame.lt || t)) * 24 / 1000); frame.lt = t; SF.timeScale = spd;
    if (music) setAmbientVol(spd); // Sounds.as setAmbientVolume: volume = efeitos x slowmo x 0.1 (cai junto com o slow motion)
    var tickMs = 1000 / 60 / spd;
    while (acc >= tickMs) {
      if (netActive) netTick(); else if (!paused && !ended) update();
      acc -= tickMs;
    }
    render(); rafId = requestAnimationFrame(frame);
  }
  function stopMusic() { if (music) { music.pause(); music = null; } }
  // volume do loop ambiente = volume de efeitos x fator de slowmo x 0.1 (igual ao original)
  function setAmbientVol(slowF) { if (!music) return; var sfx = typeof cfg.sfxVol === "number" ? cfg.sfxVol : 1; music.volume = Math.max(0, Math.min(1, sfx * slowF * 0.35)); } // 0.35 (o original usa 0.1; aumentado para ficar audivel)
  // API publica usada pelo menu (src/menu.js)
  SF.start = function (c) {
    cfg.net = false; cfg.seed = null; // nao herda de uma partida online anterior se a proxima nao mandar de novo
    for (var k in c) cfg[k] = c[k];
    stopMusic(); reset(); ended = false; paused = false; running = true; acc = 0;
    canvas.style.display = "block"; keys = {}; mouse.down = mouse.right = false;
    // durante a partida o original toca o LOOP AMBIENTE (Sounds.as: InMenu false -> playAmbient), nao o tema (que e so do menu).
    if (cfg.music && !cfg.demo) { music = snd(SOUND_FILES.ambient).cloneNode(); music.loop = true; setAmbientVol(1); var pr = music.play(); if (pr && pr.catch) pr.catch(function () {}); }
    last = performance.now(); cancelAnimationFrame(rafId); rafId = requestAnimationFrame(frame);
  };
  SF.stop = function () { running = false; cancelAnimationFrame(rafId); stopMusic(); canvas.style.display = "none"; };
  SF.setPaused = function (b) { paused = !!b; };  SF.setSfxVolume = function (v) { cfg.sfxVol = v; };
})();
