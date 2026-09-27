$ErrorActionPreference = 'Stop'

function Assert-Equal {
    param([string]$Actual, [string]$Expected, [string]$Label)
    if ($Actual -ne $Expected) { throw "$Label mismatch.`nEXPECTED:`n$Expected`nACTUAL:`n$Actual" }
}
function Assert-NotEqual {
    param([string]$Actual, [string]$Expected, [string]$Label)
    if ($Actual -eq $Expected) { throw "$Label unexpectedly matched." }
}
function Assert-Match {
    param([string]$Actual, [string]$Pattern, [string]$Label)
    if ($Actual -notmatch $Pattern) { throw "$Label did not match '$Pattern'. Actual: '$Actual'." }
}
function Map-Text {
    param([hashtable]$Map)
    return @($Map.Keys | Sort-Object | ForEach-Object { "$_=$($Map[$_])" }) -join "`n"
}

$comparatorPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..\ULTIMATE_PPTX_XPATH_COMPARATOR_v2h_DECYPHER.ps1')).Path
$tokens = $null
$parseErrors = $null
$source = Get-Content -LiteralPath $comparatorPath -Raw -Encoding UTF8
$ast = [System.Management.Automation.Language.Parser]::ParseInput($source, $comparatorPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw "Comparator parse failed: $($parseErrors -join '; ')" }
$functionNames = @(
    'Normalize-XmlFragment',
    'Get-RelativePackagePath',
    'Resolve-PackageTargetPath',
    'Get-RelMapForPart',
    'Get-PartRelPathFromFullPath',
    'Get-PackageContentTypes',
    'Get-PackageContentType',
    'Get-AttrByLocalName',
    'Get-ElementSemanticPath',
    'Get-RelationshipTargetSemanticSignature',
    'Copy-NamespaceCanonicalXmlNode',
    'Get-NamespaceCanonicalXmlSignature',
    'Get-RelationshipIndependentNamespaceCanonicalXmlSignature',
    'Get-CachedPackageHash',
    'Get-ExactUnicodeTextSignature',
    'Get-ChartRelatedPartSignature',
    'Get-NormalizedChartPartSignature',
    'Get-ChartPackageSemanticSignatures'
)
$functionAsts = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true))
foreach ($name in $functionNames) {
    $definition = $functionAsts | Where-Object Name -eq $name | Select-Object -First 1
    if (-not $definition) { throw "Comparator helper '$name' was not found." }
    Invoke-Expression $definition.Extent.Text
}
Assert-Match $source "Compare-StringMaps 'native chart and ChartEx package semantics'" 'main comparator integration'

$utf8 = New-Object System.Text.UTF8Encoding -ArgumentList $false
$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) "pptx-chart-comparator-$([Guid]::NewGuid().ToString('N'))"
[System.IO.Directory]::CreateDirectory($fixtureRoot) | Out-Null

