param($swf,$pngRoot,$svgRoot,$classes,$outDir)
Add-Type -AssemblyName System.Drawing
$chars=[ordered]@{johnny=731;boris=881;blood=1040;agent=1245;burnt=1292;billy=1455;scott=1596;funnyman=1769;mac=1910;jeff=2051}
$b=[System.IO.File]::ReadAllBytes($swf)
$ms=New-Object IO.MemoryStream(,$b[10..($b.Length-1)])
$ds=New-Object IO.Compression.DeflateStream($ms,[IO.Compression.CompressionMode]::Decompress)
$o=New-Object IO.MemoryStream; $ds.CopyTo($o); $d=$o.ToArray()
$script:bp=0
function RB($n){ $v=0; for($i=0;$i -lt $n;$i++){ $by=$d[$script:bp -shr 3]; $v=($v -shl 1) -bor (($by -shr (7-($script:bp -band 7))) -band 1); $script:bp++ }; $v }
$nb=$d[0] -shr 3; $pos=[math]::Ceiling((5+4*$nb)/8)+4; $spr=@{}
while($pos -lt $d.Length){ $h=[BitConverter]::ToUInt16($d,$pos);$pos+=2; $t=$h -shr 6;$l=$h -band 63
 if($l -eq 63){$l=[BitConverter]::ToInt32($d,$pos);$pos+=4}
 if($t -eq 39){ $id=[int][BitConverter]::ToUInt16($d,$pos); $spr[$id]=@(($pos+4),($pos+$l)) }
 $pos+=$l; if($t -eq 0){break} }
$need=New-Object 'System.Collections.Generic.HashSet[int]'
$charData=[ordered]@{}
foreach($cn in $chars.Keys){
 $s=$spr[$chars[$cn]]; $p=$s[0]; $end=$s[1]; $frame=1; $label=@{}; $states=[ordered]@{}
 while($p -lt $end){
  $h=[BitConverter]::ToUInt16($d,$p);$p+=2; $t=$h -shr 6;$l=$h -band 63
  if($l -eq 63){$l=[BitConverter]::ToInt32($d,$p);$p+=4}
  if($t -eq 1){$frame++}
  elseif($t -eq 43){ $label[$frame]=[Text.Encoding]::UTF8.GetString($d,$p,$l-1); if(-not $states.Contains($label[$frame])){$states[$label[$frame]]=[ordered]@{}} }
  elseif($t -eq 26){
   $f=$d[$p]; $q=$p+1; $depth=[BitConverter]::ToUInt16($d,$q);$q+=2; $cid=-1
   if($f -band 2){ $cid=[BitConverter]::ToUInt16($d,$q);$q+=2 }
   if($f -band 4){ $script:bp=$q*8; if(RB 1){ $n=RB 5; RB $n|Out-Null; RB $n|Out-Null }; if(RB 1){ $n=RB 5; RB $n|Out-Null; RB $n|Out-Null }; $n=RB 5; RB $n|Out-Null; RB $n|Out-Null; $q=[math]::Ceiling($script:bp/8) }
   if($f -band 8){ $script:bp=$q*8; $ha=RB 1; $hm=RB 1; $n=RB 4; if($hm){1..4|%{RB $n|Out-Null}}; if($ha){1..4|%{RB $n|Out-Null}}; $q=[math]::Ceiling($script:bp/8) }
   if($f -band 16){$q+=2}
   $name=""; if($f -band 32){ $e=$q; while($d[$e] -ne 0){$e++}; $name=[Text.Encoding]::UTF8.GetString($d,$q,$e-$q) }
   $lab=$label[$frame]
   if($cid -ge 0 -and $lab){ $key= if($name){$name}else{"d$depth"}; $states[$lab][$key]=[int]$cid; [void]$need.Add([int]$cid) }
  }
  $p+=$l }
 $charData[$cn]=$states
}
# sprites com nome (props, armas, efeitos), exceto menus/newgrounds
$alias=[ordered]@{}
foreach($line in Get-Content $classes){ $a=$line -split '\|'; $id=[int]$a[0]; $cl=$a[1]
 if($cl -match 'Container_|ewgrounds|APIConnector|FlashAd|menu|toggle|gui_|score|tips|press_space|round_winner|survival|Tutorial|billboard|plate|confirm|set_up|levels|player_|\.Player|Superfighters_fla\.(fall|aim|dive|grabbed)'){continue}
 $cl=$cl -replace '^Superfighters_fla\.',''; $cl=$cl -replace '^Code\.Particles\.','fx_'
 $alias[$cl]=$id; [void]$need.Add($id) }
$extra=@{hud_icons=2377;hud_digit=2398;hud_sign=1095;hud_digits_pair=2399}; foreach($k in $extra.Keys){ $alias[$k]=$extra[$k]; [void]$need.Add($extra[$k]) }
function FindDir($root,$id){ $x=Get-ChildItem $root -Directory | ? { $_.Name -match "^DefineSprite_${id}(_|$)" } | Select -First 1; if($x){$x.FullName} }
$man=[ordered]@{}; $miss=0
foreach($id in ($need | sort)){
 $pd=FindDir $pngRoot $id; if(-not $pd){$miss++;continue}
 $fr=Get-ChildItem $pd -Filter *.png | Sort {[int]$_.BaseName}; if(-not $fr){continue}
 $im=[Drawing.Image]::FromFile($fr[0].FullName); $w=$im.Width;$h=$im.Height; $im.Dispose()
 $ox=0;$oy=0; $sd=FindDir $svgRoot $id
 if($sd){ $sv=Join-Path $sd "1.svg"; if(Test-Path $sv){ $txt=[IO.File]::ReadAllText($sv); $m=[regex]::Match($txt,'<g transform="matrix\(([-\d.E]+), ([-\d.E]+), ([-\d.E]+), ([-\d.E]+), ([-\d.E]+), ([-\d.E]+)\)"'); if($m.Success){ $ox=[double]$m.Groups[5].Value; $oy=[double]$m.Groups[6].Value } } }
 $dst="$outDir\assets\sprites\$id"; New-Item -ItemType Directory -Force $dst | Out-Null
 $fr | % { Copy-Item $_.FullName "$dst\$($_.BaseName).png" }
 $man["$id"]=@{w=$w;h=$h;ox=$ox;oy=$oy;n=$fr.Count}
}
$js="// Gerado a partir do SWF original (sprites vetoriais rasterizados + estados das animacoes).`nwindow.SF=window.SF||{};`nSF.sprites="+($man|ConvertTo-Json -Depth 5 -Compress)+";`nSF.spriteAlias="+($alias|ConvertTo-Json -Compress)+";`nSF.chars="+($charData|ConvertTo-Json -Depth 6 -Compress)+";`n"
[IO.File]::WriteAllText("$outDir\data\sprites.js",$js,(New-Object Text.UTF8Encoding $false))
"sprites: $($man.Count) missing: $miss aliases: $($alias.Count)"


