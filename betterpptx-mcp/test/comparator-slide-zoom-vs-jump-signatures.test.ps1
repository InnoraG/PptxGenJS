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
    'Normalize-XmlFragment','Get-RelativePackagePath','Get-AttrByLocalName','Resolve-PackageTargetPath','Get-RelMapForPart',
    'Get-PartRelPathFromFullPath','Get-PackageContentTypes','Get-PackageContentType','Get-RelationshipIdAttributeValue',
    'Get-ElementSemanticPath','Get-RelationshipTargetSemanticSignature','Get-RelationshipIndependentXmlSignature',
    'Copy-NamespaceCanonicalXmlNode','Get-NamespaceCanonicalXmlSignature','Get-RelationshipIndependentNamespaceCanonicalXmlSignature',
    'Get-NormalizedBooleanAttribute','Get-CachedPackageHash','Get-RelationshipSemanticInfo','Get-ResolvedHyperlinkTargetSignature',
    'Get-ExactUnicodeTextSignature','Get-InteractiveLogicalChildren','Get-InteractiveCarrierRecords',
    'Get-InteractiveCarrierPropertiesNode','Get-CustomShowActionSemanticSignature','Get-InteractiveActionSignature','Get-InteractiveRelationshipIntegritySignature',
    'Get-PresentationSlideIdSemanticMap','Get-PresentationSectionIdSemanticMap',
    'Get-NativeZoomAlternateContentBranches','Set-NormalizedNativeZoomProperties',
    'Get-NativeSlideZoomSemanticSignature','Get-NativeSectionZoomSemanticSignature','Get-NativeSummaryZoomSemanticSignature',
    'Get-InteractiveActionAndCustomShowSignatures'
)
$definitions = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true))
foreach ($name in $names) {
    $definition = $definitions | Where-Object Name -eq $name | Select-Object -First 1
    if (-not $definition) { throw "Missing comparator helper $name" }
    Invoke-Expression $definition.Extent.Text
}
if ($source -notmatch 'nativeSlideZoomCount') { throw 'Native Slide Zoom comparator integration is missing.' }

