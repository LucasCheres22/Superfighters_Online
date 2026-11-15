param($mapsAs,$pngRoot,$svgRoot,$outDir)
$SC=1.6
$txt=Get-Content $mapsAs -Raw
$lines=$txt -split "`r?`n"
$defs=[ordered]@{ tutorial=@('GenerateMapTutorial',1,'Tutorial'); storage=@('GenerateMapStorage',2,'Deposito'); rooftops=@('GenerateMapRooftops',3,'Telhados');
  police=@('GenerateMapPoliceStation',4,'Delegacia'); hazardous=@('GenerateMapHazardous',5,'Zona Perigosa'); backstreets=@('GenerateMapBackstreets',6,'Becos');
  testing=@('GenerateMapTestingFloor',7,'Area de Testes'); survival01=@('GenerateMapSurvival01',10,'Sobrevivencia 01') }
$inv=[Globalization.CultureInfo]::InvariantCulture
function Num($s){ $v=0.0; if([double]::TryParse($s.Trim(),[Globalization.NumberStyles]::Float,$inv,[ref]$v)){ $v } else { $null } }
function Rnd($v){ [math]::Round($v,1) }
function FindDir($root,$id){ $x=Get-ChildItem $root -Directory | ? { $_.Name -match "^DefineSprite_${id}(_|$)" } | Select -First 1; if($x){$x.FullName} }
function Origin($svg){ $t=[IO.File]::ReadAllText($svg); $m=[regex]::Match($t,'<g transform="matrix\(([-\d.E]+), ([-\d.E]+), ([-\d.E]+), ([-\d.E]+), ([-\d.E]+), ([-\d.E]+)\)"'); if($m.Success){ @([double]::Parse($m.Groups[5].Value,$inv),[double]::Parse($m.Groups[6].Value,$inv)) } else { @(0,0) } }
New-Item -ItemType Directory -Force "$outDir\assets\maps" | Out-Null
$lvDir=FindDir $pngRoot 2484; $frDir=FindDir $pngRoot 2499; $lvSvg=FindDir $svgRoot 2484; $frSvg=FindDir $svgRoot 2499
$weaponIdx=@{0='pistol';1='rifle';2='shotgun';3='sniper';4='bazooka';6='grenades';8='sword';9='machete';10='axe';14='medkit';15='magnum';16='uzi'}
$weights=@(11,9,7,2,2,4,6,5,2,3,3,4,3,2,2,2,6)
$sb=New-Object Text.StringBuilder
[void]$sb.AppendLine("// GERADO a partir de Maps.as e da arte 'levels' do SWF original (scripts/convmaps.ps1).")
[void]$sb.AppendLine("// Coordenadas ja em pixels do mundo do jogo (escala 1.6 sobre os pixels do nivel original).")
[void]$sb.AppendLine("window.SF = window.SF || {}; SF.maps = SF.maps || {};")
$report=@()
foreach($id in $defs.Keys){
 $fn=$defs[$id][0]; $frame=$defs[$id][1]; $name=$defs[$id][2]
 $start=0; for($i=0;$i -lt $lines.Count;$i++){ if($lines[$i] -match "private function $fn\(") { $start=$i; break } }
 $end=$lines.Count-1; for($i=$start+1;$i -lt $lines.Count;$i++){ if($lines[$i] -match '^\s{6}(private|public) function'){ $end=$i-1; break } }
 $body=$lines[$start..$end]
 # area
 $ax=-3000;$ay=-3000;$aw=9000;$ah=9000
 $am=[regex]::Match(($body -join "`n"),'mapArea = new Rectangle\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)')
 if($am.Success){ $ax=Num $am.Groups[1].Value;$ay=Num $am.Groups[2].Value;$aw=Num $am.Groups[3].Value;$ah=Num $am.Groups[4].Value }
 else { $report+="$id : sem mapArea"; $ax=0;$ay=0;$aw=600;$ah=400 }
 function WX($x){ Rnd (($x-$ax)*$SC) }; function WY($y){ Rnd (($y-$ay)*$SC) }
 $joined=$body -join "`n"
 # spawns
 $spawns=@(); $sm=[regex]::Match($joined,'playerSpawns = new Array\((.*?)\);')
 if($sm.Success){ foreach($p in [regex]::Matches($sm.Groups[1].Value,'new Point\(([-\d.]+),([-\d.]+)\)')){ $spawns+=,@((WX (Num $p.Groups[1].Value)),(WY (Num $p.Groups[2].Value))) } }
 # weapon spawn points
 $wsp=@(); $wm=[regex]::Match($joined,'weaponSpawns = new Array\((.*?)\);\s*\n')
 if($wm.Success){ foreach($w in [regex]::Matches($wm.Groups[1].Value,'new WeaponSpawnData\(([-\d.]+),([-\d.]+),new Array\(([\d,]+)\)\)')){
   $flags=$w.Groups[3].Value -split ','; $allowed=@(); for($k=0;$k -lt $flags.Count;$k++){ if($flags[$k] -eq '1' -and $weaponIdx.ContainsKey($k)){ $allowed+=,@($weaponIdx[$k],$weights[$k]) } }
   $wsp+=,@((WX (Num $w.Groups[1].Value)),(WY (Num $w.Groups[2].Value)),$allowed) } }
 # portals
 $portals=@(); foreach($p in [regex]::Matches($joined,'new PortalData\(new Rectangle\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\),new Rectangle\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)')){
   $g=$p.Groups; $portals+=,@(@((WX (Num $g[1].Value)),(WY (Num $g[2].Value)),(Rnd ((Num $g[3].Value)*$SC)),(Rnd ((Num $g[4].Value)*$SC))),@((WX (Num $g[5].Value)),(WY (Num $g[6].Value)),(Rnd ((Num $g[7].Value)*$SC)),(Rnd ((Num $g[8].Value)*$SC)))) }
 # elevadores: AddObject("LIFT_*") + CreateElevator/CreateHorizontalElevator(var, amplitude, omega)
 $lifts=@(); $liftDef=@{}
 foreach($lm in [regex]::Matches($joined,'(\w+) = Handler_WorldItems\.AddObject\("(LIFT_\w+)",\s*([-\d.]+) / 30,\s*([-\d.]+) / 30')){ $liftDef[$lm.Groups[1].Value]=@($lm.Groups[2].Value,(Num $lm.Groups[3].Value),(Num $lm.Groups[4].Value)) }
 foreach($em in [regex]::Matches($joined,'Create(Horizontal)?Elevator\((\w+),\s*([-\d.]+),\s*([-\d.]+)\)')){
   $g=$em.Groups; $d=$liftDef[$g[2].Value]; if(-not $d){ continue }
   $small = $d[0] -eq 'LIFT_SMALL_01'; $lw= if($small){25}else{35}; $lh= if($small){6}else{7}
   $lifts+=,@{ x=(WX $d[1]); y=(WY $d[2]); w=(Rnd ($lw*$SC)); h=(Rnd ($lh*$SC)); vert=($g[1].Value -eq ''); amp=(Rnd ((Num $g[3].Value)*$SC)); om=(Num $g[4].Value); spr= if($small){'lift_small_01'}else{'lift_01'} }
 }
 $killY=$null; $km=[regex]::Match($joined,'MidPosY\(\) > ([\d.]+)'); if($km.Success){ $killY=Rnd (((Num $km.Groups[1].Value)-$ay)*$SC) }
 $spin=@(); foreach($pm in [regex]::Matches($joined,'AddObject\("WINDMILL_PROPELLER",\s*([-\d.]+) / 30,\s*([-\d.]+) / 30')){ $spin+=,@((WX (Num $pm.Groups[1].Value)),(WY (Num $pm.Groups[2].Value))) }
 # geometria e props (so nivel 1 de indentacao = incondicional)
 $depth=0; $plat=@(); $lad=@(); $props=@(); $skippedPoly=0; $skippedRot=0
 foreach($ln in $body){
  $o=([regex]::Matches($ln,'\{')).Count; $c=([regex]::Matches($ln,'\}')).Count
  $m=[regex]::Match($ln,'CreateGroundBox\([^,]+\.Material\.(\w+),\s*([-\d.]+) / 30,\s*([-\d.]+) / 30,\s*([^,]+),\s*([-\d.]+) / 30,\s*([-\d.]+) / 30,\s*new Array\("(\w+)"\)\)')
  if($m.Success){ $g=$m.Groups; $cx=Num $g[2].Value;$cy=Num $g[3].Value;$rot=Num $g[4].Value;$w=Num $g[5].Value;$h=Num $g[6].Value;$fl=$g[7].Value
    if($rot -ne $null -and [math]::Abs($rot) -gt 0.01){ $c2=[math]::Abs([math]::Cos($rot));$s2=[math]::Abs([math]::Sin($rot)); $nw=$w*$c2+$h*$s2; $nh=$w*$s2+$h*$c2; $w=$nw;$h=$nh; $skippedRot++ }
    $r=@((WX ($cx-$w/2)),(WY ($cy-$h/2)),(Rnd ($w*$SC)),(Rnd ($h*$SC)))
    if($fl -eq 'LADDER'){ $lad+=,$r } elseif($fl -eq 'CLOUD'){ $plat+=,($r+'cloud') } else { $plat+=,($r+'solid') } }
  $m=[regex]::Match($ln,'CreateGroundPolygon\([^,]+\.Material\.(\w+),\s*([-\d.]+) / 30,\s*([-\d.]+) / 30,\s*([^,]+),\s*new Array\((.*)\),\s*new Array\("(\w+)"\)\)')
  if($m.Success){ $g=$m.Groups; $cx=Num $g[2].Value;$cy=Num $g[3].Value; $pts=@(); foreach($q in [regex]::Matches($g[5].Value,'\[([-\d.]+) / 30,([-\d.]+) / 30\]')){ $pts+=,@((Num $q.Groups[1].Value),(Num $q.Groups[2].Value)) }
    if($pts.Count -ge 3 -and $g[6].Value -ne 'LADDER'){ # rasteriza em colunas de 3px (degraus)
      $minx=($pts|%{$_[0]}|measure -Minimum).Minimum; $maxx=($pts|%{$_[0]}|measure -Maximum).Maximum
      for($x=$minx; $x -lt $maxx; $x+=3){ $xm=$x+1.5; $ys=@()
        for($a=0;$a -lt $pts.Count;$a++){ $p1=$pts[$a];$p2=$pts[($a+1)%$pts.Count]; if(($p1[0] -le $xm -and $p2[0] -gt $xm) -or ($p2[0] -le $xm -and $p1[0] -gt $xm)){ $tt=($xm-$p1[0])/($p2[0]-$p1[0]); $ys+=($p1[1]+$tt*($p2[1]-$p1[1])) } }
        if($ys.Count -ge 2){ $top=($ys|measure -Minimum).Minimum; $bot=($ys|measure -Maximum).Maximum; $plat+=,@((WX ($cx+$x)),(WY ($cy+$top)),(Rnd (3*$SC)),(Rnd (($bot-$top)*$SC)),'solid') } }
      $skippedPoly++ } }
  if($depth -eq 1){
   $m=[regex]::Match($ln,'AddObject\("([^"]+)",\s*([-\d.]+) / 30,\s*([-\d.]+) / 30,\s*([-\d.]+)')
   if($m.Success){ $g=$m.Groups; $props+=,@($g[1].Value,(WX (Num $g[2].Value)),(WY (Num $g[3].Value)),(Num $g[4].Value)) } }
  $depth+= $o-$c
 }
 # arte
 $art=''; $front=''
 $pngA="$lvDir\$frame.png"; $pngF="$frDir\$frame.png"
 $oa=Origin "$lvSvg\$frame.svg"; $of=Origin "$frSvg\$frame.svg"
 Copy-Item $pngA "$outDir\assets\maps\level_$frame.png" -Force; Copy-Item $pngF "$outDir\assets\maps\front_$frame.png" -Force
 Add-Type -AssemblyName System.Drawing; $ia=[Drawing.Image]::FromFile($pngA); $aw0=$ia.Width;$ah0=$ia.Height; $ia.Dispose(); $if=[Drawing.Image]::FromFile($pngF); $fw=$if.Width;$fh=$if.Height; $if.Dispose()
 $artObj=@{src="assets/maps/level_$frame.png";x=(Rnd ((-$oa[0]-$ax)*$SC));y=(Rnd ((-$oa[1]-$ay)*$SC));w=(Rnd ($aw0*$SC));h=(Rnd ($ah0*$SC))}
 $frontObj=@{src="assets/maps/front_$frame.png";x=(Rnd ((-$of[0]-$ax)*$SC));y=(Rnd ((-$of[1]-$ay)*$SC));w=(Rnd ($fw*$SC));h=(Rnd ($fh*$SC))}
 $obj=[ordered]@{ name=$name; width=[int][math]::Round($aw*$SC); height=[int][math]::Round($ah*$SC); bg='#0d1117'; art=$artObj; front=$frontObj; platforms=$plat; ladders=$lad; spawns=$spawns; spawnPoints=$wsp; portals=$portals; decor=$props; lifts=$lifts; spinners=$spin }
 [void]$sb.AppendLine("SF.maps.$id = "+($(if($killY -ne $null){ $obj["killY"]=$killY }; $obj) | ConvertTo-Json -Depth 8 -Compress)+";")
 $report+="$id : area ${aw}x${ah} platforms=$($plat.Count) ladders=$($lad.Count) spawns=$($spawns.Count) wpnPts=$($wsp.Count) portals=$($portals.Count) props=$($props.Count) polys=$skippedPoly rotated=$skippedRot"
}
[IO.File]::WriteAllText("$outDir\data\maps_swf.js",$sb.ToString(),(New-Object Text.UTF8Encoding $false))
$report



