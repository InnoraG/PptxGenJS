$ErrorActionPreference = 'Stop'

function Assert-Equal([string]$Actual, [string]$Expected, [string]$Label) { if ($Actual -ne $Expected) { throw "$Label mismatch.`nEXPECTED:`n$Expected`nACTUAL:`n$Actual" } }
function Assert-NotEqual([string]$Actual, [string]$Expected, [string]$Label) { if ($Actual -eq $Expected) { throw "$Label unexpectedly matched." } }

$comparatorPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..\ULTIMATE_PPTX_XPATH_COMPARATOR_v2h_DECYPHER.ps1')).Path
$tokens=$null; $parseErrors=$null
$source = Get-Content -LiteralPath $comparatorPath -Raw -Encoding UTF8
$ast = [System.Management.Automation.Language.Parser]::ParseInput($source,$comparatorPath,[ref]$tokens,[ref]$parseErrors)
if ($parseErrors.Count) { throw "Comparator parse failed: $($parseErrors -join '; ')" }
$names = @(
    'Normalize-XmlFragment','Get-RelativePackagePath','Resolve-PackageTargetPath','Get-RelMapForPart','Get-PartRelPathFromFullPath',
    'Get-ElementSemanticPath','Get-RelationshipTargetSemanticSignature','Get-RelationshipIndependentXmlSignature','Get-NormalizedBooleanAttribute','Get-NormalizedThemePayloadSignature',
    'Get-ExactUnicodeTextSignature','Get-InteractiveLogicalChildren','Get-UniqueInheritanceRelationship','Get-InheritancePlaceholderRecords',
    'Get-InheritanceNodeSequenceSignature','Get-InheritanceTextBodySignature','Get-InheritanceOwnerPayload','Get-InheritanceEffectiveComponentSignature',
    'Get-InheritanceColorMapOverrideSignature','Get-InheritanceFixedObjects','Get-ResolvedLayoutInheritanceSignatures'
)
$functions=@($ast.FindAll({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst]},$true))
foreach($name in $names){$definition=$functions|Where-Object Name -eq $name|Select-Object -First 1;if(-not $definition){throw "Missing helper $name"};Invoke-Expression $definition.Extent.Text}
if($source -notmatch "Compare-StringMaps 'resolved layout master theme inheritance'"){throw 'Main comparator integration missing.'}

