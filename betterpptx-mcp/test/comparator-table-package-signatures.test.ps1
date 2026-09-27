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
    'Get-ElementSemanticPath',
    'Copy-NamespaceCanonicalXmlNode',
    'Get-NamespaceCanonicalXmlSignature',
    'Get-CachedPackageHash',
    'Get-ExactUnicodeTextSignature',
    'Get-TableRelatedPartSignature',
    'Get-NormalizedTablePayloadSignature',
    'Get-TablePackageSemanticSignatures'
)
$functionAsts = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true))
foreach ($name in $functionNames) {
    $definition = $functionAsts | Where-Object Name -eq $name | Select-Object -First 1
    if (-not $definition) { throw "Comparator helper '$name' was not found." }
    Invoke-Expression $definition.Extent.Text
}
Assert-Match $source "Compare-StringMaps 'native table grid style and cell semantics'" 'main comparator integration'

$utf8 = New-Object System.Text.UTF8Encoding -ArgumentList $false
$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) "pptx-table-comparator-$([Guid]::NewGuid().ToString('N'))"
[System.IO.Directory]::CreateDirectory($fixtureRoot) | Out-Null

function Write-Text {
    param([string]$Path, [string]$Content)
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($Path)) | Out-Null
    [System.IO.File]::WriteAllText($Path, $Content.TrimStart(), $utf8)
}
function New-TableFixture {
    param([string]$Name, [switch]$Renumber)
    $root = Join-Path $fixtureRoot $Name
    [System.IO.Directory]::CreateDirectory($root) | Out-Null
    if ($Renumber) {
        $pPrefix='pres'; $aPrefix='draw'; $rPrefix='rel'
        $hyperlinkRid='externalHyperlinkRelationship'; $imageRid='cellImageRelationship'; $styleRid='nativeTableStyleRelationship'
        $imagePart='cell9.png'; $tableStylesPart='styles/tableStyles9.xml'
    } else {
        $pPrefix='p'; $aPrefix='a'; $rPrefix='r'
        $hyperlinkRid='rId5'; $imageRid='rId6'; $styleRid='rId12'
        $imagePart='image1.png'; $tableStylesPart='tableStyles.xml'
    }
    Write-Text (Join-Path $root '[Content_Types].xml') @"
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/$tableStylesPart" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>
</Types>
"@
    Write-Text (Join-Path $root 'ppt\presentation.xml') "<$pPrefix`:presentation xmlns:$pPrefix=`"http://schemas.openxmlformats.org/presentationml/2006/main`"/>"
    Write-Text (Join-Path $root 'ppt\_rels\presentation.xml.rels') "<Relationships xmlns=`"http://schemas.openxmlformats.org/package/2006/relationships`"><Relationship Id=`"$styleRid`" Type=`"http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles`" Target=`"$tableStylesPart`"/></Relationships>"
    Write-Text (Join-Path $root "ppt\$tableStylesPart") @"
<$aPrefix`:tblStyleLst xmlns:$aPrefix="http://schemas.openxmlformats.org/drawingml/2006/main" def="{11111111-1111-1111-1111-111111111111}"><$aPrefix`:tblStyle styleId="{11111111-1111-1111-1111-111111111111}" styleName="Executive Grid"><$aPrefix`:wholeTbl><$aPrefix`:tcStyle><$aPrefix`:fill><$aPrefix`:solidFill><$aPrefix`:srgbClr val="AABBCC"/></$aPrefix`:solidFill></$aPrefix`:fill></$aPrefix`:tcStyle></$aPrefix`:wholeTbl></$aPrefix`:tblStyle></$aPrefix`:tblStyleLst>
"@
    Write-Text (Join-Path $root 'ppt\slides\slide1.xml') @"
<$pPrefix`:sld xmlns:$pPrefix="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:$aPrefix="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:$rPrefix="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><$pPrefix`:cSld><$pPrefix`:spTree><$pPrefix`:nvGrpSpPr><$pPrefix`:cNvPr id="1" name=""/><$pPrefix`:cNvGrpSpPr/><$pPrefix`:nvPr/></$pPrefix`:nvGrpSpPr><$pPrefix`:grpSpPr/><$pPrefix`:graphicFrame><$pPrefix`:nvGraphicFramePr><$pPrefix`:cNvPr id="2" name="Executive table"/><$pPrefix`:cNvGraphicFramePr/><$pPrefix`:nvPr/></$pPrefix`:nvGraphicFramePr><$pPrefix`:xfrm><$aPrefix`:off x="100" y="200"/><$aPrefix`:ext cx="6000000" cy="3000000"/></$pPrefix`:xfrm><$aPrefix`:graphic><$aPrefix`:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><$aPrefix`:tbl><$aPrefix`:tblPr firstRow="1" lastRow="1" firstCol="1" lastCol="0" bandRow="1" bandCol="1"><$aPrefix`:tableStyleId>{11111111-1111-1111-1111-111111111111}</$aPrefix`:tableStyleId></$aPrefix`:tblPr><$aPrefix`:tblGrid><$aPrefix`:gridCol w="2000000"/><$aPrefix`:gridCol w="3000000"/></$aPrefix`:tblGrid><$aPrefix`:tr h="500000"><$aPrefix`:tc gridSpan="2"><$aPrefix`:txBody><$aPrefix`:bodyPr/><$aPrefix`:lstStyle/><$aPrefix`:p><$aPrefix`:pPr algn="ctr"/><$aPrefix`:r><$aPrefix`:rPr b="1" sz="1800"><$aPrefix`:hlinkClick $rPrefix`:id="$hyperlinkRid"/></$aPrefix`:rPr><$aPrefix`:t>Revenue</$aPrefix`:t></$aPrefix`:r><$aPrefix`:endParaRPr lang="en-US"/></$aPrefix`:p></$aPrefix`:txBody><$aPrefix`:tcPr marL="1000" marR="1000" anchor="ctr"><$aPrefix`:solidFill><$aPrefix`:srgbClr val="112233"/></$aPrefix`:solidFill><$aPrefix`:lnL w="12700"><$aPrefix`:solidFill><$aPrefix`:srgbClr val="445566"><$aPrefix`:alpha val="0"/></$aPrefix`:srgbClr></$aPrefix`:solidFill></$aPrefix`:lnL><$aPrefix`:blipFill><$aPrefix`:blip $rPrefix`:embed="$imageRid"/><$aPrefix`:stretch><$aPrefix`:fillRect/></$aPrefix`:stretch></$aPrefix`:blipFill></$aPrefix`:tcPr></$aPrefix`:tc><$aPrefix`:tc hMerge="1"><$aPrefix`:txBody><$aPrefix`:bodyPr/><$aPrefix`:lstStyle/><$aPrefix`:p/></$aPrefix`:txBody><$aPrefix`:tcPr/></$aPrefix`:tc></$aPrefix`:tr><$aPrefix`:tr h="600000"><$aPrefix`:tc rowSpan="2"><$aPrefix`:txBody><$aPrefix`:bodyPr/><$aPrefix`:lstStyle/><$aPrefix`:p><$aPrefix`:r><$aPrefix`:t>Total</$aPrefix`:t></$aPrefix`:r></$aPrefix`:p></$aPrefix`:txBody><$aPrefix`:tcPr/></$aPrefix`:tc><$aPrefix`:tc vMerge="1"><$aPrefix`:txBody><$aPrefix`:bodyPr/><$aPrefix`:lstStyle/><$aPrefix`:p/></$aPrefix`:txBody><$aPrefix`:tcPr/></$aPrefix`:tc></$aPrefix`:tr></$aPrefix`:tbl></$aPrefix`:graphicData></$aPrefix`:graphic></$pPrefix`:graphicFrame></$pPrefix`:spTree></$pPrefix`:cSld></$pPrefix`:sld>
"@
    Write-Text (Join-Path $root 'ppt\slides\_rels\slide1.xml.rels') "<Relationships xmlns=`"http://schemas.openxmlformats.org/package/2006/relationships`"><Relationship Id=`"$hyperlinkRid`" Type=`"http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink`" Target=`"https://example.test/revenue`" TargetMode=`"External`"/><Relationship Id=`"$imageRid`" Type=`"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image`" Target=`"../media/$imagePart`"/></Relationships>"
    [System.IO.Directory]::CreateDirectory((Join-Path $root 'ppt\media')) | Out-Null
    [System.IO.File]::WriteAllBytes((Join-Path $root "ppt\media\$imagePart"), [byte[]](1,2,3,4,5,6))
    return $root
}
function New-Mutation {
    param([string]$Name, [string]$Relative, [string]$Old, [string]$New, [switch]$Binary)
    $root = Join-Path $fixtureRoot $Name
    Copy-Item -LiteralPath $baseline -Destination $root -Recurse
    $path = Join-Path $root $Relative
    if ($Binary) {
        [System.IO.File]::WriteAllBytes($path, [byte[]](9,8,7,6))
    } else {
        $text = [System.IO.File]::ReadAllText($path)
        if (-not $text.Contains($Old)) { throw "$Name token not found: $Old" }
        [System.IO.File]::WriteAllText($path, $text.Replace($Old, $New), $utf8)
    }
    return $root
}

