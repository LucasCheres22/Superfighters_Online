// Dados das armas (valores extraidos do SWF original: Weapons.as / Projectiles.as).
// MODS: edite aqui ou adicione novas armas em mods/*.js (veja mods/exemplo.js).
// cooldown = frames do jogo original (24fps) entre tiros; anim = animacao do braco (PISTOL, UZI, RIFLE, SHOTGUN, MAGNUM, SNIPER); spread = graus; speed = px/frame;
// damage/crit* = vida (jogador tem 100); range = px; pellets = projeteis por tiro.
window.SF = window.SF || {};
SF.weapons = {
  // Corpo a corpo (Weapons.as do original): combo de 3 golpes. damage/range = valores de cada golpe do combo (range em px do nivel original,
  // o motor multiplica por 1.6). anim = prefixo das animacoes (PUNCH_01..03, MACHETE_01..03...). blade = sangra ja no 1o golpe.
  fists:   { name: "Punhos",  melee: true, anim: "PUNCH",   damage: [6, 7, 8],    range: [10, 11, 13], hitSound: ["punch00","punch01","punch02","punch03"], blade: false },
  machete: { name: "Machete", melee: true, anim: "MACHETE", damage: [8, 9, 10],   range: [13, 13, 19], hitSound: ["katana"], blade: true },
  axe:     { name: "Machado", melee: true, anim: "AXE",     damage: [11, 12, 13], range: [18, 18, 20], hitSound: ["katana"], blade: true },
  sword:   { name: "Espada",  melee: true, anim: "SWORD",   damage: [13, 14, 15], range: [18, 18, 23], hitSound: ["katana"], blade: true },
  // pushback = PushbackPower do projetil (Projectiles.as): soma a cada acerto; ao chegar em 100 (ou critico) o alvo cambaleia ou cai.
  pistol:  { anim: "PISTOL", name: "Pistola", ammo: 12, cooldown: 6,  spread: 1,   speed: 30, damage: 10, critChance: 5,  critDamage: 15, range: 300, pellets: 1, auto: false, pushback: 15, burst: 1, gap: 2, lock: 1, aimSnd: "aim_small", sound: ["gun00","gun01"] , empty: "outofammo_light" },
  uzi:     { anim: "UZI", name: "Uzi",     ammo: 25, cooldown: 6,  spread: 6,   speed: 30, damage: 7,  critChance: 4,  critDamage: 10, range: 200, pellets: 1, auto: true,  pushback: 10, burst: 5, gap: 2, lock: 0, aimSnd: "aim_small", sound: ["uzi00","uzi01"], empty: "outofammo_light" },
  rifle:   { anim: "RIFLE", name: "Rifle",   ammo: 25, cooldown: 6,  spread: 3,   speed: 35, damage: 8,  critChance: 6,  critDamage: 10, range: 300, pellets: 1, auto: true,  pushback: 20, burst: 5, gap: 2, lock: 0, aimSnd: "rifle_draw", sound: ["rifle00","rifle01"], empty: "outofammo_heavy" },
  shotgun: { anim: "SHOTGUN", name: "Shotgun", ammo: 32, cooldown: 30, spread: 4.3, speed: 30, damage: 6,  critChance: 0,  critDamage: 6,  range: 200, pellets: 6, auto: false, pushback: 33, burst: 1, gap: 2, lock: 14, aimSnd: "shotgun_aim", sound: ["shotgun00","shotgun01","shotgun02"], empty: "outofammo_heavy" },
  magnum:  { anim: "MAGNUM", name: "Magnum",  ammo: 6,  cooldown: 8,  spread: 0.5, speed: 40, damage: 25, critChance: 40, critDamage: 35, range: 300, pellets: 1, auto: false, pushback: 50, burst: 1, gap: 2, lock: 2, aimSnd: "aim_small", sound: ["magnum"], empty: "outofammo_heavy" },
  sniper:  { anim: "SNIPER", name: "Sniper",  ammo: 5,  cooldown: 18, spread: 0,   speed: 40, damage: 30, critChance: 75, critDamage: 60, range: 900, pellets: 1, auto: false, pushback: 50, burst: 1, gap: 2, lock: 3, aimSnd: "aim_big", sound: ["sniper00","sniper01"], empty: "outofammo_heavy" }
  ,
  // Bazuca: dano 100 e velocidade 18 vem do original; o foguete explode ao bater (SF.explosion).
  bazooka: { anim: "BAZOOKA", name: "Bazuca", ammo: 3, cooldown: 10, spread: 2, speed: 18, damage: 100, critChance: 0, critDamage: 0, range: 2000, pellets: 1, auto: false, rocket: true, burst: 1, gap: 2, lock: 3, aimSnd: "bazooka_aim", sound: ["bazooka"], empty: "outofammo_heavy" },
  // Lanca-chamas (ESTIMADO): cada tiro solta uma labareda curta que atravessa jogadores, da pouco dano direto e poe fogo (ver SF.fire).
  flamethrower: { anim: "FLAMETHROWER", name: "Lanca-chamas", ammo: 100, cooldown: 10, spread: 7, speed: 6, damage: 0.5, range: 130, pellets: 1, auto: true, flame: true, burst: 10, gap: 1, lock: 0, aimSnd: "aim_big", sound: ["flame"], empty: "outofammo_heavy" }
};
// Itens que nao ocupam o slot de arma. grenades: tecla G ou botao direito do mouse.
// molotovs ocupam o mesmo slot de arremesso das granadas (pegar um tipo troca o outro).
SF.items = {
  grenades: { name: "Granadas", amount: 3, max: 3 },
  molotovs: { name: "Molotovs", amount: 3, max: 3, molotov: true },
  medkit:   { name: "Medkit", heal: 50 },
  // Weapons.as: pilulas e medkit curam na hora (25/50); slowmo_05/10 ficam no slot de powerup e duram 5/10 s (tecla powerup)
  pills:     { name: "Pilulas", heal: 25 },
  slowmo_05: { name: "Slowmo 5", slowmo: 5, icon: 15 },
  slowmo_10: { name: "Slowmo 10", slowmo: 10, icon: 16 }
};
// Granada: pavio de 3s (24*3 frames originais). Explosao: dano total ate radius/2, depois cai linear (formula do original).
// ESTIMADO (nao lido do SWF ainda): radius, damage, power, gravity/bounce da granada.
SF.grenade = { fuse: 72, speed: 8.8, gravity: 0.35, bounce: 0.5 }; // speed = 5.5 px/frame do original (ReleaseThrowable) x1.6
// Mecanica do corpo a corpo (Player.as / PlayerState.as do original). Tempos em frames originais (24fps), velocidades em px do nivel/frame.
// hitFrame: quadro da animacao em que o golpe acerta (golpe 1/2/3); comboFrame: a partir dele, apertar de novo encadeia o proximo golpe;
// stun: atordoamento do alvo = base + aleatorio*stunRand; o 3o golpe derruba (knock); glide: o 3o golpe desliza o atacante p/ frente.
// vRange: diferenca vertical aceita entre os centros (atacante - alvo). knockdown: animacao de levantar tem 13 quadros; immunity apos levantar.
SF.melee = { hitFrame: [4, 5, 6], comboFrame: [6, 7, 8], stunBase: [3, 4, 5], stunRand: 5, glide: 2, knockX: 3, knockY: -2.5, deathKnockX: 2,
  vRange: [-7, 12.5], hitStop: 1, knockdownFrames: 13, riseFrame: 9, immunity: 10, staggerMin: 6, staggerRand: 8, staggerSpeed: 1,
  comboBuffer: 3, // comboBuffer: NAO existe no original (0 = identico); guarda o aperto feito ate 3 quadros antes da janela do combo
  // Postura de tiro (Player.as): Fire desenha a arma (drawFrames) e o tiro sai ao SOLTAR; virar com a arma leva turnFrames; 6 frames apos o disparo volta ao normal.
  // pitch muda 0.5 graus/frame e acelera +2 por frame segurando cima/baixo (AimUp/AimDown), limite 90. Chute: KickDamage 4, alcance 16 px, 3 quadros.
  drawFrames: 3, turnFrames: 2, backIdle: 6, pitchStart: 0.5, pitchAccel: 2, pitchMax: 90,
  kickDamage: 4, kickRange: 16, kickFrames: 3, kickCooldown: 6, kickVx: 4, kickVy: -2, rollSpeed: 2, rollFrames: 6, rollCooldown: 12, grabRange: 16, doubleTap: 15,
  // Dive() do original (Player.as): rolamento/mergulho enquanto corre (sprint) - DiveSpeed 3.5 (quase o dobro do rolamento
  // normal) e derruba quem acertar de frente (CheckDivePlayerImpact->DiveCollision), em vez de so esquivar como o rolamento parado.
  diveSpeed: 3.6, diveFrames: 7, diveEnergy: 20,
  jumpKickDamage: 4, fallTrigger: 8.5, // voadora (JumpKickDamage) e FallTriggerSpeed: acima disso no ar o personagem cai rolando
  // Pushback (PlayerState.as: CurrentPushbackPower): cada tiro soma; 3 frames depois do ultimo acerto comeca a cair pushDecay/frame.
  // Sem essa queda o cambaleio/derrubada vem de qualquer sequencia de tiros espacados, nao so de rajadas rapidas como no original.
  pushDelay: 3, pushDecay: 10 };
