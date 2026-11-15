param(
  [string]$xmlPath = "$env:TEMP\sf.xml",
  [string]$outJs = 'C:\Users\Lucas Cheres\Documents\Superfighters\scratch-2026-11-07-d31a3a\superfighters-html5\data\placements.js'
)
$x = [xml](Get-Content $xmlPath -Raw)
$chars = [ordered]@{ johnny = 731; boris = 881; blood = 1040; agent = 1245; burnt = 1292; billy = 1455; scott = 1596; funnyman = 1769; mac = 1910; jeff = 2051 }
$inv = [Globalization.CultureInfo]::InvariantCulture
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('// Gerado por placements.ps1 a partir do SWF: deslocamento (px) de cada peca (corpo d1, ANIM, ANIM_WPN) dentro de cada estado do personagem.')
[void]$sb.AppendLine('window.SF=window.SF||{}; SF.place={};')
$scaled = 0
foreach ($cn in $chars.Keys) {
  $s = $x.SelectSingleNode("//item[@spriteId='" + $chars[$cn] + "']")
  $frame = 1; $label = @{}; $state = @{}; $perState = @{}
  $disp = @{}   # depth -> @{key; tx; ty}
  $order = @()
  foreach ($t in @($s.subTags.item)) {
    $tt = $t.type
    if ($tt -eq 'FrameLabelTag') { $label[$frame] = $t.GetAttribute('name') }
    elseif ($tt -like 'PlaceObject*') {
      $d = [string]$t.GetAttribute('depth'); $cid = $t.GetAttribute('characterId')
      $m = $t.matrix
      if ($cid) {
        $nm = $t.GetAttribute('name'); if (-not $nm) { $nm = "d$d" }
        $tx = 0.0; $ty = 0.0
        if ($m) { $tx = [double]$m.GetAttribute('translateX') / 20; $ty = [double]$m.GetAttribute('translateY') / 20; if ($m.GetAttribute('hasScale') -eq 'true' -or $m.GetAttribute('hasRotate') -eq 'true') { $scaled++ } }
        $disp[$d] = @{ key = $nm; tx = $tx; ty = $ty }
      }
    }
    elseif ($tt -like 'RemoveObject*') { $disp.Remove([string]$t.GetAttribute('depth')) }
    elseif ($tt -eq 'ShowFrameTag') {
      $lab = $label[$frame]
      if ($lab) {
        $parts = @()
        foreach ($k in ($disp.Keys | Sort-Object { [int]$_ })) { $v = $disp[$k]; $parts += ('"{0}":[{1},{2}]' -f $v.key, $v.tx.ToString('0.##', $inv), $v.ty.ToString('0.##', $inv)) }
        $perState[$lab] = '{' + ($parts -join ',') + '}'
      }
      $frame++
    }
  }
  $items = @(); foreach ($k in $perState.Keys) { $items += ('"{0}":{1}' -f $k, $perState[$k]) }
  [void]$sb.AppendLine(('SF.place.{0}={{{1}}};' -f $cn, ($items -join ',')))
}
[System.IO.File]::WriteAllText($outJs, $sb.ToString(), (New-Object System.Text.UTF8Encoding $false))
"gerado: $outJs ; pecas com escala/rotacao: $scaled"
