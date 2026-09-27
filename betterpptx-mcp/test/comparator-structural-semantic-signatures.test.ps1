$ErrorActionPreference = 'Stop'

$comparatorPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..\ULTIMATE_PPTX_XPATH_COMPARATOR_v2h_DECYPHER.ps1')).Path
$tokens = $null
$parseErrors = $null
$source = Get-Content -LiteralPath $comparatorPath -Raw -Encoding UTF8
$ast = [System.Management.Automation.Language.Parser]::ParseInput($source, $comparatorPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw "Comparator parse failed: $($parseErrors -join '; ')" }
$functionNames = @('Safe-SelectSingleNode', 'Safe-SelectNodes', 'Get-LocalXmlSignature')
$functionAsts = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true))
foreach ($functionName in $functionNames) {
    $definition = $functionAsts | Where-Object Name -eq $functionName | Select-Object -First 1
    if (-not $definition) { throw "Comparator helper '$functionName' was not found." }
    Invoke-Expression $definition.Extent.Text
}

$fixture = @'
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:grpSp><p:nvGrpSpPr><p:cNvPr id="7" name="outer"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm rot="60000"><a:off x="100" y="200"/><a:ext cx="3000" cy="4000"/><a:chOff x="10" y="20"/><a:chExt cx="6000" cy="8000"/></a:xfrm></p:grpSpPr>
    <p:grpSp><p:nvGrpSpPr><p:cNvPr id="8" name="inner"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/><a:chOff x="0" y="0"/><a:chExt cx="100" cy="100"/></a:xfrm></p:grpSpPr></p:grpSp>
    <p:sp><p:nvSpPr><p:cNvPr id="9" name="custom"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:custGeom><a:pathLst><a:path w="100" h="100"><a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:lnTo><a:pt x="100" y="100"/></a:lnTo></a:path></a:pathLst></a:custGeom></p:spPr></p:sp>
  </p:grpSp></p:spTree></p:cSld></p:sld>
'@
[xml]$xml = $fixture
$ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
$ns.AddNamespace('p', 'http://schemas.openxmlformats.org/presentationml/2006/main')
$ns.AddNamespace('a', 'http://schemas.openxmlformats.org/drawingml/2006/main')
$group = Safe-SelectSingleNode $xml '//p:grpSp[p:nvGrpSpPr/p:cNvPr[@name="outer"]]' $ns
if (-not $group) { throw 'outer group missing' }
$xfrm = Safe-SelectSingleNode $group './p:grpSpPr/a:xfrm' $ns
$chOff = Safe-SelectSingleNode $xfrm './a:chOff' $ns
$chExt = Safe-SelectSingleNode $xfrm './a:chExt' $ns
if ($chOff.GetAttribute('x') -ne '10' -or $chExt.GetAttribute('cy') -ne '8000') { throw 'group child coordinate signature mismatch' }
if ((@(Safe-SelectNodes $group './p:grpSp | ./p:sp | ./p:cxnSp' $ns)).Count -ne 2) { throw 'group child topology mismatch' }
$custom = Safe-SelectSingleNode $xml '//p:sp[p:nvSpPr/p:cNvPr[@name="custom"]]/p:spPr/a:custGeom' $ns
if (-not $custom -or (Get-LocalXmlSignature $custom).Length -lt 20) { throw 'custom geometry signature missing' }
$mutated = $xml.Clone()
(Safe-SelectSingleNode $mutated '//a:chExt' $ns).SetAttribute('cy', '8001')
$mutatedXfrm = Safe-SelectSingleNode $mutated '//p:grpSp[p:nvGrpSpPr/p:cNvPr[@name="outer"]]/p:grpSpPr/a:xfrm' $ns
if ((Get-LocalXmlSignature $xfrm) -eq (Get-LocalXmlSignature $mutatedXfrm)) { throw 'group transform mutation was not observable' }
Write-Host 'Comparator structural semantic signature fixture: PASS' -ForegroundColor Green
