# Gera os ativos de marca do GitMonster a partir da prancha de identidade visual (branding/git-monster-logo@2x.png):
#   build/icon.png                    ícone do app e do instalador (512x512, fundo escuro arredondado + símbolo)
#   src/renderer/assets/logo.png      logotipo completo (símbolo + GIT MONSTER + "Unleash your commits")
#   src/renderer/assets/mark.png      símbolo pequeno (barra de abas)
# Uso: pwsh -File tools/make-brand-assets.ps1   (ou: npm run brand)
param([string]$Sheet = (Join-Path $PSScriptRoot '..\branding\git-monster-logo@2x.png'))

Add-Type -AssemblyName System.Drawing
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$src = [System.Drawing.Bitmap]::FromFile((Resolve-Path $Sheet))

# A prancha 2560x1720 tem o painel grande à esquerda; as regiões abaixo estão em pixels dessa imagem.
$bg = $src.GetPixel(300, 300)                  # preto do painel (#050505): o fundo do ícone o repete para a emenda sumir
$markRegion = [System.Drawing.Rectangle]::new(544, 394, 620, 620)    # só o símbolo (as garras com o grafo)
$logoRegion = [System.Drawing.Rectangle]::new(254, 382, 1213, 989)   # símbolo + nome + tagline

function New-Canvas([int]$w, [int]$h) {
    $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.PixelOffsetMode = 'HighQuality'
    $g.CompositingQuality = 'HighQuality'
    return @{ Bitmap = $bmp; Graphics = $g }
}

function Save-Png($bmp, [string]$relative) {
    $path = Join-Path $root $relative
    New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output ("{0} ({1}x{2}, {3:N1} KB)" -f $relative, $bmp.Width, $bmp.Height, ((Get-Item $path).Length / 1KB))
}

function New-RoundedRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

# ---- ícone 512x512: tile arredondado + símbolo centralizado ----
$icon = New-Canvas 512 512
$tile = New-RoundedRect 0 0 512 512 112
$brush = New-Object System.Drawing.SolidBrush $bg
$icon.Graphics.FillPath($brush, $tile)
$markSize = 400
$offset = (512 - $markSize) / 2
$icon.Graphics.DrawImage($src, [System.Drawing.Rectangle]::new($offset, $offset, $markSize, $markSize), $markRegion, [System.Drawing.GraphicsUnit]::Pixel)
Save-Png $icon.Bitmap 'build\icon.png'

# ---- símbolo pequeno (reaproveita o ícone, já com o tile) ----
$mark = New-Canvas 96 96
$mark.Graphics.DrawImage($icon.Bitmap, 0, 0, 96, 96)
Save-Png $mark.Bitmap 'src\renderer\assets\mark.png'

# ---- logotipo completo, 760 px de largura ----
$logoW = 760
$logoH = [int]($logoRegion.Height * $logoW / $logoRegion.Width)
$logo = New-Canvas $logoW $logoH
$logo.Graphics.DrawImage($src, [System.Drawing.Rectangle]::new(0, 0, $logoW, $logoH), $logoRegion, [System.Drawing.GraphicsUnit]::Pixel)
Save-Png $logo.Bitmap 'src\renderer\assets\logo.png'

foreach ($c in @($icon, $mark, $logo)) { $c.Graphics.Dispose(); $c.Bitmap.Dispose() }
$src.Dispose()
