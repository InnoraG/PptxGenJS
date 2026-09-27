import path from 'node:path'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

export const NATIVE3D_PREVIEW_HYDRATION_VERSION = 'betterpptx.native3d-preview-readiness.v1'
const NS = Object.freeze({
	p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
	a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
	r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
	model: 'http://schemas.microsoft.com/office/drawing/2017/model3d',
	mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
})
const elements = (node, ns, name) => Array.from(node?.getElementsByTagNameNS(ns, name) || [])
const child = (node, ns, name) => Array.from(node?.childNodes || []).find(item => item.nodeType === 1 && item.namespaceURI === ns && item.localName === name)
const ancestor = (node, ns, name) => {
	for (let item = node?.parentNode; item; item = item.parentNode) if (item.namespaceURI === ns && item.localName === name) return item
	return null
}
const parseXml = text => new DOMParser({ errorHandler: { warning() {}, error(message) { throw new Error(message) }, fatalError(message) { throw new Error(message) } } }).parseFromString(text, 'application/xml')
const readyError = message => Object.assign(new Error(message), { code: 'POWERPOINT_PREVIEW_3D_NOT_READY' })

// Requirements are derived from the exact frozen package, never the mutable
// authoring graph or a filename/identity-specific presenter heuristic.
export async function readNative3dPreviewRequirements(packageBytes, slideIndexes, { includePosterData = true } = {}) {
	const zip = await JSZip.loadAsync(packageBytes)
	const readXml = async name => {
		const part = zip.file(name)
		if (!part) throw readyError('The presentation lacks required native 3D preview metadata.')
		return parseXml(await part.async('string'))
	}
	const relations = async name => {
		const relName = path.posix.join(path.posix.dirname(name), '_rels', `${path.posix.basename(name)}.rels`)
		const part = zip.file(relName)
		const map = new Map()
		map.inheritedParts = []
		if (!part) return map
		for (const rel of elements(parseXml(await part.async('string')), '*', 'Relationship')) {
			if (rel.getAttribute('TargetMode') === 'External') continue
			const target = rel.getAttribute('Target')
			const resolved = path.posix.normalize(target.startsWith('/') ? target.slice(1) : path.posix.join(path.posix.dirname(name), target))
			if (resolved.startsWith('../')) throw readyError('The presentation has an invalid native 3D preview resource.')
			map.set(rel.getAttribute('Id'), resolved)
			if (['http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster'].includes(rel.getAttribute('Type'))) map.inheritedParts.push(resolved)
		}
		return map
	}
	const presentation = await readXml('ppt/presentation.xml')
	const presentationRels = await relations('ppt/presentation.xml')
	const slideParts = elements(presentation, NS.p, 'sldId').map(node => presentationRels.get(node.getAttributeNS(NS.r, 'id')))
	const size = elements(presentation, NS.p, 'sldSz')[0]
	const slideSizeEmu = { w: Number(size?.getAttribute('cx')), h: Number(size?.getAttribute('cy')) }
	if (!Object.values(slideSizeEmu).every(value => Number.isFinite(value) && value > 0)) throw readyError('The presentation lacks valid slide dimensions for native preview verification.')
	const slides = []
	for (const slideIndex of slideIndexes) {
		const part = slideParts[slideIndex]
		if (!part) throw readyError('The requested slide lacks native preview metadata.')
		const document = await readXml(part)
		const models = elements(document, NS.model, 'model3d')
		const rels = await relations(part)
		const inheritedQueue = [...rels.inheritedParts]
		const checkedInheritance = new Set()
		while (inheritedQueue.length) {
			const inheritedPart = inheritedQueue.shift()
			if (checkedInheritance.has(inheritedPart)) continue
			checkedInheritance.add(inheritedPart)
			if (elements(await readXml(inheritedPart), NS.model, 'model3d').length) throw readyError('An inherited native 3D object needs an additional preview comparison before approval.')
			inheritedQueue.push(...(await relations(inheritedPart)).inheritedParts)
		}
		if (!includePosterData) {
			slides.push({ slideIndex, targets: models.map(() => ({})) })
			continue
		}
		const targets = []
		for (const model of models) {
			const graphicFrame = ancestor(model, NS.p, 'graphicFrame')
			const nv = elements(graphicFrame, NS.p, 'cNvPr')[0]
			const alternate = ancestor(model, NS.mc, 'AlternateContent')
			const fallback = child(alternate, NS.mc, 'Fallback')
			const pic = child(fallback, NS.p, 'pic')
			const fallbackBlip = elements(pic, NS.a, 'blip')[0]
			const nativeBlip = elements(model, NS.model, 'blip')[0]
			if (fallbackBlip && nativeBlip && rels.get(fallbackBlip.getAttributeNS(NS.r, 'embed')) !== rels.get(nativeBlip.getAttributeNS(NS.r, 'embed'))) throw readyError('This native 3D object has multiple compatibility views that need an additional preview comparison before approval.')
			const blip = fallbackBlip || nativeBlip
			const posterPart = blip ? rels.get(blip.getAttributeNS(NS.r, 'embed')) : null
			const transform = child(graphicFrame, NS.p, 'xfrm')
			const offset = child(transform, NS.a, 'off')
			const extent = child(transform, NS.a, 'ext')
			const frame = { x: Number(offset?.getAttribute('x')), y: Number(offset?.getAttribute('y')), w: Number(extent?.getAttribute('cx')), h: Number(extent?.getAttribute('cy')) }
			if (!nv || !Number.isInteger(Number(nv.getAttribute('id'))) || !Object.values(frame).every(Number.isFinite) || !(frame.w > 0 && frame.h > 0)) {
				throw readyError('A native 3D object lacks an inspectable preview frame.')
			}
			const fallbackTransform = elements(pic, NS.a, 'xfrm')[0]
			const unsupported = Boolean(ancestor(graphicFrame, NS.p, 'grpSp') ||
				Number(transform?.getAttribute('rot') || 0) || Number(fallbackTransform?.getAttribute('rot') || 0) ||
				['flipH', 'flipV'].some(key => ['1', 'true'].includes(transform?.getAttribute(key)) || ['1', 'true'].includes(fallbackTransform?.getAttribute(key))) ||
				['srcRect', 'effectLst', 'effectDag', 'scene3d', 'sp3d'].some(name => elements(pic, NS.a, name).length > 0))
			if (unsupported) throw readyError('This native 3D fallback treatment needs an additional preview comparison before approval.')
			if (blip && (!posterPart || !zip.file(posterPart))) throw readyError('A native 3D compatibility image is unavailable for preview verification.')
			targets.push({ shapeId: Number(nv.getAttribute('id')), frameEmu: frame, posterBase64: posterPart ? await zip.file(posterPart).async('base64') : null })
		}
		slides.push({ slideIndex, targets })
	}
	return { schemaVersion: NATIVE3D_PREVIEW_HYDRATION_VERSION, slideSizeEmu, slides }
}

