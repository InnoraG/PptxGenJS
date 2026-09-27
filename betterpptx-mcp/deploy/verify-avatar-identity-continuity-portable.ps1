param(
    [string]$FfmpegPath = '',
    [string]$FfprobePath = ''
)

$ErrorActionPreference = 'Stop'
$root = Join-Path $env:TEMP ("betterpptx-avatar-identity-verify-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root -Force | Out-Null
try {
    if ($FfmpegPath -and $FfprobePath) {
        $ffmpeg = [IO.Path]::GetFullPath($FfmpegPath)
        $ffprobe = [IO.Path]::GetFullPath($FfprobePath)
    } else {
        $zip = Join-Path $root 'ffmpeg.zip'
        $extract = Join-Path $root 'ffmpeg'
        Invoke-WebRequest -Uri 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' -OutFile $zip -UseBasicParsing
        Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force
        $ffmpeg = (Get-ChildItem -LiteralPath $extract -Recurse -Filter ffmpeg.exe | Select-Object -First 1).FullName
        $ffprobe = (Get-ChildItem -LiteralPath $extract -Recurse -Filter ffprobe.exe | Select-Object -First 1).FullName
    }
    if (-not $ffmpeg -or -not $ffprobe) { throw 'Portable ffmpeg bundle did not contain ffmpeg.exe and ffprobe.exe' }
    $env:BETTERPPTX_FFMPEG_PATH = $ffmpeg
    $env:BETTERPPTX_FFPROBE_PATH = $ffprobe
    node (Join-Path $PSScriptRoot '..\verify-avatar-identity-continuity.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Avatar identity continuity verification failed' }
    node (Join-Path $PSScriptRoot '..\build-avatar-identity-quality-review-packet.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Avatar identity review packet build failed' }
} finally {
    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item Env:BETTERPPTX_FFMPEG_PATH -ErrorAction SilentlyContinue
    Remove-Item Env:BETTERPPTX_FFPROBE_PATH -ErrorAction SilentlyContinue
}
