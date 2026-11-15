# Gera as camadas e pecas ANIMADAS dos mapas a partir do SWF original.
# No original a arte de cada mapa e um QUADRO do MovieClip "levels" (simbolo 2484); dentro de cada quadro ha filhos animados
# (MovieClips proprios, tocados por MapGraphic.Update na velocidade do jogo):
#   fan_1..4          simbolo 2206: forma 2204 girando 22.5 graus por quadro (16 passos)
#   background_clouds simbolo 2211: bitmap 2208 (265x152) ladrilhado numa janela 795x151, rolando 265 px a cada 120 quadros
#   pouring           simbolo 2230: 9 copias (3x3) de 2229, que troca entre 3 formas a cada 2 quadros (so no mapa 5)
#   btn_left/right    simbolo 242: 2 quadros (solto/apertado), mapas 7 e 10
# O export antigo (level_N.png) tinha o 1o quadro dessas pecas "assado" na arte. Este script regrava level_N.png so com a parte
# parada, cria back_N.png (ceu, atras das nuvens) e as pecas em assets/maps/anim, e escreve data/map_anim.js.
# Requer: XML do SWF (ffdec -swf2xml) e o ffdec + java em tools da pasta scratch. Depois rode tools\embed_images.ps1.
param(
  [string]$xmlPath = "$env:TEMP\sf.xml",
  [string]$swf = 'C:\Users\Lucas Cheres\Downloads\575163_Superfighters.swf',
  [string]$ffdecDir = 'C:\Users\Lucas Cheres\Documents\Superfighters\scratch-2026-11-07-d31a3a\tools',
  [string]$tmp = "$env:TEMP\sf_mapanim"
)
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$java = "$ffdecDir\jre\jdk-21.0.13+9-jre\bin\java.exe"
$jar = "$ffdecDir\ffdec\ffdec-cli.jar"
$inv = [Globalization.CultureInfo]::InvariantCulture
New-Item -ItemType Directory -Force "$tmp\shapes", "$tmp\images", "$root\assets\maps\anim" | Out-Null

$shapes = 2204, 240, 241, 2224, 2226, 2228, 2215, 2202, 2207, 2214, 2218, 2220, 2222, 2232, 2234, 2483
& $java -jar $jar -format shape:png -selectid ($shapes -join ',') -export shape "$tmp\shapes" $swf | Out-Null
& $java -jar $jar -selectid 2208 -export image "$tmp\images" $swf | Out-Null

$x = [xml](Get-Content $xmlPath -Raw)
function Box([int]$id) {
  $b = $x.SelectSingleNode("//item[@shapeId='$id']").shapeBounds
  $x0 = [double]$b.GetAttribute('Xmin') / 20; $y0 = [double]$b.GetAttribute('Ymin') / 20
  return ,([double[]]@($x0, $y0))
}
# caixa fixa do export de "levels": x -292..1027, y -201..509 (1319x710), igual aos level_N.png antigos
$BX = -292; $BY = -201; $BW = 1319; $BH = 710
function Compose([string]$outFile, $parts) { # parts: lista de @(shapeId, tx, ty)
  $bmp = New-Object System.Drawing.Bitmap $BW, $BH, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp); $g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor; $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  foreach ($p in $parts) {
    $o = Box $p[0]; $img = [System.Drawing.Bitmap]::FromFile("$tmp\shapes\$($p[0]).png")
    $px = [int][Math]::Floor($o[0] + $p[1] - $BX); $py = [int][Math]::Floor($o[1] + $p[2] - $BY)
    $g.DrawImage($img, $px, $py, $img.Width, $img.Height); $img.Dispose()
  }
  $g.Dispose(); $bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
}
$bk = "$env:TEMP\levels_backup_before_mapanim"
if (-not (Test-Path $bk)) { New-Item -ItemType Directory $bk | Out-Null; Copy-Item "$root\assets\maps\level_*.png" $bk }
$maps = "$root\assets\maps"
Compose "$maps\level_2.png"  @(, @(2202, 0, 0))
Compose "$maps\back_3.png"   @(, @(2207, 0, 0))
Compose "$maps\level_3.png"  @(@(2214, 0, 0), @(2215, 206.5, 31.5))
Compose "$maps\back_4.png"   @(, @(2218, 0, 0))
Compose "$maps\level_4.png"  @(, @(2220, 0, 0))
Compose "$maps\level_5.png"  @(, @(2222, 0, 0))
Compose "$maps\level_6.png"  @(, @(2232, 0, 0))
Compose "$maps\level_7.png"  @(, @(2234, 0, 0))
Compose "$maps\level_10.png" @(, @(2483, 0, 0))

