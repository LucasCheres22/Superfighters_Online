# Mecânicas implementadas e decisões de design

Legenda: **[ORIG]** = fiel ao AS3 original; **[PORT]** = adição/estimativa nossa (comentada no código e no LEIAME).

## Escala e tempo
- Original roda a 24 fps; o motor roda 60 Hz com `DT = 0.4` (frames originais por tick). Dados em `weapons.js` estão em "frames originais"; posições/px do port = px do original × `S=1.6`.
- Física do jogador: `SF.player.runScale 0.7`, `gravityScale 0.75` (fixos, escolhidos pelo usuário; não são mais configuráveis no menu). `JK=sqrt(GK)` mantém altura de pulo.
- **Toda lógica de simulação usa `rand()`** (RNG seedado mulberry32, `seedRng`). `Math.random()` só em código de **render/visual** (ex.: tremida de câmera) e no menu. NUNCA use `rand()` em função chamada de `render()` — consome o RNG compartilhado em quantidade diferente por PC e dessincroniza o online. Não nomear variável local `rng` (já houve colisão; a função se chama `rand`).

## Jogador / movimento
- Máquina de estados: `p.aiming` (0/1 arma/2 arremesso), `p.atk` (combo melee), `p.act` (`roll`/`dive`/`kick`/`throw`), `p.fall`/`p.kd` (derrubado), `p.stun`, `p.stag`, `p.dk`, `p.imm`, `p.push/pushDelay`, `p.gone`, `p.sprint/energy`, `p.grabbed` (arrastado em dive).
- Controles [ORIG]: P1 setas + N melee / M fogo / vírgula granada / ponto powerup; P2 WASD + 1 2 3 4. Remapeável em SET UP.
- **Correr (sprint) [ORIG: CONFIG SIMPLE]**: double-tap na mesma direção → 2× velocidade (`sprintMult`). Barra de energia `energyMax/Drain/Regen/Min` — taxa de drenagem **[PORT estimada]**; no original só pulo/rolamento/dive drenam. Bots correm ocasionalmente.
- **Dive [ORIG Player.as Dive()]**: Baixo+direção enquanto corre → mergulho (`diveSpeed 3.6`, `diveFrames`, `diveEnergy`). Anim própria `ch.DIVE` (1 quadro, origem no meio do corpo → desenhada levantada + arco). Quem for atingido de frente é **agarrado e arrastado** (`o.grabbed`) até o dive acabar, depois `knock()`. Roll normal (sem sprint) só esquiva (90% das balas: `rand()<0.9` em `updateBullets`, verificado empiricamente). Dive também esquiva.
- Imunidade 48 frames só no início da partida [ORIG SetStartImmunity]; respawn NÃO dá imunidade. **Sair do mapa (y>altura+100) mata sempre, mesmo imune** (bug grave já corrigido).
- Respawn: `pickSafeSpawn` (longe dos inimigos vivos) **[PORT]**; spawn duplicado é espalhado (jitter 14px); `groundTopBase` usa só plataformas estáticas.
- Todo jogador começa/renasce com **3 granadas**.

## Combate
- Melee combo de 3 golpes, 3º derruba; chute em derrubados/objetos; voadora no ar [ORIG].
- **Pushback** de tiros acumula e **decai** (`pushDelay 3`, `pushDecay 10`) [ORIG PlayerState]. Cambaleio/derrubada ao chegar a 100.
- **Desarme [ORIG PunchPlayer→Disarm]**: todo golpe melee derruba a arma de fogo (com munição) ou solta a granada do alvo.
- **Recuo do atirador [PORT]** (`recoilKick`): empurra o atirador; **pistola e lança-chamas NÃO têm recuo** (pedido do usuário).
- Armas: fogo = segura saca, solta atira; `burst`/`gap`/`cooldown`/`lock`. Em recarga (`p.cd>0`) apertar Fire NÃO volta a sacar (`startAim` bloqueado).
- Arma de fogo que zera munição é **largada no chão sozinha** (pending 1 tick) [PORT].

## Armas/itens no chão
- Dois slots independentes [ORIG]: `p.melee` (fists/machete/axe/sword) e `p.weapon` (fogo ou null).
- **Pegar [ORIG UpdateWeaponGrab/GrabWeapon]**: automático para QUALQUER jogador (não só bot) se o slot está vazio (melee só com punhos; fogo se sem arma/sem munição/pistola trocando por melhor); arma vazia no chão não é pega sozinha. **Baixo+Melee** força troca e **larga a arma atual no mesmo lugar** (com a munição). Dropados têm `respawn:10` de carência (evita re-pegar na hora).
- **Vida** (medkit/pílula): ao pisar só pega se machucado; com barra cheia só com Baixo+Melee (consome sem curar, nega ao inimigo).
- Spawn aleatório (7 mapas SWF): a cada 72 frames orig (3 s), "ponto livre" = **sem NENHUM pickup num raio de 40px** (antes só contava os próprios → empilhava). Pesos `SF.extraSpawns`.