// Fogo (ESTIMADO): patchLife = ticks que uma poca de fogo dura; ignite/linger = ticks pegando fogo; burnDamage = dano a cada 10 ticks;
// propDamage = dano por tick em caixas/barris (barril em chamas explode); extraSpawns = pesos extras no sorteio de armas dos mapas.
SF.fire = { patchLife: 300, ignite: 140, linger: 120, burnDamage: 1.5, propDamage: 0.4, flameProp: 1.5 };
SF.extraSpawns = { flamethrower: 2, molotovs: 3, pills: 3, slowmo_05: 2, slowmo_10: 1 };
// Slowmotion (Slowmo.as / SlowmoData): fator 0.2; powerup = N s + 1 s de saida; ultimo abate da rodada = 2 s + 1 s.
SF.slowmo = { factor: 0.2, fadeOut: 24, killStay: 48 };
// [ORIG Explosions.as] forma por 36 raios (r 33 px -> ate 49.5 px em ambiente fechado, x1.6); dano jogador 20*f (>10 derruba), power 5*f (px/frame x1.6 x0.7 runScale),
// dano em objeto 25 (+2.5 por raio que o acerta). radius = so referencia (o raio real vem de blastShape em game.js).
SF.explosion = { radius: 79, damage: 20, power: 5.6, propDamage: 25 };
// Props destrutiveis. hp = vida; explosive = explode ao ser destruido.
// push: NAO existe no original como flag separada, mas objetos leves (barris, mesas) deslizam ao serem chutados em vez de
// so levar dano (ver updateProps()/tryKick() em game.js); caixa e lata de gasolina continuam fixas, so quebram.
SF.props = {
  // slide: soco empurra a caixa pequena (desliza com atrito); 3 socos seguidos quebram (cada soco de combo novo da 6 de dano: 6+6+6 = 18 >= 16). Chute continua so dano.
  crate:  { sprite: "crate_01",  w: 26, h: 26, hp: 16, slide: true, debris: ["crate_debris_01", "crate_debris_02", "crate_debris_03"] },
  barrel: { sprite: "barrel_01", w: 22, h: 28, hp: 30, explosive: true, push: true, debris: ["barrel_debris_01", "barrel_debris_02", "barrel_debris_03"] },
  // BARREL (barrel_02) no original: BodyData(..., indestructible = true) - o balde/barril de ferro nunca quebra, so desliza.
  barrel_plain: { sprite: "barrel_02", w: 22, h: 28, hp: 40, push: true, indestructible: true, debris: ["barrel_debris_01", "barrel_debris_02", "barrel_debris_03"] },
  // GASCAN no original: onDestruction = som fireburst + Fires.TriggerFireAt("GASCAN") (labaredas que caem e queimam o chao), NAO explode.
  // gascan: so bala (ou explosao) faz efeito; soco/chute apenas ricocheteia (push), sem mudar o visual - igual ao barril explosivo
  gascan: { sprite: "gascan", w: 14, h: 18, hp: 15, gas: true, push: true, debris: ["barrel_debris_01"] },
  // COMFY_CHAIR (poltrona) no original: corpo dinamico (circulo r=6.5 + caixa), BodyData indestrutivel, Kickable, CrushDamage 25,
  // AffectedByExplosions. fly: pode ser lancada (explosao/chute/soco) e, voando, derruba e fere quem atingir.
  // chair: corpo rigido de verdade (chairStep em game.js): circulo r 6.5 + caixa 14x9 deslocada 3.5 px pra baixo, escalados x1.6 (S).
  // Rola, quica, gira ao ser chutada e esmaga com 25 (crush). w/h = caixa de colisao AABB do conjunto (para bala, soco e jogador).
  comfy_chair: { sprite: "comfy_chair", w: 22.4, h: 23.2, hp: 1e9, push: true, fly: true, chair: true, crush: 25, indestructible: true, debris: [], r: 10.4, hx: 11.2, hy: 7.2, oy: 5.6, e: 0.25, mu: 0.5 },
  // mesas: ESTIMADO (dimensoes derivadas do sprite x1.6, igual aos outros props); indestrutiveis (hp bem alto), so deslizam.
  table:       { sprite: "table_01",       w: 29, h: 18, hp: 1e9, push: true, debris: [] },
  table_small: { sprite: "table_small_01", w: 21, h: 12, hp: 1e9, push: true, debris: [] }
};
// Fisica do jogador, lida de PlayerState.as/Player.as do original e convertida para px do port (x1.6). Unidades: px por FRAME ORIGINAL (24fps);
// o motor multiplica por DT (0.4) a cada tick de 60Hz. runSpeed = _runSpeed 1.7; gravity = PlayerGravity 0.6; jumpPower = PlayerJumpPower 5
// + impulso segurando o pulo (PlayerJumpPushPower 0.7 por 4 frames, ~1.75) = 6.75; tudo x1.6. width/height em px do port.
// runScale/gravityScale: ajuste fino escolhido no teste (corrida 70%, gravidade 75% do original; 1 = valores do original).
// A gravidade reduzida tambem reduz a velocidade do pulo (x raiz), entao a altura do pulo fica igual.
// sprintMult = RunSpeed() quando Sprinting (original: _runSpeed*2). energyMax/Drain/Regen: a barra de energia do original so e
// drenada por pulo/rolamento/mergulho durante o sprint (DrainEnergy); aqui, p/ simplificar, drena continuamente correndo (ESTIMADO:
// ~4s de sprint continuo) e regenera parado/andando devagar. recoilKick: NAO existe no original (arma nao empurra o atirador);
// adicionado para dar sensacao de recuo ao disparar, proporcional ao "pushback" de cada arma (ver SF.weapons).
// PULO (fiel): PlayerJumpPower -5 (x1.6 = 8). O "impulso segurando o pulo" (PlayerJumpPushPower) so age se PlayerJumpPushActivated, que e false
// e nunca ligado em nenhum lugar do original -> altura NAO depende de segurar a tecla. Antes jumpPower era 10.8 (6.75x1.6, errado). jumpEnergy/jumpSprintEnergy = DrainEnergy JUMP 5 / SPRINT_JUMP 12.
// jumpKickDelay = AirbornTimer >= 2.5 frames para a voadora sair. Altura = 22 px orig (35 px port), ~17 frames orig (gravityScale 0.75 -> ~19.8).
SF.player = { health: 100, runSpeed: 2.72, jumpPower: 8, jumpEnergy: 5, jumpSprintEnergy: 12, jumpKickDelay: 2.5, gravity: 0.96, width: 14, height: 34, runScale: 0.7, gravityScale: 0.75,
  sprintMult: 2, energyMax: 100, energyDrain: 0.7, energyRegen: 0.35, energyMin: 15, recoilKick: 0.045 };
