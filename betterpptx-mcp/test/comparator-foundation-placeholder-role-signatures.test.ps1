$ErrorActionPreference = 'Stop'

function Assert-Equal {
    param([string]$Actual, [string]$Expected, [string]$Label)
    if ($Actual -ne $Expected) { throw "$Label mismatch.`nEXPECTED:`n$Expected`nACTUAL:`n$Actual" }
}

function Assert-NotEqual {
    param([string]$Actual, [string]$Expected, [string]$Label)
    if ($Actual -eq $Expected) { throw "$Label unexpectedly matched." }
}

function Assert-Match {
    param([string]$Actual, [string]$Pattern, [string]$Label)
    if ($Actual -notmatch $Pattern) { throw "$Label did not match '$Pattern'. Actual: '$Actual'." }
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
    'Get-ExactUnicodeTextSignature',
    'Get-NormalizedBooleanAttribute',
    'Get-NormalizedPlaceholderAttributeSignature',
    'Get-NormalizedHeaderFooterPolicySignature',
    'Test-IsDynamicPlaceholderFieldType',
    'Get-NormalizedPlaceholderPayloadSignature',
    'Get-OrderedPlaceholderFieldTokenSignature',
    'Get-ResolvedPlaceholderRoleSignatures'
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
Assert-Match $comparatorSource "Compare-StringMaps 'resolved placeholder roles and header-footer policy'" 'main comparator integration'

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) "pptx-foundation-placeholder-roles-$([Guid]::NewGuid().ToString('N'))"
[System.IO.Directory]::CreateDirectory($fixtureRoot) | Out-Null

function Write-TextFile {
    param([string]$Path, [string]$Content)
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($Path)) | Out-Null
    [System.IO.File]::WriteAllText($Path, $Content.TrimStart(), $utf8NoBom)
}

