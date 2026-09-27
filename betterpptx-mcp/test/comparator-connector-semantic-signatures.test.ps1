$ErrorActionPreference = 'Stop'

function Assert-Equal {
    param([string]$Actual, [string]$Expected, [string]$Label)
    if ($Actual -ne $Expected) { throw "$Label mismatch. Expected '$Expected', got '$Actual'." }
}

function Assert-Match {
    param([string]$Actual, [string]$Pattern, [string]$Label)
    if ($Actual -notmatch $Pattern) { throw "$Label did not match '$Pattern'. Actual: '$Actual'." }
}

$comparatorPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..\ULTIMATE_PPTX_XPATH_COMPARATOR_v2h_DECYPHER.ps1')).Path
$tokens = $null
$parseErrors = $null
$source = Get-Content -LiteralPath $comparatorPath -Raw -Encoding UTF8
$ast = [System.Management.Automation.Language.Parser]::ParseInput($source, $comparatorPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw "Comparator parse failed: $($parseErrors -join '; ')" }
$functionNames = @(
    'Safe-SelectNodes',
    'Safe-SelectSingleNode',
    'Get-LocalXmlSignature',
    'Get-NodeAttributeOrDefault',
    'Get-ConnectorArrowSignature',
    'Get-ConnectorLineProperties',
    'Get-ConnectorGeometryProperties',
    'Get-ConnectorConnectionProperties',
    'Get-ConnectorThemeStyleProperties',
    'Get-SemanticPropertyDifferences'
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

$connectorXmlText = @'
<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:cxnSp>
    <p:nvCxnSpPr>
      <p:cNvPr id="7" name="Theme Connector 6"/>
      <p:cNvCxnSpPr>
        <a:stCxn id="2" idx="1"/>
        <a:endCxn id="3" idx="3"/>
      </p:cNvCxnSpPr>
      <p:nvPr/>
    </p:nvCxnSpPr>
    <p:spPr>
      <a:xfrm flipH="1"><a:off x="1000" y="2000"/><a:ext cx="3000" cy="4000"/></a:xfrm>
      <a:prstGeom prst="bentConnector3"><a:avLst><a:gd name="adj1" fmla="val 50000"/></a:avLst></a:prstGeom>
      <a:ln w="38100" cap="rnd" cmpd="dbl" algn="ctr">
        <a:solidFill><a:schemeClr val="accent2"><a:lumMod val="85000"/><a:lumOff val="15000"/><a:alpha val="72000"/></a:schemeClr></a:solidFill>
        <a:prstDash val="dashDot"/>
        <a:miter lim="400000"/>
        <a:headEnd type="oval" w="sm" len="lg"/>
        <a:tailEnd type="triangle" w="lg" len="sm"/>
      </a:ln>
    </p:spPr>
    <p:style>
      <a:lnRef idx="2"><a:schemeClr val="accent1"><a:tint val="20000"/><a:alpha val="80000"/></a:schemeClr></a:lnRef>
      <a:fillRef idx="0"><a:schemeClr val="accent1"/></a:fillRef>
      <a:effectRef idx="1"><a:schemeClr val="accent1"/></a:effectRef>
      <a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef>
    </p:style>
  </p:cxnSp></p:spTree></p:cSld>
</p:sld>
'@

function Get-FixtureState {
    param([xml]$Xml)
    $ns = New-Object System.Xml.XmlNamespaceManager($Xml.NameTable)
    $ns.AddNamespace('p', 'http://schemas.openxmlformats.org/presentationml/2006/main')
    $ns.AddNamespace('a', 'http://schemas.openxmlformats.org/drawingml/2006/main')
    $connector = Safe-SelectSingleNode $Xml '//p:cxnSp' $ns
    return [PSCustomObject]@{
        Xml = $Xml
        Ns = $ns
        Connector = $connector
        Connection = Get-ConnectorConnectionProperties $connector $ns
        Geometry = Get-ConnectorGeometryProperties $connector $ns
        Line = Get-ConnectorLineProperties $connector $ns
        Style = Get-ConnectorThemeStyleProperties $connector $ns
    }
}

[xml]$connectorXml = $connectorXmlText
$baseline = Get-FixtureState $connectorXml
Assert-Equal $baseline.Connection['connection.start.id'] '2' 'start connection id'
Assert-Equal $baseline.Connection['connection.start.idx'] '1' 'start connection index'
Assert-Equal $baseline.Connection['connection.end.id'] '3' 'end connection id'
Assert-Equal $baseline.Connection['connection.end.idx'] '3' 'end connection index'
Assert-Equal $baseline.Geometry['geometry.type'] 'preset:bentConnector3' 'connector geometry type'
Assert-Equal $baseline.Geometry['geometry.bboxStart'] '4000,2000' 'derived connector start point'
Assert-Equal $baseline.Geometry['geometry.bboxEnd'] '1000,6000' 'derived connector end point'
Assert-Match $baseline.Geometry['geometry.guides'] 'gd\[fmla=val 50000,name=adj1\]' 'connector adjustment guide'
Assert-Equal $baseline.Line['line.width'] '38100' 'line width'
Assert-Equal $baseline.Line['line.cap'] 'rnd' 'line cap'
Assert-Equal $baseline.Line['line.compound'] 'dbl' 'line compound'
Assert-Equal $baseline.Line['line.dash'] 'preset:dashDot' 'line dash'
Assert-Match $baseline.Line['line.fill'] 'schemeClr\[val=accent2\].*lumMod\[val=85000\].*lumOff\[val=15000\].*alpha\[val=72000\]' 'line theme color/transparency transforms'
Assert-Equal $baseline.Line['line.join'] 'miter[lim=400000]{}' 'line join'
Assert-Equal $baseline.Line['line.beginArrow'] 'type=oval,w=sm,len=lg' 'begin arrow'
Assert-Equal $baseline.Line['line.endArrow'] 'type=triangle,w=lg,len=sm' 'end arrow'
Assert-Match $baseline.Style['style.lnRef'] '^idx=2;color=schemeClr\[val=accent1\].*tint\[val=20000\].*alpha\[val=80000\]' 'line theme style'
Assert-Match $baseline.Style['style.fontRef'] '^idx=minor;color=schemeClr\[val=tx1\]' 'font theme style'

$mutations = @(
    @{ Label='start connection index'; Section='Connection'; Field='connection.start.idx'; XPath='//a:stCxn'; Attr='idx'; Value='2' },
    @{ Label='geometry position'; Section='Geometry'; Field='geometry.off.x'; XPath='//a:xfrm/a:off'; Attr='x'; Value='1001' },
    @{ Label='connector type'; Section='Geometry'; Field='geometry.type'; XPath='//a:prstGeom'; Attr='prst'; Value='curvedConnector3' },
    @{ Label='line width'; Section='Line'; Field='line.width'; XPath='//a:ln'; Attr='w'; Value='40000' },
    @{ Label='line cap'; Section='Line'; Field='line.cap'; XPath='//a:ln'; Attr='cap'; Value='sq' },
    @{ Label='line compound'; Section='Line'; Field='line.compound'; XPath='//a:ln'; Attr='cmpd'; Value='tri' },
    @{ Label='theme color transform'; Section='Line'; Field='line.fill'; XPath='//a:ln/a:solidFill/a:schemeClr/a:lumMod'; Attr='val'; Value='84000' },
    @{ Label='line transparency'; Section='Line'; Field='line.fill'; XPath='//a:ln/a:solidFill/a:schemeClr/a:alpha'; Attr='val'; Value='71000' },
    @{ Label='line dash'; Section='Line'; Field='line.dash'; XPath='//a:ln/a:prstDash'; Attr='val'; Value='lgDash' },
    @{ Label='line join'; Section='Line'; Field='line.join'; XPath='//a:ln/a:miter'; Attr='lim'; Value='500000' },
    @{ Label='begin arrow type'; Section='Line'; Field='line.beginArrow'; XPath='//a:headEnd'; Attr='type'; Value='diamond' },
    @{ Label='begin arrow width'; Section='Line'; Field='line.beginArrow'; XPath='//a:headEnd'; Attr='w'; Value='lg' },
    @{ Label='end arrow length'; Section='Line'; Field='line.endArrow'; XPath='//a:tailEnd'; Attr='len'; Value='lg' },
    @{ Label='line style id'; Section='Style'; Field='style.lnRef'; XPath='//p:style/a:lnRef'; Attr='idx'; Value='3' },
    @{ Label='line style color transform'; Section='Style'; Field='style.lnRef'; XPath='//p:style/a:lnRef/a:schemeClr/a:tint'; Attr='val'; Value='21000' }
)
foreach ($mutation in $mutations) {
    [xml]$mutatedXml = $connectorXmlText
    $mutated = Get-FixtureState $mutatedXml
    $node = Safe-SelectSingleNode $mutated.Xml $mutation.XPath $mutated.Ns
    if (-not $node) { throw "$($mutation.Label): fixture mutation node missing." }
    $node.SetAttribute($mutation.Attr, $mutation.Value)
    $mutated = Get-FixtureState $mutated.Xml
    $differences = @(Get-SemanticPropertyDifferences $baseline.($mutation.Section) $mutated.($mutation.Section))
    if (-not ($differences.Name -contains $mutation.Field)) {
        throw "$($mutation.Label): expected semantic field '$($mutation.Field)' was not detected."
    }
}

Write-Host 'Comparator connector semantic signature fixture: PASS' -ForegroundColor Green