Add-Type -AssemblyName System.IO.Compression.FileSystem
function Write-Utf8([string]$Path,[string]$Text){[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($Path))|Out-Null;[System.IO.File]::WriteAllText($Path,$Text,(New-Object System.Text.UTF8Encoding($false)))}
function New-Fixture([string]$Name,[bool]$Renumbered){
    $sourceRoot=Join-Path $temp "$Name-source";$zip=Join-Path $temp "$Name.pptx";$root=Join-Path $temp $Name
    $slideRid=if($Renumbered){'rId91'}else{'rId1'};$masterRid=if($Renumbered){'rId81'}else{'rId2'};$themeRid=if($Renumbered){'rId71'}else{'rId3'}
    $slideFlags=if($Renumbered){' showMasterSp="true" showMasterPhAnim="1" showMasterBg="true"'}else{''}
    $layoutFlags=if($Renumbered){' preserve="true" showMasterSp="1" showMasterPhAnim="true"'}else{''}
    $slideClrMap=if($Renumbered){''}else{'<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>'}
    $layoutClrMap=if($Renumbered){''}else{'<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>'}
    Write-Utf8 (Join-Path $sourceRoot 'ppt\slides\slide1.xml') @"
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"$slideFlags><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Body"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp></p:spTree></p:cSld>$slideClrMap</p:sld>
"@
    Write-Utf8 (Join-Path $sourceRoot 'ppt\slides\_rels\slide1.xml.rels') @"
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="$slideRid" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>
"@
    Write-Utf8 (Join-Path $sourceRoot 'ppt\slideLayouts\slideLayout1.xml') @"
<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"$layoutFlags><p:cSld name="Body Layout"><p:spTree><p:nvGrpSpPr/><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Layout Body"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="100" y="200"/><a:ext cx="300" cy="400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:schemeClr val="accent3"/></a:solidFill><a:ln w="12700"><a:solidFill><a:prstClr val="red"/></a:solidFill></a:ln><a:effectLst><a:outerShdw blurRad="12345"><a:srgbClr val="010203"/></a:outerShdw></a:effectLst></p:spPr><p:style><a:lnRef idx="1"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef></p:style><p:txBody><a:bodyPr wrap="square" anchor="t"/><a:lstStyle><a:lvl1pPr algn="l"><a:defRPr sz="2100"/></a:lvl1pPr></a:lstStyle><a:p><a:pPr algn="ctr"><a:defRPr b="0"/></a:pPr><a:r><a:rPr lang="en-US" sz="1800"/><a:t>Layout placeholder</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Layout Brand A"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:solidFill><a:schemeClr val="accent5"/></a:solidFill></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="4" name="Layout Brand B"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:solidFill><a:schemeClr val="accent6"/></a:solidFill></p:spPr></p:sp></p:spTree></p:cSld>$layoutClrMap</p:sldLayout>
"@
    Write-Utf8 (Join-Path $sourceRoot 'ppt\slideLayouts\_rels\slideLayout1.xml.rels') @"
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="$masterRid" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>
"@
    Write-Utf8 (Join-Path $sourceRoot 'ppt\slideMasters\slideMaster1.xml') @'
<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld name="Primary Master"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="F0F0F0"/></a:solidFill></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr/><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Master Body"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="10" y="20"/><a:ext cx="30" cy="40"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:schemeClr val="accent2"/></a:solidFill><a:ln><a:noFill/></a:ln><a:effectLst><a:glow rad="5000"><a:schemeClr val="accent2"/></a:glow></a:effectLst></p:spPr><p:style><a:lnRef idx="2"><a:schemeClr val="accent2"/></a:lnRef></p:style><p:txBody><a:bodyPr wrap="none"/><a:lstStyle><a:lvl1pPr><a:defRPr sz="1900"/></a:lvl1pPr></a:lstStyle><a:p><a:pPr algn="l"/><a:r><a:rPr lang="de-DE"/><a:t>Master placeholder</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Brand A"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="4" name="Brand B"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:solidFill><a:schemeClr val="accent2"/></a:solidFill></p:spPr></p:sp></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="3200"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>
'@
    Write-Utf8 (Join-Path $sourceRoot 'ppt\slideMasters\_rels\slideMaster1.xml.rels') @"
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="$themeRid" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>
"@
    Write-Utf8 (Join-Path $sourceRoot 'ppt\theme\theme1.xml') '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Primary"><a:themeElements><a:clrScheme name="Primary"><a:accent1><a:srgbClr val="112233"/></a:accent1></a:clrScheme><a:fontScheme name="Primary"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme><a:fmtScheme name="Primary"/></a:themeElements></a:theme>'
    [System.IO.Compression.ZipFile]::CreateFromDirectory($sourceRoot,$zip);[System.IO.Compression.ZipFile]::ExtractToDirectory($zip,$root);return $root
}
function Get-Map([string]$Root){return Get-ResolvedLayoutInheritanceSignatures $Root}
function Map-Text([string]$Root){$map=Get-Map $Root;return @($map.Keys|Sort-Object|ForEach-Object{"$_=$($map[$_])"})-join"`n"}
function Assert-Contains([string]$Actual,[string]$Expected,[string]$Label){if(-not $Actual.Contains($Expected)){throw "$Label did not contain '$Expected'.`nACTUAL:`n$Actual"}}
function New-Mutation([string]$Source,[string]$Name,[string]$Relative,[string]$Old,[string]$New){$root=Join-Path $temp $Name;Copy-Item $Source $root -Recurse;$path=Join-Path $root $Relative;$text=[System.IO.File]::ReadAllText($path);if(-not $text.Contains($Old)){throw "Token missing for $Name"};Write-Utf8 $path ($text.Replace($Old,$New));return $root}

