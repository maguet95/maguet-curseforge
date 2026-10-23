# Descarga los mods del servidor de la fuente oficial de cada autor (Modrinth, la
# página de CurseForge o lo que aloja el creador) y comprueba cada archivo con su huella.
# Este script vive en «PASO 1 - Descargar mods» y deja los mods en la carpeta
# «PASO 2 - Subir al servidor», junto a config, world… Todo lo que se sube está
# ahí y nada más.
# Se puede volver a ejecutar: lo que ya está bien no se vuelve a bajar.
# Rutas LITERALES: hay mods con corchetes en el nombre ([fabric]imst...), que
# PowerShell tomaría como comodines.
$ErrorActionPreference = 'Stop'
# Tildes, ¡ y «» bien en cualquier consola.
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$lista = Join-Path (Split-Path -Parent $aqui) 'PASO 2 - Subir al servidor'
$destino = Join-Path $lista 'mods'
[IO.Directory]::CreateDirectory($destino) | Out-Null
$mods = Get-Content -LiteralPath (Join-Path $aqui 'mods.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$sha = [Security.Cryptography.SHA1]::Create()
$md5 = [Security.Cryptography.MD5]::Create()
function Huella($f) { ([BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($f)))).Replace('-', '').ToLower() }
function HuellaMd5($f) { ([BitConverter]::ToString($md5.ComputeHash([IO.File]::ReadAllBytes($f)))).Replace('-', '').ToLower() }
# 23-oct: cada mod dice cómo se comprueba (sha1 los de Modrinth de siempre; md5 los que salen del índice publicado).
function Bien($f, $m) {
    if (-not [IO.File]::Exists($f)) { return $false }
    if ($m.sha1) { return (Huella $f) -eq $m.sha1 }
    if ($m.md5) { return (HuellaMd5 $f) -eq $m.md5 }
    return $true
}
# Una barra en una sola línea, que se reescribe: así se sabe cuánto falta.
function Barra($hechos, $total) {
    $ancho = 30
    $lleno = [Math]::Floor($ancho * $hechos / [Math]::Max($total, 1))
    $pct = [Math]::Floor(100 * $hechos / [Math]::Max($total, 1))
    Write-Host -NoNewline ("`r  [" + ('#' * $lleno) + ('.' * ($ancho - $lleno)) + "]  $pct%   $hechos de $total   ")
}
$web = New-Object Net.WebClient
$ok = 0; $mal = @(); $n = 0
# Los de CurseForge (23-oct) no se bajan solos: sus condiciones no lo permiten. Se abre su página oficial, la persona
# pulsa «Download», y aquí se recoge de su carpeta de Descargas, comprobado con su huella.
$manuales = @($mods | Where-Object { $_.fuente -eq 'curseforge' })
$automaticos = @($mods | Where-Object { $_.fuente -ne 'curseforge' })
Write-Host ""
Write-Host "  Descargando los mods del servidor en:"
Write-Host "  $destino"
Write-Host ""
foreach ($m in $automaticos) {
    Barra $n $automaticos.Count
    $f = [IO.Path]::Combine($destino, $m.archivo)
    $bien = Bien $f $m
    for ($i = 1; $i -le 3 -and -not $bien; $i++) {
        try { $web.DownloadFile($m.url, $f); $bien = Bien $f $m } catch { Start-Sleep -Seconds (2 * $i) }
    }
    if ($bien) { $ok++ } else { $mal += $m.archivo; Write-Host ""; Write-Host "  FALLO  $($m.archivo)" -ForegroundColor Red }
    $n++
}
Barra $n $automaticos.Count
Write-Host ""

if ($manuales.Count) {
    $descargas = $env:MAGUET_DESCARGAS
    if (-not $descargas) {
        try { $descargas = (New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path } catch { }
        if (-not $descargas) { $descargas = Join-Path $env:USERPROFILE 'Downloads' }
    }
    $faltan = @($manuales | Where-Object { -not (Bien ([IO.Path]::Combine($destino, $_.archivo)) $_) })
    $ok += $manuales.Count - $faltan.Count
    if ($faltan.Count) {
        Write-Host ""
        Write-Host "  ==================================================" -ForegroundColor Yellow
        Write-Host "   Faltan $($faltan.Count) mods de CurseForge" -ForegroundColor Yellow
        Write-Host "  ==================================================" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  Es normal que ahora se abran páginas en tu navegador. CurseForge no"
        Write-Host "  permite que otros programas repartan sus archivos, así que cada mod"
        Write-Host "  se baja de SU página oficial, como pide el autor. Es lo correcto y es seguro."
        Write-Host ""
        Write-Host "  Tú solo tienes que pulsar «Download» en cada página que se abra."
        Write-Host "  No muevas nada: este programa encuentra el archivo en tus Descargas,"
        Write-Host "  comprueba que es exactamente el del modpack y lo pone en su carpeta."
        Write-Host "  Descargas: $descargas"
    }
    $k = 0
    foreach ($m in $faltan) {
        $k++
        $f = [IO.Path]::Combine($destino, $m.archivo)
        Write-Host ""
        Write-Host "  ($k de $($faltan.Count))  $($m.nombre)  —  abriendo su página; pulsa «Download»…"
        if (-not $env:MAGUET_SIN_NAVEGADOR) { Start-Process $m.pagina }
        $limite = (Get-Date).AddMinutes(10)
        $bien = $false
        while (-not $bien -and (Get-Date) -lt $limite) {
            # Primero por su nombre; si el navegador lo renombró, por su huella entre los .jar recientes.
            $candidatos = @()
            $exacto = [IO.Path]::Combine($descargas, $m.archivo)
            if ([IO.File]::Exists($exacto)) { $candidatos += $exacto }
            $candidatos += @(Get-ChildItem -LiteralPath $descargas -Filter '*.jar' -File -ErrorAction SilentlyContinue |
                Where-Object { $_.LastWriteTime -gt (Get-Date).AddMinutes(-30) } | ForEach-Object { $_.FullName })
            foreach ($c in $candidatos) {
                if (Bien $c $m) { Move-Item -LiteralPath $c -Destination $f -Force; $bien = $true; break }
            }
            if (-not $bien) { Start-Sleep -Seconds 2 }
        }
        if ($bien) { $ok++; Write-Host "  Listo." -ForegroundColor Green }
        else { $mal += $m.archivo; Write-Host "  No llegó (o no es el mismo archivo). Vuelve a ejecutar el script." -ForegroundColor Red }
    }
}
Write-Host ""
if ($mal.Count) {
    Write-Host "  $ok de $($mods.Count) mods listos. Fallaron $($mal.Count)." -ForegroundColor Red
    Write-Host "  Vuelve a ejecutar el script: lo que ya está bien no se vuelve a bajar." -ForegroundColor Red
    exit 1
}
Write-Host @'
  ==================================================
          ¡ Tu descarga está completada !
  ==================================================
'@ -ForegroundColor Green
Write-Host "  $ok de $($mods.Count) mods listos y comprobados."
Write-Host ""
Write-Host "  Ahora el PASO 2: sube lo que hay DENTRO de la carpeta"
Write-Host "  «PASO 2 - Subir al servidor» a la carpeta principal del servidor."
Write-Host @'

     __  __    _    ____ _   _ _____ _____
    |  \/  |  / \  / ___| | | | ____|_   _|
    | |\/| | / _ \| |  _| | | |  _|   | |
    | |  | |/ ___ \ |_| | |_| | |___  | |
    |_|  |_/_/   \_\____|\___/|_____| |_|
          . : * :  S T U D I O  : * : .

'@ -ForegroundColor Cyan
