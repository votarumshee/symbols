# Deterministic adaptation of the app's own vector crown; no external font/image download.
Add-Type -AssemblyName System.Drawing
$destination = Join-Path $PSScriptRoot '../release/graphics'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
function Draw-Crown($graphics, [single]$x, [single]$y, [single]$size) {
    $points = @([System.Drawing.PointF]::new($x,$y+$size*.25),[System.Drawing.PointF]::new($x+$size*.28,$y+$size*.45),[System.Drawing.PointF]::new($x+$size*.5,$y),[System.Drawing.PointF]::new($x+$size*.72,$y+$size*.45),[System.Drawing.PointF]::new($x+$size,$y+$size*.25),[System.Drawing.PointF]::new($x+$size*.85,$y+$size*.8),[System.Drawing.PointF]::new($x+$size*.15,$y+$size*.8))
    $brush=[System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#C7EF7D'))
    $graphics.FillPolygon($brush,$points)
    $graphics.FillRectangle($brush,$x+$size*.15,$y+$size*.9,$size*.7,$size*.08)
    $brush.Dispose()
}
foreach($kind in @('icon','feature')) {
    $width=512; $height=512
    if($kind -eq 'feature') { $width=1024; $height=500 }
    $bitmap=[System.Drawing.Bitmap]::new($width,$height)
    $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#0D1916'))
    if($kind -eq 'icon') { Draw-Crown $graphics 112 112 288 }
    else {
        Draw-Crown $graphics 80 128 240
        $white=[System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#E5EFDF'))
        $large=[System.Drawing.Font]::new('Segoe UI',52,[System.Drawing.FontStyle]::Bold)
        $small=[System.Drawing.Font]::new('Segoe UI',22)
        $graphics.DrawString('СИМВОЛЫ',$large,$white,370,150)
        $graphics.DrawString('Твой ход. Твоя стратегия.',$small,$white,375,242)
        $large.Dispose();$small.Dispose();$white.Dispose()
    }
    $bitmap.Save((Join-Path $destination "$kind.png"),[System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose();$bitmap.Dispose()
}
