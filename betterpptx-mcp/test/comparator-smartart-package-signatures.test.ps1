$ErrorActionPreference = 'Stop'

$comparatorPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..\ULTIMATE_PPTX_XPATH_COMPARATOR_v2h_DECYPHER.ps1')).Path
$tokens = $null
$parseErrors = $null
$source = Get-Content -LiteralPath $comparatorPath -Raw -Encoding UTF8
$ast = [System.Management.Automation.Language.Parser]::ParseInput($source, $comparatorPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw "Comparator parse failed: $($parseErrors -join '; ')" }
$functionNames = @('Normalize-XmlFragment', 'Get-RelativePackagePath', 'Get-PartRelPathFromFullPath', 'Get-PackageContentTypes', 'Get-PackageContentType', 'Get-SmartArtRelatedPartSignature')
$functionAsts = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true))
foreach ($functionName in $functionNames) {
    $definition = $functionAsts | Where-Object Name -eq $functionName | Select-Object -First 1
    if (-not $definition) { throw "Comparator helper '$functionName' was not found." }
    Invoke-Expression $definition.Extent.Text
}

$root = Join-Path ([System.IO.Path]::GetTempPath()) ("betterpptx-smartart-comparator-" + [guid]::NewGuid().ToString('N'))
try {
    $layoutPath = Join-Path $root 'ppt\diagrams\layout1.xml'
    $layoutRelsPath = Join-Path $root 'ppt\diagrams\_rels\layout1.xml.rels'
    New-Item -ItemType Directory -Force -Path (Split-Path $layoutPath), (Split-Path $layoutRelsPath) | Out-Null
    @'
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/diagrams/layout1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml"/></Types>
'@ | Set-Content -LiteralPath (Join-Path $root '[Content_Types].xml') -Encoding UTF8
    @'
<dgm:layoutDef xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" uniqueId="layout-fixed"><dgm:relIds r:dm="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><dgm:layoutNode name="root" modelId="{volatile-id}"><dgm:alg type="lin"/></dgm:layoutNode></dgm:layoutDef>
'@ | Set-Content -LiteralPath $layoutPath -Encoding UTF8
    @'
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData" Target="data1.xml"/></Relationships>
'@ | Set-Content -LiteralPath $layoutRelsPath -Encoding UTF8
    $contentTypes = Get-PackageContentTypes $root
    $baseline = Get-SmartArtRelatedPartSignature $root $layoutPath $contentTypes
    if ($baseline -notlike '*diagramLayout+xml*' -or $baseline -notlike '*alg*') { throw 'SmartArt related-part signature omitted content type or payload.' }

    $idMutation = (Get-Content -LiteralPath $layoutPath -Raw).Replace('{volatile-id}', '{different-id}')
    Set-Content -LiteralPath $layoutPath -Value $idMutation -Encoding UTF8
    $idEquivalent = Get-SmartArtRelatedPartSignature $root $layoutPath $contentTypes
    if ($baseline -ne $idEquivalent) { throw 'Volatile SmartArt model ID changed the canonical signature.' }

    Set-Content -LiteralPath $layoutPath -Value $idMutation.Replace('type="lin"', 'type="cycle"') -Encoding UTF8
    $algorithmMutation = Get-SmartArtRelatedPartSignature $root $layoutPath $contentTypes
    if ($baseline -eq $algorithmMutation) { throw 'SmartArt layout algorithm mutation was not observable.' }

    Set-Content -LiteralPath $layoutPath -Value $idMutation -Encoding UTF8
    Set-Content -LiteralPath $layoutRelsPath -Value ((Get-Content -LiteralPath $layoutRelsPath -Raw).Replace('rId1', 'rId99')) -Encoding UTF8
    $relIdEquivalent = Get-SmartArtRelatedPartSignature $root $layoutPath $contentTypes
    if ($idEquivalent -ne $relIdEquivalent) { throw 'Relationship ID renumbering changed the canonical signature.' }
    Write-Host 'Comparator SmartArt package signature fixture: PASS' -ForegroundColor Green
}
finally {
    if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
