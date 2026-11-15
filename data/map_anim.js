// GERADO por tools/mapanim.ps1 - pecas animadas da arte dos mapas (filhos do MovieClip "levels" do SWF). Coordenadas em px do
// NIVEL original (o jogo converte: mundo = art + (px - box) * 1.6). Chave = numero do quadro de "levels" (level_N.png).
window.SF = window.SF || {};
SF.mapAnim = {
  box: [-292, -201],            // canto da caixa do export de "levels" (level_N.png cobre x -292..1027, y -201..509)
  fan: { src: "assets/maps/anim/fan.png", o: [-5.5,-5.5], step: 22.5 },            // gira 22.5 graus por quadro original (16 passos)
  clouds: { src: "assets/maps/anim/clouds.png", w: 795, h: 151, tile: 265, frames: 120, oy: -0.5 },  // rola 1 ladrilho (265 px) a cada 120 quadros
  pour: { src: ["assets/maps/anim/pour_1.png", "assets/maps/anim/pour_2.png", "assets/maps/anim/pour_3.png"], o: [[0,0], [0,0], [0,0]], hold: 2,
          grid: [[0,0],[48,0],[96.5,0],[0,16.5],[48,16.5],[96.5,16.5],[0,32.5],[48,32.5],[96.5,32.5]] },
  btn: { src: ["assets/maps/anim/btn_1.png", "assets/maps/anim/btn_2.png"], o: [[-2,-3.5], [-2,-3.5]] },
  levels: {
    2:  { fans: [[365,90.9],[401,90.9],[437,90.9]] },
    3:  { back: "assets/maps/back_3.png", clouds: [-110,-36], fans: [[81,228],[117,228],[153,228]] },
    4:  { back: "assets/maps/back_4.png", clouds: [54.05,69], fans: [[581.95,314],[615.95,314],[649.95,314],[683.95,314]] },
    5:  { fans: [[48,153],[84,153],[120,153],[156,153]], pour: [225.35,271.35] },
    6:  { fans: [[355,98],[386,98],[419,98]] },
    7:  { fans: [[265,96],[301,96],[338,96],[374,96]], btns: [{ name: "btn_left", at: [284.5,155], flip: 1 }, { name: "btn_right", at: [354.5,155], flip: -1 }] },
    10: { fans: [[265,96],[301,96],[338,96],[374,96]], btns: [{ name: "btn_left", at: [284.5,155], flip: 1 }, { name: "btn_right", at: [354.5,155], flip: -1 }] }
  }
};