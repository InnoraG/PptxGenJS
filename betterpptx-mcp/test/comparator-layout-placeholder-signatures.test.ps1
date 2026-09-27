$ErrorActionPreference = 'Stop'

function Assert-Equal {
    param([string]$Actual, [string]$Expected, [string]$Label)
    if ($Actual -ne $Expected) {
        throw "$Label mismatch. Expected '$Expected', got '$Actual'."
    }
}

function Assert-NotEqual {
    param([string]$Actual, [string]$Expected, [string]$Label)
    if ($Actual -eq $Expected) {
        throw "$Label unexpectedly matched. Value: '$Actual'."
    }
}

function Assert-Match {
    param([string]$Actual, [string]$Pattern, [string]$Label)
    if ($Actual -notmatch $Pattern) {
        throw "$Label did not match '$Pattern'. Actual: '$Actual'."
    }
}

function Convert-SignatureMapToText {
    param([hashtable]$Map)
    return @($Map.Keys | Sort-Object | ForEach-Object { "$_=$($Map[$_])" }) -join "`n"
}

function New-LayoutXml {
    param(
        [string]$Type = 'clipArt',
        [string]$Idx = '0',
        [string]$Orient = 'vert',
        [string]$HasCustomPrompt = '1',
        [string]$X = '100',
        [switch]$OmitIdx,
        [switch]$OmitOrient,
        [switch]$OmitHasCustomPrompt,
        [switch]$MissingPlaceholder
    )

    $placeholder = if ($MissingPlaceholder) { '' } else {
        $attributes = @("type=`"$Type`"", 'sz="half"')
        if (-not $OmitIdx) { $attributes += "idx=`"$Idx`"" }
        if (-not $OmitOrient) { $attributes += "orient=`"$Orient`"" }
        if (-not $OmitHasCustomPrompt) { $attributes += "hasCustomPrompt=`"$HasCustomPrompt`"" }
        $attributeText = $attributes -join ' '
@"
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Layout ClipArt Placeholder"/>
          <p:cNvSpPr/><p:nvPr><p:ph $attributeText/></p:nvPr>
        </p:nvSpPr>
        <p:spPr><a:xfrm rot="60000" flipH="1"><a:off x="$X" y="200"/><a:ext cx="300" cy="400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>
      </p:sp>
"@
    }

    return @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             type="blank" preserve="1">
  <p:cSld name="ClipArt Layout"><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
$placeholder
  </p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>
"@
}

function New-MasterXml {
    return @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld name="ClipArt Master"><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    <p:sp>
      <p:nvSpPr>
        <p:cNvPr id="2" name="Master ClipArt Placeholder"/>
        <p:cNvSpPr/><p:nvPr><p:ph type="clipArt" idx="9" sz="quarter" orient="horz" hasCustomPrompt="0"/></p:nvPr>
      </p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="500" y="600"/><a:ext cx="700" cy="800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
  <p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles>
</p:sldMaster>
"@
}

$comparatorPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..\ULTIMATE_PPTX_XPATH_COMPARATOR_v2h_DECYPHER.ps1')).Path
$tokens = $null
$parseErrors = $null
$comparatorSource = Get-Content -LiteralPath $comparatorPath -Raw -Encoding UTF8
$ast = [System.Management.Automation.Language.Parser]::ParseInput($comparatorSource, $comparatorPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw "Comparator parse failed: $($parseErrors -join '; ')" }

$functionNames = @(
    'Safe-SelectNodes',
    'Safe-SelectSingleNode',
    'Get-RelativePackagePath',
    'Get-XmlAttributeCensus',
    'Get-NormalizedPlaceholderAttributeSignature',
    'Get-PlaceholderTopologySignatures'
)
$functionAsts = @($ast.FindAll({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst]
}, $true))
foreach ($functionName in $functionNames) {
    $definition = $functionAsts | Where-Object Name -eq $functionName | Select-Object -First 1
    if (-not $definition) { throw "Comparator helper '$functionName' was not found." }
    Invoke-Expression $definition.Extent.Text
}
Assert-Match $comparatorSource "Compare-StringMaps 'layout/master placeholder topology'" 'main comparator integration'

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) "pptx-layout-placeholder-comparator-$([Guid]::NewGuid().ToString('N'))"
[System.IO.Directory]::CreateDirectory($fixtureRoot) | Out-Null

