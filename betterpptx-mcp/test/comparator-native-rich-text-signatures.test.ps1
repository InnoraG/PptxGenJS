$ErrorActionPreference = 'Stop'

function Assert-Equal([string]$Actual, [string]$Expected, [string]$Label) {
    if ($Actual -ne $Expected) { throw "$Label mismatch.`nEXPECTED:`n$Expected`nACTUAL:`n$Actual" }
}

function Assert-NotEqual([string]$Actual, [string]$Expected, [string]$Label) {
    if ($Actual -eq $Expected) { throw "$Label unexpectedly matched." }
}

function Assert-True([bool]$Condition, [string]$Label) {
    if (-not $Condition) { throw "$Label was not true." }
}

$comparatorPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..\ULTIMATE_PPTX_XPATH_COMPARATOR_v2h_DECYPHER.ps1')).Path
$tokens = $null
$parseErrors = $null
$source = Get-Content -LiteralPath $comparatorPath -Raw -Encoding UTF8
$ast = [System.Management.Automation.Language.Parser]::ParseInput($source, $comparatorPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw "Comparator parse failed: $($parseErrors -join '; ')" }

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
    'Normalize-XmlFragment',
    'Test-NormalizedXmlEqual',
    'Get-TextContentTokenSignatures'
)
$functions = @($ast.FindAll({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst]
}, $true))
foreach ($functionName in $functionNames) {
    $definition = $functions | Where-Object Name -eq $functionName | Select-Object -First 1
    if (-not $definition) { throw "Comparator helper '$functionName' was not found." }
    Invoke-Expression $definition.Extent.Text
}

Assert-True ($source.Contains("Safe-SelectSingleNode `$refTxBody './a:lstStyle'")) 'main comparator lstStyle integration'
Assert-True ($source.Contains('|rPr={$runPropertiesSignature}|hyperlinks=')) 'token-local run-property integration'
Assert-True ($source.Contains("Label='text shape transform'")) 'main comparator text geometry integration'
Assert-True ($source.Contains('text body missing in generated shape')) 'main comparator missing txBody integration'

function New-NamespaceManager([xml]$Xml) {
    $ns = New-Object System.Xml.XmlNamespaceManager($Xml.NameTable)
    $ns.AddNamespace('p', 'http://schemas.openxmlformats.org/presentationml/2006/main')
    $ns.AddNamespace('a', 'http://schemas.openxmlformats.org/drawingml/2006/main')
    $ns.AddNamespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    Write-Output -NoEnumerate $ns
}

function Copy-Xml([string]$Text) {
    [xml]$copy = $Text
    return $copy
}

function Get-State([xml]$Xml, [string]$Root) {
    $ns = New-NamespaceManager $Xml
    $shape = Safe-SelectSingleNode $Xml '//p:sp[p:txBody]' $ns
    $rels = Get-RelMapForPart $Root (Join-Path $Root 'ppt\slides\_rels\slide1.xml.rels')
    return [PSCustomObject]@{
        Xml = $Xml
        Ns = $ns
        Shape = $shape
        Tokens = @(Get-TextContentTokenSignatures $shape $ns $Root 'ppt/slides/slide1.xml' $rels)
        Xfrm = Safe-SelectSingleNode $shape './p:spPr/a:xfrm' $ns
        Geometry = Safe-SelectSingleNode $shape './p:spPr/a:prstGeom | ./p:spPr/a:custGeom' $ns
        ShapeStyle = Safe-SelectSingleNode $shape './p:style' $ns
        BodyPr = Safe-SelectSingleNode $shape './p:txBody/a:bodyPr' $ns
        ListStyle = Safe-SelectSingleNode $shape './p:txBody/a:lstStyle' $ns
        PPr = Safe-SelectSingleNode $shape './p:txBody/a:p[1]/a:pPr' $ns
        EndParaRPr = Safe-SelectSingleNode $shape './p:txBody/a:p[1]/a:endParaRPr' $ns
    }
}

