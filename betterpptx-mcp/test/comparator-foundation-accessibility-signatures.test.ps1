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
    'Get-AccessibilityEncodedValue',
    'Get-AccessibilityAttributeSignature',
    'Get-AccessibilityCarrierDescriptor',
    'Get-AccessibilityGroupChildRecords',
    'Get-SlideAccessibilitySignature',
    'Get-TopLevelRenderOrderSignature',
    'Get-RenderOrderVisualKey'
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
Assert-Match $comparatorSource 'FOUNDATION ACCESSIBILITY SEMANTICS' 'main comparator integration'
Assert-Match $comparatorSource '\$accessibilityIssues \+ \$zOrderIssues' 'accessibility issue accounting'

function New-NamespaceManager {
    param([xml]$Xml)
    $ns = New-Object System.Xml.XmlNamespaceManager($Xml.NameTable)
    $ns.AddNamespace('p', 'http://schemas.openxmlformats.org/presentationml/2006/main')
    $ns.AddNamespace('a', 'http://schemas.openxmlformats.org/drawingml/2006/main')
    Write-Output -NoEnumerate $ns
}

function New-FixtureState {
    param([string]$XmlText)
    [xml]$xml = $XmlText
    $ns = New-NamespaceManager $xml
    return [PSCustomObject]@{
        Xml = $xml
        Ns = $ns
        Signature = Get-SlideAccessibilitySignature $xml $ns
        RenderOrder = @(Get-TopLevelRenderOrderSignature $xml $ns)
    }
}

function Signature-Text {
    param($Value)
    return @($Value) -join "`n"
}

function Assert-SignatureEqual {
    param($Actual, $Expected, [string]$Label)
    foreach ($property in @('Metadata', 'FullOrder', 'ReadableOrder', 'GroupChildOrder', 'MissingIds', 'DuplicateIds')) {
        Assert-Equal (Signature-Text $Actual.$property) (Signature-Text $Expected.$property) "$Label $property"
    }
}

function Assert-SignatureMutation {
    param($Actual, $Expected, [string]$Property, [string]$Label)
    Assert-NotEqual (Signature-Text $Actual.$Property) (Signature-Text $Expected.$Property) $Label
}

$referenceXmlText = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
       xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr/>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Text Box 1" title="Statement title" descr="Primary statement"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
      <p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Statement</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:pic>
      <p:nvPicPr><p:cNvPr id="3" name="Decorative Picture" title="Decorative title" descr="Decorative texture"><a:extLst><a:ext uri="{C183D7F6-B498-43B3-948B-1728B52AA6E4}"><adec:decorative val="1"/></a:ext></a:extLst></p:cNvPr><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
      <p:blipFill/><p:spPr/>
    </p:pic>
    <p:cxnSp><p:nvCxnSpPr><p:cNvPr id="4" name="Connector 1" title="Flow" descr="Connects the statement to the table"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr/></p:cxnSp>
    <p:graphicFrame>
      <p:nvGraphicFramePr><p:cNvPr id="5" name="Table 1" title="Metrics" descr="Quarterly metrics table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
      <p:xfrm/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl/></a:graphicData></a:graphic>
    </p:graphicFrame>
    <p:grpSp>
      <p:nvGrpSpPr><p:cNvPr id="6" name="Group 1" title="Grouped legend" descr="Two-part legend"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
      <p:sp><p:nvSpPr><p:cNvPr id="7" name="Group Label"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/></p:sp>
      <p:pic><p:nvPicPr><p:cNvPr id="8" name="Group Icon"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill/><p:spPr/></p:pic>
    </p:grpSp>
    <mc:AlternateContent>
      <mc:Choice Requires="c16"><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="9" name="Chart 1" title="Trend" descr="Quarterly trend chart"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"/></a:graphic></p:graphicFrame></mc:Choice>
      <mc:Fallback><p:pic><p:nvPicPr><p:cNvPr id="9" name="Chart 1 fallback"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill/><p:spPr/></p:pic></mc:Fallback>
    </mc:AlternateContent>
  </p:spTree></p:cSld>
</p:sld>
'@

