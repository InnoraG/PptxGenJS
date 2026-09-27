$ErrorActionPreference = 'Stop'

function Assert-Equal([string]$Actual, [string]$Expected, [string]$Label) {
    if ($Actual -ne $Expected) { throw "$Label mismatch.`nEXPECTED:`n$Expected`nACTUAL:`n$Actual" }
}
function Assert-NotEqual([string]$Actual, [string]$Expected, [string]$Label) {
    if ($Actual -eq $Expected) { throw "$Label unexpectedly matched." }
}

$comparatorPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..\ULTIMATE_PPTX_XPATH_COMPARATOR_v2h_DECYPHER.ps1')).Path
$tokens = $null; $parseErrors = $null
$comparatorSource = Get-Content -LiteralPath $comparatorPath -Raw -Encoding UTF8
$ast = [System.Management.Automation.Language.Parser]::ParseInput($comparatorSource, $comparatorPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw "Comparator parse failed: $($parseErrors -join '; ')" }
$names = @(
    'Get-RelativePackagePath','Get-AttrByLocalName','Get-RelationshipIdAttributeValue','Resolve-PackageTargetPath','Get-RelMapForPart',
    'Get-PartRelPathFromFullPath','Get-PackageContentTypes','Get-PackageContentType',
    'Get-ElementSemanticPath','Get-RelationshipTargetSemanticSignature','Get-RelationshipIndependentXmlSignature',
    'Copy-NamespaceCanonicalXmlNode','Get-NamespaceCanonicalXmlSignature','Get-RelationshipIndependentNamespaceCanonicalXmlSignature',
    'Get-NormalizedBooleanAttribute','Get-CachedPackageHash',
    'Get-RelationshipSemanticInfo','Get-ResolvedHyperlinkTargetSignature','Get-ExactUnicodeTextSignature',
    'Get-InteractiveLogicalChildren','Get-InteractiveCarrierRecords','Get-InteractiveCarrierPropertiesNode',
    'Get-CustomShowActionSemanticSignature','Get-InteractiveActionSignature','Get-InteractiveRelationshipIntegritySignature',
    'Get-PresentationSlideIdSemanticMap','Get-PresentationSectionIdSemanticMap',
    'Get-NativeZoomAlternateContentBranches','Set-NormalizedNativeZoomProperties',
    'Get-NativeSlideZoomSemanticSignature','Get-NativeSectionZoomSemanticSignature','Get-NativeSummaryZoomSemanticSignature',
    'Get-InteractiveActionAndCustomShowSignatures'
)
$definitions = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true))
foreach ($name in $names) {
    $definition = $definitions | Where-Object Name -eq $name | Select-Object -First 1
    if (-not $definition) { throw "Missing comparator helper $name" }
    Invoke-Expression $definition.Extent.Text
}
if ($comparatorSource -notmatch "Compare-StringMaps 'interactive actions and custom shows'") { throw 'Main comparator integration is missing.' }

