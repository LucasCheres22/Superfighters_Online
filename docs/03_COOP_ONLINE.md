# ONLINE (versus ate 8 jogadores) - nao existe no original; adicao pedida pelo usuario

## Arquitetura
- **Relay WebSocket** (`relay/server.js`, Node + `ws`): salas por codigo, ate 8 vagas (vaga 0 = anfitriao). So repassa mensagens; NAO simula o jogo.
- **Cliente** (`src/net.js`): `SF.net` (host/join/send/sendTo/sendInput/onMsg/onInput/onPeer/onClose/rtt). A URL do relay vem de `window.SF_RELAY_URL` (em `index.html`).
- **Lockstep deterministico** (`src/game.js`): TODOS os PCs simulam a partida inteira; so trocam as teclas de cada tick. Cada PC executa o tick T so quando tem o input de todos os jogadores para o T.
- Hospedagem atual: site na Vercel; relay rodando no PC do anfitriao atras de um tunel ngrok (`relay/iniciar-jogo-online.bat`, regiao `sa`). O Render (`render.yaml`) tambem serve, mas fica longe do Brasil (200-600 ms).

## Fluxo (menu.js)
1. COOP ONLINE -> HOSPEDAR PARTIDA (codigo de 6 chars) / ENTRAR COM CODIGO.
2. SALA (lista de vagas; anfitriao aperta INICIAR com 2+ jogadores) -> ESCOLHA (cada um escolhe o personagem; o anfitriao escolhe fase e pontos) -> JOGAR (so o anfitriao) -> partida.
3. Fim: o anfitriao pode VOLTAR A SALA e os convidados seguem. Quem sai no meio derruba a partida dos outros ("CONEXAO PERDIDA"); anfitriao sair encerra a sala.
4. Limites: 1 jogador por PC, sem bots, modo fixo "dm", nao entra no meio da partida (o relay trava a sala durante a partida).

## Lockstep (game.js) - como funciona e por que travava
- `netCapture()` mantem **exatamente `netDelay()` ticks de input local ja enviados a frente** da simulacao. Nunca captura alem disso.
- `netStep()`: captura + simula SO se tem o input de todas as vagas remotas (`netRemoteSeats`, `netRemoteIn[vaga][tick]`). Devolve se simulou.
- `frame()`: se falta input do outro PC, **espera sem gastar o tempo acumulado** (`break`) e depois corre pra alcancar, ate `NET_CATCHUP_MS` (250 ms). Pausa/fim zera o acumulador.
- `netDelay() = clamp(ceil((rtt/2 + 30 ms)/16.67), 3, 30)` ticks; `rtt` = percentil 75 das ultimas 8 amostras do pior par (`net.js`). Cada PC ajusta o seu independentemente.
- **Bug que fazia o jogo "todo travado" (corrigido):** a captura rodava a cada frame mesmo com a simulacao parada esperando a rede, e so parava em 180 ticks. Resultado: ate **3 s de atraso entre apertar a tecla e ver o efeito** (`captureTick - tick = 181`) e o tempo de espera era descartado (camera lenta). Agora o atraso de comando e fixo (`netDelay`, ~50-150 ms) e a espera e recuperada.
- Diagnostico: `SF.api.netDebug()` no console -> `tick`, `lead` (deve ser ~`delayTicks`, nunca perto de 180), `rtt`, `delayTicks`, `netReady`, `remoteNext` (`[vaga, tem input do proximo tick, quantos guardados, maior tick]`), `desynced`.
- **Teste em duas abas do mesmo navegador:** a aba em segundo plano pausa o `requestAnimationFrame`; o lockstep anda na velocidade da aba mais lenta, entao o jogo trava. Use duas JANELAS lado a lado (as duas visiveis), dois navegadores, ou dois PCs.

## Deteccao de dessincronia
- A cada `NET_HASH_EVERY` (60) ticks cada PC manda `{type:"hash", t, h}` (hash de `rngState`, tick, x/y/vida/morto de cada jogador) e compara com o dos outros. Se diferir: `SF.onNetDesync(vaga, tick)` -> pausa, overlay "JOGO FORA DE SINCRONIA" e botao Menu principal. Nada de continuar "jogando" em partidas diferentes sem avisar.

## Regras para nao quebrar o determinismo
- Simulacao so com `rand()` (seedada em `reset()` pelo `seed` do anfitriao); nada de `Math.random()`, `Date.now()`, `performance.now()` dentro de `update()`.
- Trigonometria so com `dsin`/`dcos`/`datan2`/`dhypot` (game.js, logo apos `seedRng`), nunca `Math.sin/cos/atan2/hypot`: motores de navegador diferentes podem arredondar o ultimo bit de forma diferente. (Benchmark: custa o mesmo que `Math.sin`.)
- Nada que dependa de frame rate real (render) pode consumir `rand()`.
- Todo input passa por `netKeys()` (so booleanos + `mouseAim` finito, `-0` vira `0`): o jogador local usa o MESMO objeto normalizado que os remotos reconstroem do JSON.
- Qualquer estado novo por jogador deve entrar no reset/respawn.

