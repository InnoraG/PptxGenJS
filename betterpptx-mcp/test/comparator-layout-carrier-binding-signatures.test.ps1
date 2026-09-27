$ErrorActionPreference = 'Stop'

function Assert-Equal {
    param([string]$Actual, [string]$Expected, [string]$Label)
    if ($Actual -ne $Expected) { throw "$Label mismatch. Expected '$Expected', got '$Actual'." }
}

function Assert-NotEqual {
    param([string]$Actual, [string]$Expected, [string]$Label)
    if ($Actual -eq $Expected) { throw "$Label unexpectedly matched." }
}

function Assert-Match {
    param([string]$Actual, [string]$Pattern, [string]$Label)
    if ($Actual -notmatch $Pattern) { throw "$Label did not match '$Pattern'. Actual: '$Actual'." }
}

function Convert-SignatureMapToText {
    param([hashtable]$Map)
    return @($Map.Keys | Sort-Object | ForEach-Object { "$_=$($Map[$_])" }) -join "`n"
}

$comparatorPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..\ULTIMATE_PPTX_XPATH_COMPARATOR_v2h_DECYPHER.ps1')).Path
$tokens = $null
$parseErrors = $null
$comparatorSource = Get-Content -LiteralPath $comparatorPath -Raw -Encoding UTF8
$ast = [System.Management.Automation.Language.Parser]::ParseInput($comparatorSource, $comparatorPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw "Comparator parse failed: $($parseErrors -join '; ')" }

$functionNames = @(
    'Normalize-XmlFragment',
    'Safe-SelectNodes',
    'Safe-SelectSingleNode',
    'Get-RelativePackagePath',
    'Get-NormalizedPlaceholderAttributeSignature',
    'Get-NormalizedHeaderFooterPolicySignature',
    'Get-PlaceholderTopologySignatures',
    'Resolve-PackageTargetPath',
    'Get-RelMapForPart',
    'Get-PartRelPathFromFullPath',
    'Get-PackageContentTypes',
    'Get-PackageContentType',
    'Get-RelationshipIdAttributeValue',
    'Get-ElementSemanticPath',
    'Get-RelationshipTargetSemanticSignature',
    'Get-RelationshipKindSemanticSignature',
    'Get-RelationshipIndependentXmlSignature',
    'Get-NormalizedBooleanAttribute',
    'Get-RequiredContentTypeSignature',
    'Get-CarrierIdListIntegritySignature',
    'Get-NormalizedCarrierCommonSlideDataSignature',
    'Get-NormalizedThemePayloadSignature',
    'Get-NormalizedSlideTransitionSignature',
    'Get-LayoutCarrierBindingSignatures'
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
Assert-Match $comparatorSource "Compare-StringMaps 'layout carrier bindings and semantics'" 'main comparator integration'

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) "pptx-layout-carrier-comparator-$([Guid]::NewGuid().ToString('N'))"
[System.IO.Directory]::CreateDirectory($fixtureRoot) | Out-Null

function Write-TextFile {
    param([string]$Path, [string]$Content)
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($Path)) | Out-Null
    [System.IO.File]::WriteAllText($Path, $Content.TrimStart(), $utf8NoBom)
}

