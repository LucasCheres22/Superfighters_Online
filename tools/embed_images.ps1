# Embute todos os PNGs (sprites e arte dos mapas) em data/images.js como data-URI.
# Assim o jogo nao depende de carregar arquivos de imagem (funciona em file://, previews isolados, etc.).
# Rode de novo se mudar/adicionar PNGs em assets/.   Uso: powershell -File tools\embed_images.ps1
$root = Split-Path -Parent $PSScriptRoot
$sb = New-Object Text.StringBuilder
[void]$sb.AppendLine("// GERADO por tools/embed_images.ps1 - nao edite. Chave = caminho relativo do PNG.")
[void]$sb.AppendLine("window.SF = window.SF || {}; SF.img = {};")
$n = 0
Get-ChildItem "$root\assets" -Recurse -Filter *.png | Sort-Object FullName | ForEach-Object {
  $rel = $_.FullName.Substring($root.Length + 1).Replace('\','/')
  $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($_.FullName))
  [void]$sb.AppendLine("SF.img[""$rel""]=""data:image/png;base64,$b64"";"); $n++
}
[IO.File]::WriteAllText("$root\data\images.js", $sb.ToString(), (New-Object Text.UTF8Encoding $false))
"$n imagens embutidas em data\images.js"
