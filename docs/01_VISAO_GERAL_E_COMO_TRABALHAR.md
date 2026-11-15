# Superfighters HTML5 — Visão geral e como trabalhar (leia primeiro)

## O que é o projeto
Port em HTML5 Canvas (JS puro, sem framework, roda em `file://`) do jogo Flash **Superfighters** (Mythologic), feito para ser fiel ao original e customizável (mods). O usuário fala **português** e quer **fidelidade ao original**: valores, controles, menus e animações devem vir do SWF/AS3, não de aproximações. Quando algo NÃO existe no original (recuo do atirador, auto-drop de arma vazia, spawn seguro, COOP ONLINE, mesas empurráveis...), deixar isso claro em comentário/LEIAME e manter configurável.

## Caminhos
- Projeto: `C:\Users\Lucas Cheres\Documents\Superfighters\scratch-2026-11-07-d31a3a\superfighters-html5\`
- AS3 decompilado (referência): `...\scratch-2026-11-07-d31a3a\export\scripts\Code\` (ex.: `Data\Players\Player.as`, `PlayerState.as`, `Handler\Portals.as`, `Handler\WeaponSpawn.as`, `Handler\PlayersKeeper.as`)
- SWF original: `C:\Users\Lucas Cheres\Downloads\575163_Superfighters.swf`
- Ferramentas: `...\scratch-2026-11-07-d31a3a\tools\` (ffdec+JRE; `tools/swfdump.js` lê display lists do SWF; `tools/convmaps.ps1` converte mapas; `tools/embed_images.ps1` gera `data/images.js`)
- Documentação do usuário já existente: `LEIAME.txt` (mantenha atualizado a cada mudança de mecânica).

## Arquivos do jogo
- `index.html` — carrega scripts nesta ordem: PeerJS (CDN, `defer`), `src/net.js`, `data/*.js`, `mods/load.js`, `src/game.js`, `src/menu.js`.
- `src/game.js` (~1500 linhas) — motor inteiro: física, combate, bots/IA, props, render, câmera, lockstep online.
- `src/menu.js` — menus recriados do original (canvas `#mc`, arte = PNGs do SWF em `assets/menu`), mais o fluxo COOP ONLINE (overlay HTML).
- `src/net.js` — transporte WebRTC/PeerJS (`SF.net`).
- `data/weapons.js` — **todos os valores ajustáveis**: armas, itens, `SF.melee`, `SF.player`, `SF.props`, `SF.explosion`, `SF.fire`, `SF.slowmo`, `SF.grenade`.
- `data/sprites.js` — gerado do SWF: `SF.sprites[id]={w,h,ox,oy,n}`, `SF.spriteAlias[nome]=id`, `SF.chars[personagem][ANIM]={ANIM:id}`.
- `data/maps.js` (3 mapas antigos manuais: warehouse/rooftop/bunker, usam `weaponSpawns`) e `data/maps_swf.js` (7 mapas do SWF: tutorial, storage "Deposito", rooftops "Telhados", police "Delegacia", hazardous "Zona Perigosa", backstreets "Becos", testing, survival01; usam `spawnPoints` + spawn aleatório).
- `mods/` — `load.js` + `exemplo.js`.

## Como testar (IMPORTANTE — armadilhas aprendidas)
Servidor: `mcp__Claude_Browser__preview_start({name:"sf-html5"})` (porta 8080, `.claude/launch.json`). Aba "seed".
1. **O painel do navegador costuma ficar "hidden" → `requestAnimationFrame` pausa.** Nunca dependa de tempo real. Use `SF.api.step(n)` (simulação headless, passa pelo mesmo caminho do lockstep quando `netActive`) e `SF.api.draw()` + screenshot para visual.
2. Input: dispare teclas reais com `dispatchEvent(new KeyboardEvent('keydown',{code:'KeyM',bubbles:true}))` e `step()`; nunca chame lógica interna de input. Keydown+keyup no mesmo tick é invisível ao jogo (lê estado).
3. Para ver o jogo no screenshot quando iniciou por console: `document.getElementById('mc').style.display='none'; document.getElementById('c').style.filter='none'; SF.api.draw()` (senão o menu tinge a tela).
4. **Imunidade de 48 ticks no início da partida** (`p.imm=48`): zere `p.imm=0` em testes de dano/derrubada senão dá falso negativo.
5. Teleportar jogador (`p.x/p.y`) no meio do ar → `onGround=false` e várias ações (pegar arma, melee) ficam bloqueadas. Deixe cair com `step(30)` ou reposicione o item (`SF.api.pickups()[i].x=p.x`).
6. Mecânica de tiro: Fire (M) **segura = saca/mira, SOLTAR = atira** (rajada `burst`); `w.auto` NÃO é usado no código. Esperar `drawFrames` antes de soltar.
7. `read_console_messages` pode devolver erros **velhos** (buffer não limpa em navegação). Para validar erro real use `window.onerror=function(m,s,l){(window.__err=window.__err||[]).push(m+'@'+l)}` e leia `window.__err`; ou feche a aba e abra outra.
8. `node --check src\game.js` após cada edição (PowerShell: rode cada checagem em linha separada e leia `$LASTEXITCODE`).
9. Regressão padrão: 3000–4000 ticks de 3–4 bots difíceis em `rooftops`/`hazardous` com `window.onerror`, esperar nenhum erro.
10. Ao ler `data/sprites.js` NUNCA imprima o arquivo/erro inteiro (linhas gigantes). Use Grep com `-o` e padrões estreitos (ex. `"203":\{[^}]+\}`).

## API de console (SF.api)
`step(n)`, `players()`, `props()`, `pickups()`, `give(p,'rifle')`, `explode`, `throwGrenade`, `say`, `play`, `draw()`, `cam()`, `slow()`, `navReport()`, `netDebug()` (ativo, tick, captureTick, rtt, delayTicks). `SF.start(cfg)`/`SF.stop()`; cfg: `{demo, roster:[{bot,slot,char,team,diff,net}], map, mode:'dm'|'tdm'|'survival', kills, music, sfxVol, net, seed}`.

## Preferências do usuário (resumo)
Português; fidelidade ao original; respostas curtas; relatar só o que foi verificado; quando não conseguir reproduzir um bug, dizer isso. Som do navegador de teste deve ficar baixo (usar `music:false, sfxVol:0` nos testes).