## Props e física
- `SF.props`: crate, barrel (explosivo), barrel_plain, gascan (explosivo), **table, table_small** (viraram props; indestrutíveis `hp 1e9`, dimensões **[PORT estimadas]**). Flag `push:true` em barrels e mesas.
- **Explosivos detonam na hora** com bala ou reação em cadeia (`hitProp(pr,dmg,byBlast,instant)`); melee/fogo continuam gradual; chute em prop `push` só empurra (`updateProps()` desliza com atrito, bloqueio por sólidos, reassenta com `groundTop`; sem queda real).
- Explosão: raio 90, dano 40 (valores estimados em `SF.explosion`).

## Mapas / elevadores / portais
- Elevadores (`map.lifts`, fórmula manivela-biela `liftOffset`): pouso aceita topo ANTES ou DEPOIS do movimento no tick (corrige tunelamento). Elevador horizontal carrega o jogador e agora vira `p.face` na direção do carregamento. (O relato "personagem de costas ao subir" em elevador VERTICAL não foi reproduzido; hipótese tratada = elevador horizontal.)
- **Portais [ORIG Portals.as]** só ativam andando PRA DENTRO: `!busy && !dead && |vx|>0.25 && face==sinal(vx)`. O original usa `TriggerVelocity` por portal (não extraído do SWF); a nossa regra é aproximação.
- Zona Perigosa: ácido mata abaixo de `killY`.

## Render
- Mundo desenhado em buffer `buf` com escala inteira e reduzido; **buf cresce dinamicamente** (antes tamanho fixo cortava a cena em certos zooms).
- Clipes `START_*` (sacar arma) vinham sem ponto de registro (ox=oy=0) → corrigidos no load (pés no centro-base). `DIVE` origem no meio → levantado.
- HUD com fonte pixel 04b03 extraída do SWF (sem acentos).

## Menus
Recriados do original (1 PLAYER/2 PLAYERS > VS/SURVIVAL > plates > bots > mapa/modo > FIGHT). STAGE MODE e TUTORIAL **ainda não existem**. Botão extra **COOP ONLINE** (HTML, canto superior direito, só na tela inicial).

## Explosoes e fisica de props (2026-11-15) [ORIG Explosions.as]
- Forma por 36 raios (r 33 px x1.6, passo 3 px): cada raio para na 1a parede/objeto; energia dos bloqueados redistribuida (power = min(m/livres*0.25, r/2)). Parede protege; sala fechada alcanca mais. Codigo: blastShape/inBlast em game.js.
- Jogador: dentro da forma, f=1 ate r/2 e cai linear ate r. Dano 20*f (>10 derruba, senao cambaleia), impulso 5*f. Props: 25 de dano no centro + 2.5 por raio, impulso radial 6.25*S*f, qualquer prop (nao so poltrona) voa, quica e cai (launchProp/flyProp).
- Props perdem apoio e caem (pilha de caixas), viajam em elevadores. Caixas em voo derrubam (crush so se def.crush; poltrona 25).

## Testing Floor: botoes e alcapoes; elevador nao segura itens (2026-11-15) [ORIG Maps.GenerateMapTestingFloor]
- BUTTON_01 (btn_left/btn_right) abre o alcapao do lado (hatch 107.2x20.8). Ao abrir, objetos sobre ele caem para o poco. Soco de frente para o botao ativa (tryButton).
- groundTopW: apoio pelo miolo do corpo (caixa sobre duas caixas empilha). Elevadores (r.lift) saem de groundTop, granadas, destrocos e props: atravessam elevador. Balas ja ignoravam.
- Props caem ao perder o apoio; impacto de queda (>= 2 m/s) causa dano de impacto (CheckBodyImpact).

## Props nas escadas (2026-11-15)
- Escadas (SF.stairs) sao degraus de colunas finas de 4.8 px. flyProp separa X e Y: o X so bate em bloco que cobre a altura atual do corpo e para na face de onde veio (nunca teleporta); o Y pousa no topo mais alto abaixo. Caixa solta cai no degrau certo e fica la; antes teleportava (340 -> 683 px) e sumia da cena.

