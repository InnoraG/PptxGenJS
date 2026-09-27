$ErrorActionPreference = 'Stop'

function Assert-Equal {
    param([string]$Actual, [string]$Expected, [string]$Label)
    if ($Actual -ne $Expected) { throw "$Label mismatch.`nExpected:`n$Expected`nActual:`n$Actual" }
}

function Assert-NotEqual {
    param([string]$Actual, [string]$Expected, [string]$Label)
    if ($Actual -eq $Expected) { throw "$Label unexpectedly matched.`nValue:`n$Actual" }
}

function Assert-Match {
    param([string]$Actual, [string]$Pattern, [string]$Label)
    if ($Actual -notmatch $Pattern) { throw "$Label did not match '$Pattern'.`nActual:`n$Actual" }
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
    'Get-RelativePackagePath',
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
    'Get-UniqueInheritanceRelationship',
    'Get-ExactUnicodeTextSignature',
    'Get-NormalizedSlideTransitionSignature',
    'Get-SpeakerNotesBodySignature',
    'Get-SlideLifecycleSignatures'
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
Assert-Match $comparatorSource "Compare-StringMaps 'slide lifecycle and package semantics'" 'main comparator integration'
Assert-Match $comparatorSource "Compare-StringMaps 'layout carrier bindings and semantics'" 'layout/master binding integration'

$utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) "pptx-slide-lifecycle-comparator-$([Guid]::NewGuid().ToString('N'))"
[System.IO.Directory]::CreateDirectory($fixtureRoot) | Out-Null

function Write-TextFile {
    param([string]$Path, [string]$Content)
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($Path)) | Out-Null
    [System.IO.File]::WriteAllText($Path, $Content.TrimStart(), $utf8NoBom)
}

function New-SlideXml {
    param(
        [string]$RootAttributes,
        [ValidateSet('fade','push','none')][string]$TransitionEffect,
        [string]$TransitionAttributes,
        [string]$FadeAttributes
    )
    $effect = switch ($TransitionEffect) {
        'fade' { "<p:fade$FadeAttributes/>" }
        'push' { '<p:push dir="l"/>' }
        default { '' }
    }
    $transition = if ($effect) { "<p:transition$TransitionAttributes>$effect</p:transition>" } else { '' }
    return @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"$RootAttributes>
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
  $transition
</p:sld>
"@
}

