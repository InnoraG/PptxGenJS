$ErrorActionPreference = 'Stop'

function Assert-Equal {
    param([string]$Actual, [string]$Expected, [string]$Label)
    if ($Actual -ne $Expected) {
        throw "$Label mismatch.`nExpected:`n$Expected`nActual:`n$Actual"
    }
}

function Assert-NotEqual {
    param([string]$Actual, [string]$Expected, [string]$Label)
    if ($Actual -eq $Expected) {
        throw "$Label unexpectedly matched.`nValue:`n$Actual"
    }
}

function Assert-Match {
    param([string]$Actual, [string]$Pattern, [string]$Label)
    if ($Actual -notmatch $Pattern) {
        throw "$Label did not match '$Pattern'.`nActual:`n$Actual"
    }
}

function Convert-SignatureMapToText {
    param([hashtable]$Map)
    return @($Map.Keys | Sort-Object | ForEach-Object { "$_=$($Map[$_])" }) -join "`n"
}

function New-LayoutXml {
    param(
        [string]$ChartType = 'chart',
        [string]$ChartIdx = '0',
        [string]$ChartX = '100',
        [switch]$OmitChartIdx,
        [switch]$OmitChartDefaults,
        [switch]$MissingChartPlaceholder
    )

    $chartAttributes = @('type="{0}"' -f $ChartType)
    if (-not $OmitChartIdx) { $chartAttributes += ('idx="{0}"' -f $ChartIdx) }
    if (-not $OmitChartDefaults) {
        $chartAttributes += 'sz="full"'
        $chartAttributes += 'hasCustomPrompt="0"'
    }
    $chartPlaceholder = if ($MissingChartPlaceholder) { '' } else { "<p:ph $($chartAttributes -join ' ')/>" }

    return @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             type="blank" preserve="1">
  <p:cSld name="Graphic Placeholder Layout"><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    <p:graphicFrame>
      <p:nvGraphicFramePr>
        <p:cNvPr id="2" name="Chart Placeholder 1"/>
        <p:cNvGraphicFramePr/><p:nvPr>$chartPlaceholder</p:nvPr>
      </p:nvGraphicFramePr>
      <p:xfrm><a:off x="$ChartX" y="200"/><a:ext cx="300" cy="400"/></p:xfrm>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"/></a:graphic>
    </p:graphicFrame>
    <p:graphicFrame>
      <p:nvGraphicFramePr>
        <p:cNvPr id="3" name="Table Placeholder 2"/>
        <p:cNvGraphicFramePr/><p:nvPr><p:ph type="tbl" idx="5" sz="half" hasCustomPrompt="1"/></p:nvPr>
      </p:nvGraphicFramePr>
      <p:xfrm><a:off x="500" y="600"/><a:ext cx="700" cy="800"/></p:xfrm>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"/></a:graphic>
    </p:graphicFrame>
  </p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>
"@
}

function New-SlideXml {
    param([string]$ShowMasterSpAttribute = '')
    $rootAttribute = if ($ShowMasterSpAttribute) { ' showMasterSp="{0}"' -f $ShowMasterSpAttribute } else { '' }
    return @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"$rootAttribute>
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
  </p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>
"@
}

function New-MasterXml {
    return @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld name="Graphic Placeholder Master"><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Master Sentinel"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="900" y="1000"/><a:ext cx="1100" cy="1200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
    </p:sp>
  </p:spTree></p:cSld>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles>
</p:sldMaster>
'@
}

function New-ThemeXml {
    return @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Graphic Placeholder Theme">
  <a:themeElements><a:clrScheme name="Minimal"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1></a:clrScheme><a:fontScheme name="Minimal"><a:majorFont><a:latin typeface="Aptos"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme><a:fmtScheme name="Minimal"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme></a:themeElements>
</a:theme>
'@
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
    'Normalize-XmlFragment',
    'Get-RelativePackagePath',
    'Get-NormalizedPlaceholderAttributeSignature',
    'Get-PlaceholderTopologySignatures',
    'Resolve-PackageTargetPath',
    'Get-RelMapForPart',
    'Get-PartRelPathFromFullPath',
    'Get-ElementSemanticPath',
    'Get-RelationshipTargetSemanticSignature',
    'Get-RelationshipIndependentXmlSignature',
    'Get-NormalizedBooleanAttribute',
    'Get-UniqueInheritanceRelationship',
    'Get-InheritancePlaceholderRecords',
    'Get-InheritanceNodeSequenceSignature',
    'Get-InheritanceTextBodySignature',
    'Get-InheritanceOwnerPayload',
    'Get-InheritanceEffectiveComponentSignature',
    'Get-InheritanceColorMapOverrideSignature',
    'Get-InteractiveLogicalChildren',
    'Get-InheritanceFixedObjects',
    'Get-ExactUnicodeTextSignature',
    'Get-ResolvedLayoutInheritanceSignatures'
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
Assert-Match $comparatorSource "Compare-StringMaps 'layout/master placeholder topology'" 'placeholder topology integration'
Assert-Match $comparatorSource "Compare-StringMaps 'resolved layout master theme inheritance'" 'visibility integration'

$utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) "pptx-layout-graphic-placeholder-comparator-$([Guid]::NewGuid().ToString('N'))"
[System.IO.Directory]::CreateDirectory($fixtureRoot) | Out-Null