function Write-TextFile {
    param([string]$Path, [string]$Content)
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($Path)) | Out-Null
    [System.IO.File]::WriteAllText($Path, $Content.TrimStart(), $utf8NoBom)
}

function New-PptxFixture {
    param([string]$Name, [string]$LayoutXml, [string]$MasterXml)

    $sourceRoot = Join-Path $fixtureRoot "$Name-source"
    $extractRoot = Join-Path $fixtureRoot "$Name-extract"
    $zipPath = Join-Path $fixtureRoot "$Name.pptx"
    [System.IO.Directory]::CreateDirectory($sourceRoot) | Out-Null

    Write-TextFile (Join-Path $sourceRoot '[Content_Types].xml') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
</Types>
'@
    Write-TextFile (Join-Path (Join-Path $sourceRoot '_rels') '.rels') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>
'@
    Write-TextFile (Join-Path (Join-Path $sourceRoot 'ppt') 'presentation.xml') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>
'@
    Write-TextFile (Join-Path (Join-Path (Join-Path $sourceRoot 'ppt') '_rels') 'presentation.xml.rels') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
</Relationships>
'@
    Write-TextFile (Join-Path (Join-Path (Join-Path $sourceRoot 'ppt') 'slideLayouts') 'slideLayout1.xml') $LayoutXml
    Write-TextFile (Join-Path (Join-Path (Join-Path $sourceRoot 'ppt') 'slideMasters') 'slideMaster1.xml') $MasterXml
    Write-TextFile (Join-Path (Join-Path (Join-Path (Join-Path $sourceRoot 'ppt') 'slideLayouts') '_rels') 'slideLayout1.xml.rels') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>
'@
    Write-TextFile (Join-Path (Join-Path (Join-Path (Join-Path $sourceRoot 'ppt') 'slideMasters') '_rels') 'slideMaster1.xml.rels') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>
'@

    [System.IO.Compression.ZipFile]::CreateFromDirectory($sourceRoot, $zipPath)
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $extractRoot)
    return [PSCustomObject]@{ ZipPath = $zipPath; ExtractRoot = $extractRoot }
}

