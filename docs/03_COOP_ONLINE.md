# COOP ONLINE (não existe no original — adição pedida pelo usuário)

## Arquitetura
- **P2P WebRTC via PeerJS** (`https://cdn.jsdelivr.net/npm/peerjs@1.5.4`, `defer`; servidor público grátis da PeerJS só para sinalização). Requer internet; offline o botão avisa. Sem TURN → pode falhar em NAT/firewall restritivo.
- **Lockstep determinístico**: os dois PCs simulam TUDO; só trocam teclas por tick (`SF.net.sendInput(tick, k)`).
- Escolhas do usuário: P2P/WebRTC + lockstep (não host autoritativo, não rollback). Rollback GGPO foi oferecido e recusado (ficou o atraso adaptativo).

## Fluxo
1. Menu → botão COOP ONLINE → HOSPEDAR (código de 5 chars, prefixo `sfhtml5-`) / ENTRAR COM CODIGO.
2. Após conectar, só o anfitrião percorre as telas normais (2 players: plate P1 = anfitrião, P2 = convidado; anfitrião escolhe os dois personagens). `launch()` envia `lastGame` (roster com `net:'host'|'guest'`) + seed (`SF.net.sendStart`); cada lado resolve `net` para `'local'|'remote'` e chama `SF.start` com `net:true, seed`.
3. Convidado só espera (`SF.net.onStart`); `onlineGuest=true` esconde "Jogar de novo".

## Núcleo (game.js)
- `reset()` faz `seedRng(cfg.seed ?? aleatório)` e `netActive=!!cfg.net`.
- `virtualKeys(p)`: em net, humano usa `netLocalIn[tick]`/`netRemoteIn[tick]` (buffers), nunca teclado ao vivo dentro de `update()`.
- `netCapture()` captura/envia a tecla local por tick real; `netTickReady()` exige `captureTick - T >= netDelay()` e `netRemoteIn[T]`; `netTick()` = capture + (update se pronto). `frame()` e `step()` usam `netTick()`.
- **Atraso adaptativo**: `net.js` faz ping/pong (a cada 2 s; `SF.net.rtt()` = mínimo das últimas 6 amostras); `netDelay()=clamp(ceil((rtt/2+25ms)/16.67), 2, 30)` ticks. Cada lado ajusta o seu independentemente (não afeta determinismo). Conexão local fica em 2 ticks (~33 ms).
- Se a rede atrasar mais que o buffer, o jogo **congela** esperando (não desincroniza). `NET_MAXLEAD=180`.
- Queda de conexão: `SF.net.onClose` → pausa + `SF.onNetDrop` (overlay "CONEXAO PERDIDA").
- `net.js` aceita múltiplos callbacks (`onInput`, `onClose` são listas — menu.js e game.js usam ambos).

## Regras para não quebrar o determinismo
- Simulação só com `rand()`; nada de `Math.random()`, `Date.now()`, `performance.now()` dentro de `update()`.
- Nada que dependa de frame rate real (render) pode consumir `rand()`.
- Qualquer estado novo por jogador deve entrar no reset/respawn.
- Teste padrão: dois tabs (host `SF.net.host`, guest `SF.net.join`), `onStart` do guest, `SF.start` do host, `step()` alternado nos dois e comparar `players()` (x,y,health) no MESMO tick — deve ser idêntico bit a bit. Cuidado: aba fronteada também roda rAF e avança ticks sozinha.

## Limitações conhecidas
- Pausa (Esc) congela os dois mas só quem apertou vê o overlay.
- Convidado não escolhe o próprio personagem/time.
- Queda no meio da partida não retoma.
- Teste visual de movimento em tempo real nas duas abas não foi feito (painel oculto); lógica validada por `step()`.
- Hospedar em site público (ex.: Vercel) é tecnicamente trivial (estático, HTTPS ok), mas o `LEIAME` diz que os assets são da Mythologic e "não redistribua" — decisão do usuário (avisado).
