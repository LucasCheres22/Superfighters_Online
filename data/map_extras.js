// EXTRAS DE MAPA (dados que NAO vem de maps_swf.js; carregado depois de weapons.js). Nao regenere maps*.js por causa disto.
// CAIXAS GRANDES PENDURADAS (CRATE_HANGING + CRATE_HANGING_HOLDER do original). Fonte: Maps.as (GenerateMapStorage / GenerateMapHazardous)
// e MapPremadeItems.as. Unidades: px do port (= px do nivel do original x1.6).
//  - caixa: caixa 27x14 (x1.6 = 43.2x22.4), madeira (densidade 3 -> massa ~1.26) + suporte (holder) 9x6 colado no topo (massa ~0.18), BodyData
//    indestrutivel, Kickable, CanGibb. O suporte (hp 6, so colide com o chao) e preso ao teto por DUAS juntas de distancia (a 1 px uma da
//    outra) ancoradas no mesmo ponto: na pratica uma haste rigida => PENDULO FISICO (a corda gira junto com a caixa).
//  - rope = distancia (px do port) do ponto de ancoragem no teto ate o CENTRO da caixa (= (y_caixa - y_ancora) do original x1.6).
//  - Tirar o suporte (tiro/explosao/golpe) corta a corda: a caixa cai (gravidade 10 m/s2, passo 1/30) e vira uma caixa pesada comum.
//  - crush: dano de esmagamento. O original NUNCA define CrushDamage nas caixas (=0): cair em cima de alguem so DERRUBA (Fall()), sem tirar vida.
//    Mude aqui (por mapa/caixa) se quiser que tire vida.
window.SF = window.SF || {};
SF.props = SF.props || {};
// caixa grande ja solta/sem corda (ex.: Area de Testes: CRATE_HANGING sem holder) e a caixa depois de cair
// GELADEIRA = a caixa grande (crate_hanging). Soco empurra; cai de cima e derruba quem esta de pe (sem dano);
// quem ja esta caido e tocado por ela e esmagado (morte). geladeira: true liga a regra de esmagamento (game.js geladeiraCrush).
SF.props.crate_hanging = { sprite: "crate_hanging", w: 43, h: 22, hp: 1e9, push: true, indestructible: true, geladeira: true, debris: [] };
// AMBIENTE DE TESTES DA GELADEIRA (mapa "geladeira_teste"): chao, paredes, uma geladeira pendurada (corda) e
// geladeiras soltas no chao. Use para testar: soco (empurra), queda de cima (derruba), toque no caido (esmaga).
SF.maps = SF.maps || {};
SF.maps.geladeira_teste = {
  name: "Teste da geladeira", width: 960, height: 540, bg: "#2b2f36", floorY: 500,
  platforms: [[0, 500, 960, 40], [0, 0, 16, 540], [944, 0, 16, 540], [380, 360, 200, 14]],
  spawns: [[120, 460], [840, 460], [420, 300], [600, 460]],
  weaponSpawns: [],
  decor: [["CRATE_HANGING", 480, 200]],                 // geladeira pendurada (a corda sai de y 80)
  props: [["crate_hanging", 250, 500], ["crate_hanging", 700, 500]] // geladeiras soltas no chao
};
SF.hang = {
  w: 43.2, h: 22.4,            // caixa 27x14 x1.6
  attach: 17.6,                // do centro da caixa ate o topo do holder (8 + 3 px do original) = onde a corda prende
  holderOff: 12.8,             // centro do holder acima do centro da caixa (8 px do original)
  mass: 1.44,                  // caixa + holder (kg do Box2D do original)
  holderHp: 6,                 // hp do CRATE_HANGING_HOLDER
  crush: 0,                    // dano de esmagamento (original: 0 - so derruba)
  maps: {
    // x,y = centro da caixa (igual ao decor de maps_swf.js); rope = ancora->centro
    storage:   [ { x: 232,   y: 251.2, rope: 128 },    // crate_hanging_1 (168,131), ancora y=51
                 { x: 448,   y: 193.6, rope: 70.4 } ], // crate_hanging_2 (303,95),  ancora y=51
    hazardous: [ { x: 521.6, y: 288,   rope: 153.6 },  // crate_hanging_1 (326,130), ancora y=34
                 { x: 620.8, y: 390.4, rope: 105.6 },  // crate_hanging_2 (388,194), ancora y=128
                 { x: 390.4, y: 409.6, rope: 115.2 } ], // crate_hanging_3 (244,206), ancora y=134
    geladeira_teste: [ { x: 480, y: 200, rope: 120 } ]  // ambiente de testes (SF.maps.geladeira_teste)
  }
};
