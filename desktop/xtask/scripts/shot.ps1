# Starts the replay exe at one window size, waits for its ready file, and takes a picture of its
# window with PrintWindow. Only PrintWindow is used: copying the screen would take whatever window
# lies on top when the exe's window is not in front.
#
# Prints one outcome line and ends with its code: `class=… title=… size=…` and 0 when the picture
# was saved; `NO GUI WINDOW` and 1 when the exe showed no window; `BLANK` and 4 when every sampled
# pixel had one colour (nothing was saved); `NOT READY` and 5 when no ready file came within
# -TimeoutSec; `TOO BIG` and 6 when the window cannot fit the screen's work area (the exe is not
# started). Whatever happened, no process of the exe is left behind.
param(
  [Parameter(Mandatory)] [string]$Exe,
  [string[]]$ArgList = @(),
  [Parameter(Mandatory)] [int]$Width,
  [Parameter(Mandatory)] [int]$Height,
  [Parameter(Mandatory)] [string]$ReadyFile,
  [Parameter(Mandatory)] [string]$Out,
  [int]$TimeoutSec = 60,
  [int]$SettleMs = 1500
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public class ShotWindow {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern uint GetDpiForSystem();
  [DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint action, uint param, out RECT r, uint flags);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  public struct RECT { public int L, T, R, B; }
  public static string ClassOf(IntPtr h) { var s = new StringBuilder(256); GetClassName(h, s, 256); return s.ToString(); }
  public static string TitleOf(IntPtr h) { var s = new StringBuilder(256); GetWindowText(h, s, 256); return s.ToString(); }
  public static IntPtr Of(uint pid) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p == pid && IsWindowVisible(h) && ClassOf(h) != "ConsoleWindowClass") { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@
# Physical pixels from here on, so the window and the screen are measured alike.
[ShotWindow]::SetProcessDPIAware() | Out-Null

# Start-Process joins an array with bare spaces, so an argument with a space is quoted here.
function Quote([string]$arg) {
  if ($arg -match '[\s"]') { return '"' + ($arg -replace '"', '\"') + '"' }
  return $arg
}

$name = [IO.Path]::GetFileNameWithoutExtension($Exe)
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Out) | Out-Null
Remove-Item -LiteralPath $ReadyFile -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $Out -ErrorAction SilentlyContinue

# The window's size is logical; the system scale turns it into pixels.
$scale = [ShotWindow]::GetDpiForSystem() / 96.0
$area = New-Object ShotWindow+RECT
[ShotWindow]::SystemParametersInfo(0x30, 0, [ref]$area, 0) | Out-Null
$needW = [int][Math]::Ceiling($Width * $scale); $needH = [int][Math]::Ceiling($Height * $scale)
$areaW = $area.R - $area.L; $areaH = $area.B - $area.T
if ($needW -gt $areaW -or $needH -gt $areaH) {
  Write-Output "TOO BIG (${needW}x${needH} > ${areaW}x${areaH})"
  exit 6
}

$line = (@($ArgList) + @('--window', "${Width}x${Height}", '--ready-file', $ReadyFile) | ForEach-Object { Quote $_ }) -join ' '
$code = 0
$process = $null
try {
  $process = Start-Process -FilePath $Exe -ArgumentList $line -PassThru
  # Taken now, so the exit code can be read after the process ended.
  $null = $process.Handle
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while (-not (Test-Path -LiteralPath $ReadyFile) -and -not $process.HasExited -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 200
  }
  $window = [IntPtr]::Zero
  if (-not $process.HasExited) { $window = [ShotWindow]::Of([uint32]$process.Id) }
  if ($process.HasExited -or $window -eq [IntPtr]::Zero) {
    $why = if ($process.HasExited) { "exited with $($process.ExitCode)" } else { 'still running' }
    Write-Output "NO GUI WINDOW ($why)"
    $code = 1
  } elseif (-not (Test-Path -LiteralPath $ReadyFile)) {
    Write-Output "NOT READY after $TimeoutSec s"
    $code = 5
  } else {
    [ShotWindow]::SetForegroundWindow($window) | Out-Null
    # The ready file is written before the frame that shows it; let a few frames go by.
    Start-Sleep -Milliseconds $SettleMs
    $rect = New-Object ShotWindow+RECT
    [ShotWindow]::GetWindowRect($window, [ref]$rect) | Out-Null
    $w = $rect.R - $rect.L; $h = $rect.B - $rect.T
    $bitmap = New-Object System.Drawing.Bitmap $w, $h
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $hdc = $graphics.GetHdc()
    # 2 is PW_RENDERFULLCONTENT: the window draws itself into the bitmap, whatever covers it.
    $printed = [ShotWindow]::PrintWindow($window, $hdc, 2)
    $graphics.ReleaseHdc($hdc)
    $graphics.Dispose()
    $first = $bitmap.GetPixel(0, 0).ToArgb()
    $blank = $true
    for ($y = 0; $y -lt 24 -and $blank; $y++) {
      for ($x = 0; $x -lt 24 -and $blank; $x++) {
        $px = [int](($w - 1) * ($x + 0.5) / 24); $py = [int](($h - 1) * ($y + 0.5) / 24)
        if ($bitmap.GetPixel($px, $py).ToArgb() -ne $first) { $blank = $false }
      }
    }
    if (-not $printed -or $blank) {
      Write-Output ('BLANK (printed={0} colour=#{1:X8})' -f $printed, $first)
      $code = 4
    } else {
      $bitmap.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
      Write-Output "class=$([ShotWindow]::ClassOf($window)) title=$([ShotWindow]::TitleOf($window)) size=${w}x${h}"
    }
    $bitmap.Dispose()
  }
} finally {
  if ($null -ne $process -and -not $process.HasExited) {
    try { $process.Kill() } catch { }
  }
  Remove-Item -LiteralPath $ReadyFile -ErrorAction SilentlyContinue
  # Whatever ended the shot, no process of the exe is left behind.
  Get-Process -Name $name -ErrorAction SilentlyContinue | Stop-Process -Force
}
exit $code
