$ErrorActionPreference = 'Stop'

function Assert-Equal {
    param([string]$Actual, [string]$Expected, [string]$Label)
    if ($Actual -ne $Expected) { throw "$Label mismatch. Expected '$Expected', got '$Actual'." }
}

function Assert-ContainsDifference {
    param($Baseline, $Mutated, [string]$Field, [string]$Label)
    $differences = @(Get-SemanticPropertyDifferences $Baseline $Mutated)
    if (-not ($differences.Name -contains $Field)) {
        throw "$Label did not change semantic field '$Field'. Actual fields: $($differences.Name -join ', ')."
    }
}

$comparatorPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..\ULTIMATE_PPTX_XPATH_COMPARATOR_v2h_DECYPHER.ps1')).Path
$tokens = $null
$parseErrors = $null
$source = Get-Content -LiteralPath $comparatorPath -Raw -Encoding UTF8
$ast = [System.Management.Automation.Language.Parser]::ParseInput($source, $comparatorPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw "Comparator parse failed: $($parseErrors -join '; ')" }
$functionNames = @('Safe-SelectNodes', 'Safe-SelectSingleNode', 'Get-LocalXmlSignature', 'Get-ThreeDSemanticProperties', 'Get-WordArtWarpSignature', 'Get-SemanticPropertyDifferences')
$functionAsts = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true))
foreach ($functionName in $functionNames) {
    $definition = $functionAsts | Where-Object Name -eq $functionName | Select-Object -First 1
    if (-not $definition) { throw "Comparator helper '$functionName' was not found." }
    Invoke-Expression $definition.Extent.Text
}

$fixtureText = @'
<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp>
    <p:nvSpPr><p:cNvPr id="2" name="WordArt Text3D"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
    <p:spPr>
      <a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm>
      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      <a:effectLst><a:glow rad="12700"><a:srgbClr val="112233"/></a:glow></a:effectLst>
      <a:scene3d><a:camera prst="perspectiveFront" fov="3600000"><a:rot lat="480000" lon="720000" rev="120000"/></a:camera><a:lightRig rig="threePt" dir="t"><a:rot lat="0" lon="0" rev="2700000"/></a:lightRig></a:scene3d>
      <a:sp3d extrusionH="101600" contourW="12700" prstMaterial="warmMatte"><a:bevelT w="50800" h="38100" prst="circle"/><a:bevelB w="25400" h="25400" prst="angle"/><a:extrusionClr><a:srgbClr val="6D28D9"/></a:extrusionClr><a:contourClr><a:schemeClr val="accent2"><a:tint val="20000"/></a:schemeClr></a:contourClr></a:sp3d>
      <a:extLst><a:ext uri="shape-ext"/></a:extLst>
    </p:spPr>
    <p:txBody>
      <a:bodyPr wrap="square">
        <a:prstTxWarp prst="textArchUp"><a:avLst><a:gd name="adj" fmla="val 50000"/></a:avLst></a:prstTxWarp>
        <a:noAutofit/>
        <a:scene3d><a:camera prst="perspectiveFront" fov="3600000"><a:rot lat="480000" lon="720000" rev="120000"/></a:camera><a:lightRig rig="threePt" dir="t"><a:rot lat="0" lon="0" rev="2700000"/></a:lightRig><a:backdrop anchor="keep"/></a:scene3d>
        <a:sp3d z="42" extrusionH="101600" contourW="12700" prstMaterial="warmMatte"><a:bevelT w="50800" h="38100" prst="circle"/><a:bevelB w="25400" h="25400" prst="angle"/><a:extrusionClr><a:srgbClr val="6D28D9"/></a:extrusionClr><a:contourClr><a:schemeClr val="accent2"><a:tint val="20000"/></a:schemeClr></a:contourClr><a:extLst><a:ext uri="sp3d-ext"/></a:extLst></a:sp3d>
        <a:flatTx z="0"/>
        <a:extLst><a:ext uri="body-ext"/></a:extLst>
      </a:bodyPr>
      <a:lstStyle/><a:p><a:r><a:t>Exact</a:t></a:r></a:p>
    </p:txBody>
  </p:sp></p:spTree></p:cSld>