$temp=Join-Path ([System.IO.Path]::GetTempPath()) "pptx-layout-inheritance-$([guid]::NewGuid().ToString('N'))"
try{
    [System.IO.Directory]::CreateDirectory($temp)|Out-Null
    $reference=New-Fixture 'reference' $false;$renumbered=New-Fixture 'renumbered' $true;$baselineMap=Get-Map $reference;$baseline=Map-Text $reference
    Assert-Equal (Map-Text $renumbered) $baseline 'relationship-ID and explicit-default equivalence'
    $componentPrefix='inheritance|ppt/slides/slide1.xml|placeholder|1|component|'
    foreach($component in @('xfrm','geometry','fill','line','effect','style','txBody','bodyPr','lstStyle','pPr','rPr')){Assert-Contains ([string]$baselineMap["$componentPrefix$component"]) 'source=layout' "baseline $component source"}
    Assert-Contains ([string]$baselineMap['inheritance|ppt/slides/slide1.xml|background']) 'source=master' 'baseline background source'
    Assert-Contains ([string]$baselineMap['inheritance|ppt/slides/slide1.xml|fixedObjectVisibility']) 'layoutVisible=1|masterVisible=1|layoutCount=2|masterCount=2' 'baseline fixed-object visibility/order'
    $mutations=@(
        @('slide-flags','ppt\slides\slide1.xml','<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">','<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" showMasterSp="0">'),
        @('slide-clrmap-override','ppt\slides\slide1.xml','<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>','<p:clrMapOvr><a:overrideClrMapping bg1="dk1" tx1="lt1"/></p:clrMapOvr>'),
        @('layout-geometry','ppt\slideLayouts\slideLayout1.xml','x="100"','x="500"'),
        @('layout-fill','ppt\slideLayouts\slideLayout1.xml','val="accent3"','val="accent4"'),
        @('layout-line','ppt\slideLayouts\slideLayout1.xml','val="red"','val="blue"'),
        @('layout-effect','ppt\slideLayouts\slideLayout1.xml','blurRad="12345"','blurRad="54321"'),
        @('layout-style','ppt\slideLayouts\slideLayout1.xml','<a:lnRef idx="1">','<a:lnRef idx="3">'),
        @('layout-bodyPr','ppt\slideLayouts\slideLayout1.xml','<a:bodyPr wrap="square" anchor="t"/>','<a:bodyPr wrap="none" anchor="t"/>'),
        @('layout-lstStyle','ppt\slideLayouts\slideLayout1.xml','<a:defRPr sz="2100"/>','<a:defRPr sz="2200"/>'),
        @('layout-pPr','ppt\slideLayouts\slideLayout1.xml','<a:pPr algn="ctr">','<a:pPr algn="r">'),
        @('layout-rPr','ppt\slideLayouts\slideLayout1.xml','<a:rPr lang="en-US" sz="1800"/>','<a:rPr lang="fr-FR" sz="1800"/>'),
        @('layout-txBody','ppt\slideLayouts\slideLayout1.xml','Layout placeholder','Changed placeholder'),
        @('layout-show-master','ppt\slideLayouts\slideLayout1.xml','<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">','<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" showMasterSp="0">'),
        @('layout-background','ppt\slideLayouts\slideLayout1.xml','<p:cSld name="Body Layout"><p:spTree>','<p:cSld name="Body Layout"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="ABCDEF"/></a:solidFill></p:bgPr></p:bg><p:spTree>'),
        @('master-geometry','ppt\slideMasters\slideMaster1.xml','prst="roundRect"','prst="ellipse"'),
        @('master-style','ppt\slideMasters\slideMaster1.xml','<a:lnRef idx="2">','<a:lnRef idx="4">'),
        @('master-background','ppt\slideMasters\slideMaster1.xml','val="F0F0F0"','val="E0E0E0"'),
        @('master-clrmap','ppt\slideMasters\slideMaster1.xml','accent1="accent1"','accent1="accent2"'),
        @('master-txstyles','ppt\slideMasters\slideMaster1.xml','sz="4400"','sz="4600"'),
        @('theme-payload','ppt\theme\theme1.xml','val="112233"','val="445566"'),
        @('layout-fixed-delete','ppt\slideLayouts\slideLayout1.xml','<p:sp><p:nvSpPr><p:cNvPr id="3" name="Layout Brand A"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:solidFill><a:schemeClr val="accent5"/></a:solidFill></p:spPr></p:sp>',''),
        @('master-fixed-delete','ppt\slideMasters\slideMaster1.xml','<p:sp><p:nvSpPr><p:cNvPr id="3" name="Brand A"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr></p:sp>',''),
        @('master-name','ppt\slideMasters\slideMaster1.xml','name="Primary Master"','name="Changed Master"'),
        @('missing-layout-binding','ppt\slides\_rels\slide1.xml.rels','Target="../slideLayouts/slideLayout1.xml"','Target="../slideLayouts/missing.xml"'),
        @('missing-theme-binding','ppt\slideMasters\_rels\slideMaster1.xml.rels','Target="../theme/theme1.xml"','Target="../theme/missing.xml"')
    )
    foreach($mutation in $mutations){$root=New-Mutation $reference $mutation[0] $mutation[1] $mutation[2] $mutation[3];Assert-NotEqual (Map-Text $root) $baseline $mutation[0]}
    $sourceMove='<p:spPr/>'
    $targetMove='<p:spPr><a:xfrm><a:off x="100" y="200"/><a:ext cx="300" cy="400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>'
    $provenance=New-Mutation $reference 'same-effective-geometry-new-source' 'ppt\slides\slide1.xml' $sourceMove $targetMove
    Assert-NotEqual (Map-Text $provenance) $baseline 'same effective geometry but changed inheritance provenance'
    $styleOnly=New-Mutation $reference 'style-only-slide-override' 'ppt\slides\slide1.xml' '<p:spPr/>' '<p:spPr><a:solidFill><a:schemeClr val="accent4"/></a:solidFill></p:spPr>'
    $styleMap=Get-Map $styleOnly
    Assert-Contains ([string]$styleMap["${componentPrefix}fill"]) 'source=slide' 'style-only fill source'
    Assert-Contains ([string]$styleMap["${componentPrefix}xfrm"]) 'source=layout' 'style-only xfrm provenance'
    Assert-Contains ([string]$styleMap["${componentPrefix}geometry"]) 'source=layout' 'style-only geometry provenance'
    Assert-NotEqual (Map-Text $styleOnly) $baseline 'style-only override changes effective style'
    $styleReset=New-Mutation $styleOnly 'style-only-slide-reset' 'ppt\slides\slide1.xml' '<p:spPr><a:solidFill><a:schemeClr val="accent4"/></a:solidFill></p:spPr>' '<p:spPr/>'
    Assert-Equal (Map-Text $styleReset) $baseline 'style-only component reset restores inheritance'
    $localGeometry=New-Mutation $reference 'local-geometry-only' 'ppt\slides\slide1.xml' '<p:spPr/>' '<p:spPr><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom></p:spPr>'
    $localGeometryMap=Get-Map $localGeometry
    Assert-Contains ([string]$localGeometryMap["${componentPrefix}xfrm"]) 'source=layout' 'geometry-only xfrm provenance'
    Assert-Contains ([string]$localGeometryMap["${componentPrefix}geometry"]) 'source=slide' 'geometry-only preset provenance'
    $clrOverride=New-Mutation $reference 'clrmap-local-override' 'ppt\slides\slide1.xml' '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>' '<p:clrMapOvr><a:overrideClrMapping bg1="dk1" tx1="lt1"/></p:clrMapOvr>'
    Assert-NotEqual (Map-Text $clrOverride) $baseline 'color-map local override'
    $clrReset=New-Mutation $clrOverride 'clrmap-local-reset' 'ppt\slides\slide1.xml' '<p:clrMapOvr><a:overrideClrMapping bg1="dk1" tx1="lt1"/></p:clrMapOvr>' '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>'
    Assert-Equal (Map-Text $clrReset) $baseline 'color-map reset restores inherited mapping'
    foreach($scope in @('layout','master')){
        $relative=if($scope -eq 'layout'){'ppt\slideLayouts\slideLayout1.xml'}else{'ppt\slideMasters\slideMaster1.xml'}
        $a=if($scope -eq 'layout'){'<p:sp><p:nvSpPr><p:cNvPr id="3" name="Layout Brand A"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:solidFill><a:schemeClr val="accent5"/></a:solidFill></p:spPr></p:sp>'}else{'<p:sp><p:nvSpPr><p:cNvPr id="3" name="Brand A"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr></p:sp>'}
        $b=if($scope -eq 'layout'){'<p:sp><p:nvSpPr><p:cNvPr id="4" name="Layout Brand B"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:solidFill><a:schemeClr val="accent6"/></a:solidFill></p:spPr></p:sp>'}else{'<p:sp><p:nvSpPr><p:cNvPr id="4" name="Brand B"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:solidFill><a:schemeClr val="accent2"/></a:solidFill></p:spPr></p:sp>'}
        $reordered=Join-Path $temp "$scope-fixed-reorder";Copy-Item $reference $reordered -Recurse;$path=Join-Path $reordered $relative;$text=[System.IO.File]::ReadAllText($path);Write-Utf8 $path ($text.Replace("$a$b","$b$a"));Assert-NotEqual (Map-Text $reordered) $baseline "$scope fixed-object reorder"
    }
    Write-Host 'PASS comparator layout/master/theme resolved inheritance signatures' -ForegroundColor Green
}finally{if(Test-Path $temp){Remove-Item $temp -Recurse -Force}}
