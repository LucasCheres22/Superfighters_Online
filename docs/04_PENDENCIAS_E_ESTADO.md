# Estado atual e pendências (atualizado em 2026-11-12)

## Estado
Tudo abaixo está implementado e passou em `node --check` + testes headless no navegador sem erros de console: física/recuo/sprint, dive com arrasto e animação própria, desarme, pushback com decaimento, spawn seguro, imunidade de início, correção de elevador/queda fora do mapa, props empurráveis + explosão imediata, buffer de render dinâmico, correção de sprites START_*, pegar/trocar/largar armas, vida ao pisar, 3 granadas iniciais, spawn de armas sem empilhar, portais direcionais, COOP ONLINE com atraso adaptativo.

## Sprites de personagem e posições do SWF (2026-11-13)
- **Sprites recompostos: DESFEITO (era um erro).** A hipótese "a exportação corta o sprite na caixa do 1º quadro" estava errada: quando um quadro troca a forma no mesmo depth (PlaceObject2 com `placeFlagMove` e sem matriz), o Flash MANTÉM a matriz anterior; o script zerava e inventava caixas maiores (IDLE 27×41). Com a regra certa os 510 sprites batem com o export do ffdec (só arredondamento). PNGs originais restaurados, `data/sprites_fix.js` e `tools/rebuild_sprites.ps1` removidos. Os sprites de `assets/sprites` NUNCA estiveram cortados.
- **`data/images.js` manda**: o jogo carrega `SF.img[caminho]` antes do arquivo. Mudou/adicionou PNG em `assets/`? Rode `tools\embed_images.ps1`, senão o jogo continua com a imagem antiga.

## Mapas: peças animadas, botões e pouso em plataforma (2026-11-13)
- **Estrutura no SWF**: a arte de cada mapa é um QUADRO do MovieClip `levels` (símbolo 2484; `levels_front` = 2499). As partes animadas são MovieClips FILHOS dentro do quadro (não quadros do mapa), tocados por `MapGraphic.Update(game_speed)`: `fan_1..4` (forma girando 22,5°/quadro), `background_clouds` (bitmap 265×152 ladrilhado rolando 265 px a cada 120 quadros; mapas 3 e 4), `pouring` (goteira 3×3, 3 formas, mapa 5), `btn_left/right` (2 quadros; mapas 7 e 10).
- `tools/mapanim.ps1` regrava `assets/maps/level_N.png` só com a parte parada, cria `back_N.png` (céu atrás das nuvens), as peças em `assets/maps/anim/` e `data/map_anim.js`. `drawMapAnim()` em `game.js` desenha céu+nuvens atrás e ventiladores/goteira/botões na frente. Backup dos level_N antigos: `%TEMP%\levels_backup_before_mapanim`.
- **Botões (BUTTON_01)**: soco sem acertar ninguém, de frente, a 4–14 px (orig) do botão → `tryButton()` remove o alçapão (hatch 67×13) daquele lado e trava o botão (Área de Testes e Survival).
- **Pouso em plataforma-nuvem** (`collide()`): como no `UpdateAirMovement` original, pousa com o pé DENTRO da espessura da nuvem (caindo: qualquer profundidade; subindo: ≥2 px abaixo do topo). O pico do pulo (21,97 px orig) fica 0,03 px abaixo do andar seguinte (22 px) — é essa regra que deixa subir de andar em andar. `p.dropRect` evita repousar na nuvem que se está atravessando para baixo.
- **Vidros quebráveis (APLICADO)**: `data/map_glass.js` (`SF.glass`, 13 segmentos, posições validadas contra as caixas de plataforma de cada mapa). Quebram ao pousar em cima, com tiro e com explosão. **Falta:** quebrar ao ser atravessado de lado (rolar/mergulhar/knock) e quebrar com soco/chute.
- **Quique nas escadas (APLICADO)**: `SF.stairs` no mesmo arquivo (região da escada aproximada pela caixa do polígono; o polígono exato tem 5 pontos). Queda com `AirVelocityY >= 8,5` que pousa na escada quica. **Falta:** `GetStairBodyAt`/`CanBounceAtDirection` exatos e o dano `StairBounceDamage`.
- **Não aplicado**: `Walljump()` existe no AS3 mas nunca é chamado (código morto).
- **Bug corrigido nesta rodada**: a chamada `play(...)` do tiro em paredes ficou dentro de um comentário depois de uma edição da poltrona; restaurada.
- **Posições (translate) do SWF**: `tools/placements.ps1` gera `data/placements.js` (`SF.place[char][ESTADO][peça] = [x,y]` em px). Usado em `src/game.js`: fase de sacar (START_x = corpo `d1` + peça `ANIM` deslocada) e pivô do braço de mira (`shoulderOf`: pistola -3,-12 / fuzil -4,-12 / granada -2,-12). O hack antigo de ox/oy dos START_ só roda se `SF.place` não existir.
- Verificação: pose de mira comparada pixel a pixel com o quadro 26 do SWF renderizado pelo ffdec: pernas idênticas; braço/cabeça estavam 3px à direita e 1px abaixo (corrigido). As pernas do sprite 663 são idênticas ao original (a da frente tem 2px de largura na arte).

