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
- Trigonometria só com `dsin`/`dcos`/`datan2`/`dhypot` (game.js, após `seedRng`), nunca `Math.sin/cos/atan2/hypot`: os motores de navegador podem arredondar o último bit de forma diferente.
- Nada que dependa de frame rate real (render) pode consumir `rand()`.
- Qualquer estado novo por jogador deve entrar no reset/respawn.
- Teste padrão: dois tabs (host `SF.net.host`, guest `SF.net.join`), `onStart` do guest, `SF.start` do host, `step()` alternado nos dois e comparar `players()` (x,y,health) no MESMO tick — deve ser idêntico bit a bit. Cuidado: aba fronteada também roda rAF e avança ticks sozinha.

## Limitações conhecidas
- Pausa (Esc) congela os dois mas só quem apertou vê o overlay.
- Convidado não escolhe o próprio personagem/time.
- Queda no meio da partida não retoma.
- Teste visual de movimento em tempo real nas duas abas não foi feito (painel oculto); lógica validada por `step()`.
- Hospedar em site público (ex.: Vercel) é tecnicamente trivial (estático, HTTPS ok), mas o `LEIAME` diz que os assets são da Mythologic e "não redistribua" — decisão do usuário (avisado).

## Teste de sincronizacao (2026-11-15)
- Duas abas (host e convidado) no mesmo PC, sinalizacao PeerJS publica, seed 77, entradas de teclado diferentes nos dois lados.
- Resultado: conexao P2P abriu (RTT ~0.6 ms, local). Estados do P1 e P2 identicos bit a bit nos ticks comparados (ex.: 1532, 1534, ..., 1544).
- Armadilha achada no teste: se o convidado comeca DEPOIS que o host ja enviou teclas, as teclas antigas sao descartadas e o convidado fica parado no tick 0. No fluxo real do menu isso nao acontece (host manda `start` antes das teclas, canal ordenado).
- Ainda falta: teste entre dois PCs em redes diferentes (NAT) - o STUN publico cobre a maioria, mas sem TURN pode falhar em redes restritivas.

## Deploy na Vercel (2026-11-15)
- Projeto `superfighters` na conta lucascheres22 (time lucas-cheres-projects, plano Hobby). Producao: https://superfighters-omega.vercel.app
- Verificado no navegador: menu carrega, SF e PeerJS carregam, sem erros no console; criacao de sala (HOSPEDAR) funciona em HTTPS (codigo gerado).
- Ainda nao testado: entrar com o codigo a partir de outro PC/rede.

## Relay para o Render (2026-11-15)
- Pasta `relay/` (server.js + package.json, depende de `ws`). Salas por codigo (`?room=CODE&role=host|guest`); repassa mensagens do outro lado; health check em `/`.
- `src/net.js`: se `window.SF_RELAY_URL` estiver definido (ex.: `wss://superfighters-relay.onrender.com`), host/join usam o relay (WebSocket) com a mesma interface de conexao; senao segue o PeerJS (P2P).
- `render.yaml` (raiz do projeto): blueprint do Render com `rootDir: relay`, plano free.
- Teste local (2 abas, relay em ws://localhost:8787): pareamento ok, RTT medido pelo relay, lockstep identico nos ticks 260-532 (sem combate).
- Correcoes no caminho do online: (1) boot do menu nao inicia a demonstracao quando ja ha conexao; (2) SF.hideMenu exposto para testes (o menu aberto engole teclas e pode iniciar uma partida local).

## Desync entre PCs (2026-11-15)
- Causa provável: `Math.sin/cos/atan2/hypot` têm precisão definida pela implementação (o padrão JS só exige aproximação). Chrome, Firefox e Safari (ou versões/CPUs diferentes) podem devolver o último bit diferente. A simulação usa essas funções em ~100 pontos de `game.js`, então os estados divergem com o tempo mesmo com mesma semente e mesmas teclas. Duas abas no mesmo navegador não reproduzem isso.
- Correção: `game.js` usa `dsin/dcos/datan2/dhypot`, feitas só com `+ - * /` e `Math.sqrt` (IEEE 754, idênticas em qualquer motor). Precisão medida no Node: erro < 3e-14 em seno/cosseno (entradas ±100) e ~1e-15 em atan2.
- Teste (mesma máquina e navegador, servidor local + relay no Render, 2 abas, teclas aleatórias com combate): 3965 ticks comparados pelo convidado, 0 divergências (hash das posições e vidas de todos os jogadores em cada tick). Antes da correção, esse teste não tinha como acusar o problema.
- Armadilha de teste achada: `SF.start` faz merge com o `cfg` anterior. Se o `start` não traz o `map`/`roster` completos, cada lado usa o valor residual (no teste, o mapa do demo) e diverge já no tick 1. O menu manda o `lastGame` completo, então isso não acontece no fluxo real.
- Não verificado: divergência entre dois navegadores/PCs diferentes. Só dá para confirmar com dois PCs reais jogando.
- Ainda nao validado: dessincronia relatada entre dois PCs reais (possivel causa: diferencas de motor/CPU em Math.sin/cos ou latencia). Proximo teste: partida com combate em dois PCs diferentes.

## Versus online ate 8 jogadores (2026-11-15)
- Relay (`relay/server.js`): sala com ate 8 vagas (vaga 0 = anfitriao; convidados entram nas vagas 1 a 7). Toda mensagem recebe `from` (vaga de quem mandou). Com `to` (numero) vai so pra essa vaga; sem `to` vai pra todos. Mensagens `sys` so vem do servidor (`welcome`, `peer_join`, `peer_left`, `room_closed`, `erro`).
- Transporte (`src/net.js`): so relay (o P2P/PeerJS foi removido, nao suporta 8 jogadores). `SF.net.seats()`, `send`, `sendTo`, `sendInput`, `sendStart`, `onMsg`, `onInput`, `onPeer`, `onClose`.
- Fluxo (`src/menu.js`): HOSPEDAR / ENTRAR COM CODIGO -> SALA (lista de vagas; o anfitriao aperta INICIAR com 2+ jogadores) -> ESCOLHA (cada um escolhe o personagem; o anfitriao escolhe fase e pontos pra vencer) -> JOGAR (so o anfitriao) -> partida. Ao fim, o anfitriao pode voltar pra sala e os convidados seguem.
- Lockstep (`src/game.js`): cada PC espera o input de TODAS as vagas remotas (`netRemoteSeats`, `netRemoteIn[vaga][tick]`). O jogador local usa sempre o teclado 1 (`readLocalKeys`), e o passageiro de foguete/poltrona le o input do dono pelo `virtualKeys`.
- Saida no meio da partida: quem sobra pausa e ve "CONEXAO PERDIDA"; o anfitriao sair encerra a sala pra todos.
- Limitacoes: 1 jogador por PC; so humanos (sem bots no online); modo fixo "dm" (todos contra todos); o sinal de HUD so tem arte para P1 e P2 (vagas 3 a 8 usam o sinal de P2); nao entra no meio da partida.
- Testado com relay local e 2, 4 e 8 abas no mesmo navegador: 9a entrada recusada ("sala cheia"); 8 jogadores com ~4000 ticks comparados nos convidados e zero divergencias, com combate; saida do anfitriao -> "SALA ENCERRADA" nos convidados; saida de convidado na partida -> "CONEXAO PERDIDA" no anfitriao.
- Nao testado: dois PCs reais pelo relay do Render; o botao VOLTAR A SALA depois do fim da partida (UI nao exercitada).
- Deploy: o relay do Render precisa ser atualizado (push do repositorio) ANTES do site na Vercel, senao o protocolo novo nao conversa com o relay antigo.