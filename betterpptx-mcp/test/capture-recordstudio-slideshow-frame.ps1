param(
  [Parameter(Mandatory = $true)][string]$Pptx,
  [Parameter(Mandatory = $true)][string]$OutputPng,
  [Parameter(Mandatory = $false)][int]$DelayMs = 650,
  [Parameter(Mandatory = $false)][ValidateSet('Screen', 'PrintWindow')][string]$CaptureMode = 'Screen'
)
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class BetterPptxWindowCapture {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);

  public static bool ForceForeground(IntPtr hWnd) {
    IntPtr foreground = GetForegroundWindow();
    uint ignored;
    uint foregroundThread = foreground == IntPtr.Zero ? 0 : GetWindowThreadProcessId(foreground, out ignored);
    uint currentThread = GetCurrentThreadId();
    bool attached = foregroundThread != 0 && foregroundThread != currentThread && AttachThreadInput(currentThread, foregroundThread, true);
    try {
      ShowWindow(hWnd, 9); // SW_RESTORE
      BringWindowToTop(hWnd);
      SetForegroundWindow(hWnd);
      return GetForegroundWindow() == hWnd;
    } finally {
      if (attached) AttachThreadInput(currentThread, foregroundThread, false);
    }
  }
}
"@

function Wait-RunningShowView($Show) {
  for ($i = 0; $i -lt 40; $i++) {
    try {
      $candidate = $Show.View
      if ($candidate -and [int]$candidate.State -eq 1 -and [int]$candidate.CurrentShowPosition -ge 1) { return $candidate }
    } catch { }
    Start-Sleep -Milliseconds 250
  }
  throw 'PowerPoint slideshow did not expose a running view before capture timeout.'
}

$pptxPath = [IO.Path]::GetFullPath($Pptx)
$pngPath = [IO.Path]::GetFullPath($OutputPng)
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($pngPath)) | Out-Null
$pp = $null
$presentation = $null
$show = $null
$baselinePowerPointPids = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | ForEach-Object { [int]$_.Id })
try {
  $pp = New-Object -ComObject PowerPoint.Application
  $pp.Visible = -1
  $presentation = $pp.Presentations.Open($pptxPath, $true, $false, $true)
  $ownedProcesses = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | Where-Object { $baselinePowerPointPids -notcontains [int]$_.Id })
  if ($ownedProcesses.Count -ne 1) {
    throw "Expected one isolated PowerPoint process, found $($ownedProcesses.Count). Existing or concurrent PowerPoint work was left untouched."
  }
  [uint32]$powerPointPid = [uint32]$ownedProcesses[0].Id
  $show = $presentation.SlideShowSettings.Run()
  $view = Wait-RunningShowView $show
  Start-Sleep -Milliseconds ([math]::Max(0, $DelayMs))
  $presentationTitle = [IO.Path]::GetFileName($pptxPath)
  $slideShowProcess = $null
  for ($attempt = 0; $attempt -lt 20 -and -not $slideShowProcess; $attempt++) {
    $slideShowProcess = Get-Process -Id $powerPointPid -ErrorAction SilentlyContinue |
      Where-Object { $_.MainWindowTitle -like '*Slide Show*' -and $_.MainWindowTitle -like "*$presentationTitle*" -and $_.MainWindowHandle -ne 0 }
    if (-not $slideShowProcess) { Start-Sleep -Milliseconds 100 }
  }
  if (-not $slideShowProcess) {
    throw "Could not resolve a slideshow window owned by PowerPoint PID $powerPointPid for $presentationTitle."
  }
  $window = [IntPtr]$slideShowProcess.MainWindowHandle
  if ($window -eq [IntPtr]::Zero) { throw 'PowerPoint slideshow window is not foregroundable.' }
  # PrintWindow is deliberately independent of the shared desktop focus. This
  # is the deterministic capture path for a host that may have other work in
  # progress. Screen capture still requires foreground ownership because it
  # samples actual desktop pixels and must never capture another application.
  if ($CaptureMode -eq 'Screen') {
    [BetterPptxWindowCapture]::ForceForeground($window) | Out-Null
    for ($attempt = 0; $attempt -lt 10 -and [BetterPptxWindowCapture]::GetForegroundWindow() -ne $window; $attempt++) {
      Start-Sleep -Milliseconds 100
      [BetterPptxWindowCapture]::ForceForeground($window) | Out-Null
    }
    if ([BetterPptxWindowCapture]::GetForegroundWindow() -ne $window) {
      throw "PowerPoint slideshow window for PID $powerPointPid lost foreground ownership before capture."
    }
  }
  Start-Sleep -Milliseconds 150
  $rect = New-Object BetterPptxWindowCapture+RECT
  if (-not [BetterPptxWindowCapture]::GetWindowRect($window, [ref]$rect)) { throw 'Could not resolve the PowerPoint slideshow window rectangle.' }
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -le 0 -or $height -le 0) { throw "Invalid slideshow window size ${width}x${height}." }
  $bitmap = New-Object System.Drawing.Bitmap($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  if ($CaptureMode -eq 'PrintWindow') {
    $windowHdc = $graphics.GetHdc()
    $printed = [BetterPptxWindowCapture]::PrintWindow($window, $windowHdc, 2)
    $graphics.ReleaseHdc($windowHdc)
    if (-not $printed) { throw 'PrintWindow failed for the PID-bound PowerPoint slideshow window.' }
  } else {
    if ([BetterPptxWindowCapture]::GetForegroundWindow() -ne $window) {
      throw "PowerPoint slideshow window for PID $powerPointPid lost foreground ownership during capture."
    }
    $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
  }
  $bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
  [ordered]@{ ok = $true; png = $pngPath; width = $width; height = $height; slidePosition = [int]$view.CurrentShowPosition; captureMode = $CaptureMode; powerPointPid = [int]$powerPointPid } | ConvertTo-Json -Compress
}
finally {
  if ($show) { try { $show.View.Exit() } catch {} }
  if ($presentation) { try { $presentation.Close() } catch {} }
  if ($pp) { try { $pp.Quit() } catch {} }
}
