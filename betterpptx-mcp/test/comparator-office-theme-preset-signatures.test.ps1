$ErrorActionPreference = 'Stop'

function Assert-Equal([string]$Actual, [string]$Expected, [string]$Label) {
    if ($Actual -ne $Expected) { throw "$Label mismatch.`nEXPECTED:`n$Expected`nACTUAL:`n$Actual" }
}
function Assert-NotEqual([string]$Actual, [string]$Expected, [string]$Label) {
    if ($Actual -eq $Expected) { throw "$Label unexpectedly matched." }
}
function Assert-Match([string]$Actual, [string]$Pattern, [string]$Label) {
    if ($Actual -notmatch $Pattern) { throw "$Label did not match '$Pattern'.`nACTUAL:`n$Actual" }
}
function Convert-SignatureMapToText([hashtable]$Map) {
    return @($Map.Keys | Sort-Object | ForEach-Object { "$_=$($Map[$_])" }) -join "`n"
}

$comparatorPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..\ULTIMATE_PPTX_XPATH_COMPARATOR_v2h_DECYPHER.ps1')).Path
$tokens = $null
$parseErrors = $null
$comparatorSource = Get-Content -LiteralPath $comparatorPath -Raw -Encoding UTF8
$ast = [System.Management.Automation.Language.Parser]::ParseInput($comparatorSource, $comparatorPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw "Comparator parse failed: $($parseErrors -join '; ')" }
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
    'Get-NormalizedCarrierCommonSlideDataSignature',
    'Get-NormalizedThemePayloadSignature',
    'Get-LayoutCarrierBindingSignatures'
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
Assert-Match $comparatorSource "Compare-StringMaps 'layout carrier bindings and semantics'" 'production comparator integration'

$utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) "pptx-office-theme-comparator-$([Guid]::NewGuid().ToString('N'))"

function Write-TextFile([string]$Path, [string]$Content) {
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($Path)) | Out-Null
    [System.IO.File]::WriteAllText($Path, $Content.TrimStart(), $utf8NoBom)
}