try {
    $masterXml = New-MasterXml
    $baselineA = New-PptxFixture 'baseline-a' (New-LayoutXml) $masterXml
    $baselineB = New-PptxFixture 'baseline-b' (New-LayoutXml) $masterXml
    $baselineMap = Get-PlaceholderTopologySignatures $baselineA.ExtractRoot
    $matchingMap = Get-PlaceholderTopologySignatures $baselineB.ExtractRoot
    $baselineText = Convert-SignatureMapToText $baselineMap
    Assert-Equal (Convert-SignatureMapToText $matchingMap) $baselineText 'matching zipped fixtures'

    $layoutSummaryKey = 'ppt/slideLayouts/slideLayout1.xml|summary'
    $layoutPlaceholderKey = 'ppt/slideLayouts/slideLayout1.xml|placeholder1'
    $masterSummaryKey = 'ppt/slideMasters/slideMaster1.xml|summary'
    Assert-Equal $baselineMap[$layoutSummaryKey] 'carrierKind=layout|carrierName=ClipArt Layout|placeholderCount=1' 'layout presence/count'
    Assert-Equal $baselineMap[$masterSummaryKey] 'carrierKind=master|carrierName=ClipArt Master|placeholderCount=1' 'master presence/count'
    Assert-Match $baselineMap[$layoutPlaceholderKey] '^parentKind=sp\|parentName=Layout ClipArt Placeholder\|type=clipArt\|idx=0\|sz=half\|orient=<ignored>\|hasCustomPrompt=1\|' 'layout placeholder identity and zero index'
    Assert-Match $baselineMap[$layoutPlaceholderKey] 'rot=60000\|flipH=1\|flipV=<unset>\|x=100\|y=200\|cx=300\|cy=400' 'layout placeholder transform'

    $officeSource = New-PptxFixture 'office-source' (New-LayoutXml -HasCustomPrompt '0') $masterXml
    $officeCanonicalMaster = $masterXml.Replace(' orient="horz" hasCustomPrompt="0"', '')
    $officeCanonical = New-PptxFixture 'office-canonical' (New-LayoutXml -HasCustomPrompt '0' -OmitIdx -OmitOrient -OmitHasCustomPrompt) $officeCanonicalMaster
    Assert-Equal (Convert-SignatureMapToText (Get-PlaceholderTopologySignatures $officeCanonical.ExtractRoot)) (Convert-SignatureMapToText (Get-PlaceholderTopologySignatures $officeSource.ExtractRoot)) 'Office clipArt default omission equivalence'
    [xml]$officeSourceLayoutXml = New-LayoutXml -HasCustomPrompt '0'
    [xml]$officeCanonicalLayoutXml = New-LayoutXml -HasCustomPrompt '0' -OmitIdx -OmitOrient -OmitHasCustomPrompt
    Assert-Equal (Convert-SignatureMapToText (Get-XmlAttributeCensus $officeCanonicalLayoutXml)) (Convert-SignatureMapToText (Get-XmlAttributeCensus $officeSourceLayoutXml)) 'Office clipArt attribute census equivalence'

    $nonClipVertical = New-PptxFixture 'non-clip-vertical' (New-LayoutXml -Type 'pic' -Orient 'vert') $masterXml
    $nonClipHorizontal = New-PptxFixture 'non-clip-horizontal' (New-LayoutXml -Type 'pic' -Orient 'horz') $masterXml
    Assert-NotEqual (Convert-SignatureMapToText (Get-PlaceholderTopologySignatures $nonClipHorizontal.ExtractRoot)) (Convert-SignatureMapToText (Get-PlaceholderTopologySignatures $nonClipVertical.ExtractRoot)) 'non-clipArt orientation mutation'
    [xml]$nonClipLayoutXml = New-LayoutXml -Type 'pic'
    if (-not (Get-XmlAttributeCensus $nonClipLayoutXml).ContainsKey('orient')) { throw 'Non-clipArt orientation was unexpectedly excluded from the attribute census.' }

    $mutations = @(
        [PSCustomObject]@{ Name = 'type'; Xml = (New-LayoutXml -Type 'pic') },
        [PSCustomObject]@{ Name = 'idx-from-zero'; Xml = (New-LayoutXml -Idx '1') },
        [PSCustomObject]@{ Name = 'custom-prompt'; Xml = (New-LayoutXml -HasCustomPrompt '0') },
        [PSCustomObject]@{ Name = 'geometry'; Xml = (New-LayoutXml -X '101') },
        [PSCustomObject]@{ Name = 'missing-placeholder'; Xml = (New-LayoutXml -MissingPlaceholder) }
    )
    foreach ($mutation in $mutations) {
        $fixture = New-PptxFixture "mutation-$($mutation.Name)" $mutation.Xml $masterXml
        $mutationMap = Get-PlaceholderTopologySignatures $fixture.ExtractRoot
        Assert-NotEqual (Convert-SignatureMapToText $mutationMap) $baselineText "$($mutation.Name) mutation"
        if ($mutation.Name -eq 'missing-placeholder') {
            Assert-Equal $mutationMap[$layoutSummaryKey] 'carrierKind=layout|carrierName=ClipArt Layout|placeholderCount=0' 'missing placeholder count'
            if ($mutationMap.ContainsKey($layoutPlaceholderKey)) { throw 'Missing-placeholder fixture unexpectedly retained a placeholder signature.' }
        }
    }

    Write-Host '[PASS] Layout/master placeholder comparator signatures normalize Office defaults and detect focused mutations.' -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $fixtureRoot) {
        Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
    }
}