function Get-DetachedRunPropertySignature($State) {
    $nodes = @(Safe-SelectNodes $State.Shape './p:txBody/a:p[1]/a:r/a:rPr | ./p:txBody/a:p[1]/a:fld/a:rPr | ./p:txBody/a:p[1]/a:br/a:rPr' $State.Ns)
    return @($nodes | ForEach-Object { Normalize-XmlFragment $_ }) -join "`n"
}

function Assert-TokenMutation($Baseline, $Mutated, [string]$Label) {
    Assert-NotEqual ($Mutated.Tokens -join "`n") ($Baseline.Tokens -join "`n") $Label
}

$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) "pptx-native-rich-text-$([Guid]::NewGuid().ToString('N'))"
$referenceRoot = Join-Path $fixtureRoot 'reference'
$equivalentRoot = Join-Path $fixtureRoot 'equivalent'
try {
    foreach ($root in @($referenceRoot, $equivalentRoot)) {
        New-Item -ItemType Directory -Force (Join-Path $root 'ppt\slides\_rels') | Out-Null
    }
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    $referenceRels = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.test/text" TargetMode="External"/></Relationships>'
    $equivalentRels = $referenceRels.Replace('rId9', 'rId42')
    [System.IO.File]::WriteAllText((Join-Path $referenceRoot 'ppt\slides\_rels\slide1.xml.rels'), $referenceRels, $utf8)
    [System.IO.File]::WriteAllText((Join-Path $equivalentRoot 'ppt\slides\_rels\slide1.xml.rels'), $equivalentRels, $utf8)

    $referenceText = @'
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld><p:spTree><p:sp>
    <p:nvSpPr><p:cNvPr id="2" name="Native and rich text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
    <p:spPr><a:xfrm><a:off x="100000" y="200000"/><a:ext cx="3000000" cy="800000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
    <p:style><a:lnRef idx="1"><a:schemeClr val="accent1"/></a:lnRef><a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef></p:style>
    <p:txBody>
      <a:bodyPr anchor="ctr" wrap="square"/><a:lstStyle><a:lvl1pPr marL="1000"><a:buChar char="•"/><a:defRPr sz="1600"/></a:lvl1pPr></a:lstStyle>
      <a:p><a:pPr algn="ctr" rtl="0"><a:defRPr b="0" i="0"><a:latin typeface="Aptos"/><a:solidFill><a:srgbClr val="112233"/></a:solidFill></a:defRPr></a:pPr>
        <a:r><a:rPr lang="en-US" sz="1800" b="1"><a:solidFill><a:srgbClr val="AA0000"/></a:solidFill><a:hlinkClick r:id="rId9" tooltip="Text link"/></a:rPr><a:t>Plain</a:t></a:r>
        <a:r><a:t> + rich</a:t></a:r>
        <a:br><a:rPr lang="en-US" i="1"/></a:br>
        <a:fld id="{11111111-2222-3333-4444-555555555555}" type="slidenum"><a:rPr lang="en-US" u="sng"/><a:t>7</a:t></a:fld>
        <a:endParaRPr lang="en-US" sz="1800"/>
      </a:p>
    </p:txBody>
  </p:sp></p:spTree></p:cSld>
</p:sld>
'@
    $equivalentText = $referenceText.Replace('rId9', 'rId42').Replace(' wrap="square"', '').Replace(' rtl="0"', '').Replace(' b="0" i="0"', '')
    $reference = Get-State (Copy-Xml $referenceText) $referenceRoot
    $equivalent = Get-State (Copy-Xml $equivalentText) $equivalentRoot

    Assert-Equal ($equivalent.Tokens -join "`n") ($reference.Tokens -join "`n") 'relationship renumbering and explicit-default normalization'
    foreach ($component in @('Xfrm', 'Geometry', 'ShapeStyle', 'BodyPr', 'ListStyle', 'PPr', 'EndParaRPr')) {
        Assert-Equal ([string](Test-NormalizedXmlEqual $reference.$component $equivalent.$component)) 'True' "equivalent $component"
    }
    Assert-Equal ([string]$reference.Tokens.Count) '4' 'rich token count'

    $styleMoveXml = Copy-Xml $referenceText
    $styleMove = Get-State $styleMoveXml $referenceRoot
    $firstRun = Safe-SelectSingleNode $styleMove.Shape './p:txBody/a:p[1]/a:r[1]' $styleMove.Ns
    $secondRun = Safe-SelectSingleNode $styleMove.Shape './p:txBody/a:p[1]/a:r[2]' $styleMove.Ns
    $movedRPr = (Safe-SelectSingleNode $firstRun './a:rPr' $styleMove.Ns).CloneNode($true)
    [void]$firstRun.RemoveChild((Safe-SelectSingleNode $firstRun './a:rPr' $styleMove.Ns))
    [void]$secondRun.InsertBefore($movedRPr, $secondRun.FirstChild)
    $styleMove = Get-State $styleMove.Xml $referenceRoot
    Assert-Equal (Get-DetachedRunPropertySignature $styleMove) (Get-DetachedRunPropertySignature $reference) 'detached rPr sequence demonstrates former blind spot'
    Assert-TokenMutation $reference $styleMove 'token-local rich-run style relocation'

    foreach ($mutation in @(
        @{ Label = 'ordinary text'; XPath = './p:txBody/a:p[1]/a:r[1]/a:t'; Attribute = ''; Value = 'Changed' },
        @{ Label = 'break rPr'; XPath = './p:txBody/a:p[1]/a:br/a:rPr'; Attribute = 'i'; Value = '0' },
        @{ Label = 'field rPr'; XPath = './p:txBody/a:p[1]/a:fld/a:rPr'; Attribute = 'u'; Value = 'dbl' },
        @{ Label = 'field type'; XPath = './p:txBody/a:p[1]/a:fld'; Attribute = 'type'; Value = 'datetime1' },
        @{ Label = 'field id'; XPath = './p:txBody/a:p[1]/a:fld'; Attribute = 'id'; Value = '{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}' }
    )) {
        $mutationState = Get-State (Copy-Xml $referenceText) $referenceRoot
        $node = Safe-SelectSingleNode $mutationState.Shape $mutation.XPath $mutationState.Ns
        if ($mutation.Attribute) { $node.SetAttribute($mutation.Attribute, $mutation.Value) } else { $node.InnerText = $mutation.Value }
        $mutationState = Get-State $mutationState.Xml $referenceRoot
        Assert-TokenMutation $reference $mutationState $mutation.Label
    }

    foreach ($mutation in @(
        @{ Label = 'text shape transform'; Component = 'Xfrm'; XPath = './p:spPr/a:xfrm/a:ext'; Attribute = 'cx'; Value = '3100000' },
        @{ Label = 'text shape geometry'; Component = 'Geometry'; XPath = './p:spPr/a:prstGeom'; Attribute = 'prst'; Value = 'roundRect' },
        @{ Label = 'text shape style'; Component = 'ShapeStyle'; XPath = './p:style/a:fontRef'; Attribute = 'idx'; Value = 'major' },
        @{ Label = 'bodyPr'; Component = 'BodyPr'; XPath = './p:txBody/a:bodyPr'; Attribute = 'anchor'; Value = 'b' },
        @{ Label = 'lstStyle'; Component = 'ListStyle'; XPath = './p:txBody/a:lstStyle/a:lvl1pPr/a:defRPr'; Attribute = 'sz'; Value = '1700' },
        @{ Label = 'pPr'; Component = 'PPr'; XPath = './p:txBody/a:p[1]/a:pPr'; Attribute = 'algn'; Value = 'r' },
        @{ Label = 'endParaRPr'; Component = 'EndParaRPr'; XPath = './p:txBody/a:p[1]/a:endParaRPr'; Attribute = 'sz'; Value = '1900' }
    )) {
        $mutationState = Get-State (Copy-Xml $referenceText) $referenceRoot
        (Safe-SelectSingleNode $mutationState.Shape $mutation.XPath $mutationState.Ns).SetAttribute($mutation.Attribute, $mutation.Value)
        $mutationState = Get-State $mutationState.Xml $referenceRoot
        Assert-Equal ([string](Test-NormalizedXmlEqual $reference.($mutation.Component) $mutationState.($mutation.Component))) 'False' $mutation.Label
    }

    Write-Host 'PASS comparator native/rich text signatures' -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}