Add-Type -AssemblyName System.IO.Compression.FileSystem
function Write-Utf8([string]$Path, [string]$Text) {
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($Path)) | Out-Null
    [System.IO.File]::WriteAllText($Path, $Text, (New-Object System.Text.UTF8Encoding($false)))
}
function New-Package([string]$Path, [bool]$Renumbered) {
    $work = "$Path.dir"
    [System.IO.Directory]::CreateDirectory((Join-Path $work 'ppt\slides\_rels')) | Out-Null
    [System.IO.Directory]::CreateDirectory((Join-Path $work 'ppt\_rels')) | Out-Null
    [System.IO.Directory]::CreateDirectory((Join-Path $work 'ppt\media')) | Out-Null
    $showId = if ($Renumbered) { '42' } else { '7' }
    $backupShowId = if ($Renumbered) { '43' } else { '8' }
    $slideIds = if ($Renumbered) { @('rId91','rId92','rId93') } else { @('rId1','rId2','rId3') }
    $urlId = if ($Renumbered) { 'rId71' } else { 'rId11' }
    $jumpId = if ($Renumbered) { 'rId72' } else { 'rId12' }
    $soundId = if ($Renumbered) { 'rId73' } else { 'rId13' }
    $soundFile = if ($Renumbered) { 'renamed.wav' } else { 'action.wav' }
    $wavType = if ($Renumbered) { 'audio/x-wav' } else { 'audio/wav' }
    $defaults = if ($Renumbered) { ' action="" tgtFrame="" invalidUrl="" endSnd="0" highlightClick="0" history="1"' } else { '' }
    $builtIn = if ($Renumbered) { ' builtIn="false"' } else { '' }
    $fallbackUri = if ($Renumbered) { 'ppaction://ignored-generated-fallback' } else { 'ppaction://ignored-reference-fallback' }
    $types = @"
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="wav" ContentType="$wavType"/></Types>
"@
    Write-Utf8 (Join-Path $work '[Content_Types].xml') $types
    $presentation = @"
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="$($slideIds[0])"/><p:sldId id="257" r:id="$($slideIds[1])"/><p:sldId id="258" r:id="$($slideIds[2])"/></p:sldIdLst><p:custShowLst><p:custShow name="Executive route" id="$showId"><p:sldLst><p:sld r:id="$($slideIds[2])"/><p:sld r:id="$($slideIds[1])"/></p:sldLst></p:custShow><p:custShow name="Backup route" id="$backupShowId"><p:sldLst><p:sld r:id="$($slideIds[0])"/></p:sldLst></p:custShow></p:custShowLst></p:presentation>
"@
    Write-Utf8 (Join-Path $work 'ppt\presentation.xml') $presentation
    $presRels = @"
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="$($slideIds[0])" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="$($slideIds[1])" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/><Relationship Id="$($slideIds[2])" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide3.xml"/></Relationships>
"@
    Write-Utf8 (Join-Path $work 'ppt\_rels\presentation.xml.rels') $presRels
    $slide = @"
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><p:cSld><p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
<p:sp><p:nvSpPr><p:cNvPr id="2" name="URL button"><a:hlinkClick r:id="$urlId" tooltip="Open site"$defaults/></p:cNvPr><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/></p:sp>
<p:pic><p:nvPicPr><p:cNvPr id="3" name="Hover picture"><a:hlinkMouseOver r:id="$jumpId" action="ppaction://hlinksldjump"/></p:cNvPr><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill/><p:spPr/></p:pic>
<p:sp><p:nvSpPr><p:cNvPr id="4" name="End show"><a:hlinkClick action="ppaction://hlinkshowjump?jump=endshow"/></p:cNvPr><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="5" name="Custom show"><a:hlinkClick action="ppaction://customshow?id=$showId"/></p:cNvPr><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="6" name="Sound action"><a:hlinkClick action="urn:vendor:exact-action"><a:snd r:embed="$soundId" name="Chime"$builtIn/></a:hlinkClick></p:cNvPr><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="7" name="Action Button"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:prstGeom prst="actionButtonHome"/></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr><a:hlinkClick r:id="$urlId"/><a:hlinkMouseOver r:id="$jumpId" tooltip="Preview"/></a:rPr><a:t>Go</a:t></a:r></a:p></p:txBody></p:sp>
<mc:AlternateContent><mc:Choice Requires="p14"><p:sp><p:nvSpPr><p:cNvPr id="8" name="Choice action"><a:hlinkClick action="urn:choice:exact"/></p:cNvPr><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/></p:sp></mc:Choice><mc:Fallback><p:sp><p:nvSpPr><p:cNvPr id="8" name="Fallback"><a:hlinkClick action="$fallbackUri"/></p:cNvPr><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/></p:sp></mc:Fallback></mc:AlternateContent>
</p:spTree></p:cSld></p:sld>
"@
    Write-Utf8 (Join-Path $work 'ppt\slides\slide1.xml') $slide
    foreach ($number in 2..3) { Write-Utf8 (Join-Path $work "ppt\slides\slide$number.xml") '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree/></p:cSld></p:sld>' }
    $slideRels = @"
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="$urlId" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.test/action" TargetMode="External"/><Relationship Id="$jumpId" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slide3.xml"/><Relationship Id="$soundId" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio" Target="../media/$soundFile"/></Relationships>
"@
    Write-Utf8 (Join-Path $work 'ppt\slides\_rels\slide1.xml.rels') $slideRels
    [System.IO.File]::WriteAllBytes((Join-Path $work "ppt\media\$soundFile"), [byte[]](82,73,70,70,4,0,0,0,87,65,86,69))
    [System.IO.Compression.ZipFile]::CreateFromDirectory($work, $Path)
}
function Expand-Package([string]$Pptx, [string]$Root) { [System.IO.Compression.ZipFile]::ExtractToDirectory($Pptx, $Root) }
function Map-Text([string]$Root) {
    $map = Get-InteractiveActionAndCustomShowSignatures $Root
    return @($map.Keys | Sort-Object | ForEach-Object { "$_=$($map[$_])" }) -join "`n"
}
function New-Mutation([string]$Source, [string]$Name, [string]$Old, [string]$New, [string]$RelativePath) {
    $root = Join-Path (Split-Path $Source -Parent) $Name
    Copy-Item -LiteralPath $Source -Destination $root -Recurse
    $path = Join-Path $root $RelativePath
    $text = [System.IO.File]::ReadAllText($path)
    if (-not $text.Contains($Old)) { throw "Mutation token not found: $Old" }
    Write-Utf8 $path ($text.Replace($Old, $New))
    return $root
}