function New-OfficeThemeFixture {
    param(
        [string]$Name,
        [switch]$RenumberRelationships,
        [switch]$LexicalVariants,
        [string]$ThemeName = 'Office Theme',
        [string]$SchemeName = 'Office',
        [string]$Accent1 = '4472C4',
        [string]$SystemLastColor = '000000',
        [string]$HeadFont = 'Aptos Display',
        [string]$BodyFont = 'Aptos',
        [string]$JapaneseHeadFont = 'Yu Gothic Light',
        [string]$FormatLineWidth = '6350',
        [string]$ThemeFamilyId = '{2E142A2C-CD16-42D6-873A-C26D2A0506FA}',
        [string]$Language = 'en-US',
        [switch]$OmitThemeRelationship,
        [switch]$OmitThemePart,
        [switch]$InvalidThemeContentType
    )
    $root = Join-Path $fixtureRoot $Name
    [System.IO.Directory]::CreateDirectory($root) | Out-Null
    $masterRelationshipId = if ($RenumberRelationships) { 'renMaster' } else { 'rId1' }
    $themeRelationshipId = if ($RenumberRelationships) { 'renTheme' } else { 'rId1' }
    $themeContentType = if ($InvalidThemeContentType) { 'application/xml' } else { 'application/vnd.openxmlformats-officedocument.theme+xml' }
    Write-TextFile (Join-Path $root '[Content_Types].xml') @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="$themeContentType"/>
</Types>
"@
    Write-TextFile (Join-Path $root 'ppt\presentation.xml') @"
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="$masterRelationshipId"/></p:sldMasterIdLst></p:presentation>
"@
    Write-TextFile (Join-Path $root 'ppt\_rels\presentation.xml.rels') @"
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="$masterRelationshipId" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/></Relationships>
"@
    Write-TextFile (Join-Path $root 'ppt\slideMasters\slideMaster1.xml') @"
<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld name="Office Master"><p:spTree><p:nvGrpSpPr/><p:grpSpPr/></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst/><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle><a:defPPr><a:defRPr lang="$Language"/></a:defPPr></p:otherStyle></p:txStyles></p:sldMaster>
"@
    $themeRelationship = if ($OmitThemeRelationship) { '' } else { "<Relationship Id=`"$themeRelationshipId`" Type=`"http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme`" Target=`"../theme/theme1.xml`"/>" }
    Write-TextFile (Join-Path $root 'ppt\slideMasters\_rels\slideMaster1.xml.rels') @"
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">$themeRelationship</Relationships>
"@
    if (-not $OmitThemePart) {
        $hex = {
            param([string]$Value)
            if ($LexicalVariants) { return $Value.ToLowerInvariant() }
            return $Value.ToUpperInvariant()
        }
        $rotWithShape = if ($LexicalVariants) { 'true' } else { '1' }
        $scaled = if ($LexicalVariants) { 'false' } else { '0' }
        Write-TextFile (Join-Path $root 'ppt\theme\theme1.xml') @"
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:thm15="http://schemas.microsoft.com/office/thememl/2012/main" name="$ThemeName"><a:themeElements><a:clrScheme name="$SchemeName"><a:dk1><a:sysClr val="windowText" lastClr="$(& $hex $SystemLastColor)"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="$(& $hex 'FFFFFF')"/></a:lt1><a:dk2><a:srgbClr val="$(& $hex '44546A')"/></a:dk2><a:lt2><a:srgbClr val="$(& $hex 'E7E6E6')"/></a:lt2><a:accent1><a:srgbClr val="$(& $hex $Accent1)"/></a:accent1><a:accent2><a:srgbClr val="$(& $hex 'ED7D31')"/></a:accent2><a:accent3><a:srgbClr val="$(& $hex 'A5A5A5')"/></a:accent3><a:accent4><a:srgbClr val="$(& $hex 'FFC000')"/></a:accent4><a:accent5><a:srgbClr val="$(& $hex '5B9BD5')"/></a:accent5><a:accent6><a:srgbClr val="$(& $hex '70AD47')"/></a:accent6><a:hlink><a:srgbClr val="$(& $hex '0563C1')"/></a:hlink><a:folHlink><a:srgbClr val="$(& $hex '954F72')"/></a:folHlink></a:clrScheme><a:fontScheme name="$SchemeName"><a:majorFont><a:latin typeface="$HeadFont"/><a:ea typeface=""/><a:cs typeface=""/><a:font script="Jpan" typeface="$JapaneseHeadFont"/></a:majorFont><a:minorFont><a:latin typeface="$BodyFont"/><a:ea typeface=""/><a:cs typeface=""/><a:font script="Jpan" typeface="Yu Gothic"/></a:minorFont></a:fontScheme><a:fmtScheme name="$SchemeName"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:gradFill rotWithShape="$rotWithShape"><a:gsLst><a:gs pos="0"><a:srgbClr val="$(& $hex '112233')"/></a:gs></a:gsLst><a:lin ang="5400000" scaled="$scaled"/></a:gradFill></a:fillStyleLst><a:lnStyleLst><a:ln w="$FormatLineWidth"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/><a:extLst><a:ext uri="{05A4C25C-085E-4340-85A3-A5531E510DB2}"><thm15:themeFamily name="$ThemeName" id="$ThemeFamilyId" vid="{1BDDFF52-6CD6-40A5-AB3C-68EB2F1E4D0A}"/></a:ext></a:extLst></a:theme>
"@
    }
    return $root
}

