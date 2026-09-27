# Read-only gate for the registrar delegation step. Never changes DNS.
param(
    [datetimeoffset]$EarliestUtc = [datetimeoffset]'2026-09-23T15:00:00Z'
)

$ErrorActionPreference = 'Stop'
$domain = 'xmcpx.com'
$service = 'betterpptx.xmcpx.com'
$target = '13dd6bd9-29ab-436f-9cab-4188bed1848b.cfargotunnel.com'
$expectedA = @('34.216.117.25', '54.149.79.189')
$resolvers = @('1.1.1.1', '8.8.8.8', '9.9.9.9')
$authoritative = @('harmony.ns.cloudflare.com', 'langston.ns.cloudflare.com')

function Resolve-Records([string]$name, [string]$type, [string]$server) {
    return @(Resolve-DnsName -Name $name -Type $type -Server $server -ErrorAction Stop)
}

$oldDsCounts = [ordered]@{}
foreach ($server in $resolvers) {
    $oldDsCounts[$server] = @(
        Resolve-Records $domain 'DS' $server | Where-Object { $_.Type -eq 'DS' }
    ).Count
}

$staged = [ordered]@{}
foreach ($server in $authoritative) {
    $a = @(Resolve-Records $domain 'A' $server |
        Where-Object { $_.Type -eq 'A' } | ForEach-Object { $_.IPAddress } |
        Sort-Object -Unique)
    $cname = @(Resolve-Records $service 'CNAME' $server |
        Where-Object { $_.Type -eq 'CNAME' } |
        ForEach-Object { $_.NameHost.TrimEnd('.').ToLowerInvariant() } |
        Sort-Object -Unique)
    $staged[$server] = [ordered]@{
        apexA = $a
        apexMatches = @(Compare-Object $expectedA $a).Count -eq 0
        serviceCnameMatches = $cname.Count -eq 1 -and $cname[0] -eq $target
    }
}

$now = [datetimeoffset]::UtcNow
$timeReady = $now -ge $EarliestUtc
$dsReady = @($oldDsCounts.Values | Where-Object { $_ -ne 0 }).Count -eq 0
$zoneReady = @($staged.Values | Where-Object { -not $_.apexMatches -or -not $_.serviceCnameMatches }).Count -eq 0
$result = [ordered]@{
    checkedAtUtc = $now.ToString('o')
    earliestUtc = $EarliestUtc.ToString('o')
    oldDsCounts = $oldDsCounts
    stagedCloudflare = $staged
    readyForDelegation = $timeReady -and $dsReady -and $zoneReady
    reason = if (-not $timeReady) { 'safety-time-not-reached' }
        elseif (-not $dsReady) { 'old-ds-still-cached' }
        elseif (-not $zoneReady) { 'staged-zone-mismatch' }
        else { 'ready-for-operator-action' }
}
$result | ConvertTo-Json -Depth 6
if (-not $result.readyForDelegation) { exit 2 }
