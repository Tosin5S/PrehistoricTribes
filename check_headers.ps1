$base = 'C:\Users\LENOVO\Desktop\PrehistoricTribes\Prehistoric_Tribes_240x320-84398-mobiles24\'
$files = @('pi0','pi8','pi9','ma','sa','a','pd0','l0','l1','l2','l3')
foreach ($f in $files) {
    $path = $base + $f
    if (Test-Path $path) {
        $bytes = [System.IO.File]::ReadAllBytes($path)
        $header = ($bytes[0..7] | ForEach-Object { '{0:X2}' -f $_ }) -join ' '
        $size = $bytes.Length
        Write-Host "$f ($size bytes): $header"
    }
}