function Write-TextFile {
    param([string]$Path, [string]$Content)
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($Path)) | Out-Null
    [System.IO.File]::WriteAllText($Path, $Content.TrimStart(), $utf8NoBom)
}

function New-ExtractedFixture {
    param(
        [string]$Name,
        [string]$LayoutXml,
        [string]$ShowMasterSpAttribute = ''
    )
    $root = Join-Path $fixtureRoot $Name
    [System.IO.Directory]::CreateDirectory($root) | Out-Null
    Write-TextFile (Join-Path $root 'ppt\slides\slide1.xml') (New-SlideXml -ShowMasterSpAttribute $ShowMasterSpAttribute)
    Write-TextFile (Join-Path $root 'ppt\slides\_rels\slide1.xml.rels') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>
'@
    Write-TextFile (Join-Path $root 'ppt\slideLayouts\slideLayout1.xml') $LayoutXml
    Write-TextFile (Join-Path $root 'ppt\slideLayouts\_rels\slideLayout1.xml.rels') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>
'@
    Write-TextFile (Join-Path $root 'ppt\slideMasters\slideMaster1.xml') (New-MasterXml)
    Write-TextFile (Join-Path $root 'ppt\slideMasters\_rels\slideMaster1.xml.rels') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>
'@
    Write-TextFile (Join-Path $root 'ppt\theme\theme1.xml') (New-ThemeXml)
    return $root
}

try {
    $baseline = New-ExtractedFixture 'baseline' (New-LayoutXml)
    $equivalent = New-ExtractedFixture 'equivalent' (New-LayoutXml -OmitChartIdx -OmitChartDefaults) -ShowMasterSpAttribute 'true'
    $typeMutation = New-ExtractedFixture 'type-mutation' (New-LayoutXml -ChartType 'tbl')
    $missingMutation = New-ExtractedFixture 'missing-mutation' (New-LayoutXml -MissingChartPlaceholder)
    $idxMutation = New-ExtractedFixture 'idx-mutation' (New-LayoutXml -ChartIdx '7')
    $geometryMutation = New-ExtractedFixture 'geometry-mutation' (New-LayoutXml -ChartX '101')
    $visibilityMutation = New-ExtractedFixture 'visibility-mutation' (New-LayoutXml) -ShowMasterSpAttribute 'false'

    $baselineTopology = Get-PlaceholderTopologySignatures $baseline
    $baselineTopologyText = Convert-SignatureMapToText $baselineTopology
    $equivalentTopologyText = Convert-SignatureMapToText (Get-PlaceholderTopologySignatures $equivalent)
    Assert-Equal $equivalentTopologyText $baselineTopologyText 'idx=0/sz=full/hasCustomPrompt=0 normalization'

    $chartKey = 'ppt/slideLayouts/slideLayout1.xml|placeholder1'
    $tableKey = 'ppt/slideLayouts/slideLayout1.xml|placeholder2'
    Assert-Match $baselineTopology[$chartKey] '^parentKind=graphicFrame\|parentName=Chart Placeholder 1\|type=chart\|idx=0\|sz=full\|orient=<unset>\|hasCustomPrompt=0\|' 'chart graphic-frame placeholder signature'
    Assert-Match $baselineTopology[$tableKey] '^parentKind=graphicFrame\|parentName=Table Placeholder 2\|type=tbl\|idx=5\|sz=half\|orient=<unset>\|hasCustomPrompt=1\|' 'table graphic-frame placeholder signature'

    foreach ($mutation in @(
        [PSCustomObject]@{ Name = 'chart-to-tbl'; Root = $typeMutation },
        [PSCustomObject]@{ Name = 'missing-chart-placeholder'; Root = $missingMutation },
        [PSCustomObject]@{ Name = 'chart-idx'; Root = $idxMutation },
        [PSCustomObject]@{ Name = 'chart-geometry'; Root = $geometryMutation }
    )) {
        $mutationText = Convert-SignatureMapToText (Get-PlaceholderTopologySignatures $mutation.Root)
        Assert-NotEqual $mutationText $baselineTopologyText $mutation.Name
    }

    $baselineInheritanceText = Convert-SignatureMapToText (Get-ResolvedLayoutInheritanceSignatures $baseline)
    $equivalentInheritanceText = Convert-SignatureMapToText (Get-ResolvedLayoutInheritanceSignatures $equivalent)
    $visibilityInheritance = Get-ResolvedLayoutInheritanceSignatures $visibilityMutation
    $visibilityInheritanceText = Convert-SignatureMapToText $visibilityInheritance
    Assert-Equal $equivalentInheritanceText $baselineInheritanceText 'showMasterSp default/true normalization'
    Assert-NotEqual $visibilityInheritanceText $baselineInheritanceText 'showMasterSp false mutation'
    Assert-Match $visibilityInheritance['inheritance|ppt/slides/slide1.xml|flags'] '^showMasterSp=0\|' 'showMasterSp false flag'
    Assert-Match $visibilityInheritance['inheritance|ppt/slides/slide1.xml|fixedObjectVisibility'] 'slideShowMasterSp=0\|.*masterVisible=0\|.*masterCount=1' 'showMasterSp effective master visibility'

    Write-Host '[PASS] Production comparator signatures normalize equivalent placeholder/default visibility forms and detect chart/table graphic-frame placeholder plus showMasterSp mutations.' -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $fixtureRoot) {
        Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
    }
}