function Write-Text {
    param([string]$Path, [string]$Content)
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($Path)) | Out-Null
    [System.IO.File]::WriteAllText($Path, $Content.TrimStart(), $utf8)
}
function New-ChartFixture {
    param([string]$Name, [switch]$Renumber)
    $root = Join-Path $fixtureRoot $Name
    [System.IO.Directory]::CreateDirectory($root) | Out-Null
    if ($Renumber) {
        $legacyPart='chart9.xml'; $chartExPart='chart8.xml'; $stylePart='style7.xml'; $colorPart='colors6.xml'; $workbookPart='data5.xlsx'
        $slideLegacyRid='legacyChartRelationship'; $slideChartExRid='modernChartRelationship'; $workbookRid='workbookRelationship'; $styleRid='styleRelationship'; $colorRid='colorRelationship'
        $cPrefix='z'; $aPrefix='draw'; $cxPrefix='modern'
    } else {
        $legacyPart='chart1.xml'; $chartExPart='chart2.xml'; $stylePart='style1.xml'; $colorPart='colors1.xml'; $workbookPart='book1.xlsx'
        $slideLegacyRid='rId1'; $slideChartExRid='rId7'; $workbookRid='rId2'; $styleRid='rId3'; $colorRid='rId4'
        $cPrefix='c'; $aPrefix='a'; $cxPrefix='cx'
    }
    Write-Text (Join-Path $root '[Content_Types].xml') @"
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/charts/$legacyPart" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
  <Override PartName="/ppt/charts/$chartExPart" ContentType="application/vnd.ms-office.chartex+xml"/>
  <Override PartName="/ppt/charts/$stylePart" ContentType="application/vnd.ms-office.chartstyle+xml"/>
  <Override PartName="/ppt/charts/$colorPart" ContentType="application/vnd.ms-office.chartcolorstyle+xml"/>
  <Override PartName="/ppt/embeddings/$workbookPart" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/>
</Types>
"@
    Write-Text (Join-Path $root 'ppt\slides\slide1.xml') @"
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="2" name="Revenue chart"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="100" y="200"/><a:ext cx="300" cy="400"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="$slideLegacyRid"/></a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld></p:sld>
"@
    Write-Text (Join-Path $root 'ppt\slides\_rels\slide1.xml.rels') "<Relationships xmlns=`"http://schemas.openxmlformats.org/package/2006/relationships`"><Relationship Id=`"$slideLegacyRid`" Type=`"http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart`" Target=`"../charts/$legacyPart`"/></Relationships>"
    Write-Text (Join-Path $root 'ppt\slides\slide2.xml') @"
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="2" name="Modern waterfall"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="500" y="600"/><a:ext cx="700" cy="800"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/drawing/2014/chartex"><cx:chart r:id="$slideChartExRid"/></a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld></p:sld>
"@
    Write-Text (Join-Path $root 'ppt\slides\_rels\slide2.xml.rels') "<Relationships xmlns=`"http://schemas.openxmlformats.org/package/2006/relationships`"><Relationship Id=`"$slideChartExRid`" Type=`"http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart`" Target=`"../charts/$chartExPart`"/></Relationships>"

    Write-Text (Join-Path $root "ppt\charts\$legacyPart") @"
<$cPrefix`:chartSpace xmlns:$cPrefix="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:$aPrefix="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><$cPrefix`:style val="4"/><$cPrefix`:chart><$cPrefix`:plotArea><$cPrefix`:layout><$cPrefix`:manualLayout><$cPrefix`:xMode val="factor"/><$cPrefix`:yMode val="factor"/></$cPrefix`:manualLayout></$cPrefix`:layout><$cPrefix`:barChart><$cPrefix`:barDir val="col"/><$cPrefix`:grouping val="clustered"/><$cPrefix`:varyColors val="0"/><$cPrefix`:ser><$cPrefix`:idx val="0"/><$cPrefix`:order val="0"/><$cPrefix`:tx><$cPrefix`:v>Revenue</$cPrefix`:v></$cPrefix`:tx><$cPrefix`:dLbls><$cPrefix`:showVal val="1"/><$cPrefix`:showCatName val="0"/></$cPrefix`:dLbls><$cPrefix`:cat><$cPrefix`:strLit><$cPrefix`:ptCount val="2"/><$cPrefix`:pt idx="0"><$cPrefix`:v>A</$cPrefix`:v></$cPrefix`:pt><$cPrefix`:pt idx="1"><$cPrefix`:v>B</$cPrefix`:v></$cPrefix`:pt></$cPrefix`:strLit></$cPrefix`:cat><$cPrefix`:val><$cPrefix`:numLit><$cPrefix`:formatCode>0</$cPrefix`:formatCode><$cPrefix`:ptCount val="2"/><$cPrefix`:pt idx="0"><$cPrefix`:v>10</$cPrefix`:v></$cPrefix`:pt><$cPrefix`:pt idx="1"><$cPrefix`:v>20</$cPrefix`:v></$cPrefix`:pt></$cPrefix`:numLit></$cPrefix`:val><$cPrefix`:spPr><$aPrefix`:solidFill><$aPrefix`:srgbClr val="3366FF"/></$aPrefix`:solidFill></$cPrefix`:spPr><$cPrefix`:axId val="11"/><$cPrefix`:axId val="22"/></$cPrefix`:ser></$cPrefix`:barChart><$cPrefix`:catAx><$cPrefix`:axId val="11"/><$cPrefix`:axPos val="b"/><$cPrefix`:majorGridlines/><$cPrefix`:crossAx val="22"/></$cPrefix`:catAx><$cPrefix`:valAx><$cPrefix`:axId val="22"/><$cPrefix`:axPos val="l"/><$cPrefix`:majorGridlines/><$cPrefix`:crossAx val="11"/></$cPrefix`:valAx><$cPrefix`:dTable><$cPrefix`:showHorzBorder val="1"/><$cPrefix`:showKeys val="1"/></$cPrefix`:dTable></$cPrefix`:plotArea><$cPrefix`:legend><$cPrefix`:legendPos val="b"/></$cPrefix`:legend><$cPrefix`:plotVisOnly val="1"/></$cPrefix`:chart><$cPrefix`:externalData r:id="$workbookRid"/></$cPrefix`:chartSpace>
"@
    Write-Text (Join-Path $root "ppt\charts\_rels\$legacyPart.rels") @"
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="$workbookRid" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="../embeddings/$workbookPart"/><Relationship Id="$styleRid" Type="http://schemas.microsoft.com/office/2011/relationships/chartStyle" Target="$stylePart"/><Relationship Id="$colorRid" Type="http://schemas.microsoft.com/office/2011/relationships/chartColorStyle" Target="$colorPart"/></Relationships>
"@
    Write-Text (Join-Path $root "ppt\charts\$stylePart") "<$aPrefix`:chartStyle xmlns:$aPrefix=`"http://schemas.microsoft.com/office/drawing/2012/chartStyle`" id=`"102`"><$aPrefix`:axisTitle><$aPrefix`:fill><$aPrefix`:solidFill><$aPrefix`:srgbClr val=`"112233`"/></$aPrefix`:solidFill></$aPrefix`:fill></$aPrefix`:axisTitle></$aPrefix`:chartStyle>"
    Write-Text (Join-Path $root "ppt\charts\$colorPart") "<$aPrefix`:colorStyle xmlns:$aPrefix=`"http://schemas.microsoft.com/office/drawing/2012/chartStyle`" meth=`"cycle`" id=`"10`"><$aPrefix`:schemeClr val=`"accent1`"/></$aPrefix`:colorStyle>"
    [System.IO.Directory]::CreateDirectory((Join-Path $root 'ppt\embeddings')) | Out-Null
    [System.IO.File]::WriteAllBytes((Join-Path $root "ppt\embeddings\$workbookPart"), [byte[]](1,2,3,4,5,6))

    Write-Text (Join-Path $root "ppt\charts\$chartExPart") @"
<$cxPrefix`:chartSpace xmlns:$cxPrefix="http://schemas.microsoft.com/office/drawing/2014/chartex"><$cxPrefix`:chart><$cxPrefix`:plotArea><$cxPrefix`:plotAreaRegion><$cxPrefix`:series layoutId="waterfall"><$cxPrefix`:dataLabels pos="outEnd"/><$cxPrefix`:data><$cxPrefix`:numDim type="val"><$cxPrefix`:f>Sheet1!B2:B4</$cxPrefix`:f><$cxPrefix`:numLit><$cxPrefix`:pt idx="0"><$cxPrefix`:v>4</$cxPrefix`:v></$cxPrefix`:pt></$cxPrefix`:numLit></$cxPrefix`:numDim></$cxPrefix`:data></$cxPrefix`:series></$cxPrefix`:plotAreaRegion></$cxPrefix`:plotArea></$cxPrefix`:chart></$cxPrefix`:chartSpace>
"@
    return $root
}
function New-Mutation {
    param([string]$Name, [string]$Relative, [string]$Old, [string]$New, [switch]$Delete, [switch]$Binary)
    $root = Join-Path $fixtureRoot $Name
    Copy-Item -LiteralPath $baseline -Destination $root -Recurse
    $path = Join-Path $root $Relative
    if ($Delete) { Remove-Item -LiteralPath $path -Force }
    elseif ($Binary) { [System.IO.File]::WriteAllBytes($path, [byte[]](9,8,7,6)) }
    else {
        $text = [System.IO.File]::ReadAllText($path)
        if (-not $text.Contains($Old)) { throw "$Name token not found: $Old" }
        [System.IO.File]::WriteAllText($path, $text.Replace($Old, $New), $utf8)
    }
    return $root
}

try {
    $baseline = New-ChartFixture 'baseline'
    $equivalent = New-ChartFixture 'equivalent' -Renumber
    $baselineMap = Get-ChartPackageSemanticSignatures $baseline
    $baselineText = Map-Text $baselineMap
    Assert-Equal (Map-Text (Get-ChartPackageSemanticSignatures $equivalent)) $baselineText 'relationship, part-name, and namespace-prefix independence'
    Assert-Match $baselineMap['chart|ppt/slides/slide1.xml|0000'] 'barChart' 'legacy chart payload'
    Assert-Match $baselineMap['chart|ppt/slides/slide1.xml|0000'] 'chartStyle.*112233' 'chart style part payload'
    Assert-Match $baselineMap['chart|ppt/slides/slide1.xml|0000'] 'chartColorStyle.*accent1' 'chart color part payload'
    Assert-Match $baselineMap['chart|ppt/slides/slide1.xml|0000'] 'spreadsheetml.sheet.*sha256=' 'embedded workbook payload'
    Assert-Match $baselineMap['chart|ppt/slides/slide1.xml|0000'] 'x=100' 'chart-frame transform payload'
    Assert-Match $baselineMap['chart|ppt/slides/slide2.xml|0000'] 'layoutId=waterfall' 'ChartEx payload'
    if ($baselineText -match 'chart1\.xml|style1\.xml|colors1\.xml|book1\.xlsx|rId[0-9]') { throw 'Semantic chart map leaked relationship IDs or package-local part names.' }

    $mutations = @(
        [PSCustomObject]@{ Name='legacy-type'; Relative='ppt\charts\chart1.xml'; Old='barChart'; New='lineChart'; Key='chart|ppt/slides/slide1.xml|0000' },
        [PSCustomObject]@{ Name='style-selector'; Relative='ppt\charts\chart1.xml'; Old='<c:style val="4"/>'; New='<c:style val="49"/>'; Key='chart|ppt/slides/slide1.xml|0000' },
        [PSCustomObject]@{ Name='legend-layout'; Relative='ppt\charts\chart1.xml'; Old='legendPos val="b"'; New='legendPos val="r"'; Key='chart|ppt/slides/slide1.xml|0000' },
        [PSCustomObject]@{ Name='data-label'; Relative='ppt\charts\chart1.xml'; Old='showVal val="1"'; New='showVal val="0"'; Key='chart|ppt/slides/slide1.xml|0000' },
        [PSCustomObject]@{ Name='axis-gridline'; Relative='ppt\charts\chart1.xml'; Old='<c:majorGridlines/>'; New='<c:majorGridlines><c:spPr><a:ln w="12700"/></c:spPr></c:majorGridlines>'; Key='chart|ppt/slides/slide1.xml|0000' },
        [PSCustomObject]@{ Name='chart-style-part'; Relative='ppt\charts\style1.xml'; Old='112233'; New='445566'; Key='chart|ppt/slides/slide1.xml|0000' },
        [PSCustomObject]@{ Name='chart-color-part'; Relative='ppt\charts\colors1.xml'; Old='accent1'; New='accent2'; Key='chart|ppt/slides/slide1.xml|0000' },
        [PSCustomObject]@{ Name='chartex-type'; Relative='ppt\charts\chart2.xml'; Old='layoutId="waterfall"'; New='layoutId="funnel"'; Key='chart|ppt/slides/slide2.xml|0000' },
        [PSCustomObject]@{ Name='missing-slide-relationship'; Relative='ppt\slides\slide1.xml'; Old='r:id="rId1"'; New='r:id="rId404"'; Key='chart|ppt/slides/slide1.xml|relationshipIntegrity' },
        [PSCustomObject]@{ Name='orphan-slide-chart-relationship'; Relative='ppt\slides\slide1.xml'; Old='uri="http://schemas.openxmlformats.org/drawingml/2006/chart"'; New='uri="http://schemas.openxmlformats.org/drawingml/2006/notchart"'; Key='chart|ppt/slides/slide1.xml|relationshipIntegrity' },
        [PSCustomObject]@{ Name='related-relationship-kind'; Relative='ppt\charts\_rels\chart1.xml.rels'; Old='relationships/chartStyle'; New='relationships/image'; Key='chart|ppt/slides/slide1.xml|0000' },
        [PSCustomObject]@{ Name='content-type'; Relative='[Content_Types].xml'; Old='application/vnd.openxmlformats-officedocument.drawingml.chart+xml'; New='application/xml'; Key='chart|ppt/slides/slide1.xml|0000' }
    )
    foreach ($mutation in $mutations) {
        $root = New-Mutation $mutation.Name $mutation.Relative $mutation.Old $mutation.New
        $map = Get-ChartPackageSemanticSignatures $root
        Assert-NotEqual (Map-Text $map) $baselineText $mutation.Name
        Assert-NotEqual ([string]$map[$mutation.Key]) ([string]$baselineMap[$mutation.Key]) "$($mutation.Name) focused signature"
    }
    $workbook = New-Mutation 'workbook-payload' 'ppt\embeddings\book1.xlsx' '' '' -Binary
    Assert-NotEqual (Map-Text (Get-ChartPackageSemanticSignatures $workbook)) $baselineText 'embedded workbook payload'
    $missingChart = New-Mutation 'missing-chart-part' 'ppt\charts\chart1.xml' '' '' -Delete
    Assert-NotEqual (Map-Text (Get-ChartPackageSemanticSignatures $missingChart)) $baselineText 'missing chart part'

    Write-Host '[PASS] Native chart/ChartEx comparator signatures ignore relationship IDs, part names, and namespace prefixes while detecting chart type/style/color/layout/data/axis/label/workbook/relationship/content-type mutations.' -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}
