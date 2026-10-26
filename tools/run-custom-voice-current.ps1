param(
    [string]$ModelDirectory = 'C:\Users\SafeUser\.codex\models\chatterbox-multilingual',
    [string]$ReferenceDirectory = 'C:\Users\SafeUser\.codex\models\chatterbox-references',
    [string]$Python = 'C:\Users\SafeUser\.codex\runtimes\chatterbox\Scripts\python.exe',
    [int]$Port = 5002
)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$output = Join-Path $taskRoot 'outputs/custom-voice-current'
[IO.Directory]::CreateDirectory($output) | Out-Null
$manifestSource = 'D:\PptxGenJS_Claude\outputs\chatterbox-narration-current\voice-manifest.json'
$manifestPath = Join-Path $output 'voice-manifest.json'
$model = (Resolve-Path -LiteralPath $ModelDirectory).Path
$references = (Resolve-Path -LiteralPath $ReferenceDirectory).Path
$runtime = Join-Path $taskRoot 'deploy/docker/chatterbox_http_runtime.py'
$voiceManifest = Get-Content -LiteralPath $manifestSource -Raw | ConvertFrom-Json
if ($voiceManifest.provider -ne 'chatterbox-http' -or $voiceManifest.modelVariant -ne 'multilingual') { throw 'Expected the existing multilingual manifest.' }
Copy-Item -LiteralPath $manifestSource -Destination $manifestPath
$env:CHATTERBOX_MODEL_DIR = $model
$env:CHATTERBOX_VOICES_MANIFEST = $manifestPath
$env:CHATTERBOX_REFERENCE_ROOT = $references
$env:CHATTERBOX_CUSTOM_REFERENCE_ROOT = Join-Path $output 'runtime-custom-cache'
$env:CHATTERBOX_DEVICE = 'cpu'
$env:CHATTERBOX_MODEL_VARIANT = 'multilingual'
$env:CHATTERBOX_CPU_THREADS = '4'
$env:CHATTERBOX_PORT = [string]$Port
$env:CHATTERBOX_LOCAL_DIAGNOSTICS = '1'
$env:CHATTERBOX_SEED = '7'
$env:HF_HUB_OFFLINE = '1'
$env:TRANSFORMERS_OFFLINE = '1'
$env:BETTERPPTX_CUSTOM_VOICE_ROOT = Join-Path $output 'private-voices'
$env:BETTERPPTX_TTS_PROVIDER = 'chatterbox-http'
$env:BETTERPPTX_CHATTERBOX_URL = "http://127.0.0.1:$Port"
$env:BETTERPPTX_CHATTERBOX_VOICES_MANIFEST = $manifestPath
$env:BETTERPPTX_TTS_RUNTIME_VERSION = '0.1.7-cpu-seed7-private-voice'
$env:BETTERPPTX_TTS_TIMEOUT_MS = '900000'
$env:BETTERPPTX_NARRATION_RESPONSE_TIMEOUT_MS = '900000'
$env:BETTERPPTX_TTS_MAX_CONCURRENCY = '1'
$env:BETTERPPTX_NARRATION_MODE = 'production'
$worker = $null
Push-Location $taskRoot
try {
    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw 'The selected local test port is already in use; existing services were left intact.' }
    $worker = Start-Process -FilePath $Python -ArgumentList @('"' + $runtime + '"') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $output 'runtime.stdout.log') -RedirectStandardError (Join-Path $output 'runtime.stderr.log')
    $ready = $false
    $deadline = [DateTime]::UtcNow.AddMinutes(5)
    while ([DateTime]::UtcNow -lt $deadline -and -not $worker.HasExited) {
        try { $health = Invoke-RestMethod "$($env:BETTERPPTX_CHATTERBOX_URL)/health" -TimeoutSec 3; $ready = ($health.ready -eq $true) } catch {}
        if ($ready) { break }
        Start-Sleep -Seconds 3
        $worker.Refresh()
    }
    if (-not $ready) { throw 'The real local speech model did not become ready. Inspect the bounded current runtime logs.' }
    node betterpptx-mcp/verify-custom-voice-current.mjs > (Join-Path $output 'acceptance-run.log') 2>&1
    if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath (Join-Path $output 'acceptance-run.log') -Tail 5; throw 'Private voice acceptance failed.' }
    Get-Content -LiteralPath (Join-Path $output 'acceptance-run.log') -Tail 1
} finally {
    if ($worker -and -not $worker.HasExited) { $worker.Kill($true); $worker.WaitForExit() }
    Pop-Location
}
