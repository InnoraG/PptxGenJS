$ErrorActionPreference = 'Stop'

function Assert-Equal {
    param([string]$Actual, [string]$Expected, [string]$Label)
    if ($Actual -ne $Expected) {
        throw "$Label mismatch. Expected '$Expected', got '$Actual'."
    }
}

function Assert-Match {
    param([string]$Actual, [string]$Pattern, [string]$Label)
    if ($Actual -notmatch $Pattern) {
        throw "$Label did not match '$Pattern'. Actual: '$Actual'."
    }
}

function Assert-NotEqual {
    param([string]$Actual, [string]$Expected, [string]$Label)
    if ($Actual -eq $Expected) {
        throw "$Label unexpectedly matched. Value: '$Actual'."
    }
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
    'Get-AttrByLocalName',
    'Resolve-PackageTargetPath',
    'Get-RelMapForPart',
    'Get-PackageContentTypes',
    'Get-PackageContentType',
    'Get-CachedPackageHash',
    'Get-RelationshipSemanticInfo',
    'Get-ResolvedHyperlinkTargetSignature',
    'Get-NormalizedPlaceholderAttributeSignature',
    'Get-PicturePlaceholderSignature',
    'Get-PictureMetadataSignature',
    'Get-PictureCountSignature',
    'Get-PictureRelationshipSignatures',
    'Get-MediaCaptionSignatures',
    'Get-PresentationShowSettingsSignature',
    'Get-SavedNarrationSemanticSignature',
    'Get-MediaPlaybackSignatures',
    'Get-TimingConditionSignatures',
    'Get-MediaCommandSignatures'
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

$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) "pptx-comparator-semantics-$([Guid]::NewGuid().ToString('N'))"
try {
    $slideDir = Join-Path $fixtureRoot 'ppt\slides'
    $relsDir = Join-Path $slideDir '_rels'
    $mediaDir = Join-Path $fixtureRoot 'ppt\media'
    New-Item -ItemType Directory -Force $relsDir, $mediaDir | Out-Null

    @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="mp4" ContentType="video/mp4"/>
  <Default Extension="wav" ContentType="audio/wav"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="svg" ContentType="image/svg+xml"/>
  <Default Extension="wdp" ContentType="image/vnd.ms-photo"/>
  <Default Extension="vtt" ContentType="text/vtt"/>
</Types>
'@ | Set-Content -LiteralPath (Join-Path $fixtureRoot '[Content_Types].xml') -Encoding utf8

    [System.IO.File]::WriteAllBytes((Join-Path $mediaDir 'clip.mp4'), [byte[]](1,2,3,4,5))
    [System.IO.File]::WriteAllBytes((Join-Path $mediaDir 'clip.wav'), [byte[]](82,73,70,70,0,0,0,0,87,65,86,69))
    [System.IO.File]::WriteAllBytes((Join-Path $mediaDir 'poster.png'), [byte[]](137,80,78,71,13,10,26,10))
    [System.IO.File]::WriteAllText((Join-Path $mediaDir 'vector.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>')
    [System.IO.File]::WriteAllBytes((Join-Path $mediaDir 'native.wdp'), [byte[]](73,73,188,1,87,68,80,72,79,84,79))
    [System.IO.File]::WriteAllText((Join-Path $mediaDir 'captions.vtt'), "WEBVTT`n`n00:00:00.000 --> 00:00:01.000`nProof`n")

    @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdVideo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/video" Target="../media/clip.mp4"/>
  <Relationship Id="rIdAudio" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio" Target="../media/clip.wav"/>
  <Relationship Id="rIdMedia" Type="http://schemas.microsoft.com/office/2007/relationships/media" Target="../media/clip.mp4"/>
  <Relationship Id="rIdPoster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/poster.png"/>
  <Relationship Id="rIdSvg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/vector.svg"/>
  <Relationship Id="rIdWdp" Type="http://schemas.microsoft.com/office/2007/relationships/hdphoto" Target="../media/native.wdp"/>
  <Relationship Id="rIdCaption" Type="http://schemas.microsoft.com/office/2017/04/relationships/track" Target="../media/captions.vtt"/>
  <Relationship Id="rIdLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.test/watch" TargetMode="External"/>
</Relationships>
'@ | Set-Content -LiteralPath (Join-Path $relsDir 'slide1.xml.rels') -Encoding utf8

    $slideXmlText = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"
       xmlns:p173="http://schemas.microsoft.com/office/powerpoint/2017/3/main">
  <p:cSld><p:spTree>
    <p:pic>
      <p:nvPicPr>
        <p:cNvPr id="2" name="Video 1" title="Quarterly demo" descr="Captioned product walkthrough">
          <a:hlinkClick r:id="rIdLink"/>
        </p:cNvPr>
        <p:cNvPicPr/>
        <p:nvPr>
          <p:ph type="pic" idx="3" sz="half" orient="vert" hasCustomPrompt="1"/>
          <a:videoFile r:link="rIdVideo"/>
          <p:extLst><p:ext uri="media"><p14:media r:embed="rIdMedia"><p14:extLst><p:ext uri="tracks"><p173:tracksInfo displayLoc="slide"><p173:trackLst><p173:track id="{00000000-0000-0000-0000-000000000001}" label="English" lang="en-US" default="1" r:embed="rIdCaption"/></p173:trackLst></p173:tracksInfo></p:ext></p14:extLst></p14:media></p:ext></p:extLst>
        </p:nvPr>
      </p:nvPicPr>
      <p:blipFill><a:blip r:embed="rIdPoster"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
      <p:spPr/>
    </p:pic>
  </p:spTree></p:cSld>
  <p:timing><p:tnLst>
    <p:seq><p:cTn nodeType="interactiveSeq">
      <p:stCondLst><p:cond evt="onClick" delay="0"><p:tgtEl><p:spTgt spid="2"/></p:tgtEl></p:cond></p:stCondLst>
      <p:childTnLst><p:par><p:cTn nodeType="clickEffect">
        <p:stCondLst><p:cond delay="250"/></p:stCondLst>
        <p:childTnLst><p:cmd type="call" cmd="playFrom(0.0)"><p:cBhvr>
          <p:cTn dur="3000"/><p:tgtEl><p:spTgt spid="2"/></p:tgtEl>
        </p:cBhvr></p:cmd></p:childTnLst>
      </p:cTn></p:par></p:childTnLst>
    </p:cTn></p:seq>
    <p:video fullScrn="0"><p:cMediaNode vol="65000" showWhenStopped="1">
      <p:cTn><p:endCondLst><p:cond evt="onStopAudio" delay="0"/></p:endCondLst></p:cTn>
      <p:tgtEl><p:spTgt spid="2"/></p:tgtEl>
    </p:cMediaNode></p:video>
  </p:tnLst></p:timing>
</p:sld>
'@
    $slidePath = Join-Path $slideDir 'slide1.xml'
    $slideXmlText | Set-Content -LiteralPath $slidePath -Encoding utf8
    [xml]$slideXml = $slideXmlText
    $ns = New-Object System.Xml.XmlNamespaceManager($slideXml.NameTable)
    $ns.AddNamespace('p', 'http://schemas.openxmlformats.org/presentationml/2006/main')
    $ns.AddNamespace('a', 'http://schemas.openxmlformats.org/drawingml/2006/main')

    $picture = Safe-SelectSingleNode $slideXml '//p:pic' $ns
    $rels = Get-RelMapForPart $fixtureRoot (Join-Path $relsDir 'slide1.xml.rels')
    $contentTypes = Get-PackageContentTypes $fixtureRoot
    $metadata = Get-PictureMetadataSignature $picture $ns
    Assert-Equal $metadata.Match 'name=Video 1|title=Quarterly demo|descr=Captioned product walkthrough' 'picture metadata'
    [xml]$pictureNameMutationXml = $slideXmlText.Replace('name="Video 1"', 'name="Renamed video"')
    $pictureNameMutationNs = New-Object System.Xml.XmlNamespaceManager($pictureNameMutationXml.NameTable)
    $pictureNameMutationNs.AddNamespace('p', 'http://schemas.openxmlformats.org/presentationml/2006/main')
    $pictureNameMutation = Safe-SelectSingleNode $pictureNameMutationXml '//p:pic' $pictureNameMutationNs
    Assert-NotEqual (Get-PictureMetadataSignature $pictureNameMutation $pictureNameMutationNs).Match $metadata.Match 'picture object-name mutation'
    Assert-Equal (Get-PicturePlaceholderSignature $picture $ns) 'type=pic|idx=3|sz=half|orient=vert|hasCustomPrompt=1' 'placeholder tuple'
    Assert-Equal (Get-PictureCountSignature $slideXml $ns) 'count=1' 'picture count'

    [xml]$clipArtExplicitXml = '<p:pic xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:nvPicPr><p:cNvPr id="2" name="ClipArt"/><p:cNvPicPr/><p:nvPr><p:ph type="clipArt" idx="0" orient="vert" hasCustomPrompt="0"/></p:nvPr></p:nvPicPr><p:blipFill/><p:spPr/></p:pic>'
    $clipArtExplicitNs = New-Object System.Xml.XmlNamespaceManager($clipArtExplicitXml.NameTable)
    $clipArtExplicitNs.AddNamespace('p', 'http://schemas.openxmlformats.org/presentationml/2006/main')
    [xml]$clipArtCanonicalXml = '<p:pic xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:nvPicPr><p:cNvPr id="2" name="ClipArt"/><p:cNvPicPr/><p:nvPr><p:ph type="clipArt"/></p:nvPr></p:nvPicPr><p:blipFill/><p:spPr/></p:pic>'
    $clipArtCanonicalNs = New-Object System.Xml.XmlNamespaceManager($clipArtCanonicalXml.NameTable)
    $clipArtCanonicalNs.AddNamespace('p', 'http://schemas.openxmlformats.org/presentationml/2006/main')
    Assert-Equal (Get-PicturePlaceholderSignature $clipArtCanonicalXml.DocumentElement $clipArtCanonicalNs) (Get-PicturePlaceholderSignature $clipArtExplicitXml.DocumentElement $clipArtExplicitNs) 'picture clipArt Office default omission equivalence'

    [xml]$pictureHorizontalXml = $slideXmlText.Replace('orient="vert"', 'orient="horz"')
    $pictureHorizontalNs = New-Object System.Xml.XmlNamespaceManager($pictureHorizontalXml.NameTable)
    $pictureHorizontalNs.AddNamespace('p', 'http://schemas.openxmlformats.org/presentationml/2006/main')
    $pictureHorizontal = Safe-SelectSingleNode $pictureHorizontalXml '//p:pic' $pictureHorizontalNs
    Assert-NotEqual (Get-PicturePlaceholderSignature $pictureHorizontal $pictureHorizontalNs) (Get-PicturePlaceholderSignature $picture $ns) 'picture non-clipArt orientation mutation'

    $extraPictureFragment = '<p:pic><p:nvPicPr><p:cNvPr id="99" name="Unexpected picture"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill/><p:spPr/></p:pic>'
    [xml]$extraPictureXml = $slideXmlText.Replace('</p:spTree>', "$extraPictureFragment</p:spTree>")
    $extraPictureNs = New-Object System.Xml.XmlNamespaceManager($extraPictureXml.NameTable)
    $extraPictureNs.AddNamespace('p', 'http://schemas.openxmlformats.org/presentationml/2006/main')
    $extraPictureNs.AddNamespace('a', 'http://schemas.openxmlformats.org/drawingml/2006/main')
    Assert-Equal (Get-PictureCountSignature $extraPictureXml $extraPictureNs) 'count=2' 'extra picture count gate'

    $hyperlink = Safe-SelectSingleNode $picture './p:nvPicPr/p:cNvPr/a:hlinkClick' $ns
    $hyperlinkSig = Get-ResolvedHyperlinkTargetSignature $hyperlink $fixtureRoot 'ppt/slides/slide1.xml' $rels
    Assert-Equal $hyperlinkSig.Match 'hyperlink|external|https://example.test/watch' 'resolved hyperlink target'

    $pictureRels = Get-PictureRelationshipSignatures $picture $ns $fixtureRoot 'ppt/slides/slide1.xml' $rels $contentTypes
    Assert-Equal $pictureRels.CarrierKind 'videoFile|internal' 'media carrier kind'
    Assert-Match $pictureRels.Carrier.Match '^video\|internal\|ppt/media/\*\.mp4\|video/mp4\|[0-9a-f]{64}$' 'media asset signature'
    Assert-Match $pictureRels.Companion.Match '^media\|internal\|ppt/media/\*\.mp4\|video/mp4\|[0-9a-f]{64}$' 'media companion signature'
    Assert-Match $pictureRels.Poster.Match '^image\|internal\|ppt/media/\*\.png\|image/png\|[0-9a-f]{64}$' 'poster signature'
    Assert-Match $pictureRels.Carrier.Detail 'target=ppt/media/clip\.mp4; mode=Internal; contentType=video/mp4; sha256=' 'resolved media details'
    $wavInfo = Get-RelationshipSemanticInfo $fixtureRoot 'ppt/slides/slide1.xml' $rels 'rIdAudio' $contentTypes
    $wavAliasTypes = [PSCustomObject]@{ Defaults = @{ wav = 'audio/x-wav' }; Overrides = @{} }
    $wavAliasInfo = Get-RelationshipSemanticInfo $fixtureRoot 'ppt/slides/slide1.xml' $rels 'rIdAudio' $wavAliasTypes
    Assert-Equal $wavAliasInfo.Match $wavInfo.Match 'WAV registered content-type alias equivalence'
    Assert-NotEqual $wavAliasInfo.Detail $wavInfo.Detail 'WAV diagnostic retains exact content type'

    $captionSigs = @(Get-MediaCaptionSignatures $slideXml $ns $fixtureRoot 'ppt/slides/slide1.xml' $rels $contentTypes)
    Assert-Equal ([string]$captionSigs.Count) '1' 'caption track count'
    Assert-Match $captionSigs[0] '^spid=2\|displayLoc=slide\|id=\{00000000-0000-0000-0000-000000000001\}\|label=English\|lang=en-US\|default=1\|payload=track\|internal\|ppt/media/\*\.vtt\|text/vtt\|[0-9a-f]{64}$' 'caption semantic signature'
    [xml]$captionMetadataMutationXml = $slideXmlText.Replace('label="English"', 'label="French"')
    $captionMetadataMutationNs = New-Object System.Xml.XmlNamespaceManager($captionMetadataMutationXml.NameTable)
    $captionMetadataMutationNs.AddNamespace('p', 'http://schemas.openxmlformats.org/presentationml/2006/main')
    $captionMetadataMutationSig = @(Get-MediaCaptionSignatures $captionMetadataMutationXml $captionMetadataMutationNs $fixtureRoot 'ppt/slides/slide1.xml' $rels $contentTypes)
    if (($captionMetadataMutationSig -join "`n") -eq ($captionSigs -join "`n")) { throw 'Caption label mutation was not detected.' }
    [System.IO.File]::WriteAllText((Join-Path $mediaDir 'captions.vtt'), "WEBVTT`n`n00:00:00.000 --> 00:00:01.000`nChanged`n")
    $script:semanticPackageHashCache = @{}
    $captionPayloadMutationSig = @(Get-MediaCaptionSignatures $slideXml $ns $fixtureRoot 'ppt/slides/slide1.xml' $rels $contentTypes)
    if (($captionPayloadMutationSig -join "`n") -eq ($captionSigs -join "`n")) { throw 'Caption WebVTT payload mutation was not detected.' }
    [xml]$captionRemovalXml = $slideXmlText.Replace('<p173:track id="{00000000-0000-0000-0000-000000000001}" label="English" lang="en-US" default="1" r:embed="rIdCaption"/>', '')
    $captionRemovalNs = New-Object System.Xml.XmlNamespaceManager($captionRemovalXml.NameTable)
    $captionRemovalNs.AddNamespace('p', 'http://schemas.openxmlformats.org/presentationml/2006/main')
    Assert-Equal ([string]@(Get-MediaCaptionSignatures $captionRemovalXml $captionRemovalNs $fixtureRoot 'ppt/slides/slide1.xml' $rels $contentTypes).Count) '0' 'caption removal gate'

    $svgPictureText = @'
<p:pic xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main">
  <p:nvPicPr><p:cNvPr id="3" name="Vector 1"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
  <p:blipFill><a:blip r:embed="rIdPoster"><a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip r:embed="rIdSvg"/></a:ext></a:extLst></a:blip><a:stretch><a:fillRect/></a:stretch></p:blipFill>
  <p:spPr/>
</p:pic>
'@
    [xml]$svgPictureXml = $svgPictureText
    $svgNs = New-Object System.Xml.XmlNamespaceManager($svgPictureXml.NameTable)
    $svgNs.AddNamespace('p', 'http://schemas.openxmlformats.org/presentationml/2006/main')
    $svgNs.AddNamespace('a', 'http://schemas.openxmlformats.org/drawingml/2006/main')
    $svgPicture = $svgPictureXml.DocumentElement
    $svgRelsBefore = Get-PictureRelationshipSignatures $svgPicture $svgNs $fixtureRoot 'ppt/slides/slide1.xml' $rels $contentTypes
    Assert-Match $svgRelsBefore.Poster.Match '^image\|internal\|ppt/media/\*\.png\|image/png\|[0-9a-f]{64}$' 'SVG fallback signature'
    Assert-Match $svgRelsBefore.Svg.Match '^image\|internal\|ppt/media/\*\.svg\|image/svg\+xml\|[0-9a-f]{64}$' 'SVG companion signature'

    [System.IO.File]::WriteAllText((Join-Path $mediaDir 'vector.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><circle r="2"/></svg>')
    $script:semanticPackageHashCache = @{}
    $svgRelsAfter = Get-PictureRelationshipSignatures $svgPicture $svgNs $fixtureRoot 'ppt/slides/slide1.xml' $rels $contentTypes
    if ($svgRelsAfter.Svg.Match -eq $svgRelsBefore.Svg.Match) { throw 'SVG companion-only payload mutation was not detected.' }
    if ($svgRelsAfter.Poster.Match -ne $svgRelsBefore.Poster.Match) { throw 'SVG companion-only mutation changed the fallback signature.' }

    $wdpPictureText = @'
<p:pic xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main">
  <p:nvPicPr><p:cNvPr id="4" name="Adjusted 1"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
  <p:blipFill><a:blip r:embed="rIdPoster"><a:extLst><a:ext uri="{BEBA8EAE-BF5A-486C-A8C5-ECC9F3942E4B}"><a14:imgProps><a14:imgLayer r:embed="rIdWdp"><a14:imgEffect><a14:saturation val="120000"/></a14:imgEffect></a14:imgLayer></a14:imgProps></a:ext></a:extLst></a:blip><a:stretch><a:fillRect/></a:stretch></p:blipFill>
  <p:spPr/>
</p:pic>
'@
    [xml]$wdpPictureXml = $wdpPictureText
    $wdpNs = New-Object System.Xml.XmlNamespaceManager($wdpPictureXml.NameTable)
    $wdpNs.AddNamespace('p', 'http://schemas.openxmlformats.org/presentationml/2006/main')
    $wdpNs.AddNamespace('a', 'http://schemas.openxmlformats.org/drawingml/2006/main')
    $wdpRelsBefore = Get-PictureRelationshipSignatures $wdpPictureXml.DocumentElement $wdpNs $fixtureRoot 'ppt/slides/slide1.xml' $rels $contentTypes
    Assert-Match $wdpRelsBefore.NativeImage.Match '^hdphoto\|internal\|ppt/media/\*\.wdp\|image/vnd\.ms-photo\|[0-9a-f]{64}$' 'WDP native image signature'

    [System.IO.File]::WriteAllBytes((Join-Path $mediaDir 'native.wdp'), [byte[]](73,73,188,1,67,72,65,78,71,69,68))
    $script:semanticPackageHashCache = @{}
    $wdpRelsAfter = Get-PictureRelationshipSignatures $wdpPictureXml.DocumentElement $wdpNs $fixtureRoot 'ppt/slides/slide1.xml' $rels $contentTypes
    Assert-NotEqual $wdpRelsAfter.NativeImage.Match $wdpRelsBefore.NativeImage.Match 'WDP native image payload mutation'
    Assert-Equal $wdpRelsAfter.Poster.Match $wdpRelsBefore.Poster.Match 'WDP payload mutation preserves fallback signature'

    $wrongKindRels = @{}
    foreach ($relationshipId in $rels.Keys) {
        $relationship = $rels[$relationshipId]
        $relationshipType = if ($relationshipId -eq 'rIdWdp') { 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image' } else { [string]$relationship.Type }
        $wrongKindRels[$relationshipId] = [PSCustomObject]@{
            Id = [string]$relationship.Id
            Type = $relationshipType
            Target = [string]$relationship.Target
            TargetMode = [string]$relationship.TargetMode
        }
    }
    $wdpWrongKind = Get-PictureRelationshipSignatures $wdpPictureXml.DocumentElement $wdpNs $fixtureRoot 'ppt/slides/slide1.xml' $wrongKindRels $contentTypes
    Assert-NotEqual $wdpWrongKind.NativeImage.Match $wdpRelsAfter.NativeImage.Match 'WDP relationship-kind mutation'

    $missingWdpRels = @{}
    foreach ($relationshipId in $rels.Keys) {
        if ($relationshipId -ne 'rIdWdp') { $missingWdpRels[$relationshipId] = $rels[$relationshipId] }
    }
    $wdpMissing = Get-PictureRelationshipSignatures $wdpPictureXml.DocumentElement $wdpNs $fixtureRoot 'ppt/slides/slide1.xml' $missingWdpRels $contentTypes
    Assert-Match $wdpMissing.NativeImage.Match '^missing-relationship\|rIdWdp$' 'WDP missing relationship gate'

    $playback = @(Get-MediaPlaybackSignatures $slideXml $ns)
    Assert-Equal $playback[0] 'kind=video|target=2|vol=65000|showWhenStopped=1|endOnStopAudio=1|isNarration=0|fullScrn=0' 'media playback signature'
    $commands = @(Get-MediaCommandSignatures $slideXml $ns)
    Assert-Equal $commands[0] 'type=call|cmd=playFrom(0.0)|target=2|nodeType=clickEffect|triggerConds=evt=<unset>,delay=250,target=<unset>,tn=<unset>|dur=3000|seqConds=evt=onClick,delay=0,target=2,tn=<unset>' 'media command signature'

    [xml]$changedTimingXml = $slideXmlText.Replace('delay="250"', 'delay="251"').Replace('vol="65000"', 'vol="64000"')
    $changedTimingNs = New-Object System.Xml.XmlNamespaceManager($changedTimingXml.NameTable)
    $changedTimingNs.AddNamespace('p', 'http://schemas.openxmlformats.org/presentationml/2006/main')
    $changedTimingNs.AddNamespace('a', 'http://schemas.openxmlformats.org/drawingml/2006/main')
    if ((@(Get-MediaCommandSignatures $changedTimingXml $changedTimingNs) -join "`n") -eq ($commands -join "`n")) { throw 'Media command delay mutation was not detected.' }
    if ((@(Get-MediaPlaybackSignatures $changedTimingXml $changedTimingNs) -join "`n") -eq ($playback -join "`n")) { throw 'Media playback flag mutation was not detected.' }

    $commandCases = @(
        [PSCustomObject]@{ Name = 'play/onClick'; Command = 'playFrom(0.0)'; MutatedCommand = 'stop'; NodeType = 'clickEffect'; MutatedNodeType = 'withEffect'; Event = 'onClick'; MutatedEvent = 'onBegin'; Delay = 101; Duration = 1001 },
        [PSCustomObject]@{ Name = 'pause/withPrevious'; Command = 'togglePause'; MutatedCommand = 'playFrom(0.0)'; NodeType = 'withEffect'; MutatedNodeType = 'afterEffect'; Event = 'onBegin'; MutatedEvent = 'onEnd'; Delay = 202; Duration = 1 },
        [PSCustomObject]@{ Name = 'stop/afterPrevious'; Command = 'stop'; MutatedCommand = 'togglePause'; NodeType = 'afterEffect'; MutatedNodeType = 'clickEffect'; Event = 'onEnd'; MutatedEvent = 'onClick'; Delay = 303; Duration = 1 }
    )
    foreach ($case in $commandCases) {
        $commandFixtureText = @"
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:timing><p:tnLst><p:par><p:cTn nodeType="$($case.NodeType)">
    <p:stCondLst><p:cond evt="$($case.Event)" delay="$($case.Delay)"><p:tgtEl><p:spTgt spid="2"/></p:tgtEl></p:cond></p:stCondLst>
    <p:childTnLst><p:cmd type="call" cmd="$($case.Command)"><p:cBhvr><p:cTn dur="$($case.Duration)"/><p:tgtEl><p:spTgt spid="2"/></p:tgtEl></p:cBhvr></p:cmd></p:childTnLst>
  </p:cTn></p:par></p:tnLst></p:timing>
</p:sld>
"@
        [xml]$commandFixtureXml = $commandFixtureText
        $commandFixtureNs = New-Object System.Xml.XmlNamespaceManager($commandFixtureXml.NameTable)
        $commandFixtureNs.AddNamespace('p', 'http://schemas.openxmlformats.org/presentationml/2006/main')
        $baselineCommandSig = @(Get-MediaCommandSignatures $commandFixtureXml $commandFixtureNs) -join "`n"
        Assert-Match $baselineCommandSig ("cmd=" + [regex]::Escape($case.Command) + "\|target=2\|nodeType=" + $case.NodeType) "$($case.Name) command/target/node signature"
        Assert-Match $baselineCommandSig ("triggerConds=evt=" + $case.Event + ",delay=" + $case.Delay + ",target=2") "$($case.Name) trigger signature"

        $mutations = [ordered]@{
            command = $commandFixtureText.Replace("cmd=`"$($case.Command)`"", "cmd=`"$($case.MutatedCommand)`"")
            nodeType = $commandFixtureText.Replace("nodeType=`"$($case.NodeType)`"", "nodeType=`"$($case.MutatedNodeType)`"")
            trigger = $commandFixtureText.Replace("evt=`"$($case.Event)`"", "evt=`"$($case.MutatedEvent)`"")
            delay = $commandFixtureText.Replace("delay=`"$($case.Delay)`"", "delay=`"$([int]$case.Delay + 1)`"")
            duration = $commandFixtureText.Replace("dur=`"$($case.Duration)`"", "dur=`"$([int]$case.Duration + 1)`"")
            target = $commandFixtureText.Replace('spid="2"', 'spid="9"')
        }
        foreach ($mutationName in $mutations.Keys) {
            [xml]$mutatedCommandXml = $mutations[$mutationName]
            $mutatedCommandNs = New-Object System.Xml.XmlNamespaceManager($mutatedCommandXml.NameTable)
            $mutatedCommandNs.AddNamespace('p', 'http://schemas.openxmlformats.org/presentationml/2006/main')
            $mutatedCommandSig = @(Get-MediaCommandSignatures $mutatedCommandXml $mutatedCommandNs) -join "`n"
            if ($mutatedCommandSig -eq $baselineCommandSig) { throw "$($case.Name) $mutationName mutation was not detected." }
        }
    }

    $presPropsText = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentationPr xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:showPr showNarration="1" showAnimation="1" useTimings="1"/>
</p:presentationPr>
'@
    $presPropsPath = Join-Path $fixtureRoot 'ppt\presProps.xml'
    $presPropsText | Set-Content -LiteralPath $presPropsPath -Encoding utf8
    $narrationSlideText = @'
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:p15="http://schemas.microsoft.com/office/powerpoint/2012/main">
  <p:cSld><p:spTree><p:pic><p:nvPicPr><p:cNvPr id="7" name="Narration 1"/><p:cNvPicPr/><p:nvPr><p:extLst><p:ext uri="{42D2F446-02D8-4167-A562-619A0277C38B}"><p15:isNarration val="1"/></p:ext></p:extLst></p:nvPr></p:nvPicPr><p:blipFill/><p:spPr/></p:pic></p:spTree></p:cSld>
  <p:transition advClick="0" advTm="4321"/>
  <p:timing><p:tnLst><p:audio isNarration="1"><p:cMediaNode><p:cTn/><p:tgtEl><p:spTgt spid="7"/></p:tgtEl></p:cMediaNode></p:audio></p:tnLst></p:timing>
</p:sld>
'@
    [xml]$narrationSlideXml = $narrationSlideText
    $narrationNs = New-Object System.Xml.XmlNamespaceManager($narrationSlideXml.NameTable)
    $narrationNs.AddNamespace('p', 'http://schemas.openxmlformats.org/presentationml/2006/main')
    $narrationBaseline = Get-SavedNarrationSemanticSignature $narrationSlideXml $narrationNs $fixtureRoot
    if (-not $narrationBaseline.HasNarration) { throw 'Saved narration declaration was not recognized.' }
    Assert-Equal $narrationBaseline.PictureBindings 'spid=7,isNarration=1' 'narration picture binding'
    Assert-Equal $narrationBaseline.AudioBindings 'spid=7,isNarration=1' 'narration audio binding'
    Assert-Equal $narrationBaseline.Transition 'advClick=0,advTm=4321' 'narration transition'
    Assert-Equal $narrationBaseline.Presentation 'showNarration=1|showAnimation=1|useTimings=1' 'narration presentation flags'

    $narrationXmlMutations = [ordered]@{
        pictureBinding = $narrationSlideText.Replace('<p15:isNarration val="1"/>', '<p15:isNarration val="0"/>')
        audioBinding = $narrationSlideText.Replace('<p:audio isNarration="1">', '<p:audio isNarration="0">')
        transitionClick = $narrationSlideText.Replace('advClick="0"', 'advClick="1"')
        transitionTime = $narrationSlideText.Replace('advTm="4321"', 'advTm="4322"')
    }
    foreach ($mutationName in $narrationXmlMutations.Keys) {
        [xml]$mutatedNarrationXml = $narrationXmlMutations[$mutationName]
        $mutatedNarrationNs = New-Object System.Xml.XmlNamespaceManager($mutatedNarrationXml.NameTable)
        $mutatedNarrationNs.AddNamespace('p', 'http://schemas.openxmlformats.org/presentationml/2006/main')
        $mutatedNarration = Get-SavedNarrationSemanticSignature $mutatedNarrationXml $mutatedNarrationNs $fixtureRoot
        if ($mutatedNarration.Match -eq $narrationBaseline.Match) { throw "Narration $mutationName mutation was not detected." }
    }
    foreach ($flag in @('showNarration','showAnimation','useTimings')) {
        $presPropsText.Replace("$flag=`"1`"", "$flag=`"0`"") | Set-Content -LiteralPath $presPropsPath -Encoding utf8
        $mutatedPresentation = Get-SavedNarrationSemanticSignature $narrationSlideXml $narrationNs $fixtureRoot
        if ($mutatedPresentation.Match -eq $narrationBaseline.Match) { throw "Narration presentation flag $flag mutation was not detected." }
    }
    $presPropsText | Set-Content -LiteralPath $presPropsPath -Encoding utf8

    [System.IO.File]::WriteAllBytes((Join-Path $mediaDir 'clip.mp4'), [byte[]](9,9,9,9,9))
    $script:semanticPackageHashCache = @{}
    $changed = Get-PictureRelationshipSignatures $picture $ns $fixtureRoot 'ppt/slides/slide1.xml' $rels $contentTypes
    if ($changed.Carrier.Match -eq $pictureRels.Carrier.Match) { throw 'Media payload hash mutation was not detected.' }

    Write-Host 'Comparator picture/media semantic signature fixture: PASS' -ForegroundColor Green
} finally {
    Remove-Item -LiteralPath $fixtureRoot -Recurse -Force -ErrorAction SilentlyContinue
}
