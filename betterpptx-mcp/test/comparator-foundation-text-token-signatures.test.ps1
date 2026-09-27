$ErrorActionPreference = 'Stop'

function Assert-Equal {
    param([string]$Actual, [string]$Expected, [string]$Label)
    if ($Actual -ne $Expected) { throw "$Label mismatch. Expected '$Expected', got '$Actual'." }
}

function Assert-NotEqual {
    param([string]$Actual, [string]$Expected, [string]$Label)
    if ($Actual -eq $Expected) { throw "$Label unexpectedly matched. Value: '$Actual'." }
}

function Assert-Match {
    param([string]$Actual, [string]$Pattern, [string]$Label)
    if ($Actual -notmatch $Pattern) { throw "$Label did not match '$Pattern'. Actual: '$Actual'." }
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
    'Get-ResolvedHyperlinkTargetSignature',
    'Get-ExactUnicodeTextSignature',
    'Get-TextRunHyperlinkSignature',
    'Get-TextContentTokenSignatures',
    'Normalize-XmlFragment',
    'Test-NormalizedXmlEqual'
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

function New-NamespaceManager {
    param([xml]$Xml)
    $ns = New-Object System.Xml.XmlNamespaceManager($Xml.NameTable)
    $ns.AddNamespace('p', 'http://schemas.openxmlformats.org/presentationml/2006/main')
    $ns.AddNamespace('a', 'http://schemas.openxmlformats.org/drawingml/2006/main')
    $ns.AddNamespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    Write-Output -NoEnumerate $ns
}

function Get-FixtureState {
    param([xml]$Xml, [string]$Root)
    $ns = New-NamespaceManager $Xml
    $shape = Safe-SelectSingleNode $Xml '//p:sp[p:txBody]' $ns
    $relsPath = Join-Path $Root 'ppt\slides\_rels\slide1.xml.rels'
    $rels = Get-RelMapForPart $Root $relsPath
    return [PSCustomObject]@{
        Xml = $Xml
        Ns = $ns
        Shape = $shape
        Rels = $rels
        Tokens = @(Get-TextContentTokenSignatures $shape $ns $Root 'ppt/slides/slide1.xml' $rels)
        BodyPr = Safe-SelectSingleNode $shape './p:txBody/a:bodyPr' $ns
        PPr = Safe-SelectSingleNode $shape './p:txBody/a:p[1]/a:pPr' $ns
        RPr = Safe-SelectSingleNode $shape './p:txBody/a:p[1]/a:r[1]/a:rPr' $ns
    }
}

function Copy-FixtureXml {
    param([string]$Text)
    [xml]$copy = $Text
    return $copy
}

function Assert-TokenMutation {
    param([string[]]$Baseline, [string[]]$Mutated, [string]$Label)
    Assert-NotEqual ($Mutated -join "`n") ($Baseline -join "`n") $Label
}

$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) "pptx-foundation-text-token-$([Guid]::NewGuid().ToString('N'))"
$refRoot = Join-Path $fixtureRoot 'reference'
$genRoot = Join-Path $fixtureRoot 'generated'
$targetMutationRoot = Join-Path $fixtureRoot 'target-mutation'
try {
    foreach ($root in @($refRoot, $genRoot, $targetMutationRoot)) {
        New-Item -ItemType Directory -Force (Join-Path $root 'ppt\slides\_rels') | Out-Null
    }

    $refRelationships = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.test/foundation" TargetMode="External"/>
</Relationships>
'@
    $genRelationships = $refRelationships.Replace('rId9', 'rId42')
    $targetMutationRelationships = $refRelationships.Replace('https://example.test/foundation', 'https://example.test/changed')
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Join-Path $refRoot 'ppt\slides\_rels\slide1.xml.rels'), $refRelationships, $utf8WithoutBom)
    [System.IO.File]::WriteAllText((Join-Path $genRoot 'ppt\slides\_rels\slide1.xml.rels'), $genRelationships, $utf8WithoutBom)
    [System.IO.File]::WriteAllText((Join-Path $targetMutationRoot 'ppt\slides\_rels\slide1.xml.rels'), $targetMutationRelationships, $utf8WithoutBom)

    $referenceXmlText = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld><p:spTree><p:sp>
    <p:nvSpPr><p:cNvPr id="2" name="Foundation text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
    <p:spPr/>
    <p:txBody>
      <a:bodyPr vert="eaVert"><a:normAutofit/></a:bodyPr><a:lstStyle/>
      <a:p>
        <a:pPr rtl="1"><a:buChar char="&#x2713;"/></a:pPr>
        <a:r><a:rPr lang="en-US" baseline="30000"><a:hlinkClick r:id="rId9" action="ppaction://hlinkshowjump" tooltip="Open foundation proof"/></a:rPr><a:t>Alpha&#xA0;Beta</a:t></a:r>
        <a:br/>
        <a:fld id="{11111111-2222-3333-4444-555555555555}" type="datetime1"><a:rPr lang="en-US"/><a:t>2026-08-28</a:t></a:fld>
        <a:endParaRPr lang="en-US"/>
      </a:p>
      <a:p><a:r><a:rPr lang="ar-SA"/><a:t>مرحبا &#x1F30D;</a:t></a:r></a:p>
    </p:txBody>
  </p:sp></p:spTree></p:cSld>