function New-PlaceholderSetXml {
    param(
        [ValidateSet('master','layout','slide')][string]$Scope,
        [switch]$OfficeCanonical,
        [string]$Mutation = 'none'
    )

    $roles = @(
        [PSCustomObject]@{ Type = 'title'; Index = '0'; Name = 'Role Title' },
        [PSCustomObject]@{ Type = 'body'; Index = '1'; Name = 'Role Body' },
        [PSCustomObject]@{ Type = 'subTitle'; Index = '2'; Name = 'Role Subtitle' },
        [PSCustomObject]@{ Type = 'dt'; Index = '3'; Name = 'Role Date' },
        [PSCustomObject]@{ Type = 'ftr'; Index = '4'; Name = 'Role Footer' },
        [PSCustomObject]@{ Type = 'sldNum'; Index = '6'; Name = 'Role Slide Number' },
        [PSCustomObject]@{ Type = 'media'; Index = '7'; Name = 'Role Media' }
    )
    $items = @()
    $id = 2
    foreach ($role in $roles) {
        if (($Mutation -eq 'delete-role') -and ($Scope -eq 'slide') -and ($role.Type -eq 'media')) { continue }
        $type = [string]$role.Type
        $index = [string]$role.Index
        if (($Mutation -eq 'wrong-type') -and ($Scope -eq 'slide') -and ($role.Type -eq 'body')) { $type = 'subTitle' }
        if (($Mutation -eq 'wrong-idx') -and ($Scope -eq 'slide') -and ($role.Type -eq 'body')) { $index = '99' }
        if (($Mutation -eq 'duplicate-idx') -and ($Scope -eq 'slide') -and ($role.Type -eq 'subTitle')) { $index = '1' }

        $attributes = @()
        if (-not ($OfficeCanonical -and ($Scope -eq 'slide') -and ($role.Type -eq 'body'))) { $attributes += "type=`"$type`"" }
        if (-not ($OfficeCanonical -and ($role.Type -eq 'title'))) { $attributes += "idx=`"$index`"" }
        if (-not ($OfficeCanonical -and ($role.Type -eq 'title'))) { $attributes += 'sz="full"' }
        if ($role.Type -eq 'ftr' -and -not $OfficeCanonical) { $attributes += 'hasCustomPrompt="0"' }
        $placeholderAttributes = $attributes -join ' '

        if ($role.Type -eq 'media') {
            $items += @"
    <p:pic>
      <p:nvPicPr><p:cNvPr id="$id" name="$($role.Name)"/><p:cNvPicPr/><p:nvPr><p:ph $placeholderAttributes/></p:nvPr></p:nvPicPr>
      <p:blipFill><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr/>
    </p:pic>
"@
            $id++
            continue
        }

        $text = "$Scope-$($role.Type)"
        if (($Mutation -eq "$Scope-payload") -and ($role.Type -eq 'title')) { $text = 'MUTATED-PAYLOAD' }
        $paragraphContent = if ($role.Type -eq 'sldNum') {
            $fieldType = if (($Mutation -eq 'field-type') -and ($Scope -eq 'slide')) { 'datetime1' } else { 'slidenum' }
            $fieldId = if ($OfficeCanonical) { "{BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB}" } else { "{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}" }
            $fieldText = if ($OfficeCanonical) { '‹#›' } else { if ($Scope -eq 'slide') { '1' } else { '1002' } }
            "<a:fld id=`"$fieldId`" type=`"$fieldType`"><a:rPr lang=`"en-US`"/><a:pPr/><a:t>$fieldText</a:t></a:fld>"
        } else {
            "<a:r><a:rPr lang=`"en-US`"/><a:t>$text</a:t></a:r>"
        }
        $items += @"
    <p:sp>
      <p:nvSpPr><p:cNvPr id="$id" name="$($role.Name)"/><p:cNvSpPr/><p:nvPr><p:ph $placeholderAttributes/></p:nvPr></p:nvSpPr>
      <p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p>$paragraphContent<a:endParaRPr lang="en-US"/></a:p></p:txBody>
    </p:sp>
"@
        $id++
    }
    return $items -join "`n"
}

function New-PlaceholderPartXml {
    param(
        [ValidateSet('master','layout','slide')][string]$Scope,
        [switch]$OfficeCanonical,
        [string]$Mutation = 'none'
    )
    $rootName = switch ($Scope) { 'master' { 'sldMaster' }; 'layout' { 'sldLayout' }; default { 'sld' } }
    $roleXml = New-PlaceholderSetXml -Scope $Scope -OfficeCanonical:$OfficeCanonical -Mutation $Mutation
    $hf = ''
    if ($Scope -ne 'slide') {
        if (($Mutation -eq 'header-policy') -and ($Scope -eq 'layout')) {
            $hf = '<p:hf hdr="1"/>'
        } elseif ($OfficeCanonical) {
            $hf = '<p:hf hdr="false"/>'
        } else {
            $hf = '<p:hf dt="1" hdr="0" ftr="1" sldNum="1"/>'
        }
    }
    $tail = if ($Scope -eq 'layout') { '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>' } else { '' }
    return @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:$rootName xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld name="$Scope Role Carrier"><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
$roleXml
  </p:spTree></p:cSld>
  $hf
  $tail
</p:$rootName>
"@
}

function New-PptxFixture {
    param(
        [string]$Name,
        [switch]$OfficeCanonical,
        [string]$Mutation = 'none',
        [switch]$MissingSlideRelationship
    )

    $sourceRoot = Join-Path $fixtureRoot "$Name-source"
    $extractRoot = Join-Path $fixtureRoot "$Name-extract"
    $zipPath = Join-Path $fixtureRoot "$Name.pptx"
    [System.IO.Directory]::CreateDirectory($sourceRoot) | Out-Null
    Write-TextFile (Join-Path $sourceRoot '[Content_Types].xml') @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
</Types>
'@
    Write-TextFile (Join-Path $sourceRoot 'ppt\slideMasters\slideMaster1.xml') (New-PlaceholderPartXml -Scope master -OfficeCanonical:$OfficeCanonical -Mutation $Mutation)
    Write-TextFile (Join-Path $sourceRoot 'ppt\slideLayouts\slideLayout1.xml') (New-PlaceholderPartXml -Scope layout -OfficeCanonical:$OfficeCanonical -Mutation $Mutation)
    Write-TextFile (Join-Path $sourceRoot 'ppt\slides\slide1.xml') (New-PlaceholderPartXml -Scope slide -OfficeCanonical:$OfficeCanonical -Mutation $Mutation)

    $layoutRid = if ($OfficeCanonical) { 'rId42' } else { 'rId1' }
    $slideRid = if ($OfficeCanonical) { 'rId77' } else { 'rId2' }
    Write-TextFile (Join-Path $sourceRoot 'ppt\slideLayouts\_rels\slideLayout1.xml.rels') @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="$layoutRid" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>
"@
    $slideRelationships = if ($MissingSlideRelationship) { '' } else { "<Relationship Id=`"$slideRid`" Type=`"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout`" Target=`"../slideLayouts/slideLayout1.xml`"/>" }
    Write-TextFile (Join-Path $sourceRoot 'ppt\slides\_rels\slide1.xml.rels') @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">$slideRelationships</Relationships>
"@

    [System.IO.Compression.ZipFile]::CreateFromDirectory($sourceRoot, $zipPath)
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $extractRoot)
    return [PSCustomObject]@{ ZipPath = $zipPath; ExtractRoot = $extractRoot }
}

try {
    $baseline = New-PptxFixture 'baseline'
    $officeCanonical = New-PptxFixture 'office-canonical' -OfficeCanonical
    $baselineMap = Get-ResolvedPlaceholderRoleSignatures $baseline.ExtractRoot
    $baselineText = Convert-SignatureMapToText $baselineMap
    Assert-Equal (Convert-SignatureMapToText (Get-ResolvedPlaceholderRoleSignatures $officeCanonical.ExtractRoot)) $baselineText 'relationship IDs and Office canonical defaults'

    foreach ($scope in @('master','layout','slide')) {
        Assert-Equal $baselineMap["placeholderRole|ppt/$($(if ($scope -eq 'master') {'slideMasters/slideMaster1.xml'} elseif ($scope -eq 'layout') {'slideLayouts/slideLayout1.xml'} else {'slides/slide1.xml'}))|summary"] "scope=$scope|count=7|parent=$($(if ($scope -eq 'master') {'<none>'} else {'resolved'}))" "$scope seven-role summary"
    }
    if (@($baselineMap.Keys | Where-Object { $_ -like 'placeholderDiagnostic|*' }).Count -ne 0) { throw 'Baseline unexpectedly emitted placeholder diagnostics.' }
    if ((Convert-SignatureMapToText $baselineMap) -match 'type=hdr') { throw 'Header was incorrectly modeled as a physical placeholder role.' }
    Assert-Equal $baselineMap['headerFooter|ppt/slideLayouts/slideLayout1.xml'] 'dt=1|hdr=0|ftr=1|sldNum=1' 'layout header-footer policy'
    Assert-Match $baselineMap['placeholderRole|ppt/slides/slide1.xml|6'] 'type=sldNum\|idx=6.*kind=fld.*display=\{<dynamic>\}' 'ordered dynamic slide-number field token'

    $mutations = @(
        [PSCustomObject]@{ Name = 'wrong-type'; ExpectedDiagnostic = 'placeholderDiagnostic|ppt/slides/slide1.xml|placeholder2|type' },
        [PSCustomObject]@{ Name = 'wrong-idx'; ExpectedDiagnostic = 'placeholderDiagnostic|ppt/slides/slide1.xml|placeholder2|binding' },
        [PSCustomObject]@{ Name = 'duplicate-idx'; ExpectedDiagnostic = 'placeholderDiagnostic|ppt/slides/slide1.xml|duplicateIdx|1' },
        [PSCustomObject]@{ Name = 'delete-role'; ExpectedDiagnostic = $null },
        [PSCustomObject]@{ Name = 'field-type'; ExpectedDiagnostic = $null },
        [PSCustomObject]@{ Name = 'master-payload'; ExpectedDiagnostic = $null },
        [PSCustomObject]@{ Name = 'layout-payload'; ExpectedDiagnostic = $null },
        [PSCustomObject]@{ Name = 'slide-payload'; ExpectedDiagnostic = $null },
        [PSCustomObject]@{ Name = 'header-policy'; ExpectedDiagnostic = $null }
    )
    foreach ($mutation in $mutations) {
        $fixture = New-PptxFixture "mutation-$($mutation.Name)" -Mutation $mutation.Name
        $map = Get-ResolvedPlaceholderRoleSignatures $fixture.ExtractRoot
        Assert-NotEqual (Convert-SignatureMapToText $map) $baselineText "$($mutation.Name) mutation"
        if ($mutation.ExpectedDiagnostic -and -not $map.ContainsKey($mutation.ExpectedDiagnostic)) {
            throw "$($mutation.Name) did not emit expected diagnostic '$($mutation.ExpectedDiagnostic)'."
        }
    }

    $missingRelationship = New-PptxFixture 'mutation-missing-slide-relationship' -MissingSlideRelationship
    $missingRelationshipMap = Get-ResolvedPlaceholderRoleSignatures $missingRelationship.ExtractRoot
    Assert-NotEqual (Convert-SignatureMapToText $missingRelationshipMap) $baselineText 'missing slide-layout relationship'
    Assert-Equal $missingRelationshipMap['placeholderDiagnostic|ppt/slides/slide1.xml|parent'] 'missing-relationship' 'missing relationship diagnostic'

    Write-Host '[PASS] Resolved seven-role placeholder, header policy, and dynamic field signatures normalize Office equivalents and detect focused mutations.' -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}