## Barril explosivo e galao: uma batida (2026-11-15)
- hitProp(instant) agora vale para soco, chute e arma branca (antes so bala). Barril explosivo e galao de gasolina detonam/queimam na 1a batida; caixas continuam perdendo vida. Chute em barril explosivo nao so empurra mais (o empurrao segue so para barril comum/mesa).

## Socos: caixa pequena, vidro e piso rigido (2026-11-15)
- Caixa pequena (crate, slide:true, hp 16): soco empurra ~5 px e quebra no 3o soco seguido (dano de combo novo = 6). Chute continua so dano. Caixa e barril de metal/mesa seguem a regra de empurrao (push).
- Vidro (r.glass) quebra com qualquer soco ou golpe de arma branca na frente (punchGlass).
- Objetos voando andam em sub-passos (<= 2.5 px cada, flyStep) e nunca atravessam piso/parede; unstickProp tira o objeto de dentro de um bloco rigido pela face mais proxima. Teste: 66 caixas soltas em 6 mapas, 0 presas e 0 NaN.

## Barril explosivo so com bala ou granada (2026-11-15, corrige a regra de 'uma batida')
- hitProp ignora barril explosivo quando nao vem de bala (bullet) nem de explosao (byBlast): soco, chute, arma branca, fogo e queda so empurram (ou nada). Bala detona na hora; granada/explosao em cadeia tambem.
- Galao de gasolina continua reagindo a uma batida de qualquer golpe (queima, nao explode).

## Afundar no piso, caixa grande, galao so ricocheteia (2026-11-15)
- unstickPlayer: personagem dentro de bloco rigido sai pela face mais proxima (cima = pousa, lados). Chamado no fim de collide() e na carona de foguete (updateBullets), que antes copiava a posicao do foguete sem colisao e afundava o personagem no piso.
- Caixa grande (hanging) que cai sobre alguem: morte instantanea (damage 999, gib), sem depender de CrushDamage.
- Galao de gasolina: soco/chute so ricocheteia (push), sem dano, sem fogo e sem mudar o sprite; so bala ou explosao o ativa. Mesma regra do barril explosivo.

## Colisao robusta (2026-11-15)
- Personagem: collide() agora roda em sub-passos de <= 2 px (collideCore por passo; eixo bloqueado zera o resto do eixo). Evita tunelamento por piso fino e coluna de escada.
- Granadas: movimento em sub-passos; granada presa dentro de bloco rigido sai pela face mais proxima.
- Props: voo em sub-passos (flyStep); objeto parado sobreposto a outro bloco e separado (unstickProp) - antes so em queda, entao caixas do mapa que nasciam encostadas ficavam sobrepostas.
- unstickPlayer: agora inclui caixa suspensa (solida, .lift); so elevador (cloud) e ignorado.
- Teste de invariantes (1200 ticks, 8 mapas, passeio + pulos + granadas + props): personagem vivo dentro de bloco = 0 nos 8 mapas exceto Warehouse (ver pendencia); props parados sobrepostos = 0-3; NaN = 0.
- Pendencia: no Warehouse, apos a troca de rodada, o personagem fica sobre um piso sobreposto a blocos de outro mapa (solids mistos). Nao reproduzido de forma isolada; investigar a troca de rodada/map.

## Miniatura do HUD e poltrona fiel (2026-11-15)
- Miniatura do personagem no painel do HUD (drawReplica): o mesmo drawBody do jogo, no estado atual (pose, arma, pulo, corrida, ataque, direcao, morte). Antes era a pose fixa START_PISTOL.
- Poltrona (comfy_chair) como no original: corpo rigido com circulo r 6.5 + caixa 14x9 deslocada 3.5 px (escala S). Integra por tick, contato por pontos (circulo + base da caixa), impulso com restituicao 0.25 e atrito mu 0.5, entao rola, desliza, gira e quica. Chutada/explodida/socada usa o mesmo lancamento dos outros props; esmaga com 25 (crush). Limitacoes: jogador nao sobe em cima dela (so colide com o retangulo) e o empilhamento de poltronas e aproximado.

- Poltrona derruba em qualquer contato com ela em movimento (velocidade >= 0.5); dano de 25 so em impacto forte (> 4). Antes so batia acima de 4, entao golpes mais leves nao derrubavam.

- Poltrona derruba SO ao cair em cima do personagem (vy > 0.5 e centro acima da metade superior do corpo) ou em impacto forte (velocidade > 7: explosao/chute). Empurrao leve nao derruba nem da dano. Dano 25 acompanha a queda por cima e o impacto forte.