## Último trabalho (verificado por teste/print)
- Shotgun: em recarga, Fire não re-saca (60 cliques → 1 saque, 2 tiros).
- Sprites de sacar arma e dive não afundam mais no chão (print confirmado).
- Vida: cheia não pega ao pisar; Baixo+Melee consome sem curar; machucado pega ao pisar.

## Pendências pedidas/identificadas (nada disto foi feito)
1. **TUTORIAL** (mapa `tutorial` existe em `maps_swf.js`, sem script do tutorial) e **STAGE MODE** (desafios) — menu mostra "ainda não implementado".
2. Bônus 1.2× de velocidade de quem ativa o slowmo (original) — não implementado.
3. Opções GRAPHIC/EFFECT QUALITY do SET UP são só cosméticas (não fazem nada).
4. Config avançada de teclas para sprint/dive (original tem "advanced config"; só temos o CONFIG SIMPLE por double-tap).
5. Portais: extrair `TriggerVelocity`/direção por portal do SWF (hoje inferido por facing+velocidade). Se o usuário relatar portal ainda disparando/recusando indevidamente, esse é o ponto.
6. Bug relatado "elevador: personagem fica de costas ao subir": **não reproduzido em elevador vertical**; só tratado o carregamento horizontal. Pedir ao usuário mapa/situação exata se persistir.
7. `w.auto` das armas nunca é usado (todo fogo é rajada `burst` por soltar o gatilho). Se o usuário quiser fogo contínuo segurando, precisa implementar.
8. COOP: convidado escolher personagem; overlay de pausa dos dois lados; TURN; rollback (recusado por ora).
9. Props: mesas/barris sem queda real (sem `vy`), sem empurrar jogadores; dimensões das mesas estimadas.
10. `SF.api.pickups()` e `netDebug()` ficaram expostos na API (úteis para teste; podem permanecer).
11. Seria bom um conjunto de testes headless reaproveitável (hoje são scripts ad hoc colados no console; ver receitas em `01_...md`).

## Pulo (fiel ao original, importado)
- [ORIG] PlayerJumpPower -5 (`jumpPower 8` no port), gravidade 0.6, SEM pulo variavel (PlayerJumpPushActivated e false e nunca ligado; antes o port usava 6.75 = pulo ~1.8x mais alto). Altura 22 px orig (~35 px port), ~17 frames orig (19,8 com gravityScale 0.75; mantido).
- [ORIG] Ar: sem inercia (MovePlayer move RunSpeed direto, para ao soltar), nao vira no ar; sem coyote/buffer; tecla de pulo ainda apertada ao pousar pula de novo (PlayerLands). Pulo drena energia: 5 (12 com sprint) e sem energia cancela o sprint. Voadora: Melee no ar enfileira (QueueJumpKick) e so sai com AirbornTimer >= 2,5 frames (`jumpKickDelay`).
- Nao feito: parede-pulo (Walljump() existe no AS3 mas nunca e chamado = codigo morto), CollisionHead(-2) bloqueando pulo sob teto baixo, pulo herda velocidade de elevador/esteira, +-RunSpeed*0.8 no X ao disparar FallTrigger. Grafo de navegacao dos bots perde algumas arestas (police 225/240 pares, antes 240/240).

## Receitas de teste rápidas
- Dive: dois jogadores, `p1.imm=p2.imm=0`, double-tap direita (keydown, step1, keyup, step1, keydown, step6), depois keydown ArrowDown; checar `p2.grabbed` e depois `p2.fall`.
- Pegar arma por troca: `SF.start` → `step(30)` → `pk.x=p.x; pk.y=p.y` num pickup → ArrowDown + KeyN.
- Auto-drop: `give(p,'pistol'); p.ammo=1;` segurar M ~11 ticks, soltar, `step(21)` → `p.weapon===null`.
- Spawn sem empilhar: `SF.api.pickups().push({x:ponto.x+2,y:ponto.y+1,type:'machete',respawn:900,base:null})` + `step(3600)` e checar duplicatas a <40px.