function New-LayoutXml {
    param(
        [string]$Name,
        [string]$Type,
        [string]$BackgroundColor,
        [string]$AssetRelationshipId,
        [string]$PlaceholderTextColor,
        [ValidateSet('normal','delete','reverse')][string]$FixedObjectMode = 'normal'
    )
    $assetLink = if ($AssetRelationshipId) { "<a:hlinkClick r:id=`"$AssetRelationshipId`"/>" } else { '' }
    $fixedA = @"
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Fixed A">$assetLink</p:cNvPr><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="100" y="200"/><a:ext cx="300" cy="400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="112233"/></a:solidFill></p:spPr>
    </p:sp>
"@
    $fixedB = @'
    <p:sp>
      <p:nvSpPr><p:cNvPr id="3" name="Fixed B"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="500" y="600"/><a:ext cx="700" cy="800"/></a:xfrm><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="445566"/></a:solidFill></p:spPr>
    </p:sp>
'@
    $fixedObjects = switch ($FixedObjectMode) {
        'delete' { $fixedA }
        'reverse' { "$fixedB`n$fixedA" }
        default { "$fixedA`n$fixedB" }
    }
    return @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             matchingName="$Name" type="$Type" preserve="1" showMasterSp="1" showMasterPhAnim="1">
  <p:cSld name="$Name">
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="$BackgroundColor"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
$fixedObjects
      <p:sp>
        <p:nvSpPr><p:cNvPr id="4" name="Body Placeholder"/><p:cNvSpPr txBox="1"/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="900" y="1000"/><a:ext cx="5000" cy="1800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
        <p:txBody>
          <a:bodyPr lIns="91440" rIns="91440" tIns="45720" bIns="45720" wrap="square"/><a:lstStyle/>
          <a:p><a:pPr algn="l"/><a:r><a:rPr lang="en-US" sz="1800"><a:solidFill><a:srgbClr val="$PlaceholderTextColor"/></a:solidFill></a:rPr><a:t>Styled placeholder text</a:t></a:r><a:endParaRPr lang="en-US" sz="1800"/></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
  <p:hf dt="1" hdr="1" ftr="1" sldNum="1"/>
  <p:transition spd="fast"><p:fade/></p:transition>
  <p:timing><p:tnLst/></p:timing>
  <p:extLst><p:ext uri="{11111111-2222-3333-4444-555555555555}"><a:extPayload val="$Name"/></p:ext></p:extLst>
</p:sldLayout>
"@
}

function New-MasterXml {
    param(
        [string]$Name,
        [string]$BackgroundColor,
        [string]$ObjectColor,
        [string]$PlaceholderIdx,
        [string]$Accent1,
        [string]$TitleSize,
        [string]$Language,
        [string]$FooterVisible,
        [string]$LayoutRelationshipId1,
        [string]$LayoutRelationshipId2,
        [ValidateSet('normal','reverse','single','none')][string]$LayoutOrder = 'normal'
    )
    $layoutList = if ($LayoutOrder -eq 'none') { '' } elseif ($LayoutOrder -eq 'single') {
        "<p:sldLayoutIdLst><p:sldLayoutId id=`"2147483649`" r:id=`"$LayoutRelationshipId1`"/></p:sldLayoutIdLst>"
    } elseif ($LayoutOrder -eq 'reverse') {
        "<p:sldLayoutIdLst><p:sldLayoutId id=`"2147483650`" r:id=`"$LayoutRelationshipId2`"/><p:sldLayoutId id=`"2147483649`" r:id=`"$LayoutRelationshipId1`"/></p:sldLayoutIdLst>"
    } else {
        "<p:sldLayoutIdLst><p:sldLayoutId id=`"2147483649`" r:id=`"$LayoutRelationshipId1`"/><p:sldLayoutId id=`"2147483650`" r:id=`"$LayoutRelationshipId2`"/></p:sldLayoutIdLst>"
    }
    return @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld name="$Name">
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="$BackgroundColor"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp><p:nvSpPr><p:cNvPr id="2" name="Master Fixed Object"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="100" y="100"/><a:ext cx="200" cy="200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="$ObjectColor"/></a:solidFill></p:spPr></p:sp>
      <p:sp><p:nvSpPr><p:cNvPr id="3" name="Master Title Placeholder"/><p:cNvSpPr/><p:nvPr><p:ph type="title" idx="$PlaceholderIdx"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="400" y="500"/><a:ext cx="600" cy="700"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="$Language"/></a:p></p:txBody></p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="$Accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  $layoutList
  <p:transition spd="fast"><p:fade/></p:transition>
  <p:timing><p:tnLst/></p:timing>
  <p:hf dt="1" hdr="0" ftr="$FooterVisible" sldNum="1"/>
  <p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr lang="$Language" sz="$TitleSize"/></a:lvl1pPr></p:titleStyle><p:bodyStyle/><p:otherStyle/></p:txStyles>
  <p:extLst><p:ext uri="{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}"><a:extPayload val="$Name"/></p:ext></p:extLst>
</p:sldMaster>
"@
}

function New-ThemeXml {
    param([string]$Name, [string]$Accent, [string]$HeadFont, [string]$BodyFont)
    return @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="$Name">
  <a:themeElements><a:clrScheme name="$Name"><a:accent1><a:srgbClr val="$Accent"/></a:accent1></a:clrScheme><a:fontScheme name="$Name"><a:majorFont><a:latin typeface="$HeadFont"/></a:majorFont><a:minorFont><a:latin typeface="$BodyFont"/></a:minorFont></a:fontScheme><a:fmtScheme name="$Name"/></a:themeElements>
</a:theme>
"@
}

