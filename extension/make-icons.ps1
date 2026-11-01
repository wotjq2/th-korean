# 통합 번역 아이콘(icons/icon16·32·48·128.png)을 그린다. 한 번만 돌리면 된다 — 결과 png 는 저장소에 둔다.
Add-Type -AssemblyName System.Drawing
$dir = Join-Path $PSScriptRoot 'icons'
New-Item -ItemType Directory -Force $dir | Out-Null
foreach ($s in 16, 32, 48, 128) {
  $bmp = New-Object System.Drawing.Bitmap $s, $s
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  $g.Clear([System.Drawing.Color]::Transparent)
  # 둥근 네모 바탕
  $r = [Math]::Max(3, [int]($s * 0.22))
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddArc(0, 0, 2 * $r, 2 * $r, 180, 90)
  $p.AddArc($s - 2 * $r - 1, 0, 2 * $r, 2 * $r, 270, 90)
  $p.AddArc($s - 2 * $r - 1, $s - 2 * $r - 1, 2 * $r, 2 * $r, 0, 90)
  $p.AddArc(0, $s - 2 * $r - 1, 2 * $r, 2 * $r, 90, 90)
  $p.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(37, 99, 235))), $p)
  # 가운데 '한'
  $font = New-Object System.Drawing.Font 'Malgun Gothic', ([float]($s * 0.56)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = 'Center'
  $fmt.LineAlignment = 'Center'
  $rect = New-Object System.Drawing.RectangleF 0, ([float]($s * 0.04)), $s, $s
  $g.DrawString([string][char]0xD55C, $font, [System.Drawing.Brushes]::White, $rect, $fmt)
  $g.Dispose()
  $bmp.Save((Join-Path $dir "icon$s.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
Get-ChildItem $dir | Select-Object Name, Length