$utf8 = New-Object System.Text.UTF8Encoding($false)
function Write-Utf8([string]$Path, [string]$Text) {
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($Path)) | Out-Null
    [System.IO.File]::WriteAllText($Path, $Text, $utf8)
}
function New-Fixture([string]$Name, [bool]$Renumbered) {
    $root = Join-Path $temp $Name
    [System.IO.Directory]::CreateDirectory((Join-Path $root 'ppt\slides\_rels')) | Out-Null
    [System.IO.Directory]::CreateDirectory((Join-Path $root 'ppt\_rels')) | Out-Null
    [System.IO.Directory]::CreateDirectory((Join-Path $root 'ppt\media')) | Out-Null
    $presentationRids = if ($Renumbered) { @('rId91','rId92','rId93') } else { @('rId1','rId2','rId3') }
    $slideIds = if ($Renumbered) { @('1024','1025','1026') } else { @('256','257','258') }
    $jumpRid = if ($Renumbered) { 'rId71' } else { 'rId11' }
    $zoomRid = if ($Renumbered) { 'rId72' } else { 'rId12' }
    $imageRid = if ($Renumbered) { 'rId73' } else { 'rId13' }
    $guid = if ($Renumbered) { '{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}' } else { '{11111111-2222-3333-4444-555555555555}' }
    $zoomDefaults = if ($Renumbered) { ' transitionDur="1000"' } else { ' returnToParent="1" imageType="preview" transitionDur="1000" showBg="true"' }
    $childId = ' cId="0"'
    Write-Utf8 (Join-Path $root '[Content_Types].xml') '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/></Types>'
    Write-Utf8 (Join-Path $root 'ppt\presentation.xml') @"
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="$($slideIds[0])" r:id="$($presentationRids[0])"/><p:sldId id="$($slideIds[1])" r:id="$($presentationRids[1])"/><p:sldId id="$($slideIds[2])" r:id="$($presentationRids[2])"/></p:sldIdLst></p:presentation>
"@
    Write-Utf8 (Join-Path $root 'ppt\_rels\presentation.xml.rels') @"
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="$($presentationRids[0])" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="$($presentationRids[1])" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/><Relationship Id="$($presentationRids[2])" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide3.xml"/></Relationships>
"@
    Write-Utf8 (Join-Path $root 'ppt\slides\slide1.xml') @"
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><p:cSld><p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
<p:sp><p:nvSpPr><p:cNvPr id="2" name="Ordinary internal jump"><a:hlinkClick r:id="$jumpRid" action="ppaction://hlinksldjump" tooltip="Jump to detail"/></p:cNvPr><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="100000" y="100000"/><a:ext cx="1000000" cy="500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:sp>
<mc:AlternateContent><mc:Choice xmlns:pslz="http://schemas.microsoft.com/office/powerpoint/2016/slidezoom" Requires="pslz"><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="3" name="Native Slide Zoom"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="2000000" y="1000000"/><a:ext cx="3000000" cy="2000000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/powerpoint/2016/slidezoom"><pslz:sldZm><pslz:sldZmObj sldId="$($slideIds[2])"$childId><pslz:zmPr id="$guid"$zoomDefaults><p166:blipFill xmlns:p166="http://schemas.microsoft.com/office/powerpoint/2016/6/main"><a:blip r:embed="$imageRid"/><a:stretch><a:fillRect/></a:stretch></p166:blipFill><p166:spPr xmlns:p166="http://schemas.microsoft.com/office/powerpoint/2016/6/main"><a:xfrm><a:off x="0" y="0"/><a:ext cx="3000000" cy="2000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p166:spPr></pslz:zmPr></pslz:sldZmObj></pslz:sldZm></a:graphicData></a:graphic></p:graphicFrame></mc:Choice><mc:Fallback><p:pic><p:nvPicPr><p:cNvPr id="3" name="Native Slide Zoom"><a:hlinkClick r:id="$zoomRid" action="ppaction://hlinksldjump"/></p:cNvPr><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="$imageRid"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="2000000" y="1000000"/><a:ext cx="3000000" cy="2000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></mc:Fallback></mc:AlternateContent>
</p:spTree></p:cSld></p:sld>
"@
    foreach ($number in 2..3) { Write-Utf8 (Join-Path $root "ppt\slides\slide$number.xml") '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree/></p:cSld></p:sld>' }
    Write-Utf8 (Join-Path $root 'ppt\slides\_rels\slide1.xml.rels') @"
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="$jumpRid" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slide2.xml"/><Relationship Id="$zoomRid" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slide3.xml"/><Relationship Id="$imageRid" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/zoom.png"/></Relationships>
"@
    [System.IO.File]::WriteAllBytes((Join-Path $root 'ppt\media\zoom.png'), [byte[]](137,80,78,71,13,10,26,10,1,2,3,4))
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

$temp = Join-Path ([System.IO.Path]::GetTempPath()) "pptx-slide-zoom-comparator-$([Guid]::NewGuid().ToString('N'))"
try {
    [System.IO.Directory]::CreateDirectory($temp) | Out-Null
    $reference = New-Fixture 'reference' $false
    $equivalent = New-Fixture 'equivalent' $true
    $baseline = Map-Text $reference
    Assert-Equal (Map-Text $equivalent) $baseline 'relationship, presentation-slide-ID, GUID, and explicit-default equivalence'
    Assert-Match $baseline 'nativeSlideZoomCount=count=1' 'native Slide Zoom count'
    Assert-Match $baseline 'actionCount=count=1' 'ordinary jump action count excludes zoom fallback'
    Assert-Match $baseline 'nativeSlideZoom\|0000=.*choiceTarget=\{kind=slide\|mode=Internal\|target=ppt/slides/slide3.xml' 'native zoom target'
    $ordinaryJumpTarget = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('slide|internal|ppt/slides/slide2.xml|exists=1'))
    Assert-Match $baseline "action\|0000=.*target=\{utf8=$([regex]::Escape($ordinaryJumpTarget))\|" 'ordinary jump target'

    $mutations = @(
        @('ordinary-jump-target','ppt\slides\_rels\slide1.xml.rels','Target="slide2.xml"','Target="slide3.xml"'),
        @('zoom-choice-target','ppt\slides\slide1.xml','sldId="258"','sldId="257"'),
        @('zoom-fallback-target','ppt\slides\_rels\slide1.xml.rels','Target="slide3.xml"','Target="slide2.xml"'),
        @('zoom-creation-id','ppt\slides\slide1.xml',' cId="0"',''),
        @('zoom-return','ppt\slides\slide1.xml','returnToParent="1"','returnToParent="0"'),
        @('zoom-image-type','ppt\slides\slide1.xml','imageType="preview"','imageType="live"'),
        @('zoom-duration','ppt\slides\slide1.xml','transitionDur="1000"','transitionDur="2500"'),
        @('zoom-duration-zero','ppt\slides\slide1.xml','transitionDur="1000"','transitionDur="0"'),
        @('zoom-duration-omitted','ppt\slides\slide1.xml',' transitionDur="1000"',''),
        @('zoom-show-background','ppt\slides\slide1.xml','showBg="true"','showBg="false"'),
        @('zoom-geometry','ppt\slides\slide1.xml','<a:off x="2000000" y="1000000"/>','<a:off x="2100000" y="1000000"/>'),
        @('zoom-accessibility','ppt\slides\slide1.xml','name="Native Slide Zoom"/>','name="Native Slide Zoom" descr="Target preview"/>'),
        @('zoom-kind','ppt\slides\slide1.xml','http://schemas.microsoft.com/office/powerpoint/2016/slidezoom','http://schemas.microsoft.com/office/powerpoint/2016/not-slidezoom'),
        @('zoom-namespace','ppt\slides\slide1.xml','xmlns:pslz="http://schemas.microsoft.com/office/powerpoint/2016/slidezoom"','xmlns:pslz="http://schemas.microsoft.com/office/powerpoint/2016/not-slidezoom"')
    )
    foreach ($mutation in $mutations) {
        $root = New-Mutation $reference $mutation[0] $mutation[1] $mutation[2] $mutation[3]
        Assert-NotEqual (Map-Text $root) $baseline $mutation[0]
    }
    $thumbnail = Join-Path $temp 'zoom-thumbnail'
    Copy-Item -LiteralPath $reference -Destination $thumbnail -Recurse
    [System.IO.File]::WriteAllBytes((Join-Path $thumbnail 'ppt\media\zoom.png'), [byte[]](137,80,78,71,13,10,26,10,9,9,9,9))
    Assert-NotEqual (Map-Text $thumbnail) $baseline 'zoom thumbnail payload'

    Write-Host 'PASS comparator native Slide Zoom versus ordinary jump signatures' -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