function New-PptxFixture {
    param(
        [string]$Name,
        [switch]$RenumberRelationships,
        [string]$SlideLayoutTarget = '../slideLayouts/slideLayout1.xml',
        [string]$Slide2LayoutTarget = '../slideLayouts/slideLayout2.xml',
        [string]$Layout1MasterTarget = '../slideMasters/slideMaster1.xml',
        [string]$Layout2MasterTarget = '../slideMasters/slideMaster2.xml',
        [string]$Master1ThemeTarget = '../theme/theme1.xml',
        [string]$Master2ThemeTarget = '../theme/theme2.xml',
        [string]$Layout1Type = 'title',
        [ValidateSet('normal','delete','reverse')][string]$FixedObjectMode = 'normal',
        [string]$LayoutBackground = 'F1F5F9',
        [string]$LayoutPlaceholderTextColor = '334155',
        [string]$MasterBackground = 'FFFFFF',
        [string]$MasterObjectColor = '0F172A',
        [string]$MasterPlaceholderIdx = '1',
        [string]$MasterAccent1 = 'accent1',
        [string]$MasterTitleSize = '3200',
        [string]$MasterLanguage = 'en-US',
        [string]$MasterFooterVisible = '1',
        [string]$ThemeAccent = '0EA5E9',
        [string]$ThemeHeadFont = 'Aptos Display',
        [string]$ThemeBodyFont = 'Aptos',
        [ValidateSet('normal','reverse')][string]$MasterLayoutOrder = 'normal',
        [switch]$RemoveSlideLayoutRelationship,
        [switch]$OmitLayout1ContentType
    )

    if ($RenumberRelationships) {
        $ids = @{
            presentationMaster1='renMasterOne'; presentationMaster2='renMasterTwo'; presentationSlide='renSlideOne'; presentationSlide2='renSlideTwo'
            slideLayout='renSlideLayout'; slide2Layout='renSlideTwoLayout'; layoutMaster='renLayoutMaster'; layoutAsset='renLayoutAsset'; layout2Master='renLayoutTwoMaster'; layout3Master='renLayoutThreeMaster'
            masterLayout1='renMasterLayoutOne'; masterLayout2='renMasterLayoutTwo'; masterTheme='renMasterTheme'; master2Layout='renMasterTwoLayout'; master2Theme='renMasterTwoTheme'
        }
    } else {
        $ids = @{
            presentationMaster1='rId1'; presentationMaster2='rId2'; presentationSlide='rId3'; presentationSlide2='rId4'
            slideLayout='rId1'; slide2Layout='rId1'; layoutMaster='rId1'; layoutAsset='rId2'; layout2Master='rId1'; layout3Master='rId1'
            masterLayout1='rId1'; masterLayout2='rId2'; masterTheme='rId3'; master2Layout='rId1'; master2Theme='rId2'
        }
    }

    $sourceRoot = Join-Path $fixtureRoot "$Name-source"
    $extractRoot = Join-Path $fixtureRoot "$Name-extract"
    $zipPath = Join-Path $fixtureRoot "$Name.pptx"
    [System.IO.Directory]::CreateDirectory($sourceRoot) | Out-Null

    $layout1Override = if ($OmitLayout1ContentType) { '' } else { '  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' }
    Write-TextFile (Join-Path $sourceRoot '[Content_Types].xml') @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
$layout1Override
  <Override PartName="/ppt/slideLayouts/slideLayout2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout3.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
</Types>
"@
    Write-TextFile (Join-Path $sourceRoot '_rels\.rels') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>
'@
    Write-TextFile (Join-Path $sourceRoot 'ppt\presentation.xml') @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="$($ids.presentationMaster1)"/><p:sldMasterId id="2147483649" r:id="$($ids.presentationMaster2)"/></p:sldMasterIdLst>
  <p:sldIdLst><p:sldId id="256" r:id="$($ids.presentationSlide)"/><p:sldId id="257" r:id="$($ids.presentationSlide2)"/></p:sldIdLst>
</p:presentation>
"@
    Write-TextFile (Join-Path $sourceRoot 'ppt\_rels\presentation.xml.rels') @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="$($ids.presentationMaster1)" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="$($ids.presentationMaster2)" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster2.xml"/>
  <Relationship Id="$($ids.presentationSlide)" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="$($ids.presentationSlide2)" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
</Relationships>
"@
    Write-TextFile (Join-Path $sourceRoot 'ppt\slides\slide1.xml') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld></p:sld>
'@
    $slideRelationship = if ($RemoveSlideLayoutRelationship) { '' } else { "  <Relationship Id=`"$($ids.slideLayout)`" Type=`"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout`" Target=`"$SlideLayoutTarget`"/>" }
    Write-TextFile (Join-Path $sourceRoot 'ppt\slides\_rels\slide1.xml.rels') @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
$slideRelationship
</Relationships>
"@
    Write-TextFile (Join-Path $sourceRoot 'ppt\slides\slide2.xml') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld></p:sld>
'@
    Write-TextFile (Join-Path $sourceRoot 'ppt\slides\_rels\slide2.xml.rels') @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="$($ids.slide2Layout)" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="$Slide2LayoutTarget"/></Relationships>
"@

    Write-TextFile (Join-Path $sourceRoot 'ppt\slideLayouts\slideLayout1.xml') (New-LayoutXml 'Primary Layout' $Layout1Type $LayoutBackground $ids.layoutAsset $LayoutPlaceholderTextColor $FixedObjectMode)
    Write-TextFile (Join-Path $sourceRoot 'ppt\slideLayouts\slideLayout2.xml') (New-LayoutXml 'Secondary Master Layout' 'blank' 'FFF7ED' '' '7C2D12' 'normal')
    Write-TextFile (Join-Path $sourceRoot 'ppt\slideLayouts\slideLayout3.xml') (New-LayoutXml 'Primary Alternate Layout' 'blank' 'E2E8F0' '' '334155' 'normal')
    Write-TextFile (Join-Path $sourceRoot 'ppt\slideLayouts\_rels\slideLayout1.xml.rels') @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="$($ids.layoutMaster)" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="$Layout1MasterTarget"/><Relationship Id="$($ids.layoutAsset)" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.invalid/layout-proof" TargetMode="External"/></Relationships>
"@
    Write-TextFile (Join-Path $sourceRoot 'ppt\slideLayouts\_rels\slideLayout2.xml.rels') @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="$($ids.layout2Master)" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="$Layout2MasterTarget"/></Relationships>
"@
    Write-TextFile (Join-Path $sourceRoot 'ppt\slideLayouts\_rels\slideLayout3.xml.rels') @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="$($ids.layout3Master)" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>
"@

    Write-TextFile (Join-Path $sourceRoot 'ppt\slideMasters\slideMaster1.xml') (New-MasterXml 'Primary Master' $MasterBackground $MasterObjectColor $MasterPlaceholderIdx $MasterAccent1 $MasterTitleSize $MasterLanguage $MasterFooterVisible $ids.masterLayout1 $ids.masterLayout2 $MasterLayoutOrder)
    Write-TextFile (Join-Path $sourceRoot 'ppt\slideMasters\slideMaster2.xml') (New-MasterXml 'Secondary Master' 'FFF7ED' '7C2D12' '2' 'accent1' '3000' 'en-US' '1' $ids.master2Layout '' 'single')
    Write-TextFile (Join-Path $sourceRoot 'ppt\slideMasters\_rels\slideMaster1.xml.rels') @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="$($ids.masterLayout1)" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="$($ids.masterLayout2)" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout3.xml"/>
  <Relationship Id="$($ids.masterTheme)" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="$Master1ThemeTarget"/>
</Relationships>
"@
    Write-TextFile (Join-Path $sourceRoot 'ppt\slideMasters\_rels\slideMaster2.xml.rels') @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="$($ids.master2Layout)" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout2.xml"/><Relationship Id="$($ids.master2Theme)" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="$Master2ThemeTarget"/></Relationships>
"@
    Write-TextFile (Join-Path $sourceRoot 'ppt\theme\theme1.xml') (New-ThemeXml 'Primary Theme' $ThemeAccent $ThemeHeadFont $ThemeBodyFont)
    Write-TextFile (Join-Path $sourceRoot 'ppt\theme\theme2.xml') (New-ThemeXml 'Secondary Theme' 'F97316' 'Georgia' 'Verdana')

    [System.IO.Compression.ZipFile]::CreateFromDirectory($sourceRoot, $zipPath)
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $extractRoot)
    return [PSCustomObject]@{ ZipPath=$zipPath; ExtractRoot=$extractRoot }
}