</p:sld>
'@
    $generatedXmlText = $referenceXmlText.Replace('rId9', 'rId42')

    $reference = Get-FixtureState (Copy-FixtureXml $referenceXmlText) $refRoot
    $generated = Get-FixtureState (Copy-FixtureXml $generatedXmlText) $genRoot
    $baselineTokens = @($reference.Tokens)

    if (-not $reference.Shape) { throw 'Reference text shape was not selected.' }
    Assert-Equal ([string](@(Safe-SelectNodes $reference.Shape './p:txBody/a:p' $reference.Ns).Count)) '2' 'reference paragraph selection'
    Assert-Equal ([string]$baselineTokens.Count) '4' 'ordered text token count'
    Assert-Equal ($generated.Tokens -join "`n") ($baselineTokens -join "`n") 'relationship-ID-independent ordered token signature'
    Assert-Equal ([string](Test-NormalizedXmlEqual $reference.RPr $generated.RPr)) 'True' 'relationship-ID-independent existing rPr comparison'
    Assert-Match ($baselineTokens -join "`n") 'paragraph=0\|token=0\|kind=r' 'run token ordinal'
    Assert-Match ($baselineTokens -join "`n") 'U\+00A0' 'NBSP code point'
    Assert-Match ($baselineTokens -join "`n") 'paragraph=0\|token=1\|kind=br' 'break token ordinal'
    Assert-Match ($baselineTokens -join "`n") 'paragraph=0\|token=2\|kind=fld' 'field token ordinal'
    Assert-Match ($baselineTokens -join "`n") 'paragraph=1\|token=0\|kind=r' 'second paragraph ordinal'
    Assert-Match ($baselineTokens -join "`n") 'U\+1F30D' 'supplementary Unicode code point'

    $textMutationXml = Copy-FixtureXml $referenceXmlText
    $textMutation = Get-FixtureState $textMutationXml $refRoot
    (Safe-SelectSingleNode $textMutation.Shape './p:txBody/a:p[1]/a:r[1]/a:t' $textMutation.Ns).InnerText = 'AlphaXBeta'
    $textMutation = Get-FixtureState $textMutation.Xml $refRoot
    Assert-TokenMutation $baselineTokens $textMutation.Tokens 'ordinary text mutation'

    $nbspMutationXml = Copy-FixtureXml $referenceXmlText
    $nbspMutation = Get-FixtureState $nbspMutationXml $refRoot
    $nbspText = Safe-SelectSingleNode $nbspMutation.Shape './p:txBody/a:p[1]/a:r[1]/a:t' $nbspMutation.Ns
    $nbspText.InnerText = $nbspText.InnerText.Replace([char]0x00A0, [char]0x0020)
    $nbspMutation = Get-FixtureState $nbspMutation.Xml $refRoot
    Assert-TokenMutation $baselineTokens $nbspMutation.Tokens 'NBSP-to-space mutation'

    $breakMutationXml = Copy-FixtureXml $referenceXmlText
    $breakMutation = Get-FixtureState $breakMutationXml $refRoot
    $run = Safe-SelectSingleNode $breakMutation.Shape './p:txBody/a:p[1]/a:r[1]' $breakMutation.Ns
    $replacementBreak = $breakMutation.Xml.CreateElement('a', 'br', 'http://schemas.openxmlformats.org/drawingml/2006/main')
    [void]$replacementBreak.AppendChild((Safe-SelectSingleNode $run './a:rPr' $breakMutation.Ns).CloneNode($true))
    [void]$run.ParentNode.ReplaceChild($replacementBreak, $run)
    $breakMutation = Get-FixtureState $breakMutation.Xml $refRoot
    Assert-TokenMutation $baselineTokens $breakMutation.Tokens 'run-to-break mutation'

    $runMutationXml = Copy-FixtureXml $referenceXmlText
    $runMutation = Get-FixtureState $runMutationXml $refRoot
    $break = Safe-SelectSingleNode $runMutation.Shape './p:txBody/a:p[1]/a:br' $runMutation.Ns
    $replacementRun = $runMutation.Xml.CreateElement('a', 'r', 'http://schemas.openxmlformats.org/drawingml/2006/main')
    $replacementRunProperties = $runMutation.Xml.CreateElement('a', 'rPr', 'http://schemas.openxmlformats.org/drawingml/2006/main')
    $replacementRunProperties.SetAttribute('lang', 'en-US')
    $replacementText = $runMutation.Xml.CreateElement('a', 't', 'http://schemas.openxmlformats.org/drawingml/2006/main')
    $replacementText.InnerText = ''
    [void]$replacementRun.AppendChild($replacementRunProperties)
    [void]$replacementRun.AppendChild($replacementText)
    [void]$break.ParentNode.ReplaceChild($replacementRun, $break)
    $runMutation = Get-FixtureState $runMutation.Xml $refRoot
    Assert-TokenMutation $baselineTokens $runMutation.Tokens 'break-to-run mutation'

    foreach ($fieldMutation in @(
        @{ Label = 'field id mutation'; Attribute = 'id'; Value = '{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}' },
        @{ Label = 'field type mutation'; Attribute = 'type'; Value = 'slidenum' }
    )) {
        $fieldMutationXml = Copy-FixtureXml $referenceXmlText
        $fieldMutationState = Get-FixtureState $fieldMutationXml $refRoot
        $field = Safe-SelectSingleNode $fieldMutationState.Shape './p:txBody/a:p[1]/a:fld' $fieldMutationState.Ns
        $field.SetAttribute($fieldMutation.Attribute, $fieldMutation.Value)
        $fieldMutationState = Get-FixtureState $fieldMutationState.Xml $refRoot
        Assert-TokenMutation $baselineTokens $fieldMutationState.Tokens $fieldMutation.Label
    }

    $fieldTextMutationXml = Copy-FixtureXml $referenceXmlText
    $fieldTextMutation = Get-FixtureState $fieldTextMutationXml $refRoot
    (Safe-SelectSingleNode $fieldTextMutation.Shape './p:txBody/a:p[1]/a:fld/a:t' $fieldTextMutation.Ns).InnerText = '2027-01-01'
    $fieldTextMutation = Get-FixtureState $fieldTextMutation.Xml $refRoot
    Assert-TokenMutation $baselineTokens $fieldTextMutation.Tokens 'field display-text mutation'

    $targetMutation = Get-FixtureState (Copy-FixtureXml $referenceXmlText) $targetMutationRoot
    Assert-TokenMutation $baselineTokens $targetMutation.Tokens 'resolved hyperlink target mutation'

    foreach ($hyperlinkMutation in @(
        @{ Label = 'hyperlink action mutation'; Attribute = 'action'; Value = 'ppaction://hlinksldjump' },
        @{ Label = 'hyperlink tooltip mutation'; Attribute = 'tooltip'; Value = 'Changed tooltip' }
    )) {
        $hyperlinkMutationXml = Copy-FixtureXml $referenceXmlText
        $hyperlinkMutationState = Get-FixtureState $hyperlinkMutationXml $refRoot
        $hyperlink = Safe-SelectSingleNode $hyperlinkMutationState.Shape './p:txBody/a:p[1]/a:r[1]/a:rPr/a:hlinkClick' $hyperlinkMutationState.Ns
        $hyperlink.SetAttribute($hyperlinkMutation.Attribute, $hyperlinkMutation.Value)
        $hyperlinkMutationState = Get-FixtureState $hyperlinkMutationState.Xml $refRoot
        Assert-TokenMutation $baselineTokens $hyperlinkMutationState.Tokens $hyperlinkMutation.Label
    }

    foreach ($styleMutation in @(
        @{ Label = 'bullet glyph mutation'; XPath = './p:txBody/a:p[1]/a:pPr/a:buChar'; Attribute = 'char'; Value = ([string][char]0x2605); Section = 'PPr' },
        @{ Label = 'paragraph RTL mutation'; XPath = './p:txBody/a:p[1]/a:pPr'; Attribute = 'rtl'; Value = '0'; Section = 'PPr' },
        @{ Label = 'vertical direction mutation'; XPath = './p:txBody/a:bodyPr'; Attribute = 'vert'; Value = 'mongolianVert'; Section = 'BodyPr' },
        @{ Label = 'baseline mutation'; XPath = './p:txBody/a:p[1]/a:r[1]/a:rPr'; Attribute = 'baseline'; Value = '-40000'; Section = 'RPr' }
    )) {
        $styleMutationXml = Copy-FixtureXml $referenceXmlText
        $styleMutationState = Get-FixtureState $styleMutationXml $refRoot
        $node = Safe-SelectSingleNode $styleMutationState.Shape $styleMutation.XPath $styleMutationState.Ns
        $node.SetAttribute($styleMutation.Attribute, $styleMutation.Value)
        $styleMutationState = Get-FixtureState $styleMutationState.Xml $refRoot
        $referenceSection = $reference.PSObject.Properties[$styleMutation.Section].Value
        $mutatedSection = $styleMutationState.PSObject.Properties[$styleMutation.Section].Value
        Assert-Equal ([string](Test-NormalizedXmlEqual $referenceSection $mutatedSection)) 'False' $styleMutation.Label
    }

    $autofitMutationXml = Copy-FixtureXml $referenceXmlText
    $autofitMutation = Get-FixtureState $autofitMutationXml $refRoot
    $normAutofit = Safe-SelectSingleNode $autofitMutation.BodyPr './a:normAutofit' $autofitMutation.Ns
    $spAutoFit = $autofitMutation.Xml.CreateElement('a', 'spAutoFit', 'http://schemas.openxmlformats.org/drawingml/2006/main')
    [void]$normAutofit.ParentNode.ReplaceChild($spAutoFit, $normAutofit)
    $autofitMutation = Get-FixtureState $autofitMutation.Xml $refRoot
    Assert-Equal ([string](Test-NormalizedXmlEqual $reference.BodyPr $autofitMutation.BodyPr)) 'False' 'autofit mutation'

    Write-Host 'Comparator foundation text token signature fixture: PASS' -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}