function New-NotesXml {
    param([string]$Text, [string]$Language)
    $run = if ($Text) { "<a:r><a:rPr lang=`"$Language`"/><a:t>$Text</a:t></a:r>" } else { '' }
    return @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
         xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
         xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    <p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes Placeholder 1"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p>$run<a:endParaRPr lang="$Language"/></a:p></p:txBody></p:sp>
  </p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:notes>
"@
}

function New-ExtractedFixture {
    param(
        [string]$Name,
        [switch]$RenumberRelationships,
        [ValidateSet('normal','reverse')][string]$PresentationOrder = 'normal',
        [string]$Slide1Id = '256',
        [switch]$DuplicateSlideId,
        [switch]$OmitSecondPresentationRelationship,
        [switch]$UnlistedThirdSlide,
        [string]$Slide1RootAttributes = '',
        [ValidateSet('fade','push','none')][string]$TransitionEffect = 'fade',
        [string]$TransitionAttributes = '',
        [string]$FadeAttributes = '',
        [string]$Slide1LayoutTarget = '../slideLayouts/slideLayout1.xml',
        [string]$NoteText = 'Speaker note',
        [string]$NotesLanguage = 'en-US',
        [switch]$OmitNotes,
        [string]$NotesBackTarget = '../slides/slide1.xml',
        [int]$NotesNumber = 1,
        [switch]$InvalidNotesContentType
    )
    $root = Join-Path $fixtureRoot $Name
    [System.IO.Directory]::CreateDirectory($root) | Out-Null
    $ids = if ($RenumberRelationships) {
        @{ slide1='renSlideOne'; slide2='renSlideTwo'; layout='renLayout'; notes='renNotes'; notesBack='renBack'; notesMaster='renMaster' }
    } else {
        @{ slide1='rId1'; slide2='rId2'; layout='rId1'; notes='rId2'; notesBack='rId1'; notesMaster='rId2' }
    }
    $slideId2 = if ($DuplicateSlideId) { '256' } else { '257' }
    $firstNode = "<p:sldId id=`"$Slide1Id`" r:id=`"$($ids.slide1)`"/>"
    $secondNode = "<p:sldId id=`"$slideId2`" r:id=`"$($ids.slide2)`"/>"
    $slideList = if ($PresentationOrder -eq 'reverse') { "$secondNode$firstNode" } else { "$firstNode$secondNode" }
    Write-TextFile (Join-Path $root 'ppt\presentation.xml') @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>$slideList</p:sldIdLst></p:presentation>
"@
    $secondRelationship = if ($OmitSecondPresentationRelationship) { '' } else { "<Relationship Id=`"$($ids.slide2)`" Type=`"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide`" Target=`"slides/slide2.xml`"/>" }
    Write-TextFile (Join-Path $root 'ppt\_rels\presentation.xml.rels') @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="$($ids.slide1)" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>$secondRelationship</Relationships>
"@

    Write-TextFile (Join-Path $root 'ppt\slides\slide1.xml') (New-SlideXml $Slide1RootAttributes $TransitionEffect $TransitionAttributes $FadeAttributes)
    Write-TextFile (Join-Path $root 'ppt\slides\slide2.xml') (New-SlideXml '' 'none' '' '')
    if ($UnlistedThirdSlide) { Write-TextFile (Join-Path $root 'ppt\slides\slide3.xml') (New-SlideXml '' 'none' '' '') }
    $notesRelationship = if ($OmitNotes) { '' } else { "<Relationship Id=`"$($ids.notes)`" Type=`"http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide`" Target=`"../notesSlides/notesSlide$NotesNumber.xml`"/>" }
    Write-TextFile (Join-Path $root 'ppt\slides\_rels\slide1.xml.rels') @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="$($ids.layout)" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="$Slide1LayoutTarget"/>$notesRelationship</Relationships>
"@
    Write-TextFile (Join-Path $root 'ppt\slides\_rels\slide2.xml.rels') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>
'@
    if ($UnlistedThirdSlide) {
        Write-TextFile (Join-Path $root 'ppt\slides\_rels\slide3.xml.rels') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>
'@
    }
    Write-TextFile (Join-Path $root 'ppt\slideLayouts\slideLayout1.xml') '<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld/></p:sldLayout>'
    Write-TextFile (Join-Path $root 'ppt\slideLayouts\slideLayout2.xml') '<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld/></p:sldLayout>'
    if (-not $OmitNotes) {
        Write-TextFile (Join-Path $root "ppt\notesSlides\notesSlide$NotesNumber.xml") (New-NotesXml $NoteText $NotesLanguage)
        Write-TextFile (Join-Path $root "ppt\notesSlides\_rels\notesSlide$NotesNumber.xml.rels") @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="$($ids.notesBack)" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="$NotesBackTarget"/><Relationship Id="$($ids.notesMaster)" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"/></Relationships>
"@
        Write-TextFile (Join-Path $root 'ppt\notesMasters\notesMaster1.xml') '<p:notesMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld/></p:notesMaster>'
    }

    $notesOverride = if ($OmitNotes) { '' } else {
        $notesType = if ($InvalidNotesContentType) { 'application/xml' } else { 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml' }
        "<Override PartName=`"/ppt/notesSlides/notesSlide$NotesNumber.xml`" ContentType=`"$notesType`"/><Override PartName=`"/ppt/notesMasters/notesMaster1.xml`" ContentType=`"application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml`"/>"
    }
    $slide3Override = if ($UnlistedThirdSlide) { '<Override PartName="/ppt/slides/slide3.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>' } else { '' }
    Write-TextFile (Join-Path $root '[Content_Types].xml') @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>$slide3Override<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slideLayouts/slideLayout2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>$notesOverride</Types>
"@
    return $root
}

try {
    $baseline = New-ExtractedFixture 'baseline'
    $equivalent = New-ExtractedFixture 'equivalent' -RenumberRelationships -Slide1RootAttributes ' show="true" showMasterSp="1" showMasterPhAnim="true"' -TransitionAttributes ' advClick="true"' -NotesNumber 9 -NotesLanguage 'fr-FR'
    $baselineMap = Get-SlideLifecycleSignatures $baseline
    $baselineText = Convert-SignatureMapToText $baselineMap
    Assert-Equal (Convert-SignatureMapToText (Get-SlideLifecycleSignatures $equivalent)) $baselineText 'relationship ID, boolean lexical, transition default, and notes-part naming normalization'
    Assert-Match $baselineMap['presentation|slideOrder'] '^count=2\|id=256\|target=.*slide1.xml.*id=257\|target=.*slide2.xml' 'presentation slide order and persistent IDs'
    Assert-Match $baselineMap['presentation|slideIdIntegrity'] 'duplicateCount=0\|domainInvalidCount=0\|valid=1' 'presentation slide ID integrity'
    Assert-Match $baselineMap['slide|ppt/slides/slide1.xml|flags'] '^show=1\|showMasterSp=1\|showMasterPhAnim=1$' 'slide visibility defaults'
    Assert-Match $baselineMap['slide|ppt/slides/slide1.xml|transition'] '<p:transition\|advClick=1\|<p:fade\|\|' 'normalized native transition payload'
    Assert-Match $baselineMap['slide|ppt/slides/slide1.xml|speakerNotes'] 'utf8=U3BlYWtlciBub3Rl' 'speaker notes text payload'

    $absentNotes = New-ExtractedFixture 'absent-notes' -OmitNotes
    $emptyNotes = New-ExtractedFixture 'empty-notes' -NoteText ''
    Assert-Equal (Convert-SignatureMapToText (Get-SlideLifecycleSignatures $emptyNotes)) (Convert-SignatureMapToText (Get-SlideLifecycleSignatures $absentNotes)) 'absent and valid empty notes carrier normalization'

    $mutations = @(
        [PSCustomObject]@{ Name='slide-order'; Root=(New-ExtractedFixture 'mutation-slide-order' -PresentationOrder reverse); Key='presentation|slideOrder' },
        [PSCustomObject]@{ Name='persistent-slide-id'; Root=(New-ExtractedFixture 'mutation-slide-id' -Slide1Id '300'); Key='presentation|slideOrder' },
        [PSCustomObject]@{ Name='duplicate-slide-id'; Root=(New-ExtractedFixture 'mutation-duplicate-id' -DuplicateSlideId); Key='presentation|slideIdIntegrity' },
        [PSCustomObject]@{ Name='missing-presentation-slide-relationship'; Root=(New-ExtractedFixture 'mutation-missing-slide-rel' -OmitSecondPresentationRelationship); Key='presentation|slideRelationships' },
        [PSCustomObject]@{ Name='unlisted-slide-part'; Root=(New-ExtractedFixture 'mutation-unlisted-slide' -UnlistedThirdSlide); Key='slide|ppt/slides/slide3.xml|contentType' },
        [PSCustomObject]@{ Name='hidden-slide'; Root=(New-ExtractedFixture 'mutation-hidden' -Slide1RootAttributes ' show="false"'); Key='slide|ppt/slides/slide1.xml|flags' },
        [PSCustomObject]@{ Name='hide-master-shapes'; Root=(New-ExtractedFixture 'mutation-master-shapes' -Slide1RootAttributes ' showMasterSp="0"'); Key='slide|ppt/slides/slide1.xml|flags' },
        [PSCustomObject]@{ Name='hide-master-placeholder-animation'; Root=(New-ExtractedFixture 'mutation-master-animation' -Slide1RootAttributes ' showMasterPhAnim="false"'); Key='slide|ppt/slides/slide1.xml|flags' },
        [PSCustomObject]@{ Name='layout-binding'; Root=(New-ExtractedFixture 'mutation-layout-binding' -Slide1LayoutTarget '../slideLayouts/slideLayout2.xml'); Key='slide|ppt/slides/slide1.xml|layout' },
        [PSCustomObject]@{ Name='transition-effect'; Root=(New-ExtractedFixture 'mutation-transition-effect' -TransitionEffect push); Key='slide|ppt/slides/slide1.xml|transition' },
        [PSCustomObject]@{ Name='transition-click-policy'; Root=(New-ExtractedFixture 'mutation-transition-click' -TransitionAttributes ' advClick="false"'); Key='slide|ppt/slides/slide1.xml|transition' },
        [PSCustomObject]@{ Name='transition-speed'; Root=(New-ExtractedFixture 'mutation-transition-speed' -TransitionAttributes ' spd="slow"'); Key='slide|ppt/slides/slide1.xml|transition' },
        [PSCustomObject]@{ Name='transition-through-black'; Root=(New-ExtractedFixture 'mutation-transition-through-black' -FadeAttributes ' thruBlk="true"'); Key='slide|ppt/slides/slide1.xml|transition' },
        [PSCustomObject]@{ Name='speaker-notes'; Root=(New-ExtractedFixture 'mutation-notes' -NoteText 'Changed speaker note'); Key='slide|ppt/slides/slide1.xml|speakerNotes' },
        [PSCustomObject]@{ Name='missing-speaker-notes'; Root=(New-ExtractedFixture 'mutation-missing-notes' -OmitNotes); Key='slide|ppt/slides/slide1.xml|speakerNotes' },
        [PSCustomObject]@{ Name='wrong-notes-backlink'; Root=(New-ExtractedFixture 'mutation-notes-backlink' -NotesBackTarget '../slides/slide2.xml'); Key='slide|ppt/slides/slide1.xml|speakerNotes' },
        [PSCustomObject]@{ Name='wrong-notes-content-type'; Root=(New-ExtractedFixture 'mutation-notes-content-type' -InvalidNotesContentType); Key='slide|ppt/slides/slide1.xml|speakerNotes' }
    )
    foreach ($mutation in $mutations) {
        $mutationMap = Get-SlideLifecycleSignatures $mutation.Root
        $mutationText = Convert-SignatureMapToText $mutationMap
        Assert-NotEqual $mutationText $baselineText $mutation.Name
        if ($baselineMap.ContainsKey($mutation.Key)) {
            Assert-NotEqual ([string]$mutationMap[$mutation.Key]) ([string]$baselineMap[$mutation.Key]) "$($mutation.Name) focused signature"
        } else {
            Assert-Match $mutationText ([regex]::Escape($mutation.Key)) "$($mutation.Name) added signature key"
        }
    }

    Write-Host '[PASS] Production comparator normalizes equivalent slide defaults and detects slide list/order, binding, hidden/master flags, native transition, and speaker-notes package mutations.' -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}
