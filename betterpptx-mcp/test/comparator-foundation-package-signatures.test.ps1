$ErrorActionPreference = 'Stop'

function Assert-Equal {
    param([string]$Actual, [string]$Expected, [string]$Label)
    if ($Actual -cne $Expected) { throw "$Label mismatch. Expected '$Expected', got '$Actual'." }
}

function Assert-NotEqual {
    param([string]$Actual, [string]$Expected, [string]$Label)
    if ($Actual -ceq $Expected) { throw "$Label unexpectedly matched. Value: '$Actual'." }
}

function Convert-MapToText {
    param([hashtable]$Map)
    return @($Map.Keys | Sort-Object | ForEach-Object { "$_=$($Map[$_])" }) -join "`n"
}

$comparatorPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..\ULTIMATE_PPTX_XPATH_COMPARATOR_v2h_DECYPHER.ps1')).Path
$tokens = $null
$parseErrors = $null
$source = Get-Content -LiteralPath $comparatorPath -Raw -Encoding UTF8
$ast = [System.Management.Automation.Language.Parser]::ParseInput($source, $comparatorPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw "Comparator parse failed: $($parseErrors -join '; ')" }
$functionAsts = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true))
foreach ($name in @('Safe-SelectSingleNode', 'Normalize-XmlFragment', 'Resolve-PackageTargetPath', 'Get-RelMapForPart', 'Get-CachedPackageHash', 'Get-FoundationPackageProperties', 'Get-SlideBackgroundSignature')) {
    $definition = $functionAsts | Where-Object Name -eq $name | Select-Object -First 1
    if (-not $definition) { throw "Comparator helper '$name' was not found." }
    Invoke-Expression $definition.Extent.Text
}
if ($source -notmatch 'Compare-FoundationPackageProperties \(Get-FoundationPackageProperties \$refExtract\)') { throw 'Main comparator foundation integration was not found.' }
if ($source -notmatch '\$slideBackgroundIssues \+ \$structIssues') { throw 'Slide background issue count is not integrated into the comparator total.' }

$utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) "pptx-foundation-comparator-$([Guid]::NewGuid().ToString('N'))"

function Write-TextFile {
    param([string]$Path, [string]$Content)
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($Path)) | Out-Null
    [System.IO.File]::WriteAllText($Path, $Content.TrimStart(), $utf8NoBom)
}

function New-FoundationFixture {
    param(
        [string]$Name,
        [string]$Title = 'Foundation Proof',
        [string]$Company = 'Acme &amp; Co',
        [string]$Revision = '7',
        [string]$Rtl = '1',
        [string]$FirstSlideId = '256',
        [string]$SecondSlideId = '257',
        [string]$SectionGuid = '{11111111-1111-1111-1111-111111111111}',
        [string]$SectionMembers = 'first'
    )
    $root = Join-Path $fixtureRoot $Name
    Write-TextFile (Join-Path $root 'docProps\core.xml') @"
<?xml version="1.0" encoding="UTF-8"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>$Title</dc:title><dc:subject>Scope</dc:subject><dc:creator>Author</dc:creator><cp:lastModifiedBy>Author</cp:lastModifiedBy><cp:revision>$Revision</cp:revision>
</cp:coreProperties>
"@
    Write-TextFile (Join-Path $root 'docProps\app.xml') @"
<?xml version="1.0" encoding="UTF-8"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Company>$Company</Company></Properties>
"@
    $memberId = if ($SectionMembers -eq 'second') { $SecondSlideId } else { $FirstSlideId }
    Write-TextFile (Join-Path $root 'ppt\presentation.xml') @"
<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" rtl="$Rtl">
  <p:sldIdLst><p:sldId id="$FirstSlideId" r:id="rId2"/><p:sldId id="$SecondSlideId" r:id="rId3"/></p:sldIdLst>
  <p:extLst><p:ext uri="{521415D9-36F7-43E2-AB2F-B90AF26B5E84}"><p14:sectionLst><p14:section name="Overview" id="$SectionGuid"><p14:sldIdLst><p14:sldId id="$memberId"/></p14:sldIdLst></p14:section></p14:sectionLst></p:ext></p:extLst>
</p:presentation>
"@
    return $root
}

function New-BackgroundFixture {
    param([string]$Name, [string]$Color = '112233', [string]$Rid = 'rId5', [string]$Target = '../media/background.png', [byte]$Payload = 1)
    $root = Join-Path $fixtureRoot $Name
    $slidePath = Join-Path $root 'ppt\slides\slide1.xml'
    Write-TextFile $slidePath @"
<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="$Color"/></a:solidFill><a:effectLst/><a:blip r:embed="$Rid"/></p:bgPr></p:bg><p:spTree/></p:cSld></p:sld>
"@
    Write-TextFile (Join-Path $root 'ppt\slides\_rels\slide1.xml.rels') @"
<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="$Rid" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="$Target"/></Relationships>
"@
    $payloadPath = Join-Path $root ('ppt\' + $Target.Replace('../', '').Replace('/', '\'))
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($payloadPath)) | Out-Null
    [System.IO.File]::WriteAllBytes($payloadPath, [byte[]]($Payload, 2, 3, 4))
    [xml]$xml = Get-Content -LiteralPath $slidePath -Raw
    $ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
    $ns.AddNamespace('p', 'http://schemas.openxmlformats.org/presentationml/2006/main')
    $ns.AddNamespace('a', 'http://schemas.openxmlformats.org/drawingml/2006/main')
    $ns.AddNamespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    $relMap = Get-RelMapForPart $root (Join-Path $root 'ppt\slides\_rels\slide1.xml.rels')
    return Get-SlideBackgroundSignature $root 'ppt/slides/slide1.xml' $xml $ns $relMap
}

try {
    $baseline = New-FoundationFixture 'baseline'
    $sameSemantics = New-FoundationFixture 'same-semantics' -FirstSlideId '900' -SecondSlideId '901' -SectionGuid '{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}'
    $baselineText = Convert-MapToText (Get-FoundationPackageProperties $baseline)
    Assert-Equal (Convert-MapToText (Get-FoundationPackageProperties $sameSemantics)) $baselineText 'section GUID and slide-id normalization'

    foreach ($mutation in @(
        @{ Name='title'; Args=@{ Title='Changed title' } },
        @{ Name='company'; Args=@{ Company='Different company' } },
        @{ Name='revision'; Args=@{ Revision='8' } },
        @{ Name='rtl'; Args=@{ Rtl='0' } },
        @{ Name='section-membership'; Args=@{ SectionMembers='second' } }
    )) {
        $mutationArgs = $mutation.Args
        $root = New-FoundationFixture ("mutation-" + $mutation.Name) @mutationArgs
        Assert-NotEqual (Convert-MapToText (Get-FoundationPackageProperties $root)) $baselineText ($mutation.Name + ' mutation')
    }

    $background = New-BackgroundFixture 'background-a'
    Assert-Equal (New-BackgroundFixture 'background-same-payload' -Rid 'rId99' -Target '../media/renamed.png') $background 'background relationship-id/name normalization'
    Assert-NotEqual (New-BackgroundFixture 'background-color' -Color '445566') $background 'background color mutation'
    Assert-NotEqual (New-BackgroundFixture 'background-payload' -Payload 9) $background 'background payload mutation'

    Write-Host '[PASS] Foundation comparator signatures detect metadata, RTL, section topology, and background mutations.' -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}