$generatedXmlText = $referenceXmlText.Replace('xmlns:adec=', 'xmlns:xdec=').Replace('<adec:', '<xdec:')
foreach ($id in 1..9) {
    $generatedXmlText = $generatedXmlText.Replace("id=`"$id`"", "id=`"$($id + 100)`"")
}

$reference = New-FixtureState $referenceXmlText
$generated = New-FixtureState $generatedXmlText
$baseline = $reference.Signature
Assert-SignatureEqual $generated.Signature $baseline 'ID-renumbered and decorative-prefix-equivalent signature'
Assert-Equal ([string]$baseline.FullOrder.Count) '6' 'logical top-level object count'
Assert-Equal ([string]$baseline.Metadata.Count) '6' 'top-level accessibility metadata count'
Assert-Equal ([string]$baseline.ReadableOrder.Count) '5' 'readable order excludes decorative=true'
Assert-Equal ([string]$baseline.GroupChildOrder.Count) '2' 'group child order count'
Assert-Equal ([string]$baseline.DuplicateIds.Count) '0' 'AlternateContent fallback is not double-counted'
Assert-Equal ([string]$baseline.MissingIds.Count) '0' 'baseline missing-ID diagnostics'

$refRenderKeys = @($reference.RenderOrder | ForEach-Object { Get-RenderOrderVisualKey $_ })
$genRenderKeys = @($generated.RenderOrder | ForEach-Object { Get-RenderOrderVisualKey $_ })
Assert-Equal (Signature-Text $genRenderKeys) (Signature-Text $refRenderKeys) 'ID-independent existing render-order key'

$titleMutation = New-FixtureState $referenceXmlText
(Safe-SelectSingleNode $titleMutation.Xml "//p:cNvPr[@name='Text Box 1']" $titleMutation.Ns).SetAttribute('title', 'Changed statement title')
$titleMutation.Signature = Get-SlideAccessibilitySignature $titleMutation.Xml $titleMutation.Ns
Assert-SignatureMutation $titleMutation.Signature $baseline 'Metadata' 'title mutation'

$descriptionMutation = New-FixtureState $referenceXmlText
(Safe-SelectSingleNode $descriptionMutation.Xml "//p:cNvPr[@name='Connector 1']" $descriptionMutation.Ns).SetAttribute('descr', 'Changed connector description')
$descriptionMutation.Signature = Get-SlideAccessibilitySignature $descriptionMutation.Xml $descriptionMutation.Ns
Assert-SignatureMutation $descriptionMutation.Signature $baseline 'Metadata' 'description mutation'

$decorativeMutation = New-FixtureState $referenceXmlText
$decorativeNode = $decorativeMutation.Xml.SelectSingleNode("//*[local-name()='decorative' and namespace-uri()='http://schemas.microsoft.com/office/drawing/2017/decorative']")
$decorativeNode.SetAttribute('val', '0')
$decorativeMutation.Signature = Get-SlideAccessibilitySignature $decorativeMutation.Xml $decorativeMutation.Ns
Assert-SignatureMutation $decorativeMutation.Signature $baseline 'Metadata' 'decorative value mutation'
Assert-SignatureMutation $decorativeMutation.Signature $baseline 'ReadableOrder' 'decorative readable-order mutation'

$deletionMutation = New-FixtureState $referenceXmlText
$deletedConnector = Safe-SelectSingleNode $deletionMutation.Xml '//p:cxnSp' $deletionMutation.Ns
[void]$deletedConnector.ParentNode.RemoveChild($deletedConnector)
$deletionMutation.Signature = Get-SlideAccessibilitySignature $deletionMutation.Xml $deletionMutation.Ns
Assert-SignatureMutation $deletionMutation.Signature $baseline 'FullOrder' 'object deletion mutation'

$orderMutation = New-FixtureState $referenceXmlText
$orderTree = Safe-SelectSingleNode $orderMutation.Xml '//p:spTree' $orderMutation.Ns
$movedTable = Safe-SelectSingleNode $orderMutation.Xml '//p:graphicFrame' $orderMutation.Ns
$firstText = Safe-SelectSingleNode $orderMutation.Xml '//p:sp[1]' $orderMutation.Ns
[void]$orderTree.InsertBefore($movedTable, $firstText)
$orderMutation.Signature = Get-SlideAccessibilitySignature $orderMutation.Xml $orderMutation.Ns
Assert-SignatureMutation $orderMutation.Signature $baseline 'FullOrder' 'top-level reorder mutation'

$groupOrderMutation = New-FixtureState $referenceXmlText
$group = Safe-SelectSingleNode $groupOrderMutation.Xml "//p:grpSp[p:nvGrpSpPr/p:cNvPr[@name='Group 1']]" $groupOrderMutation.Ns
$groupFirstChild = Safe-SelectSingleNode $group './p:sp' $groupOrderMutation.Ns
[void]$group.AppendChild($groupFirstChild)
$groupOrderMutation.Signature = Get-SlideAccessibilitySignature $groupOrderMutation.Xml $groupOrderMutation.Ns
Assert-SignatureMutation $groupOrderMutation.Signature $baseline 'GroupChildOrder' 'group child reorder mutation'

$missingIdMutation = New-FixtureState $referenceXmlText
(Safe-SelectSingleNode $missingIdMutation.Xml "//p:cNvPr[@name='Connector 1']" $missingIdMutation.Ns).RemoveAttribute('id')
$missingIdMutation.Signature = Get-SlideAccessibilitySignature $missingIdMutation.Xml $missingIdMutation.Ns
Assert-Equal ([string]$missingIdMutation.Signature.MissingIds.Count) '1' 'missing-ID diagnostic'
Assert-Equal (Signature-Text $missingIdMutation.Signature.FullOrder) (Signature-Text $baseline.FullOrder) 'missing ID excluded from semantic identity'

$duplicateIdMutation = New-FixtureState $referenceXmlText
(Safe-SelectSingleNode $duplicateIdMutation.Xml "//p:cNvPr[@name='Connector 1']" $duplicateIdMutation.Ns).SetAttribute('id', '2')
$duplicateIdMutation.Signature = Get-SlideAccessibilitySignature $duplicateIdMutation.Xml $duplicateIdMutation.Ns
Assert-Equal ([string]$duplicateIdMutation.Signature.DuplicateIds.Count) '1' 'duplicate-ID diagnostic'
Assert-Equal (Signature-Text $duplicateIdMutation.Signature.FullOrder) (Signature-Text $baseline.FullOrder) 'duplicate ID excluded from semantic identity'

Write-Host 'Comparator foundation accessibility signature fixture: PASS' -ForegroundColor Green