## Seguranca (revisao de 2026-11-15)
O relay e publico: qualquer um abre um WebSocket. Falhas encontradas e provadas contra o relay antigo (script de ataque), e como ficou:
| Falha (antes) | Efeito | Correcao |
|---|---|---|
| Mensagem maior que o limite -> `RangeError` sem tratador de `error` | **derrubava o processo do relay** (todas as salas) com 1 mensagem | `ws.on("error")`, `maxPayload` 8 KB, `uncaughtException` logado |
| URL malformada (`GET //[`) -> `new URL` lanca | **derrubava o processo** | `try/catch` + resposta de erro |
| Convidado enviava `start`/`lobby` como se fosse o anfitriao | forcar partida/voltar pra sala nos outros | relay descarta `start`/`lobby` que nao vem da vaga 0; cliente tambem confere `from === 0` |
| Sem limite de taxa | inundacao/amplificacao (1 msg -> 7 destinos) | token bucket por conexao (150 msg/s, 32 KB/s) + expulsao de quem insiste |
| Forca bruta de codigos sem bloqueio | achar e entrar em salas alheias | 12 falhas/min por IP -> bloqueio de 5 min; codigo de 6 chars (1 bi) sorteado com `crypto` |
| Qualquer site podia conectar (sem Origin) | outros sites usando o relay / CSWSH | lista de origens: `https://superfighters*.vercel.app`, localhost e `ALLOWED_ORIGINS` |
| Salas e conexoes ilimitadas por IP | esgotar memoria/CPU | max 16 conexoes, 4 salas, 90 conexoes/min por IP; 200 salas no total |
| Tipos/formatos livres | lixo repassado, memoria no cliente | so `input/ping/pong/hash/pick/lobby/start` com formato validado |
| Entrar no meio da partida | vaga fantasma no lockstep | sala travada apos `start`, destravada por `lobby` |
| Pagina de saude mostrava nº de salas | vazamento | resposta fixa "ok" |
Cliente:
- Input remoto: so de vaga que e jogador remoto, tick inteiro entre `tick+1` e `tick+150` (descarta o resto, sem crescer memoria), 1o valor vale, normalizado por `netKeys()`.
- `menu.js`: `lobby`/`pick`/`start` so com valores da lista (personagem, fase, pontos); `start` e reconstruido (`cleanMatch`): nomes, modo e bots vem do codigo local, nunca do texto que chegou; nomes escapados no placar (`esc`).
- Limite inerente do lockstep: o PC de cada jogador ve tudo e um cliente modificado pode trapacear (ex.: macros). O hash detecta divergencia, nao trapaca "coerente".
- Atras de proxy (ngrok/Render) o IP real vem de `X-Forwarded-For`: `TRUST_PROXY_HOPS` (padrao 1 = o ultimo valor da lista; o ngrok acrescenta o IP real). Verificado no inspetor do ngrok. Se usar outro proxy, ajuste ou os limites por IP vao tratar todos como um so.
- Variaveis do relay: `PORT`, `ALLOWED_ORIGINS` (lista separada por virgula), `TRUST_PROXY_HOPS`, `MAX_ROOMS`, `MAX_CONN_PER_IP`, `MAX_ROOMS_PER_IP`.
- Vercel (`vercel.json`): `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`. CSP nao foi aplicada (o `index.html` tem script inline e carrega muitos assets; quebraria o jogo sem teste real).

## Testes feitos (2026-11-15)
- Relay (scripts de ataque antes/depois): oito vetores; antes 2 derrubavam o processo; depois todos barrados e o relay continua vivo. Fluxo normal: 8 jogadores, 9o recebe `sala_cheia`, 210/210 inputs entregues, `sala_em_partida`, mensagens invalidas descartadas.
- Lockstep (2 abas + relay local, teclas aleatorias com combate): 1800 ticks, 0 divergencias, `lead` max 3 (antes 181). Com 3 jogadores: 1500 ticks por par, 0 divergencias.
- Convidado parado: o anfitriao avanca no maximo `delay` ticks e para (nao acumula).
- Laco real (`frame()` do host + convidado travando 120 ms por segundo): 58,8 ticks/s, `lead` fixo em 3, sem desync.
- Input forjado (t absurdo, antigo, nao inteiro, `__proto__`, `k` com lixo, NaN): so o t valido foi guardado, normalizado; `Object.prototype` limpo.
- Dessincronia provocada (P1 +5 px so no anfitriao): os dois lados mostraram "JOGO FORA DE SINCRONIA" no tick 1980.
- `start` forjado no convidado (de outra vaga, personagem/mapa/pontos/seed invalidos, nao me inclui, vaga duplicada, 1 jogador): todos ignorados; campos estranhos (nome com HTML, modo, bots) normalizados.
- Nao testado: dois PCs reais em redes diferentes com o relay corrigido; 8 jogadores com o lockstep novo (so o relay foi testado com 8; o lockstep com 3); botao VOLTAR A SALA com varios convidados.