## Geladeira (caixa grande), musica e mapa de teste (2026-11-15)
- Geladeira = crate_hanging (geladeira: true). Soco empurra (pendurada: balanco forte; no chao: vx forte). Queda de cima: cair literalmente em cima de quem esta de pe (centro sobre o corpo) esmaga na hora; toque de cima leve ou lateral derruba (sem dano). Quem ja esta caido e tocado por ela morre (geladeiraCrush).
- Musica: ambiente de partida (2502) com volume 0.35 x slowmo (era 0.1); tema (2501) toca no menu desde o carregamento (boot) e para ao entrar na partida.
- Mapa de teste: SF.maps.geladeira_teste (data/map_extras.js) com geladeira pendurada e duas no chao. Nao aparece na lista do menu (so mapas com arte); abrir pelo console: SF.start({roster:[{slot:0,char:1},{bot:true,slot:1,char:2,diff:0}], map:'geladeira_teste', mode:'dm', kills:99, music:true, seed:11}).

## Escadinha, armas e itens largados (2026-11-15)
- Escadinha (rampa): o personagem anda sobre a linha do topo das colunas (ramps, setupRamps), sem colidir com cada coluna; subir e descer segue a rampa sem pular. Caixas/balas usam as colunas.
- Arma largada com balas: pickup que CAI com gravidade ate o chao (antes flutuava no ar). Arma SEM balas: vira objeto de chao (prop wpn_<tipo>), nao pickup, nao pode ser pega por engano. Melee largada tambem cai.
- Barril: testado (explosao e empurrao), cai, quica e para com gravidade.

- Arma sem balas (original: Player.as CheckAimDrop -> AddPolygon("wpn_"+tipo)): objeto de chao SEM colisao com personagem e balas (filtro so com o mundo), nao chutavel, com o frame EMPTY (frame 2 do sprite) e sem indicador de municao. No port: prop wpn_<tipo> com noPlayer; passa-se por cima e a bala atravessa. Nao replicado: o fade de debris do original (_debrisFadeFunction): a arma fica no chao.

- Arma vazia no chao: desenha so o frame 1 (a arma). O frame 2 do sprite sao os colchetes brancos do indicador de municao, que o original esconde em arma vazia.

- Arma de fogo sem balas NUNCA vira pickup: todos os caminhos que largam arma (morte, desarme, troca, esvaziar) passam por dropGunAt (com balas = pickup que cai; sem balas = objeto de chao). Antes, morte e desarme criavam pickups com 0 balas (a arma com indicador e etiqueta, que dava pra pegar de novo).

- Geladeira: quem cai (no ar) e POUSA em cima dela fica vivo (standOn = a geladeira nao conta como caido no chao). Morre so se estiver caido no chao e a geladeira o tocar, ou se a geladeira cair centralizada em cima de quem esta de pe.

- Arma vazia no chao: os colchetes brancos NAO estao no frame 2; estao no frame 1, junto com a arma (escura). Agora a arma vazia e desenhada com cleanSprite: o frame 1 com os pixels claros removidos (so a arma).

## Spawns de armas/itens do original (2026-11-15)
- data/item_spawns.js: TODOS os WeaponSpawnData de Maps.as (Backstreets 6, Testing 5, Hazardous 6, Rooftops 7, Police 6, Storage 6, Survival01 2). Tutorial sem itens.
- Conversao validada: os spawns de jogadores originais convertidos batem 100% com os spawns do port (mesma formula x = art.x + (x+292)*1.6, y = art.y + (y+201)*1.6).
- Sorteio como WeaponSpawn.as: a cada 72 frames, um ponto livre (sem item perto) e escolhido; o array de 30 do ponto liga os tipos permitidos e cada tipo entra com o peso _weaponSpawnChance (11,9,7,2,2,4,6,5,2,3,3,4,3,2,2,2,6). extraSpawns (invencao do port) foi removido do sorteio.
- Fora de escopo: o GetMap do original tem 2 pontos extras (420,188),(235,188) num nivel sem spawns de jogador (provavel mapa de teste); e os mapas de mod (warehouse, rooftop, bunker) continuam com o sistema antigo.

- Itens (armas/itens sorteados) NAO nascem em rampa nem escada: spawnRandomWeapon descarta pontos sobre a superficie da escadinha, dentro da caixa de SF.stairs ou sobre map.ladders (onRampOrStair). Testado: 0 itens nascidos nessas areas nos 7 mapas.