try {
    $baseline = New-TableFixture 'baseline'
    $equivalent = New-TableFixture 'equivalent' -Renumber
    $baselineMap = Get-TablePackageSemanticSignatures $baseline
    $baselineText = Map-Text $baselineMap
    Assert-Equal (Map-Text (Get-TablePackageSemanticSignatures $equivalent)) $baselineText 'relationship, part-name, and namespace-prefix independence'
    $tableKey = 'table|ppt/slides/slide1.xml|0000'
    $packageKey = 'table|package|tableStyles'
    Assert-Match $baselineMap[$tableKey] 'bandCol=1.*firstRow=1' 'conditional table style flags'
    Assert-Match $baselineMap[$tableKey] 'gridCol.*w=2000000.*tr.*h=500000' 'grid and row dimensions'
    Assert-Match $baselineMap[$tableKey] 'gridSpan=2.*hMerge=1.*rowSpan=2.*vMerge=1' 'merge topology'
    Assert-Match $baselineMap[$tableKey] 'marL=1000.*alpha.*val=0' 'cell style and transparent border'
    Assert-Match $baselineMap[$tableKey] 'target=https://example.test/revenue' 'cell hyperlink target'
    Assert-Match $baselineMap[$tableKey] 'image/png.*sha256=' 'cell image-fill payload'
    Assert-Match $baselineMap[$packageKey] 'Executive Grid.*AABBCC' 'native table styles payload'
    if ($baselineText -match 'tableStyles\.xml|image1\.png|rId[0-9]') { throw 'Semantic table map leaked relationship IDs or package-local related-part names.' }

    $mutations = @(
        [PSCustomObject]@{ Name='conditional-flag'; Relative='ppt\slides\slide1.xml'; Old='firstRow="1"'; New='firstRow="0"'; Key=$tableKey },
        [PSCustomObject]@{ Name='style-id'; Relative='ppt\slides\slide1.xml'; Old='{11111111-1111-1111-1111-111111111111}</a:tableStyleId>'; New='{22222222-2222-2222-2222-222222222222}</a:tableStyleId>'; Key=$tableKey },
        [PSCustomObject]@{ Name='column-width'; Relative='ppt\slides\slide1.xml'; Old='gridCol w="2000000"'; New='gridCol w="2000001"'; Key=$tableKey },
        [PSCustomObject]@{ Name='row-height'; Relative='ppt\slides\slide1.xml'; Old='tr h="500000"'; New='tr h="500001"'; Key=$tableKey },
        [PSCustomObject]@{ Name='colspan'; Relative='ppt\slides\slide1.xml'; Old='gridSpan="2"'; New='gridSpan="3"'; Key=$tableKey },
        [PSCustomObject]@{ Name='rowspan'; Relative='ppt\slides\slide1.xml'; Old='rowSpan="2"'; New='rowSpan="3"'; Key=$tableKey },
        [PSCustomObject]@{ Name='horizontal-merge'; Relative='ppt\slides\slide1.xml'; Old='hMerge="1"'; New='hMerge="0"'; Key=$tableKey },
        [PSCustomObject]@{ Name='vertical-merge'; Relative='ppt\slides\slide1.xml'; Old='vMerge="1"'; New='vMerge="0"'; Key=$tableKey },
        [PSCustomObject]@{ Name='cell-margin'; Relative='ppt\slides\slide1.xml'; Old='marL="1000"'; New='marL="2000"'; Key=$tableKey },
        [PSCustomObject]@{ Name='cell-fill'; Relative='ppt\slides\slide1.xml'; Old='val="112233"'; New='val="112244"'; Key=$tableKey },
        [PSCustomObject]@{ Name='transparent-border'; Relative='ppt\slides\slide1.xml'; Old='alpha val="0"'; New='alpha val="1000"'; Key=$tableKey },
        [PSCustomObject]@{ Name='border-width'; Relative='ppt\slides\slide1.xml'; Old='lnL w="12700"'; New='lnL w="25400"'; Key=$tableKey },
        [PSCustomObject]@{ Name='plain-cell-text'; Relative='ppt\slides\slide1.xml'; Old='>Revenue<'; New='>Bookings<'; Key=$tableKey },
        [PSCustomObject]@{ Name='rich-cell-run'; Relative='ppt\slides\slide1.xml'; Old='rPr b="1"'; New='rPr b="0"'; Key=$tableKey },
        [PSCustomObject]@{ Name='hyperlink-target'; Relative='ppt\slides\_rels\slide1.xml.rels'; Old='https://example.test/revenue'; New='https://example.test/bookings'; Key=$tableKey },
        [PSCustomObject]@{ Name='hyperlink-target-mode'; Relative='ppt\slides\_rels\slide1.xml.rels'; Old=' TargetMode="External"'; New=''; Key=$tableKey },
        [PSCustomObject]@{ Name='missing-cell-relationship'; Relative='ppt\slides\slide1.xml'; Old='r:id="rId5"'; New='r:id="rId404"'; Key=$tableKey },
        [PSCustomObject]@{ Name='frame-name'; Relative='ppt\slides\slide1.xml'; Old='name="Executive table"'; New='name="Operations table"'; Key=$tableKey },
        [PSCustomObject]@{ Name='table-style-default'; Relative='ppt\tableStyles.xml'; Old='def="{11111111-1111-1111-1111-111111111111}"'; New='def="{22222222-2222-2222-2222-222222222222}"'; Key=$packageKey },
        [PSCustomObject]@{ Name='table-style-payload'; Relative='ppt\tableStyles.xml'; Old='AABBCC'; New='DDEEFF'; Key=$packageKey },
        [PSCustomObject]@{ Name='table-style-relationship-kind'; Relative='ppt\_rels\presentation.xml.rels'; Old='relationships/tableStyles'; New='relationships/theme'; Key=$packageKey },
        [PSCustomObject]@{ Name='table-style-content-type'; Relative='[Content_Types].xml'; Old='application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml'; New='application/xml'; Key=$packageKey },
        [PSCustomObject]@{ Name='table-carrier'; Relative='ppt\slides\slide1.xml'; Old='drawingml/2006/table"'; New='drawingml/2006/not-table"'; Key='table|ppt/slides/slide1.xml|count' }
    )
    foreach ($mutation in $mutations) {
        $root = New-Mutation $mutation.Name $mutation.Relative $mutation.Old $mutation.New
        $map = Get-TablePackageSemanticSignatures $root
        Assert-NotEqual (Map-Text $map) $baselineText $mutation.Name
        $focusedActual = [string]($map[$mutation.Key])
        $focusedBaseline = [string]($baselineMap[$mutation.Key])
        Assert-NotEqual $focusedActual $focusedBaseline "$($mutation.Name) focused signature"
    }
    $imagePayload = New-Mutation 'image-payload' 'ppt\media\image1.png' '' '' -Binary
    Assert-NotEqual (Map-Text (Get-TablePackageSemanticSignatures $imagePayload)) $baselineText 'cell image-fill payload'

    Write-Host '[PASS] Native table signatures ignore relationship IDs, related-part names, and namespace prefixes while detecting table flags/styles/grid/rows/merges/cell formatting/text/hyperlinks/image fills and tableStyles package mutations.' -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}