try {
    $baseline = New-PptxFixture 'baseline'
    $renumbered = New-PptxFixture 'renumbered' -RenumberRelationships
    $baselineMap = Get-LayoutCarrierBindingSignatures $baseline.ExtractRoot
    $baselineText = Convert-SignatureMapToText $baselineMap
    $baselinePlaceholderTopology = Convert-SignatureMapToText (Get-PlaceholderTopologySignatures $baseline.ExtractRoot)
    Assert-Equal (Convert-SignatureMapToText (Get-LayoutCarrierBindingSignatures $renumbered.ExtractRoot)) $baselineText 'relationship-ID renumbering equivalence'

    Assert-Match $baselineMap['graph|ppt/slides/slide1.xml|layout'] 'target=ppt/slideLayouts/slideLayout1.xml' 'slide to layout binding'
    Assert-Match $baselineMap['graph|ppt/slides/slide2.xml|layout'] 'target=ppt/slideLayouts/slideLayout2.xml' 'second slide to second-master layout binding'
    Assert-Match $baselineMap['graph|ppt/slideLayouts/slideLayout1.xml|master'] 'target=ppt/slideMasters/slideMaster1.xml' 'layout to master binding'
    Assert-Match $baselineMap['graph|ppt/slideLayouts/slideLayout2.xml|master'] 'target=ppt/slideMasters/slideMaster2.xml' 'second layout to second master binding'
    Assert-Match $baselineMap['graph|ppt/slideMasters/slideMaster1.xml|theme'] 'target=ppt/theme/theme1.xml' 'master to theme binding'
    Assert-Match $baselineMap['graph|ppt/slideMasters/slideMaster2.xml|theme'] 'target=ppt/theme/theme2.xml' 'second master to second theme binding'
    Assert-Match $baselineMap['graph|ppt/presentation.xml|masters'] 'count=2' 'presentation master relationship set'
    Assert-Match $baselineMap['graph|ppt/slideMasters/slideMaster1.xml|layouts'] 'count=2' 'master layout relationship set'
    Assert-Match $baselineMap['graph|ppt/slideMasters/slideMaster2.xml|layouts'] 'count=1' 'second master layout relationship set'
    Assert-Match $baselineMap['layout|ppt/slideLayouts/slideLayout1.xml|root'] 'type=title' 'layout root attributes'
    Assert-Equal $baselineMap['layout|ppt/slideLayouts/slideLayout1.xml|fixedObjectCount'] '2' 'fixed object count'
    Assert-Match $baselineMap['layout|ppt/slideLayouts/slideLayout1.xml|fixedObject|1'] 'kind=hyperlink\|mode=External\|target=https://example.invalid/layout-proof' 'fixed object relationship binding'
    Assert-Match $baselineMap['layout|ppt/slideLayouts/slideLayout1.xml|placeholderStyle|1'] '334155' 'layout placeholder body/text style'
    Assert-Match $baselineMap['layout|ppt/slideLayouts/slideLayout2.xml|transition'] '<p:transition\|advClick=1;spd=fast' 'second-master layout transition carrier'
    Assert-Match $baselineMap['layout|ppt/slideLayouts/slideLayout3.xml|clrMapOvr'] 'masterClrMapping' 'unused layout color-map carrier'
    Assert-Match $baselineMap['master|ppt/slideMasters/slideMaster1.xml|layoutOrder'] 'slideLayout1.xml.*slideLayout3.xml' 'master layout-list order'
    Assert-Match $baselineMap['master|ppt/slideMasters/slideMaster2.xml|layoutOrder'] 'slideLayout2.xml' 'second master layout-list membership'
    Assert-Match $baselineMap['master|ppt/slideMasters/slideMaster2.xml|timing'] 'tnLst' 'second master timing carrier'
    Assert-Match $baselineMap['master|ppt/slideMasters/slideMaster2.xml|extLst'] 'Secondary Master' 'second master extension carrier'
    Assert-Match $baselineMap['presentation|masterIdIntegrity'] 'duplicateCount=0\|domainInvalidCount=0\|valid=1' 'presentation master ID integrity'
    Assert-Match $baselineMap['master|ppt/slideMasters/slideMaster1.xml|layoutIdIntegrity'] 'duplicateCount=0\|domainInvalidCount=0\|valid=1' 'master layout ID integrity'
    Assert-Match $baselineMap['master|ppt/slideMasters/slideMaster2.xml|root'] 'name=Secondary Master' 'second master identity'
    Assert-Match $baselineMap['contentType|ppt/slideLayouts/slideLayout1.xml'] 'valid=1$' 'required layout content type'

    $fieldEquivalentA = New-PptxFixture 'field-equivalent-a'
    $fieldEquivalentB = New-PptxFixture 'field-equivalent-b' -RenumberRelationships
    $fieldPayloads = @(
        [PSCustomObject]@{ Fixture=$fieldEquivalentA; Id='{11111111-2222-3333-4444-555555555555}'; Display='August 28, 2026' },
        [PSCustomObject]@{ Fixture=$fieldEquivalentB; Id='{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}'; Display='August 29, 2026' }
    )
    foreach ($fieldPayload in $fieldPayloads) {
        $path = Join-Path $fieldPayload.Fixture.ExtractRoot 'ppt\slideMasters\slideMaster2.xml'
        $text = [System.IO.File]::ReadAllText($path)
        $fieldShape = "<p:sp><p:nvSpPr><p:cNvPr id=`"9`" name=`"Dynamic master field`"/><p:cNvSpPr/><p:nvPr><p:ph type=`"dt`" idx=`"9`"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id=`"$($fieldPayload.Id)`" type=`"datetime1`"><a:rPr/><a:t>$($fieldPayload.Display)</a:t></a:fld></a:p></p:txBody></p:sp>"
        [System.IO.File]::WriteAllText($path, $text.Replace('</p:spTree>', "$fieldShape</p:spTree>"), $utf8NoBom)
    }
    Assert-Equal (Convert-SignatureMapToText (Get-LayoutCarrierBindingSignatures $fieldEquivalentB.ExtractRoot)) (Convert-SignatureMapToText (Get-LayoutCarrierBindingSignatures $fieldEquivalentA.ExtractRoot)) 'relationship and dynamic-field normalization equivalence'

    $mutations = @(
        [PSCustomObject]@{ Name='wrong-slide-layout'; Options=@{ SlideLayoutTarget='../slideLayouts/slideLayout2.xml' }; Key='graph|ppt/slides/slide1.xml|layout' },
        [PSCustomObject]@{ Name='wrong-second-slide-layout'; Options=@{ Slide2LayoutTarget='../slideLayouts/slideLayout1.xml' }; Key='graph|ppt/slides/slide2.xml|layout' },
        [PSCustomObject]@{ Name='wrong-layout-master'; Options=@{ Layout1MasterTarget='../slideMasters/slideMaster2.xml' }; Key='graph|ppt/slideLayouts/slideLayout1.xml|master' },
        [PSCustomObject]@{ Name='wrong-second-layout-master'; Options=@{ Layout2MasterTarget='../slideMasters/slideMaster1.xml' }; Key='graph|ppt/slideLayouts/slideLayout2.xml|master' },
        [PSCustomObject]@{ Name='wrong-master-theme'; Options=@{ Master1ThemeTarget='../theme/theme2.xml' }; Key='graph|ppt/slideMasters/slideMaster1.xml|theme' },
        [PSCustomObject]@{ Name='wrong-second-master-theme'; Options=@{ Master2ThemeTarget='../theme/theme1.xml' }; Key='graph|ppt/slideMasters/slideMaster2.xml|theme' },
        [PSCustomObject]@{ Name='layout-root-attributes'; Options=@{ Layout1Type='sectionHead' }; Key='layout|ppt/slideLayouts/slideLayout1.xml|root' },
        [PSCustomObject]@{ Name='fixed-object-deletion'; Options=@{ FixedObjectMode='delete' }; Key='layout|ppt/slideLayouts/slideLayout1.xml|fixedObjectCount' },
        [PSCustomObject]@{ Name='fixed-object-reorder'; Options=@{ FixedObjectMode='reverse' }; Key='layout|ppt/slideLayouts/slideLayout1.xml|fixedObject|1' },
        [PSCustomObject]@{ Name='layout-background'; Options=@{ LayoutBackground='FEF3C7' }; Key='layout|ppt/slideLayouts/slideLayout1.xml|background' },
        [PSCustomObject]@{ Name='layout-placeholder-text-style'; Options=@{ LayoutPlaceholderTextColor='DC2626' }; Key='layout|ppt/slideLayouts/slideLayout1.xml|placeholderStyle|1' },
        [PSCustomObject]@{ Name='master-background'; Options=@{ MasterBackground='FEE2E2' }; Key='master|ppt/slideMasters/slideMaster1.xml|background' },
        [PSCustomObject]@{ Name='master-fixed-object'; Options=@{ MasterObjectColor='DC2626' }; Key='master|ppt/slideMasters/slideMaster1.xml|cSld' },
        [PSCustomObject]@{ Name='master-placeholder'; Options=@{ MasterPlaceholderIdx='7' }; Key='master|ppt/slideMasters/slideMaster1.xml|cSld' },
        [PSCustomObject]@{ Name='master-txStyles'; Options=@{ MasterTitleSize='3600' }; Key='master|ppt/slideMasters/slideMaster1.xml|txStyles' },
        [PSCustomObject]@{ Name='master-inherited-language'; Options=@{ MasterLanguage='fr-FR' }; Key='master|ppt/slideMasters/slideMaster1.xml|txStyles' },
        [PSCustomObject]@{ Name='master-clrMap'; Options=@{ MasterAccent1='accent2' }; Key='master|ppt/slideMasters/slideMaster1.xml|clrMap' },
        [PSCustomObject]@{ Name='master-hf'; Options=@{ MasterFooterVisible='0' }; Key='master|ppt/slideMasters/slideMaster1.xml|hf' },
        [PSCustomObject]@{ Name='theme-color-scheme'; Options=@{ ThemeAccent='DB2777' }; Key='theme|ppt/theme/theme1.xml|payload' },
        [PSCustomObject]@{ Name='theme-head-font'; Options=@{ ThemeHeadFont='Georgia' }; Key='theme|ppt/theme/theme1.xml|payload' },
        [PSCustomObject]@{ Name='theme-body-font'; Options=@{ ThemeBodyFont='Verdana' }; Key='theme|ppt/theme/theme1.xml|payload' },
        [PSCustomObject]@{ Name='master-layout-order'; Options=@{ MasterLayoutOrder='reverse' }; Key='master|ppt/slideMasters/slideMaster1.xml|layoutOrder' },
        [PSCustomObject]@{ Name='missing-slide-layout-relationship'; Options=@{ RemoveSlideLayoutRelationship=$true }; Key='graph|ppt/slides/slide1.xml|layout' },
        [PSCustomObject]@{ Name='missing-layout-content-type'; Options=@{ OmitLayout1ContentType=$true }; Key='contentType|ppt/slideLayouts/slideLayout1.xml' }
    )
    foreach ($mutation in $mutations) {
        $options = $mutation.Options
        $fixture = New-PptxFixture -Name "mutation-$($mutation.Name)" @options
        $mutationMap = Get-LayoutCarrierBindingSignatures $fixture.ExtractRoot
        Assert-NotEqual (Convert-SignatureMapToText $mutationMap) $baselineText "$($mutation.Name) full signature"
        Assert-NotEqual ([string]$mutationMap[$mutation.Key]) ([string]$baselineMap[$mutation.Key]) "$($mutation.Name) focused signature"
        if ($mutation.Name -eq 'layout-placeholder-text-style') {
            Assert-Equal (Convert-SignatureMapToText (Get-PlaceholderTopologySignatures $fixture.ExtractRoot)) $baselinePlaceholderTopology 'placeholder style mutation leaves topology unchanged'
        }
    }

    foreach ($mutation in @(
        [PSCustomObject]@{ Name='duplicate-presentation-master-id'; Relative='ppt\presentation.xml'; Old='id="2147483649"'; New='id="2147483648"'; Key='presentation|masterIdIntegrity' },
        [PSCustomObject]@{ Name='out-of-domain-presentation-master-id'; Relative='ppt\presentation.xml'; Old='id="2147483649"'; New='id="2147483647"'; Key='presentation|masterIdIntegrity' },
        [PSCustomObject]@{ Name='duplicate-master-layout-id'; Relative='ppt\slideMasters\slideMaster1.xml'; Old='id="2147483650"'; New='id="2147483649"'; Key='master|ppt/slideMasters/slideMaster1.xml|layoutIdIntegrity' },
        [PSCustomObject]@{ Name='out-of-domain-master-layout-id'; Relative='ppt\slideMasters\slideMaster1.xml'; Old='id="2147483650"'; New='id="42"'; Key='master|ppt/slideMasters/slideMaster1.xml|layoutIdIntegrity' },
        [PSCustomObject]@{ Name='dangling-master-layout-relationship'; Relative='ppt\slideMasters\_rels\slideMaster1.xml.rels'; Old='</Relationships>'; New='<Relationship Id="rIdDangling" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/missing.xml"/></Relationships>'; Key='graph|ppt/slideMasters/slideMaster1.xml|layouts' },
        [PSCustomObject]@{ Name='second-master-layout-transition'; Relative='ppt\slideLayouts\slideLayout2.xml'; Old='<p:transition spd="fast">'; New='<p:transition spd="slow">'; Key='layout|ppt/slideLayouts/slideLayout2.xml|transition' },
        [PSCustomObject]@{ Name='unused-layout-color-map'; Relative='ppt\slideLayouts\slideLayout3.xml'; Old='<a:masterClrMapping/>'; New='<a:overrideClrMapping accent1="accent2"/>'; Key='layout|ppt/slideLayouts/slideLayout3.xml|clrMapOvr' },
        [PSCustomObject]@{ Name='second-master-timing'; Relative='ppt\slideMasters\slideMaster2.xml'; Old='<p:timing><p:tnLst/></p:timing>'; New='<p:timing><p:tnLst><p:par/></p:tnLst></p:timing>'; Key='master|ppt/slideMasters/slideMaster2.xml|timing' },
        [PSCustomObject]@{ Name='second-master-extension'; Relative='ppt\slideMasters\slideMaster2.xml'; Old='val="Secondary Master"'; New='val="Changed Secondary Master"'; Key='master|ppt/slideMasters/slideMaster2.xml|extLst' },
        [PSCustomObject]@{ Name='second-master-csld-payload'; Relative='ppt\slideMasters\slideMaster2.xml'; Old='</p:spTree>'; New='<p:sp><p:nvSpPr><p:cNvPr id="9" name="Second master identity"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:solidFill><a:srgbClr val="ABCDEF"/></a:solidFill></p:spPr></p:sp></p:spTree>'; Key='master|ppt/slideMasters/slideMaster2.xml|cSld' },
        [PSCustomObject]@{ Name='second-master-placeholder'; Relative='ppt\slideMasters\slideMaster2.xml'; Old='type="title" idx="2"'; New='type="title" idx="9"'; Key='master|ppt/slideMasters/slideMaster2.xml|cSld' }
    )) {
        $fixture = New-PptxFixture -Name "mutation-$($mutation.Name)"
        $path = Join-Path $fixture.ExtractRoot $mutation.Relative
        $text = [System.IO.File]::ReadAllText($path)
        if (-not $text.Contains($mutation.Old)) { throw "$($mutation.Name) source token was not found." }
        [System.IO.File]::WriteAllText($path, $text.Replace($mutation.Old, $mutation.New), $utf8NoBom)
        $mutationMap = Get-LayoutCarrierBindingSignatures $fixture.ExtractRoot
        Assert-NotEqual (Convert-SignatureMapToText $mutationMap) $baselineText "$($mutation.Name) full signature"
        Assert-NotEqual ([string]$mutationMap[$mutation.Key]) ([string]$baselineMap[$mutation.Key]) "$($mutation.Name) focused signature"
    }

    Write-Host '[PASS] Layout carrier/binding signatures ignore relationship IDs and detect two active master chains, layout/master/theme/slide bindings, high-domain ID integrity, complete top-level carrier policy, identity/payload, content-type, order, fixed-object, background, placeholder, inherited-language, theme color/font, and master-style mutations.' -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}
