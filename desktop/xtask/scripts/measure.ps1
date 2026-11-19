# Runs the measuring exe once and waits for it to end. The exe writes its own CSV (--perf-log)
# and quits after the replay; this only starts it, brings its window to the front, checks the
# window is not minimized, and kills a run that does not end.
#
# Exit codes: the exe's own when it ended; 3 when it did not end within -TimeoutSec and was
# killed; 4 when no window came up or the window was minimized (nothing drawn can be measured).
param(
  [Parameter(Mandatory)] [string]$Exe,
  [string[]]$ArgList = @(),
  [Parameter(Mandatory)] [string]$Csv,
  [int]$TimeoutSec = 200
)
$ErrorActionPreference = 'Stop'
Add-Type @"
using System; using System.Collections.Generic; using System.Runtime.InteropServices;
public class MeasureWindow {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  public static IntPtr Of(uint pid) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p == pid && IsWindowVisible(h)) { found = h; return false; } return true; }, IntPtr.Zero);
    return found;
  }
}
"@

# Start-Process joins an array with bare spaces, so an argument with a space is quoted here.
function Quote([string]$arg) {
  if ($arg -match '[\s"]') { return '"' + ($arg -replace '"', '\"') + '"' }
  return $arg
}

$name = [IO.Path]::GetFileNameWithoutExtension($Exe)
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Csv) | Out-Null
Remove-Item -LiteralPath $Csv -ErrorAction SilentlyContinue
$line = (@($ArgList) + @('--perf-log', $Csv) | ForEach-Object { Quote $_ }) -join ' '
$code = 0
try {
  $process = Start-Process -FilePath $Exe -ArgumentList $line -PassThru
  # Taken now, so the exit code can be read after the process ended.
  $null = $process.Handle
  $window = [IntPtr]::Zero
  $deadline = (Get-Date).AddSeconds(30)
  while ($window -eq [IntPtr]::Zero -and -not $process.HasExited -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 200
    $window = [MeasureWindow]::Of([uint32]$process.Id)
  }
  if ($window -eq [IntPtr]::Zero) {
    Write-Output 'held: no window came up'
    $code = 4
  } else {
    [MeasureWindow]::SetForegroundWindow($window) | Out-Null
    Start-Sleep -Milliseconds 300
    if ([MeasureWindow]::IsIconic($window)) {
      Write-Output 'held: the window is minimized'
      $code = 4
    } elseif (-not $process.WaitForExit($TimeoutSec * 1000)) {
      $process.Kill()
      Write-Output "held: the run did not end within $TimeoutSec s and was killed"
      # PowerShell runs the finally block on exit too.
      exit 3
    } else {
      $code = $process.ExitCode
    }
  }
} finally {
  # Whatever ended the run, no process of the exe is left behind.
  Get-Process -Name $name -ErrorAction SilentlyContinue | Stop-Process -Force
}
exit $code
