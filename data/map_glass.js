// VIDROS QUEBRAVEIS (AddGlass do original: SOLID_GLASS_01, PlayerFragile + IsGlass). Gerado a partir de Maps.as (pontos em px do nivel
// original; convertidos com o mesmo deslocamento das caixas de cada mapa, validado: todas as caixas casam com as plataformas).
// Cada item: [x1,y1,x2,y2] em px do port. Quebra ao pousar em cima, ao ser atravessado pelo corpo (rolar/mergulhar/knock), por tiro e explosao.
window.SF = window.SF || {}; SF.glass = {
  rooftops: [[508.8,489.6,550.4,489.6],[568,489.6,609.6,489.6],[644.8,489.6,686.4,489.6],[704,489.6,745.6,489.6],[411.2,632,411.2,571.2],[313.6,561.6,313.6,624]],
  police: [[717.6,483.2,717.6,542.4],[889.6,625.6,889.6,675.2]],
  backstreets: [[507.2,342.4,507.2,406.4],[307.2,377.6,307.2,316.8]],
  hazardous: [[275.2,291.2,275.2,227.2],[670.4,300.8,670.4,358.4]],
  storage: [[508.8,209.6,508.8,268.8]]
};

// ESCADAS que quicam (CreateGroundPolygon com tiltValue do original; Player.as PlayerLands/StairBounce). Itens: [x0,y0,x1,y1,tilt] em px do port.
// O poligono exato tem 5 pontos; aqui a caixa do poligono (aproximada) basta para a regiao em que o pouso quica.
SF.stairs = {
  backstreets: [[137.6,480,185.6,598.4,-2]],
  testing: [[295.2,438.4,386.4,539.2,-2],[626.4,438.4,719.2,539.2,2]],
  survival01: [[277.6,426.4,368.8,527.2,-2],[608.8,426.4,701.6,527.2,2]],
  hazardous: [[68.8,480,155.2,580.8,2]],
  rooftops: [[481.6,630.4,528,755.2,2]],
  police: [[960,715.2,1004.8,846.4,2]],
  storage: [[166.4,452.8,214.4,571.2,2],[449.6,449.6,497.6,568,-2]]
};
