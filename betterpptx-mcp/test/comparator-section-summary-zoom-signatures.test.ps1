$ErrorActionPreference = 'Stop'

function Assert-Equal([string]$Actual, [string]$Expected, [string]$Label) {
    if ($Actual -ne $Expected) { throw "$Label mismatch.`nEXPECTED:`n$Expected`nACTUAL:`n$Actual" }
}
function Assert-NotEqual([string]$Actual, [string]$Expected, [string]$Label) {
    if ($Actual -eq $Expected) { throw "$Label unexpectedly matched." }
}
function Assert-Match([string]$Actual, [string]$Pattern, [string]$Label) {
    if ($Actual -notmatch $Pattern) { throw "$Label did not match '$Pattern'.`nACTUAL:`n$Actual" }
}

$comparatorPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..\ULTIMATE_PPTX_XPATH_COMPARATOR_v2h_DECYPHER.ps1')).Path
$tokens = $null; $parseErrors = $null
$source = Get-Content -LiteralPath $comparatorPath -Raw -Encoding UTF8
$ast = [System.Management.Automation.Language.Parser]::ParseInput($source, $comparatorPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw "Comparator parse failed: $($parseErrors -join '; ')" }
$names = @(
    'Normalize-XmlFragment','Get-RelativePackagePath','Get-AttrByLocalName','Get-RelationshipIdAttributeValue',
    'Resolve-PackageTargetPath','Get-RelMapForPart','Get-PartRelPathFromFullPath','Get-PackageContentTypes',
    'Get-PackageContentType','Get-ElementSemanticPath','Get-RelationshipTargetSemanticSignature',
    'Get-RelationshipIndependentXmlSignature','Copy-NamespaceCanonicalXmlNode','Get-NamespaceCanonicalXmlSignature',
    'Get-RelationshipIndependentNamespaceCanonicalXmlSignature','Get-NormalizedBooleanAttribute','Get-CachedPackageHash',
    'Get-RelationshipSemanticInfo','Get-ResolvedHyperlinkTargetSignature','Get-ExactUnicodeTextSignature',
    'Get-InteractiveLogicalChildren','Get-InteractiveCarrierRecords','Get-InteractiveCarrierPropertiesNode',
    'Get-CustomShowActionSemanticSignature','Get-InteractiveActionSignature','Get-InteractiveRelationshipIntegritySignature','Get-PresentationSlideIdSemanticMap',
    'Get-PresentationSectionIdSemanticMap','Get-NativeZoomAlternateContentBranches','Set-NormalizedNativeZoomProperties',
    'Get-NativeSlideZoomSemanticSignature','Get-NativeSectionZoomSemanticSignature','Get-NativeSummaryZoomSemanticSignature',
    'Get-InteractiveActionAndCustomShowSignatures'
)
$definitions = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true))
foreach ($name in $names) {
    $definition = $definitions | Where-Object Name -eq $name | Select-Object -First 1
    if (-not $definition) { throw "Missing comparator helper $name" }
    Invoke-Expression $definition.Extent.Text
}
if ($source -notmatch 'nativeSectionZoomCount' -or $source -notmatch 'nativeSummaryZoomCount') {
    throw 'Native Section/Summary Zoom comparator integration is missing.'
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
$refSummarySection = '{10000000-0000-0000-0000-000000000001}'
$refOverviewSection = '{20000000-0000-0000-0000-000000000002}'
$refDetailsSection = '{30000000-0000-0000-0000-000000000003}'
function Write-Utf8([string]$Path, [string]$Text) {
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($Path)) | Out-Null
    [System.IO.File]::WriteAllText($Path, $Text, $utf8)
}
function New-Fixture([string]$Name, [bool]$Renumbered) {
    $root = Join-Path $temp $Name
    [System.IO.Directory]::CreateDirectory((Join-Path $root 'ppt\slides\_rels')) | Out-Null
    [System.IO.Directory]::CreateDirectory((Join-Path $root 'ppt\_rels')) | Out-Null
    [System.IO.Directory]::CreateDirectory((Join-Path $root 'ppt\media')) | Out-Null
    $presentationRids = if ($Renumbered) { @('rId91','rId92','rId93','rId94','rId95') } else { @('rId1','rId2','rId3','rId4','rId5') }
    $slideIds = if ($Renumbered) { @('1024','1025','1026','1027','1028') } else { @('256','257','258','259','260') }
    $sectionIds = if ($Renumbered) {
        @('{A0000000-0000-0000-0000-000000000001}','{B0000000-0000-0000-0000-000000000002}','{C0000000-0000-0000-0000-000000000003}')
    } else { @($refSummarySection,$refOverviewSection,$refDetailsSection) }
    $rids = if ($Renumbered) { @('rId71','rId72','rId73','rId74','rId75','rId76','rId77') } else { @('rId11','rId12','rId13','rId14','rId15','rId16','rId17') }
    $sectionGuid = if ($Renumbered) { '{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}' } else { '{11111111-2222-3333-4444-555555555555}' }
    $summaryGuid1 = if ($Renumbered) { '{AAAAAAAA-1111-2222-3333-444444444444}' } else { '{66666666-7777-8888-9999-AAAAAAAAAAAA}' }
    $summaryGuid2 = if ($Renumbered) { '{BBBBBBBB-1111-2222-3333-444444444444}' } else { '{BBBBBBBB-CCCC-DDDD-EEEE-FFFFFFFFFFFF}' }
    $sectionProperties = if ($Renumbered) { ' transitionDur="1000"' } else { ' returnToParent="true" imageType="preview" transitionDur="1000" showBg="1"' }
    $summaryObjectDefaults = if ($Renumbered) { '' } else { ' title="" descr="" offsetFactorX="0" offsetFactorY="0" scaleFactorX="100000" scaleFactorY="100000"' }
    $summaryProperties = if ($Renumbered) { ' transitionDur="1000"' } else { ' returnToParent="1" imageType="preview" transitionDur="1000" showBg="true"' }

    Write-Utf8 (Join-Path $root '[Content_Types].xml') '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/></Types>'
    Write-Utf8 (Join-Path $root 'ppt\presentation.xml') @"
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"><p:sldIdLst><p:sldId id="$($slideIds[0])" r:id="$($presentationRids[0])"/><p:sldId id="$($slideIds[1])" r:id="$($presentationRids[1])"/><p:sldId id="$($slideIds[2])" r:id="$($presentationRids[2])"/><p:sldId id="$($slideIds[3])" r:id="$($presentationRids[3])"/><p:sldId id="$($slideIds[4])" r:id="$($presentationRids[4])"/></p:sldIdLst><p:extLst><p:ext uri="{521415D9-36F7-43E2-AB2F-B90AF26B5E84}"><p14:sectionLst><p14:section name="Summary Section" id="$($sectionIds[0])"><p14:sldIdLst><p14:sldId id="$($slideIds[0])"/></p14:sldIdLst></p14:section><p14:section name="Overview" id="$($sectionIds[1])"><p14:sldIdLst><p14:sldId id="$($slideIds[1])"/><p14:sldId id="$($slideIds[2])"/></p14:sldIdLst></p14:section><p14:section name="Details" id="$($sectionIds[2])"><p14:sldIdLst><p14:sldId id="$($slideIds[3])"/><p14:sldId id="$($slideIds[4])"/></p14:sldIdLst></p14:section></p14:sectionLst></p:ext></p:extLst></p:presentation>
"@
    $presentationRelationships = for ($i = 0; $i -lt 5; $i++) { '<Relationship Id="{0}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{1}.xml"/>' -f $presentationRids[$i],($i + 1) }
    Write-Utf8 (Join-Path $root 'ppt\_rels\presentation.xml.rels') "<Relationships xmlns=`"http://schemas.openxmlformats.org/package/2006/relationships`">$($presentationRelationships -join '')</Relationships>"

    $slideXml = @"
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><p:cSld><p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
<p:sp><p:nvSpPr><p:cNvPr id="2" name="Ordinary jump"><a:hlinkClick r:id="$($rids[0])" action="ppaction://hlinksldjump" tooltip="Ordinary action"/></p:cNvPr><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/></p:sp>
<mc:AlternateContent><mc:Choice xmlns:psez="http://schemas.microsoft.com/office/powerpoint/2016/sectionzoom" Requires="psez"><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="3" name="Section Zoom"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="1000000" y="1000000"/><a:ext cx="3000000" cy="1800000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/powerpoint/2016/sectionzoom"><psez:sectionZm><psez:sectionZmObj sectionId="$($sectionIds[2])"><psez:zmPr id="$sectionGuid"$sectionProperties><p166:blipFill xmlns:p166="http://schemas.microsoft.com/office/powerpoint/2016/6/main"><a:blip r:embed="$($rids[1])"/><a:stretch><a:fillRect/></a:stretch></p166:blipFill><p166:spPr xmlns:p166="http://schemas.microsoft.com/office/powerpoint/2016/6/main"><a:xfrm><a:off x="0" y="0"/><a:ext cx="3000000" cy="1800000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p166:spPr></psez:zmPr></psez:sectionZmObj></psez:sectionZm></a:graphicData></a:graphic></p:graphicFrame></mc:Choice><mc:Fallback><p:pic><p:nvPicPr><p:cNvPr id="3" name="Section Zoom"><a:hlinkClick r:id="$($rids[2])" action="ppaction://hlinksldjump"/></p:cNvPr><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="$($rids[1])"/></p:blipFill><p:spPr><a:xfrm><a:off x="1000000" y="1000000"/><a:ext cx="3000000" cy="1800000"/></a:xfrm></p:spPr></p:pic></mc:Fallback></mc:AlternateContent>
<mc:AlternateContent><mc:Choice xmlns:psuz="http://schemas.microsoft.com/office/powerpoint/2016/summaryzoom" Requires="psuz"><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="Summary Zoom"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="500000" y="3200000"/><a:ext cx="8000000" cy="2500000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/powerpoint/2016/summaryzoom"><psuz:summaryZm><psuz:summaryZmObj sectionId="$($sectionIds[1])"$summaryObjectDefaults><psuz:zmPr id="$summaryGuid1"$summaryProperties><p166:blipFill xmlns:p166="http://schemas.microsoft.com/office/powerpoint/2016/6/main"><a:blip r:embed="$($rids[3])"/></p166:blipFill><p166:spPr xmlns:p166="http://schemas.microsoft.com/office/powerpoint/2016/6/main"><a:xfrm><a:off x="0" y="0"/><a:ext cx="3800000" cy="2200000"/></a:xfrm></p166:spPr></psuz:zmPr></psuz:summaryZmObj><psuz:summaryZmObj sectionId="$($sectionIds[2])"$summaryObjectDefaults><psuz:zmPr id="$summaryGuid2"$summaryProperties><p166:blipFill xmlns:p166="http://schemas.microsoft.com/office/powerpoint/2016/6/main"><a:blip r:embed="$($rids[4])"/></p166:blipFill><p166:spPr xmlns:p166="http://schemas.microsoft.com/office/powerpoint/2016/6/main"><a:xfrm><a:off x="4000000" y="0"/><a:ext cx="3800000" cy="2200000"/></a:xfrm></p166:spPr></psuz:zmPr></psuz:summaryZmObj><psuz:gridLayout/></psuz:summaryZm></a:graphicData></a:graphic></p:graphicFrame></mc:Choice><mc:Fallback><p:grpSp><p:nvGrpSpPr><p:cNvPr id="4" name="Summary Zoom"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:pic><p:nvPicPr><p:cNvPr id="5" name="Overview fallback"><a:hlinkClick r:id="$($rids[5])" action="ppaction://hlinksldjump"/></p:cNvPr><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="$($rids[3])"/></p:blipFill><p:spPr/></p:pic><p:pic><p:nvPicPr><p:cNvPr id="6" name="Details fallback"><a:hlinkClick r:id="$($rids[6])" action="ppaction://hlinksldjump"/></p:cNvPr><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="$($rids[4])"/></p:blipFill><p:spPr/></p:pic></p:grpSp></mc:Fallback></mc:AlternateContent>
</p:spTree></p:cSld></p:sld>
"@
    if ($Renumbered) {
        $slideXml = $slideXml.Replace('xmlns:psez=', 'xmlns:se=').Replace('Requires="psez"', 'Requires="se"').Replace('psez:', 'se:')
        $slideXml = $slideXml.Replace('xmlns:psuz=', 'xmlns:su=').Replace('Requires="psuz"', 'Requires="su"').Replace('psuz:', 'su:')
        $slideXml = $slideXml.Replace('xmlns:p166=', 'xmlns:z16=').Replace('p166:', 'z16:')
    }
    Write-Utf8 (Join-Path $root 'ppt\slides\slide1.xml') $slideXml
    foreach ($number in 2..5) { Write-Utf8 (Join-Path $root "ppt\slides\slide$number.xml") '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree/></p:cSld></p:sld>' }
    Write-Utf8 (Join-Path $root 'ppt\slides\_rels\slide1.xml.rels') @"
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="$($rids[0])" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slide3.xml"/><Relationship Id="$($rids[1])" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/section.png"/><Relationship Id="$($rids[2])" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slide4.xml"/><Relationship Id="$($rids[3])" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/summary-a.png"/><Relationship Id="$($rids[4])" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/summary-b.png"/><Relationship Id="$($rids[5])" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slide2.xml"/><Relationship Id="$($rids[6])" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slide4.xml"/></Relationships>
"@
    [System.IO.File]::WriteAllBytes((Join-Path $root 'ppt\media\section.png'), [byte[]](137,80,78,71,13,10,26,10,1))
    [System.IO.File]::WriteAllBytes((Join-Path $root 'ppt\media\summary-a.png'), [byte[]](137,80,78,71,13,10,26,10,2))
    [System.IO.File]::WriteAllBytes((Join-Path $root 'ppt\media\summary-b.png'), [byte[]](137,80,78,71,13,10,26,10,3))
    return $root
}
function Map-Text([string]$Root) {
    $map = Get-InteractiveActionAndCustomShowSignatures $Root
    return @($map.Keys | Sort-Object | ForEach-Object { "$_=$($map[$_])" }) -join "`n"
}
function New-Mutation([string]$Source, [string]$Name, [string]$Relative, [string]$Old, [string]$New) {
    $root = Join-Path $temp $Name
    Copy-Item -LiteralPath $Source -Destination $root -Recurse
    $path = Join-Path $root $Relative
    $text = [System.IO.File]::ReadAllText($path)
    if (-not $text.Contains($Old)) { throw "$Name source token was not found." }
    Write-Utf8 $path ($text.Replace($Old, $New))
    return $root
}