$temp = Join-Path ([System.IO.Path]::GetTempPath()) "pptx-interactive-actions-$([guid]::NewGuid().ToString('N'))"
try {
    [System.IO.Directory]::CreateDirectory($temp) | Out-Null
    $refPptx = Join-Path $temp 'reference.pptx'; $genPptx = Join-Path $temp 'generated.pptx'
    New-Package $refPptx $false; New-Package $genPptx $true
    $refRoot = Join-Path $temp 'reference'; $genRoot = Join-Path $temp 'generated'
    Expand-Package $refPptx $refRoot; Expand-Package $genPptx $genRoot
    $baseline = Map-Text $refRoot
    Assert-Equal (Map-Text $genRoot) $baseline 'relationship/show-ID renumber, WAV alias/name, defaults, and fallback equivalence'
    if ((@($baseline -split "`n" | Where-Object { $_ -match '\|action\|' })).Count -ne 8) { throw 'Expected eight logical object/run click/hover actions; AlternateContent fallback may have been double-counted.' }
    if ($baseline -notmatch 'carrierKind=sp.*location=object' -or $baseline -notmatch 'carrierKind=pic.*location=object' -or $baseline -notmatch 'carrierKind=sp.*location=run=') {
        throw 'Expected shape, picture, and text-run hyperlink carriers.'
    }
    if ($baseline -notmatch 'relationshipIntegrity=candidateCount=2\|referencedCount=2\|orphanCount=0') { throw 'Expected clean hyperlink/slide relationship integrity baseline.' }

    $cases = @(
        @('click-hover','<a:hlinkClick r:id="rId11" tooltip="Open site"/>','<a:hlinkMouseOver r:id="rId11" tooltip="Open site"/>','ppt\slides\slide1.xml'),
        @('url-target','https://example.test/action','https://example.test/changed','ppt\slides\_rels\slide1.xml.rels'),
        @('external-target-mode',' TargetMode="External"','','ppt\slides\_rels\slide1.xml.rels'),
        @('relationship-kind','relationships/hyperlink" Target="https://example.test/action"','relationships/image" Target="https://example.test/action"','ppt\slides\_rels\slide1.xml.rels'),
        @('tooltip','tooltip="Open site"','tooltip="Changed"','ppt\slides\slide1.xml'),
        @('target-frame','tooltip="Open site"','tooltip="Open site" tgtFrame="_blank"','ppt\slides\slide1.xml'),
        @('missing-relationship','<a:hlinkClick r:id="rId11" tooltip="Open site"/>','<a:hlinkClick r:id="rId404" tooltip="Open site"/>','ppt\slides\slide1.xml'),
        @('internal-retarget','Target="slide3.xml"','Target="slide2.xml"','ppt\slides\_rels\slide1.xml.rels'),
        @('internal-dangling-target','Target="slide3.xml"','Target="slide404.xml"','ppt\slides\_rels\slide1.xml.rels'),
        @('end-show','jump=endshow','jump=nextslide','ppt\slides\slide1.xml'),
        @('unknown-action','urn:vendor:exact-action','urn:vendor:changed','ppt\slides\slide1.xml'),
        @('custom-order','<p:sld r:id="rId3"/><p:sld r:id="rId2"/>','<p:sld r:id="rId2"/><p:sld r:id="rId3"/>','ppt\presentation.xml'),
        @('custom-unresolved','customshow?id=7','customshow?id=999','ppt\slides\slide1.xml'),
        @('sound-name','name="Chime"','name="Other"','ppt\slides\slide1.xml'),
        @('sound-missing-relationship','r:embed="rId13"','r:embed="rId999"','ppt\slides\slide1.xml'),
        @('sound-content-type','audio/wav','audio/mpeg','[Content_Types].xml'),
        @('sound-payload','82,73,70,70','unused','none'),
        @('run-hover','tooltip="Preview"','tooltip="Changed preview"','ppt\slides\slide1.xml'),
        @('choice-action','urn:choice:exact','urn:choice:changed','ppt\slides\slide1.xml')
    )
    foreach ($case in $cases) {
        if ($case[0] -eq 'sound-payload') {
            $root = Join-Path $temp 'sound-payload'; Copy-Item $refRoot $root -Recurse
            [System.IO.File]::WriteAllBytes((Join-Path $root 'ppt\media\action.wav'), [byte[]](82,73,70,70,9,0,0,0,87,65,86,69))
        } else { $root = New-Mutation $refRoot $case[0] $case[1] $case[2] $case[3] }
        Assert-NotEqual (Map-Text $root) $baseline $case[0]
    }
    $danglingProofRoot = New-Mutation $refRoot 'internal-dangling-proof' 'Target="slide3.xml"' 'Target="slide404.xml"' 'ppt\slides\_rels\slide1.xml.rels'
    [xml]$danglingSlideXml = Get-Content -LiteralPath (Join-Path $danglingProofRoot 'ppt\slides\slide1.xml') -Raw
    $danglingNode = $danglingSlideXml.SelectSingleNode("//*[local-name()='hlinkMouseOver']")
    $danglingRels = Get-RelMapForPart $danglingProofRoot (Join-Path $danglingProofRoot 'ppt\slides\_rels\slide1.xml.rels')
    $danglingInfo = Get-ResolvedHyperlinkTargetSignature $danglingNode $danglingProofRoot 'ppt/slides/slide1.xml' $danglingRels
    Assert-Equal $danglingInfo.Match 'slide|internal|ppt/slides/slide404.xml|exists=0' 'dangling internal target existence'
    $showOrderOld = '<p:custShow name="Executive route" id="7"><p:sldLst><p:sld r:id="rId3"/><p:sld r:id="rId2"/></p:sldLst></p:custShow><p:custShow name="Backup route" id="8"><p:sldLst><p:sld r:id="rId1"/></p:sldLst></p:custShow>'
    $showOrderNew = '<p:custShow name="Backup route" id="8"><p:sldLst><p:sld r:id="rId1"/></p:sldLst></p:custShow><p:custShow name="Executive route" id="7"><p:sldLst><p:sld r:id="rId3"/><p:sld r:id="rId2"/></p:sldLst></p:custShow>'
    $showOrderRoot = New-Mutation $refRoot 'custom-show-list-order' $showOrderOld $showOrderNew 'ppt\presentation.xml'
    Assert-NotEqual (Map-Text $showOrderRoot) $baseline 'ordered custom-show list'
    $duplicateRoot = New-Mutation $refRoot 'duplicate-show' '</p:custShowLst>' '<p:custShow name="Executive route" id="7"><p:sldLst/></p:custShow></p:custShowLst>' 'ppt\presentation.xml'
    Assert-NotEqual (Map-Text $duplicateRoot) $baseline 'duplicate custom-show diagnostics'
    $fallbackRoot = New-Mutation $refRoot 'fallback-only' 'ppaction://ignored-reference-fallback' 'ppaction://changed-but-ignored' 'ppt\slides\slide1.xml'
    Assert-Equal (Map-Text $fallbackRoot) $baseline 'AlternateContent fallback collapse'

    $reorderOld = '<p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/><p:sldId id="258" r:id="rId3"/></p:sldIdLst>'
    $reorderNew = '<p:sldIdLst><p:sldId id="258" r:id="rId3"/><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst>'
    $reorderRoot = New-Mutation $refRoot 'slide-reorder' $reorderOld $reorderNew 'ppt\presentation.xml'
    Assert-Equal (Map-Text $reorderRoot) $baseline 'slide reorder preserves relationship-resolved hyperlink target'

    $missingA = New-Mutation $refRoot 'missing-a' 'r:id="rId11"' 'r:id="rId404"' 'ppt\slides\slide1.xml'
    $missingB = New-Mutation $refRoot 'missing-b' 'r:id="rId11"' 'r:id="rId909"' 'ppt\slides\slide1.xml'
    Assert-Equal (Map-Text $missingA) (Map-Text $missingB) 'missing relationship-ID independence'

    $staleRoot = New-Mutation $refRoot 'stale-reset-object' '<a:hlinkClick r:id="rId11" tooltip="Open site"/>' '' 'ppt\slides\slide1.xml'
    $staleRoot2 = New-Mutation $staleRoot 'stale-reset-run' '<a:hlinkClick r:id="rId11"/>' '' 'ppt\slides\slide1.xml'
    $staleMap = Map-Text $staleRoot2
    if ($staleMap -notmatch 'relationshipIntegrity=candidateCount=2\|referencedCount=1\|orphanCount=1') { throw 'Stale hyperlink relationship after carrier reset/delete was not diagnosed.' }
    $urlRelationship = '<Relationship Id="rId11" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.test/action" TargetMode="External"/>'
    $cleanRoot = New-Mutation $staleRoot2 'clean-reset' $urlRelationship '' 'ppt\slides\_rels\slide1.xml.rels'
    Assert-NotEqual (Map-Text $cleanRoot) $staleMap 'clean reset/delete versus stale relationship'
    if ((Map-Text $cleanRoot) -notmatch 'relationshipIntegrity=candidateCount=1\|referencedCount=1\|orphanCount=0') { throw 'Clean reset/delete relationship state was not recognized.' }

    $orphanRelationship = '<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.test/orphan" TargetMode="External"/>'
    $orphanRoot = New-Mutation $refRoot 'extra-orphan' '</Relationships>' "$orphanRelationship</Relationships>" 'ppt\slides\_rels\slide1.xml.rels'
    Assert-NotEqual (Map-Text $orphanRoot) $baseline 'extra orphan hyperlink relationship'
    if ((Map-Text $orphanRoot) -notmatch 'orphanCount=1') { throw 'Extra orphan hyperlink relationship was not diagnosed.' }
    $invalidOrphanRelationship = '<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.test/orphan"/>'
    $invalidOrphanRoot = New-Mutation $orphanRoot 'invalid-mode-orphan' $orphanRelationship $invalidOrphanRelationship 'ppt\slides\_rels\slide1.xml.rels'
    Assert-NotEqual (Map-Text $invalidOrphanRoot) (Map-Text $orphanRoot) 'orphan relationship target mode'
    Write-Host 'PASS comparator foundation interactive-action/custom-show signatures' -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