</p:sld>
'@

function Get-FixtureState {
    param([xml]$Xml)
    $ns = New-Object System.Xml.XmlNamespaceManager($Xml.NameTable)
    $ns.AddNamespace('p', 'http://schemas.openxmlformats.org/presentationml/2006/main')
    $ns.AddNamespace('a', 'http://schemas.openxmlformats.org/drawingml/2006/main')
    $shapeProperties = Safe-SelectSingleNode $Xml '//p:sp/p:spPr' $ns
    $bodyProperties = Safe-SelectSingleNode $Xml '//p:sp/p:txBody/a:bodyPr' $ns
    return [PSCustomObject]@{
        Xml = $Xml
        Ns = $ns
        Shape = Get-ThreeDSemanticProperties $shapeProperties $ns 'shape3D'
        Text = Get-ThreeDSemanticProperties $bodyProperties $ns 'text3D'
        Warp = Get-WordArtWarpSignature $bodyProperties $ns
    }
}

[xml]$baselineXml = $fixtureText
$baseline = Get-FixtureState $baselineXml
Assert-Equal $baseline.Shape['shape3D.scene3d.count'] '1' 'shape scene count'
Assert-Equal $baseline.Shape['shape3D.sp3d.count'] '1' 'shape format count'
Assert-Equal $baseline.Text['text3D.scene3d.count'] '1' 'text scene count'
Assert-Equal $baseline.Text['text3D.sp3d.count'] '1' 'text format count'
Assert-Equal $baseline.Shape['shape3D.directChildOrder'] 'xfrm>prstGeom>effectLst>scene3d>sp3d>extLst' 'shape 3D child order'
Assert-Equal $baseline.Text['text3D.directChildOrder'] 'prstTxWarp>noAutofit>scene3d>sp3d>flatTx>extLst' 'bodyPr child order'
if ($baseline.Warp -notmatch 'count=1\|prstTxWarp.*fmla=val 50000') { throw "WordArt signature omitted its exact guide: $($baseline.Warp)" }

$attributeMutations = @(
    @{ Label='shape camera preset'; Scope='Shape'; Field='shape3D.scene3d'; XPath='//p:sp/p:spPr/a:scene3d/a:camera'; Attr='prst'; Value='orthographicFront' },
    @{ Label='shape extrusion depth'; Scope='Shape'; Field='shape3D.sp3d'; XPath='//p:sp/p:spPr/a:sp3d'; Attr='extrusionH'; Value='114300' },
    @{ Label='text camera fov'; Scope='Text'; Field='text3D.scene3d'; XPath='//a:bodyPr/a:scene3d/a:camera'; Attr='fov'; Value='3540000' },
    @{ Label='text camera latitude'; Scope='Text'; Field='text3D.scene3d'; XPath='//a:bodyPr/a:scene3d/a:camera/a:rot'; Attr='lat'; Value='540000' },
    @{ Label='text light rig direction'; Scope='Text'; Field='text3D.scene3d'; XPath='//a:bodyPr/a:scene3d/a:lightRig'; Attr='dir'; Value='br' },
    @{ Label='text light rotation'; Scope='Text'; Field='text3D.scene3d'; XPath='//a:bodyPr/a:scene3d/a:lightRig/a:rot'; Attr='rev'; Value='2760000' },
    @{ Label='text material'; Scope='Text'; Field='text3D.sp3d'; XPath='//a:bodyPr/a:sp3d'; Attr='prstMaterial'; Value='metal' },
    @{ Label='text top bevel width'; Scope='Text'; Field='text3D.sp3d'; XPath='//a:bodyPr/a:sp3d/a:bevelT'; Attr='w'; Value='63500' },
    @{ Label='text bottom bevel preset'; Scope='Text'; Field='text3D.sp3d'; XPath='//a:bodyPr/a:sp3d/a:bevelB'; Attr='prst'; Value='cross' },
    @{ Label='text contour theme transform'; Scope='Text'; Field='text3D.sp3d'; XPath='//a:bodyPr/a:sp3d/a:contourClr/a:schemeClr/a:tint'; Attr='val'; Value='21000' }
)
foreach ($mutation in $attributeMutations) {
    [xml]$mutatedXml = $fixtureText
    $mutated = Get-FixtureState $mutatedXml
    $node = Safe-SelectSingleNode $mutated.Xml $mutation.XPath $mutated.Ns
    if (-not $node) { throw "$($mutation.Label): mutation node missing." }
    $node.SetAttribute($mutation.Attr, $mutation.Value)
    $mutated = Get-FixtureState $mutated.Xml
    Assert-ContainsDifference $baseline.($mutation.Scope) $mutated.($mutation.Scope) $mutation.Field $mutation.Label
}