$temp = Join-Path ([System.IO.Path]::GetTempPath()) "pptx-section-summary-zoom-$([Guid]::NewGuid().ToString('N'))"
try {
    [System.IO.Directory]::CreateDirectory($temp) | Out-Null
    $reference = New-Fixture 'reference' $false
    $equivalent = New-Fixture 'equivalent' $true
    $baseline = Map-Text $reference
    Assert-Equal (Map-Text $equivalent) $baseline 'relationship, slide-ID, section-GUID, zoom-GUID, and explicit-default equivalence'
    Assert-Match $baseline 'nativeSectionZoomCount=count=1' 'native Section Zoom count'
    Assert-Match $baseline 'nativeSummaryZoomCount=count=1' 'native Summary Zoom count'
    Assert-Match $baseline 'actionCount=count=1' 'ordinary action count excludes all zoom fallbacks'
    Assert-Match $baseline 'nativeSectionZoom\|0000=.*sectionTarget=\{index=2\|.*target=ppt/slides/slide4.xml' 'Section Zoom semantic target'
    Assert-Match $baseline 'nativeSummaryZoom\|0000=layout=gridLayout\|objectCount=2\|.*fallbackPictureCount=2' 'Summary Zoom topology'

    $mutations = @(
        @('section-choice-target','ppt\slides\slide1.xml',"<psez:sectionZmObj sectionId=`"$refDetailsSection`"","<psez:sectionZmObj sectionId=`"$refOverviewSection`""),
        @('section-name','ppt\presentation.xml','name="Details"','name="Detail renamed"'),
        @('section-return','ppt\slides\slide1.xml','returnToParent="true"','returnToParent="false"'),
        @('section-duration-zero','ppt\slides\slide1.xml','transitionDur="1000" showBg="1"','transitionDur="0" showBg="1"'),
        @('section-duration-omitted','ppt\slides\slide1.xml',' transitionDur="1000" showBg="1"',' showBg="1"'),
        @('section-geometry','ppt\slides\slide1.xml','<a:off x="1000000" y="1000000"/>','<a:off x="1100000" y="1000000"/>'),
        @('section-accessibility','ppt\slides\slide1.xml','name="Section Zoom"/>','name="Section Zoom" descr="Section preview"/>'),
        @('section-namespace','ppt\slides\slide1.xml','xmlns:psez="http://schemas.microsoft.com/office/powerpoint/2016/sectionzoom"','xmlns:psez="http://schemas.microsoft.com/office/powerpoint/2016/not-sectionzoom"'),
        @('section-fallback-target','ppt\slides\_rels\slide1.xml.rels','<Relationship Id="rId13" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slide4.xml"/>','<Relationship Id="rId13" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slide5.xml"/>'),
        @('summary-choice-target','ppt\slides\slide1.xml',"<psuz:summaryZmObj sectionId=`"$refOverviewSection`"","<psuz:summaryZmObj sectionId=`"$refDetailsSection`""),
        @('summary-layout','ppt\slides\slide1.xml','<psuz:gridLayout/>','<psuz:fixedLayout/>'),
        @('summary-title','ppt\slides\slide1.xml',' title="" descr=""',' title="Overview zoom" descr=""'),
        @('summary-offset','ppt\slides\slide1.xml','offsetFactorX="0"','offsetFactorX="1000"'),
        @('summary-scale','ppt\slides\slide1.xml','scaleFactorY="100000"','scaleFactorY="90000"'),
        @('summary-duration-zero','ppt\slides\slide1.xml','id="{66666666-7777-8888-9999-AAAAAAAAAAAA}" returnToParent="1" imageType="preview" transitionDur="1000"','id="{66666666-7777-8888-9999-AAAAAAAAAAAA}" returnToParent="1" imageType="preview" transitionDur="0"'),
        @('summary-show-background','ppt\slides\slide1.xml','showBg="true"','showBg="false"'),
        @('summary-geometry','ppt\slides\slide1.xml','<a:off x="500000" y="3200000"/>','<a:off x="600000" y="3200000"/>'),
        @('summary-accessibility','ppt\slides\slide1.xml','name="Summary Zoom"/>','name="Summary Zoom" descr="Summary preview"/>'),
        @('summary-namespace','ppt\slides\slide1.xml','xmlns:psuz="http://schemas.microsoft.com/office/powerpoint/2016/summaryzoom"','xmlns:psuz="http://schemas.microsoft.com/office/powerpoint/2016/not-summaryzoom"'),
        @('summary-fallback-target','ppt\slides\_rels\slide1.xml.rels','Target="slide2.xml"','Target="slide3.xml"')
    )
    foreach ($mutation in $mutations) {
        $root = New-Mutation $reference $mutation[0] $mutation[1] $mutation[2] $mutation[3]
        Assert-NotEqual (Map-Text $root) $baseline $mutation[0]
    }
    foreach ($mediaMutation in @(
        @('section-thumbnail','ppt\media\section.png',[byte[]](137,80,78,71,13,10,26,10,9)),
        @('summary-thumbnail','ppt\media\summary-b.png',[byte[]](137,80,78,71,13,10,26,10,8))
    )) {
        $root = Join-Path $temp $mediaMutation[0]
        Copy-Item -LiteralPath $reference -Destination $root -Recurse
        [System.IO.File]::WriteAllBytes((Join-Path $root $mediaMutation[1]), $mediaMutation[2])
        Assert-NotEqual (Map-Text $root) $baseline $mediaMutation[0]
    }

    Write-Host 'PASS comparator native Section/Summary Zoom signatures' -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
