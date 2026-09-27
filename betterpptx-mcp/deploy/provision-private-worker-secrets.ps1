param(
    [string[]]$Profiles = @('betterpptx-flux', 'betterpptx-fluxworkerai1')
)
$ErrorActionPreference = 'Stop'

function New-OwnerToken {
    $bytes = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return [Convert]::ToBase64String($bytes)
}

foreach ($profile in $Profiles) {
    $temp = Join-Path $env:TEMP ("betterpptx-private-worker-secret-" + [guid]::NewGuid().ToString('N') + '.env')
    try {
        $token = New-OwnerToken
        Set-Content -LiteralPath $temp -Value ("IMAGE_EDIT_ENDPOINT_TOKEN=" + $token) -NoNewline
        $env:MODAL_PROFILE = $profile
        & python -m modal secret create betterpptx-image-edit-token --from-dotenv $temp --force | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "image-edit secret creation failed for profile $profile" }
        Write-Output ("image-edit secret ready: " + $profile)
    } finally {
        Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
    }
}

Write-Output 'Secret values were never printed or persisted locally by this script.'
