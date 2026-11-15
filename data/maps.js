// Mapas: plataformas retangulares [x, y, largura, altura]. spawns: pontos de nascimento.
// weaponSpawns: onde as armas aparecem. MODS: adicione mapas novos em SF.maps.
window.SF = window.SF || {};
SF.maps = {
  warehouse: {
    name: "Armazem", width: 960, height: 540, bg: "#2b2f36", floorY: 500,
    platforms: [
      [0, 500, 960, 40],      // chao
      [0, 0, 16, 540], [944, 0, 16, 540], // paredes
      [120, 400, 200, 14], [640, 400, 200, 14],
      [380, 320, 200, 14],
      [40, 270, 160, 14], [760, 270, 160, 14],
      [300, 190, 360, 14]
    ],
    spawns: [[60, 460], [880, 460], [200, 360], [740, 360], [470, 280]],
    weaponSpawns: [[480, 290, "magnum"], [100, 235, "shotgun"], [850, 235, "rifle"], [480, 155, "sniper"], [200, 370, "uzi"], [740, 370, "pistol"],
      [440, 490, "bazooka"], [520, 490, "grenades"], [330, 175, "medkit"], [630, 175, "medkit"], [60, 490, "grenades"], [900, 490, "grenades"]],
    // props: [tipo, x (centro), y (base)]
    props: [["crate", 300, 500], ["crate", 326, 500], ["crate", 313, 474], ["barrel", 650, 500], ["barrel", 675, 500], ["barrel", 220, 400],
            ["crate", 760, 270], ["barrel", 500, 320], ["crate", 120, 270]]
  },
  // Mapas abaixo: layouts originais deste port (os 8 mapas do SWF ainda nao foram convertidos).
  rooftop: {
    name: "Telhado", width: 960, height: 540, bg: "#1f2a3a", floorY: 480,
    platforms: [
      [0, 480, 300, 60], [660, 480, 300, 60],           // chao com buraco no meio
      [0, 0, 16, 540], [944, 0, 16, 540],
      [330, 400, 300, 14], [100, 330, 180, 14], [680, 330, 180, 14],
      [420, 250, 120, 14], [40, 200, 140, 14], [780, 200, 140, 14]
    ],
    spawns: [[60, 440], [900, 440], [150, 290], [800, 290], [480, 210]],
    weaponSpawns: [[480, 380, "shotgun"], [190, 310, "rifle"], [770, 310, "uzi"], [480, 230, "sniper"], [110, 180, "magnum"], [850, 180, "bazooka"],
      [250, 460, "grenades"], [710, 460, "grenades"], [480, 380, "medkit"]],
    props: [["crate", 250, 480], ["crate", 276, 480], ["barrel", 700, 480], ["barrel", 150, 330], ["crate", 800, 330]]
  },
  bunker: {
    name: "Bunker", width: 960, height: 540, bg: "#2a2622", floorY: 500,
    platforms: [
      [0, 500, 960, 40], [0, 0, 960, 16], [0, 0, 16, 540], [944, 0, 16, 540],
      [440, 440, 80, 60],                                  // bloco central
      [200, 430, 140, 14], [620, 430, 140, 14], [380, 360, 200, 14],
      [60, 330, 120, 14], [780, 330, 120, 14], [250, 260, 120, 14], [590, 260, 120, 14],
      [400, 180, 160, 14], [40, 190, 110, 14], [810, 190, 110, 14]
    ],
    spawns: [[60, 460], [900, 460], [270, 400], [690, 400], [120, 300], [840, 300]],
    weaponSpawns: [[480, 340, "bazooka"], [270, 240, "shotgun"], [680, 240, "magnum"], [480, 160, "rifle"], [100, 170, "uzi"], [860, 170, "sniper"],
      [480, 420, "medkit"], [110, 310, "grenades"], [840, 310, "grenades"], [300, 480, "grenades"]],
    props: [["barrel", 400, 500], ["barrel", 560, 500], ["crate", 800, 500], ["crate", 160, 500], ["crate", 826, 500], ["barrel", 700, 430], ["crate", 230, 430]]
  }
};