[xml]$warpXml = $fixtureText
$warpState = Get-FixtureState $warpXml
(Safe-SelectSingleNode $warpState.Xml '//a:bodyPr/a:prstTxWarp' $warpState.Ns).SetAttribute('prst', 'textWave1')
$warpState = Get-FixtureState $warpState.Xml
if ($warpState.Warp -eq $baseline.Warp) { throw 'WordArt preset mutation escaped the exact warp signature.' }

[xml]$guideXml = $fixtureText
$guideState = Get-FixtureState $guideXml
(Safe-SelectSingleNode $guideState.Xml '//a:bodyPr/a:prstTxWarp/a:avLst/a:gd' $guideState.Ns).SetAttribute('fmla', 'val 75000')
$guideState = Get-FixtureState $guideState.Xml
if ($guideState.Warp -eq $baseline.Warp) { throw 'WordArt guide mutation escaped the exact warp signature.' }

foreach ($scope in @('Shape', 'Text')) {
    [xml]$duplicateXml = $fixtureText
    $duplicate = Get-FixtureState $duplicateXml
    $containerPath = if ($scope -eq 'Shape') { '//p:sp/p:spPr' } else { '//a:bodyPr' }
    $scenePath = "$containerPath/a:scene3d"
    $container = Safe-SelectSingleNode $duplicate.Xml $containerPath $duplicate.Ns
    $scene = Safe-SelectSingleNode $duplicate.Xml $scenePath $duplicate.Ns
    [void]$container.AppendChild($scene.CloneNode($true))
    $duplicate = Get-FixtureState $duplicate.Xml
    $prefix = if ($scope -eq 'Shape') { 'shape3D' } else { 'text3D' }
    Assert-ContainsDifference $baseline.($scope) $duplicate.($scope) "$prefix.scene3d.count" "$scope duplicate scene3d"

    [xml]$orderXml = $fixtureText
    $order = Get-FixtureState $orderXml
    $container = Safe-SelectSingleNode $order.Xml $containerPath $order.Ns
    $scene = Safe-SelectSingleNode $order.Xml "$containerPath/a:scene3d" $order.Ns
    $sp3d = Safe-SelectSingleNode $order.Xml "$containerPath/a:sp3d" $order.Ns
    [void]$container.InsertBefore($sp3d, $scene)
    $order = Get-FixtureState $order.Xml
    Assert-ContainsDifference $baseline.($scope) $order.($scope) "$prefix.directChildOrder" "$scope invalid 3D order"
}

foreach ($requiredText in @('SHAPE 3D semantic payload mismatch', 'Text 3D semantic payload mismatch', 'Get-WordArtWarpSignature')) {
    if ($source -notmatch [regex]::Escape($requiredText)) { throw "Comparator integration is missing '$requiredText'." }
}

Write-Host 'Comparator WordArt/Text3D exact signature fixture: PASS' -ForegroundColor Green
