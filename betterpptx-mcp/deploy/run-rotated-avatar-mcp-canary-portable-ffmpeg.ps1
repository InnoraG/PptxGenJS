param(
    [string]$Project = 'betterpptx-mcp-staging',
    [string]$SecretName = 'betterpptx-avatar-worker-credentials',
    [string]$FfmpegPath = '',
    [string]$FfprobePath = '',
    [string]$ImagePath = ''
)
$ErrorActionPreference = 'Stop'
$root = Join-Path $env:TEMP ("betterpptx-avatar-portable-canary-" + [guid]::NewGuid().ToString('N'))
$credentialFile = Join-Path $root 'credentials.json'
New-Item -ItemType Directory -Path $root -Force | Out-Null
try {
    if ($FfmpegPath -and $FfprobePath) {
        $ffmpeg = [IO.Path]::GetFullPath($FfmpegPath)
        $ffprobe = [IO.Path]::GetFullPath($FfprobePath)
    } else {
        $zip = Join-Path $root 'ffmpeg.zip'
        $extract = Join-Path $root 'ffmpeg'
        New-Item -ItemType Directory -Path $extract -Force | Out-Null
        $ffmpegUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
        Invoke-WebRequest -Uri $ffmpegUrl -OutFile $zip -UseBasicParsing
        Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force
        $ffmpeg = (Get-ChildItem -LiteralPath $extract -Recurse -Filter ffmpeg.exe | Select-Object -First 1).FullName
        $ffprobe = (Get-ChildItem -LiteralPath $extract -Recurse -Filter ffprobe.exe | Select-Object -First 1).FullName
    }
    if (-not $ffmpeg -or -not $ffprobe) { throw 'Portable ffmpeg bundle did not contain ffmpeg.exe and ffprobe.exe' }
    gcloud secrets versions access latest --secret=$SecretName --project=$Project --out-file=$credentialFile *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Secret Manager read failed' }
    $env:BETTERPPTX_CREDENTIAL_STORE = $credentialFile
    $env:BETTERPPTX_FFMPEG_PATH = $ffmpeg
    $env:BETTERPPTX_FFPROBE_PATH = $ffprobe
    $env:BETTERPPTX_AVATAR_TIMEOUT_MS = '360000'
    $env:BETTERPPTX_AVATAR_CANARY_IDEMPOTENCY_KEY = 'private-avatar-mcp-canary-' + [guid]::NewGuid().ToString('N')
    if ($ImagePath) { $env:BETTERPPTX_AVATAR_CANARY_IMAGE = [IO.Path]::GetFullPath($ImagePath) }
    node (Join-Path $PSScriptRoot '..\verify-private-avatar-mcp-canary.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Rotated MCP/PPTX canary failed' }
} finally {
    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item Env:BETTERPPTX_CREDENTIAL_STORE -ErrorAction SilentlyContinue
    Remove-Item Env:BETTERPPTX_FFMPEG_PATH -ErrorAction SilentlyContinue
    Remove-Item Env:BETTERPPTX_FFPROBE_PATH -ErrorAction SilentlyContinue
    Remove-Item Env:BETTERPPTX_AVATAR_TIMEOUT_MS -ErrorAction SilentlyContinue
    Remove-Item Env:BETTERPPTX_AVATAR_CANARY_IDEMPOTENCY_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:BETTERPPTX_AVATAR_CANARY_IMAGE -ErrorAction SilentlyContinue
}