try {
    $baseline = New-OfficeThemeFixture 'baseline'
    $equivalent = New-OfficeThemeFixture 'equivalent' -RenumberRelationships -LexicalVariants
    $baselineMap = Get-LayoutCarrierBindingSignatures $baseline
    $baselineText = Convert-SignatureMapToText $baselineMap
    Assert-Equal (Convert-SignatureMapToText (Get-LayoutCarrierBindingSignatures $equivalent)) $baselineText 'relationship ID, hexadecimal case, and boolean lexical normalization'

    $themeKey = 'theme|ppt/theme/theme1.xml|payload'
    Assert-Match $baselineMap['graph|ppt/slideMasters/slideMaster1.xml|theme'] 'count=1.*target=ppt/theme/theme1.xml.*exists=1' 'slide-master theme binding'
    Assert-Match $baselineMap['contentType|ppt/theme/theme1.xml'] 'valid=1$' 'theme content type'
    Assert-Match $baselineMap[$themeKey] 'name=Office Theme' 'Office theme identity'
    Assert-Match $baselineMap[$themeKey] 'typeface=Aptos Display' 'Office head font'
    Assert-Match $baselineMap[$themeKey] 'typeface=Aptos' 'Office body font'
    Assert-Match $baselineMap[$themeKey] 'val=4472C4' 'Office accent color'
    Assert-Match $baselineMap[$themeKey] ([regex]::Escape('{2E142A2C-CD16-42D6-873A-C26D2A0506FA}')) 'Office theme-family identity'
    Assert-Match $baselineMap['master|ppt/slideMasters/slideMaster1.xml|txStyles'] 'lang=en-US' 'theme language carrier'

    $mutations = @(
        [PSCustomObject]@{ Name='theme-name'; Options=@{ ThemeName='Office Theme Altered' }; Key=$themeKey },
        [PSCustomObject]@{ Name='resource-scoped-scheme-name'; Options=@{ SchemeName='Office Theme' }; Key=$themeKey },
        [PSCustomObject]@{ Name='accent-color'; Options=@{ Accent1='AA22CC' }; Key=$themeKey },
        [PSCustomObject]@{ Name='system-last-color'; Options=@{ SystemLastColor='010101' }; Key=$themeKey },
        [PSCustomObject]@{ Name='head-font'; Options=@{ HeadFont='Calibri Light' }; Key=$themeKey },
        [PSCustomObject]@{ Name='body-font'; Options=@{ BodyFont='Calibri' }; Key=$themeKey },
        [PSCustomObject]@{ Name='script-font'; Options=@{ JapaneseHeadFont='Yu Mincho' }; Key=$themeKey },
        [PSCustomObject]@{ Name='format-scheme'; Options=@{ FormatLineWidth='12700' }; Key=$themeKey },
        [PSCustomObject]@{ Name='theme-family-id'; Options=@{ ThemeFamilyId='{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}' }; Key=$themeKey },
        [PSCustomObject]@{ Name='language'; Options=@{ Language='fr-FR' }; Key='master|ppt/slideMasters/slideMaster1.xml|txStyles' },
        [PSCustomObject]@{ Name='missing-theme-relationship'; Options=@{ OmitThemeRelationship=$true }; Key='graph|ppt/slideMasters/slideMaster1.xml|theme' },
        [PSCustomObject]@{ Name='missing-theme-part'; Options=@{ OmitThemePart=$true }; Key='graph|ppt/slideMasters/slideMaster1.xml|theme' },
        [PSCustomObject]@{ Name='theme-content-type'; Options=@{ InvalidThemeContentType=$true }; Key='contentType|ppt/theme/theme1.xml' }
    )
    foreach ($mutation in $mutations) {
        $options = $mutation.Options
        $root = New-OfficeThemeFixture -Name "mutation-$($mutation.Name)" @options
        $map = Get-LayoutCarrierBindingSignatures $root
        Assert-NotEqual (Convert-SignatureMapToText $map) $baselineText "$($mutation.Name) full signature"
        Assert-NotEqual ([string]$map[$mutation.Key]) ([string]$baselineMap[$mutation.Key]) "$($mutation.Name) focused signature"
    }

    Write-Host '[PASS] Production comparator normalizes equivalent Office-theme lexical forms and detects resource-scoped identity, graph, color, font, language, format, family, part, and content-type mutations.' -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}