# alinhamento fino: o PNG de forma do ffdec pode sair 1 px deslocado (bounds fracionarios). Compara com o level_N antigo (so onde a
# camada nova e opaca) e desloca a camada para o encaixe com menos diferencas.
function Align([string]$file, [string]$oldFile) {
  $a = [System.Drawing.Bitmap]::FromFile($oldFile); $src = [System.Drawing.Bitmap]::FromFile($file); $b = New-Object System.Drawing.Bitmap $src; $src.Dispose()
  $best = $null; $bd = [int]::MaxValue
  foreach ($dx in -1, 0, 1) { foreach ($dy in -1, 0, 1) {
    $diff = 0
    for ($y = 12; $y -lt $BH - 12; $y += 9) { for ($xx = 12; $xx -lt $BW - 12; $xx += 9) {
      $cb = $b.GetPixel($xx - $dx, $y - $dy); if ($cb.A -lt 255) { continue }
      $ca = $a.GetPixel($xx, $y)
      if ([Math]::Abs($ca.R - $cb.R) + [Math]::Abs($ca.G - $cb.G) + [Math]::Abs($ca.B - $cb.B) -gt 24) { $diff++ }
    } }
    if ($diff -lt $bd) { $bd = $diff; $best = @($dx, $dy) }
  } }
  $a.Dispose()
  if ($best[0] -ne 0 -or $best[1] -ne 0) {
    $o = New-Object System.Drawing.Bitmap $BW, $BH, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($o); $g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0)); $g.DrawImage($b, $best[0], $best[1], $BW, $BH); $g.Dispose()
    $b.Dispose(); $o.Save($file, [System.Drawing.Imaging.ImageFormat]::Png); $o.Dispose()
  } else { $b.Dispose() }
  "{0}: deslocamento ({1},{2}), diferencas {3}" -f (Split-Path $file -Leaf), $best[0], $best[1], $bd
}
foreach ($n in 2, 3, 4, 5, 6, 7, 10) { Align "$maps\level_$n.png" "$bk\level_$n.png" }
# back_N (ceu) nao e alinhado: no export antigo ele esta quase todo coberto pelos predios, a comparacao nao e confiavel.

Copy-Item "$tmp\shapes\2204.png" "$maps\anim\fan.png" -Force
Copy-Item "$tmp\shapes\240.png" "$maps\anim\btn_1.png" -Force
Copy-Item "$tmp\shapes\241.png" "$maps\anim\btn_2.png" -Force
Copy-Item "$tmp\shapes\2224.png" "$maps\anim\pour_1.png" -Force
Copy-Item "$tmp\shapes\2226.png" "$maps\anim\pour_2.png" -Force
Copy-Item "$tmp\shapes\2228.png" "$maps\anim\pour_3.png" -Force
$cl = Get-ChildItem "$tmp\images" -Recurse -Filter '2208*' | Select-Object -First 1
Copy-Item $cl.FullName "$maps\anim\clouds.png" -Force

function O([int]$id) { $o = Box $id; return ('[{0},{1}]' -f $o[0].ToString('0.##', $inv), $o[1].ToString('0.##', $inv)) }
$js = @"
// GERADO por tools/mapanim.ps1 - pecas animadas da arte dos mapas (filhos do MovieClip "levels" do SWF). Coordenadas em px do
// NIVEL original (o jogo converte: mundo = art + (px - box) * 1.6). Chave = numero do quadro de "levels" (level_N.png).
window.SF = window.SF || {};
SF.mapAnim = {
  box: [$BX, $BY],            // canto da caixa do export de "levels" (level_N.png cobre x $BX..1027, y $BY..509)
  fan: { src: "assets/maps/anim/fan.png", o: $(O 2204), step: 22.5 },            // gira 22.5 graus por quadro original (16 passos)
  clouds: { src: "assets/maps/anim/clouds.png", w: 795, h: 151, tile: 265, frames: 120, oy: -0.5 },  // rola 1 ladrilho (265 px) a cada 120 quadros
  pour: { src: ["assets/maps/anim/pour_1.png", "assets/maps/anim/pour_2.png", "assets/maps/anim/pour_3.png"], o: [$(O 2224), $(O 2226), $(O 2228)], hold: 2,
          grid: [[0,0],[48,0],[96.5,0],[0,16.5],[48,16.5],[96.5,16.5],[0,32.5],[48,32.5],[96.5,32.5]] },
  btn: { src: ["assets/maps/anim/btn_1.png", "assets/maps/anim/btn_2.png"], o: [$(O 240), $(O 241)] },
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
"@
[System.IO.File]::WriteAllText("$root\data\map_anim.js", $js, (New-Object System.Text.UTF8Encoding $false))
"ok: camadas em assets\maps, pecas em assets\maps\anim, dados em data\map_anim.js (backup dos level_N antigos em $bk)"