export function native3dHydrationProofComplete(proof, expectedCount = 0) {
	if (expectedCount === 0) return true
	const hasViewportEvidence = proof?.fullyClippedModelCount !== undefined || proof?.partiallyClippedModelCount !== undefined || proof?.viewportFrameMatch !== undefined
	if (hasViewportEvidence && !(proof.viewportFrameMatch === 'verified'
		&& [proof.fullyClippedModelCount, proof.partiallyClippedModelCount].every(count => Number.isInteger(count) && count >= 0)
		&& proof.fullyClippedModelCount + proof.partiallyClippedModelCount <= expectedCount
		&& proof.clippedAbsenceCheck === (proof.fullyClippedModelCount > 0 ? 'pixel-identical-with-target-hidden' : 'not-needed'))) return false
	return proof?.schemaVersion === NATIVE3D_PREVIEW_HYDRATION_VERSION && proof?.status === 'verified'
		&& proof.modelCount === expectedCount && proof.verifiedModelCount === expectedCount
		&& proof.stablePasses >= 2 && proof.fallbackGuard === 'checked' && proof.slideContentMatch === 'verified'
}

// This helper runs only in the isolated, read-only PowerPoint preview worker.
// A stable compatibility poster is explicitly a failure, not a ready model.
export const NATIVE3D_PREVIEW_HYDRATION_POWERSHELL = String.raw`
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
public sealed class BetterPptxNativeRasterEvidence {
  public string Hash;
  public int Foreground;
  public bool Informative;
  public bool FallbackMatch;
  public double Difference;
}
public static class BetterPptxNativeRaster {
  const int N = 96;
  static byte[] Signature(Image image, RectangleF source) {
    using (var bitmap = new Bitmap(N, N, PixelFormat.Format32bppArgb)) {
      using (var graphics = Graphics.FromImage(bitmap)) {
        graphics.CompositingMode = CompositingMode.SourceCopy;
        graphics.InterpolationMode = InterpolationMode.HighQualityBilinear;
        graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
        graphics.DrawImage(image, new RectangleF(0, 0, N, N), source, GraphicsUnit.Pixel);
      }
      var values = new byte[N * N * 4];
      for (int y = 0; y < N; y++) for (int x = 0; x < N; x++) {
        Color c = bitmap.GetPixel(x, y); int p = (y * N + x) * 4;
        values[p] = (byte)(c.R * c.A / 255); values[p + 1] = (byte)(c.G * c.A / 255);
        values[p + 2] = (byte)(c.B * c.A / 255); values[p + 3] = c.A;
      }
      return values;
    }
  }
  static byte[] Poster(string base64) {
    using (var stream = new MemoryStream(Convert.FromBase64String(base64)))
    using (var image = Image.FromStream(stream)) return Signature(image, new RectangleF(0, 0, image.Width, image.Height));
  }
  public static BetterPptxNativeRasterEvidence Inspect(string file, string posterBase64) {
    byte[] actual;
    using (var image = Image.FromFile(file)) actual = Signature(image, new RectangleF(0, 0, image.Width, image.Height));
    var evidence = new BetterPptxNativeRasterEvidence();
    using (var hash = SHA256.Create()) evidence.Hash = BitConverter.ToString(hash.ComputeHash(actual)).Replace("-", "").ToLowerInvariant();
    int min = 255, max = 0;
    for (int p = 0; p < actual.Length; p += 4) {
      if (actual[p + 3] > 20) evidence.Foreground++;
      for (int c = 0; c < 4; c++) { min = Math.Min(min, actual[p + c]); max = Math.Max(max, actual[p + c]); }
    }
    bool uniform = true;
    for (int p = 4; p < actual.Length && uniform; p += 4) for (int c = 0; c < 4; c++) if (Math.Abs(actual[p + c] - actual[c]) > 4) uniform = false;
    evidence.Informative = !uniform && max - min > 4 && evidence.Foreground >= 12;
    if (String.IsNullOrEmpty(posterBase64)) return evidence;
    byte[] expected = Poster(posterBase64); double difference = 0; int count = 0;
    for (int p = 0; p < actual.Length; p += 4) {
      if (actual[p + 3] <= 20 && expected[p + 3] <= 20) continue;
      for (int c = 0; c < 4; c++) difference += Math.Abs(actual[p + c] - expected[p + c]);
      count += 4;
    }
    evidence.Difference = count == 0 ? 0 : difference / count;
    evidence.FallbackMatch = count > 0 && evidence.Difference <= 8;
    return evidence;
  }
  public static string FileHash(string file) {
    using (var hash = SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(File.ReadAllBytes(file))).Replace("-", "").ToLowerInvariant();
  }
  static bool Finite(double value) { return !Double.IsNaN(value) && !Double.IsInfinity(value); }
  // -1 invalid, 0 no intersection, 1 partially clipped, 2 fully visible.
  public static int ViewportIntersection(double x, double y, double w, double h, double viewportW, double viewportH) {
    if (!Finite(x) || !Finite(y) || !Finite(w) || !Finite(h) || !Finite(viewportW) || !Finite(viewportH) || w <= 0 || h <= 0 || viewportW <= 0 || viewportH <= 0 || !Finite(x + w) || !Finite(y + h)) return -1;
    if (Math.Min(viewportW, x + w) <= Math.Max(0, x) || Math.Min(viewportH, y + h) <= Math.Max(0, y)) return 0;
    return x >= 0 && y >= 0 && x + w <= viewportW && y + h <= viewportH ? 2 : 1;
  }
  static byte[] Pixels(Bitmap bitmap) {
    var data = bitmap.LockBits(new Rectangle(0, 0, bitmap.Width, bitmap.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
    try {
      var values = new byte[bitmap.Width * bitmap.Height * 4];
      for (int y = 0; y < bitmap.Height; y++) Marshal.Copy(IntPtr.Add(data.Scan0, y * data.Stride), values, y * bitmap.Width * 4, bitmap.Width * 4);
      return values;
    } finally { bitmap.UnlockBits(data); }
  }
  public static bool SamePixels(string firstFile, string secondFile) {
    using (var first = new Bitmap(firstFile)) using (var second = new Bitmap(secondFile)) {
      if (first.Width != second.Width || first.Height != second.Height) return false;
      byte[] a = Pixels(first), b = Pixels(second);
      for (int i = 0; i < a.Length; i++) if (a[i] != b[i]) return false;
      return true;
    }
  }
  // Match the isolated non-fallback shape's opaque core in the final slide.
  // The unknown slide background is excluded; this also detects a stale slide
  // export even when an isolated shape export has already hydrated correctly.
  public static bool SlideMatchesNative(string file, string nativeFile, double x, double y, double w, double h) {
    byte[] expected, actual;
    using (var slideImage = Image.FromFile(file)) using (var nativeImage = Image.FromFile(nativeFile)) {
      int intersection = ViewportIntersection(x, y, w, h, slideImage.Width, slideImage.Height);
      // Wholly clipped models require a separate absence export, never an
      // affirmative result from an empty or invalid comparison rectangle.
      if (intersection <= 0) return false;
      double left = Math.Max(0, x), top = Math.Max(0, y);
      double visibleW = Math.Min(slideImage.Width, x + w) - left, visibleH = Math.Min(slideImage.Height, y + h) - top;
      expected = Signature(nativeImage, new RectangleF((float)((left - x) / w * nativeImage.Width), (float)((top - y) / h * nativeImage.Height), (float)(visibleW / w * nativeImage.Width), (float)(visibleH / h * nativeImage.Height)));
      actual = Signature(slideImage, new RectangleF((float)left, (float)top, (float)visibleW, (float)visibleH));
    }
    int count = 0, close = 0; double difference = 0;
    for (int py = 1; py < N - 1; py++) for (int px = 1; px < N - 1; px++) {
      int p = (py * N + px) * 4;
      if (expected[p + 3] < 250 || expected[p - 4 + 3] < 250 || expected[p + 4 + 3] < 250 || expected[p - N * 4 + 3] < 250 || expected[p + N * 4 + 3] < 250) continue;
      double d = 0; for (int c = 0; c < 3; c++) d += Math.Abs(actual[p + c] - expected[p + c]);
      d /= 3; count++; difference += d; if (d <= 14) close++;
    }
    // Too few opaque pixels is inconclusive, never affirmative native proof.
    return count >= 12 && difference / count <= 9 && (double)close / count >= 0.9;
  }
}
'@

function Get-Native3dPreviewShape($shapes, [int]$shapeId) {
  for ($shapeIndex = 1; $shapeIndex -le $shapes.Count; $shapeIndex++) {
    $shape = $shapes.Item($shapeIndex)
    if ([int]$shape.Id -eq $shapeId) { return $shape }
    if ([int]$shape.Type -eq 6) {
      $nested = Get-Native3dPreviewShape $shape.GroupItems $shapeId
      if ($null -ne $nested) { return $nested }
    }
  }
  return $null
}

function Export-Native3dReadySlide($slide, $requirement, $slideSize, [string]$file, [int]$width, [int]$height, [string]$outDir) {
  $targets = @($requirement.targets)
  if ($targets.Count -eq 0) {
    $slide.Export($file, 'PNG', $width, $height)
    return $null
  }
  $watch = [Diagnostics.Stopwatch]::StartNew()
  $attempts = 0
  $rejectedFallbackFrames = 0
  $stablePasses = 0
  $previousSignature = ''
  $lastReason = 'native content is not ready'
  $diagnostics = New-Object System.Collections.ArrayList
  $fullyClippedModelCount = 0
  $partiallyClippedModelCount = 0
  # Trigger model loading in this same presentation; do not reopen between retries.
  $slide.Export($file, 'PNG', $width, $height)
  $initialExportMs = $watch.ElapsedMilliseconds
  $watch.Restart()
  # Two verified passes are mandatory. A slow first export must not consume
  # the retry window before the worker can perform its confirming comparison.
  # The enclosing worker still enforces its overall execution timeout.
  while (($watch.ElapsedMilliseconds -lt 15000 -or $attempts -lt 2) -and $attempts -lt 30) {
    $attempts++
    if ($attempts -gt 1) { Start-Sleep -Milliseconds 400 }
    $ready = $true
    $hashes = New-Object System.Collections.ArrayList
    foreach ($target in $targets) {
      try {
        $shape = Get-Native3dPreviewShape $slide.Shapes ([int]$target.shapeId)
        if ($null -eq $shape) { throw 'native shape was not found' }
        $probeFile = Join-Path $outDir ("native3d_probe_{0}_{1}.png" -f $slide.SlideIndex, $target.shapeId)
        $shape.Export($probeFile, 2, $width, $height, 1)
        $measurement = [BetterPptxNativeRaster]::Inspect($probeFile, [string]$target.posterBase64)
        if (-not $measurement.Informative -or $measurement.FallbackMatch) {
          $ready = $false
          $lastReason = 'native content is blank or still matches the compatibility preview'
          if ($measurement.FallbackMatch) { $rejectedFallbackFrames++ }
        }
        [void]$hashes.Add($measurement.Hash)
      } catch {
        $ready = $false
        $lastReason = 'native content could not yet be exported'
      }
    }
    $slide.Export($file, 'PNG', $width, $height)
    $fullyClippedModelCount = 0
    $partiallyClippedModelCount = 0
    foreach ($target in $targets) {
      $frame = $target.frameEmu
      $probeFile = Join-Path $outDir ("native3d_probe_{0}_{1}.png" -f $slide.SlideIndex, $target.shapeId)
      $matches = $false
      $intersection = [BetterPptxNativeRaster]::ViewportIntersection([double]$frame.x, [double]$frame.y, [double]$frame.w, [double]$frame.h, [double]$slideSize.w, [double]$slideSize.h)
      $shape = Get-Native3dPreviewShape $slide.Shapes ([int]$target.shapeId)
      $frameMatches = $null -ne $shape
      if ($frameMatches) {
        $actual = @([double]$shape.Left, [double]$shape.Top, [double]$shape.Width, [double]$shape.Height)
        $expected = @([double]$frame.x, [double]$frame.y, [double]$frame.w, [double]$frame.h)
        if ($actual[2] -le 0 -or $actual[3] -le 0) { $frameMatches = $false }
        for ($i = 0; $i -lt 4; $i++) {
          if ([double]::IsNaN($actual[$i]) -or [double]::IsInfinity($actual[$i]) -or [Math]::Abs($actual[$i] * 12700 - $expected[$i]) -gt 128) { $frameMatches = $false }
        }
      }
      if ($frameMatches -and $intersection -ge 0 -and (Test-Path -LiteralPath $probeFile)) {
        if ($intersection -eq 0) {
          $fullyClippedModelCount++
          # Independently prove that this exact COM shape contributes no pixels.
          # The read-only source is never saved, and visibility is always restored.
          $absenceFile = Join-Path $outDir ("native3d_absence_{0}_{1}.png" -f $slide.SlideIndex, $target.shapeId)
          $originalVisibility = $shape.Visible
          try {
            $shape.Visible = 0
            $slide.Export($absenceFile, 'PNG', $width, $height)
            $matches = [BetterPptxNativeRaster]::SamePixels($file, $absenceFile)
          } finally { $shape.Visible = $originalVisibility }
        } else {
          if ($intersection -eq 1) { $partiallyClippedModelCount++ }
          $matches = [BetterPptxNativeRaster]::SlideMatchesNative($file, $probeFile,
            [double]$frame.x / [double]$slideSize.w * $width, [double]$frame.y / [double]$slideSize.h * $height,
            [double]$frame.w / [double]$slideSize.w * $width, [double]$frame.h / [double]$slideSize.h * $height)
        }
      }
      if (-not $matches) {
        $ready = $false
        $lastReason = 'the slide does not yet match its isolated native content'
      }
    }
    [void]$hashes.Add([BetterPptxNativeRaster]::FileHash($file))
    $signature = [string]::Join(':', [string[]]$hashes)
    if ($ready -and $signature -eq $previousSignature) { $stablePasses++ }
    elseif ($ready) { $stablePasses = 1 }
    else { $stablePasses = 0 }
    $previousSignature = $signature
    if ($ready -and $stablePasses -lt 2) { $lastReason = 'native render has not produced two identical verified passes' }
    [void]$diagnostics.Add([ordered]@{ attempt=$attempts; elapsedMs=$watch.ElapsedMilliseconds; ready=$ready; stablePasses=$stablePasses; signature=$signature; fullyClippedModelCount=$fullyClippedModelCount; partiallyClippedModelCount=$partiallyClippedModelCount; lastReason=$lastReason })
    [IO.File]::WriteAllText((Join-Path $outDir ("native3d_readiness_{0}.json" -f $slide.SlideIndex)), ([ordered]@{ initialExportMs=$initialExportMs; passes=@($diagnostics) } | ConvertTo-Json -Depth 8))
    if ($stablePasses -ge 2) {
      return [pscustomobject]@{
        schemaVersion = 'betterpptx.native3d-preview-readiness.v1'
        status = 'verified'
        modelCount = $targets.Count
        verifiedModelCount = $targets.Count
        stablePasses = $stablePasses
        fallbackGuard = 'checked'
        slideContentMatch = 'verified'
        viewportFrameMatch = 'verified'
        fullyClippedModelCount = $fullyClippedModelCount
        partiallyClippedModelCount = $partiallyClippedModelCount
        clippedAbsenceCheck = $(if ($fullyClippedModelCount -gt 0) { 'pixel-identical-with-target-hidden' } else { 'not-needed' })
        attempts = $attempts
        rejectedFallbackFrames = $rejectedFallbackFrames
        elapsedMs = $initialExportMs + $watch.ElapsedMilliseconds
      }
    }
  }
  throw ("POWERPOINT_PREVIEW_3D_NOT_READY: Slide {0}: {1}. No preview approval was recorded." -f $slide.SlideIndex, $lastReason)
}
`