## Histórico enxuto de bugs graves já resolvidos (para não reintroduzir)
- Imunidade bloqueava a morte por sair do mapa → jogador caía para sempre.
- `Math.random()`→`rand()` em massa: variável local `rng` sombreava a função; tremida de câmera consumia RNG no render → dessincronia online.
- `Math.max(it.ammo,1)` no pickup recarregava arma vazia em loop com auto-drop; dropar sob os pés = re-pegar na hora (corrigido com `respawn:10` e exclusão de arma vazia no auto-pickup).
- Spawn aleatório só considerava pickups próprios (`k.point`) → empilhava com armas largadas.
- Buffer de render fixo 1500×1130 cortava a cena (N/L chega perto de 2×).
- Testes enganosos: `window.__errs` inexistente retorna "0 erros" sempre; use `window.onerror` próprio.

## Caixas penduradas por corda (2026-11-13)
- CRATE_HANGING + CRATE_HANGING_HOLDER do original (Maps.as: Deposito x2, Zona Perigosa x3; Area de Testes tem CRATE_HANGING SEM holder = caixa solta, 1/3 de chance cada). Dados em `data/map_extras.js` (SF.hang.maps + SF.props.crate_hanging); codigo em `src/game.js` (bloco hang*, ganchos hangUpdate/hangDraw/hangBullet/hangBlast/hangKick/hangMelee). `SF.api.hangs()` e `SF.api.bullets()` para teste.
- Original: caixa 27x14 + holder 9x6 presos ao teto por 2 juntas de distancia no mesmo ponto = haste rigida => pendulo fisico (balanco inicial leve, chute 1.6 balanca ~13 graus). Tiro/explosao/golpe no holder (hp 6) corta a corda; a caixa cai e vira caixa pesada comum (prop `crate_hanging`, nao volta a pendurar). Cair em pessoa em pe com v>=2 m/s DERRUBA (Fall) mas NAO da dano: o original nunca seta CrushDamage nas caixas (=0); `SF.hang.crush`/`crush` por caixa permite dano se desejado.
- NAO feito: bots nao conhecem a caixa pendurada no grafo de navegacao (original tinha PathNodes CRATE_n); fogo (chamas) nao corta a corda; caixa pendurada colide por AABB (rotacao so visual); verificado por teste headless (corte por tiro, derrubada, pouso, chute), sem COOP real.

## Lampadas penduradas (2026-11-13)
- `data/anim_decor.js` (`SF.lamps[mapa]` = [teto x, teto y, corda] em px do nivel, extraido dos `AddHangingLamp` do Maps.as; 46 lampadas em 7 mapas). `game.js`: `lampReset/lampUpdate/lampDraw/lampBullet/lampBlast` (pendulo visual, camada dos objetos). Tiro ou explosao quebra (frame 2 de `hanging_lamp` + faiscas); explosao balanca.
- NAO e o corpo fisico do original (sem chute/colisao com jogadores; balanco inicial deterministico, nao Math.random). Ventiladores/nuvens/goteira ja importados por `tools/mapanim.ps1` (outro agente); botoes sao mecanica, nao decoracao.

## Menu inicial: render do fundo (2026-11-13)
- O fundo do menu agora e composto no canvas #mc (drawBackdrop em src/menu.js): demo do jogo em escala 0.95 na posicao (80,110) (MenuMain.StartMenuGame) + grade do bg_noise (textura 2065, 25%, rola -49px em 24 quadros) + tinta MULTIPLY verde->vermelho->azul (ciclo de 900 quadros a 30 fps, valores lidos do EFFECT_MC). Acabou o filtro CSS com hue-rotate. Sinais "COM" ficam acima da tinta (SF.drawDemoOverheads em game.js). Creditos = textos 2079/2080 do SWF (tem o A com trema); painel preto do first_choise inteiro (175px) e balao "New to Superfighters?" so na 1a execucao (localStorage sf_html5_started, como o SharedObject startedBefore); first_choise segue visivel sob MODE e SET UP.
- NAO verificado/pendente: comparacao pixel a pixel das telas players/nobots/bots/map/setup/keys com o original (o painel do navegador pausou a animacao), e a tela MODE/SET UP apos a mudanca "first_choise visivel por baixo" so foi conferida pelo codigo e por um print do original.
