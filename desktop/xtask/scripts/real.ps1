# Starts the replay exe against the real CLI once and says what it saw, one line each:
#
#   CONSOLES <n>             console windows shown before the exe starts
#   READY <line;line>        the ready file's slot lines, once every slot settled (NOT READY if not)
#   KIDS <n>                 the exe's descendants remembered once ready
#   MARKED wsl=<n>           WSL processes carrying CLOSTA_SMOKE_MARK=<Mark> once ready
#   SHOT <png> | SHOT HELD <why>          (Close) the window, by PrintWindow
#   HOLD <pid> | NO HOLD                  (Hold) the fake MCP server's hold-<pid> within 20 s
#   HOLD ALIVE yes|no|unknown             (Hold) whether that pid lived just before the close
#   GONE <ms> | NOT GONE     from the ready file's `closing <unix ms>` until the window went
#   CONSOLES MAX <n>         the most console windows seen, sampled every 200 ms
#   LEFT windows=<n>         the exe's descendants still running after the window went
#   LEFT wsl=<n>             marked WSL processes still running after it
#   HOLD LEFT yes|no|unknown              (Hold) whether that pid still lives
#
# Close mode waits for the exe's own timed close; Hold mode closes the window as its close
# button would. What is left gets until ten seconds after the close began to go before it is
# counted.
#
# Only what this run started is counted and stopped: the exe's descendants, found by
# ParentProcessId once it is ready, and the WSL processes with this run's mark. Nothing is
# matched by the name of the CLI or of WSL, so the user's own sessions are never touched. No
# path but the picture's, no env and nothing the CLI said is printed.
param(
  [Parameter(Mandatory)] [ValidateSet('Close', 'Hold')] [string]$Mode,
  [Parameter(Mandatory)] [string]$Exe,
  [string[]]$ArgList = @(),
  [Parameter(Mandatory)] [string]$ReadyFile,
  [Parameter(Mandatory)] [string]$Distro,
  [Parameter(Mandatory)] [string]$Mark,
  [string]$Shot = '',
  [string]$HoldDir = '',
  [int]$ReadySec = 90,
  [int]$GoneSec = 15,
  [int]$SettleMs = 1000
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public class RealWindow {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  public struct RECT { public int L, T, R, B; }
  public static string ClassOf(IntPtr h) { var s = new StringBuilder(256); GetClassName(h, s, 256); return s.ToString(); }
  // A console window: the classic host's, or Windows Terminal's when it is the default terminal.
  static bool IsConsole(string c) { return c == "ConsoleWindowClass" || c == "CASCADIA_HOSTING_WINDOW_CLASS"; }
  public static int Consoles() {
    int n = 0;
    EnumWindows((h, l) => { if (IsWindowVisible(h) && IsConsole(ClassOf(h))) { n++; } return true; }, IntPtr.Zero);
    return n;
  }
  public static IntPtr Of(uint pid) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p == pid && IsWindowVisible(h) && !IsConsole(ClassOf(h))) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@
# Physical pixels, so the window's rectangle and the picture agree.
[RealWindow]::SetProcessDPIAware() | Out-Null

# Start-Process joins an array with bare spaces, so an argument with a space is quoted here.
function Quote([string]$arg) {
  if ($arg -match '[\s"]') { return '"' + ($arg -replace '"', '\"') + '"' }
  return $arg
}

# Straight to stdout, so a line said inside a function is not taken as its value.
function Say([string]$line) { [Console]::Out.WriteLine($line) }

function Now-Ms { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }

$script:consoleMax = 0
# Every wait goes through here, so the console windows are counted every 200 ms.
function Wait-Tick([int]$ms = 200) {
  $end = (Now-Ms) + $ms
  do {
    Start-Sleep -Milliseconds 200
    $n = [RealWindow]::Consoles()
    if ($n -gt $script:consoleMax) { $script:consoleMax = $n }
  } while ((Now-Ms) -lt $end)
}

function Ready-Lines {
  if (-not (Test-Path -LiteralPath $ReadyFile)) { return @() }
  try { return @(Get-Content -LiteralPath $ReadyFile -ErrorAction Stop | Where-Object { $_ -ne '' }) } catch { return @() }
}

function Closing-Ms {
  foreach ($line in Ready-Lines) {
    if ($line -match '^closing (\d+)$') { return [int64]$Matches[1] }
  }
  return $null
}

# The exe's descendants now, by ParentProcessId, as pid -> creation time. A process older than
# the exe only reuses a parent's pid and is no descendant.
function Descendants([uint32]$root, [datetime]$since) {
  $all = @(Get-CimInstance Win32_Process)
  $found = @{}
  $queue = New-Object System.Collections.Queue
  $queue.Enqueue($root)
  while ($queue.Count -gt 0) {
    $parent = $queue.Dequeue()
    foreach ($candidate in $all) {
      if ($candidate.ParentProcessId -eq $parent -and -not $found.ContainsKey($candidate.ProcessId) -and $candidate.CreationDate -ge $since) {
        $found[$candidate.ProcessId] = $candidate.CreationDate
        $queue.Enqueue($candidate.ProcessId)
      }
    }
  }
  return $found
}

# Whether a remembered descendant still runs: the same pid, started at the same time.
function Still-Running($id, [datetime]$created) {
  $running = Get-Process -Id $id -ErrorAction SilentlyContinue
  if ($null -eq $running) { return $false }
  try { return [Math]::Abs(($running.StartTime - $created).TotalSeconds) -lt 2 } catch { return $true }
}

function Count-Left($kids) {
  $n = 0
  foreach ($id in @($kids.Keys)) { if (Still-Running $id $kids[$id]) { $n++ } }
  return $n
}

# The WSL processes whose environment carries this run's mark; -1 when they could not be counted.
function Count-Marked {
  $out = & wsl.exe -d $Distro -- sh -c "grep -al 'CLOSTA_SMOKE_MARK=$Mark' /proc/[0-9]*/environ 2>/dev/null | wc -l"
  $n = 0
  if ($LASTEXITCODE -eq 0 -and [int]::TryParse((@($out) -join '').Trim(), [ref]$n)) { return $n }
  return -1
}

function Shown([int]$n) { if ($n -lt 0) { return 'unknown' } return "$n" }

# 'yes' or 'no' by what the shell said; 'unknown' when WSL said neither (it failed to run).
function Hold-Alive([int]$id) {
  $out = & wsl.exe -d $Distro -- sh -c "kill -0 $id 2>/dev/null && echo yes || echo no"
  $said = (@($out) -join '').Trim()
  if ($said -eq 'yes' -or $said -eq 'no') { return $said }
  return 'unknown'
}

# The window by PrintWindow: what it draws itself, whatever lies on top of it.
function Take-Shot($app) {
  if (Get-Process -Name LogonUI -ErrorAction SilentlyContinue) { return 'SHOT HELD locked' }
  # The ready file is written before the frame that shows it; let a few frames go by.
  Wait-Tick $SettleMs
  if ($app.HasExited) { return 'SHOT HELD no window' }
  $window = [RealWindow]::Of([uint32]$app.Id)
  if ($window -eq [IntPtr]::Zero) { return 'SHOT HELD no window' }
  $rect = New-Object RealWindow+RECT
  [RealWindow]::GetWindowRect($window, [ref]$rect) | Out-Null
  $w = $rect.R - $rect.L; $h = $rect.B - $rect.T
  if ($w -le 0 -or $h -le 0) { return 'SHOT HELD no window' }
  $bitmap = New-Object System.Drawing.Bitmap $w, $h
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $hdc = $graphics.GetHdc()
    # 2 is PW_RENDERFULLCONTENT: the window draws itself into the bitmap, whatever covers it.
    $printed = [RealWindow]::PrintWindow($window, $hdc, 2)
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
    if (-not $printed -or $blank) { return 'SHOT HELD blank' }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Shot) | Out-Null
    $bitmap.Save($Shot, [System.Drawing.Imaging.ImageFormat]::Png)
    return "SHOT $Shot"
  } finally {
    $bitmap.Dispose()
  }
}

Remove-Item -LiteralPath $ReadyFile -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "$ReadyFile.tmp" -ErrorAction SilentlyContinue
if ($Shot) { Remove-Item -LiteralPath $Shot -ErrorAction SilentlyContinue }

$before = [RealWindow]::Consoles()
$script:consoleMax = $before
Say "CONSOLES $before"

$line = (@($ArgList) | ForEach-Object { Quote $_ }) -join ' '
$process = $null
$since = $null
$kids = @{}
$holdPid = $null
try {
  $process = Start-Process -FilePath $Exe -ArgumentList $line -PassThru
  # Taken now, so the process can be read after it ended.
  $null = $process.Handle
  $since = $process.StartTime.AddSeconds(-1)

  $slots = @()
  $deadline = (Now-Ms) + $ReadySec * 1000
  while (-not $process.HasExited -and (Now-Ms) -lt $deadline) {
    $slots = @(Ready-Lines | Where-Object { $_ -match '^(Running|Failed) ' })
    if ($slots.Count -gt 0) { break }
    Wait-Tick
  }
  if ($slots.Count -gt 0) {
    Say ('READY ' + ($slots -join ';'))
    $kids = Descendants ([uint32]$process.Id) $since
    Say "KIDS $($kids.Count)"
    Say ('MARKED wsl=' + (Shown (Count-Marked)))
  } else {
    Say 'NOT READY'
  }

  if ($Mode -eq 'Close' -and $Shot) {
    if ($slots.Count -gt 0) { Say (Take-Shot $process) } else { Say 'SHOT HELD not ready' }
  }

  if ($Mode -eq 'Hold') {
    if ($slots.Count -gt 0 -and $HoldDir) {
      $deadline = (Now-Ms) + 20000
      while ($null -eq $holdPid -and (Now-Ms) -lt $deadline) {
        $file = Get-ChildItem -LiteralPath $HoldDir -Filter 'hold-*' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($file -and $file.Name -match '^hold-(\d+)$') { $holdPid = [int]$Matches[1] } else { Wait-Tick }
      }
    }
    if ($null -ne $holdPid) {
      Say "HOLD $holdPid"
      Say ('HOLD ALIVE ' + (Hold-Alive $holdPid))
    } else {
      Say 'NO HOLD'
    }
    # As the close button would: WM_CLOSE to the window.
    if (-not $process.HasExited -and -not $process.CloseMainWindow()) {
      $window = [RealWindow]::Of([uint32]$process.Id)
      if ($window -ne [IntPtr]::Zero) { [RealWindow]::PostMessage($window, 0x10, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null }
    }
  }

  # The wait is timed from the close's `closing` line once it comes, and from here until then.
  $closing = $null
  $goneAt = $null
  $deadline = (Now-Ms) + $GoneSec * 1000
  while ((Now-Ms) -lt $deadline) {
    if ($null -eq $closing) {
      $closing = Closing-Ms
      if ($null -ne $closing) { $deadline = $closing + $GoneSec * 1000 }
    }
    if ($process.HasExited -or [RealWindow]::Of([uint32]$process.Id) -eq [IntPtr]::Zero) { $goneAt = Now-Ms; break }
    Wait-Tick
  }
  if ($null -eq $closing) { $closing = Closing-Ms }
  if ($null -ne $goneAt -and $null -ne $closing) {
    Say "GONE $([Math]::Max(0, $goneAt - $closing))"
  } else {
    Say 'NOT GONE'
    if (-not $process.HasExited) { try { $process.Kill() } catch { } }
  }
  Say "CONSOLES MAX $($script:consoleMax)"

  # What was left gets until ten seconds after the close began to go.
  $limit = if ($null -ne $closing) { $closing + 10000 } else { Now-Ms }
  do {
    $leftWindows = Count-Left $kids
    $leftWsl = Count-Marked
    $holdLeft = if ($null -ne $holdPid) { Hold-Alive $holdPid } else { 'no' }
    if ($leftWindows -eq 0 -and $leftWsl -eq 0 -and $holdLeft -eq 'no') { break }
    Wait-Tick 500
  } while ((Now-Ms) -lt $limit)
  Say "LEFT windows=$leftWindows"
  Say ('LEFT wsl=' + (Shown $leftWsl))
  if ($null -ne $holdPid) { Say ('HOLD LEFT ' + $holdLeft) }
} finally {
  # Whatever ended the run, nothing it started is left behind: the exe it started, the
  # descendants it remembered, the hold and the marked WSL processes. Nothing is stopped by its
  # name, so the user's own processes stay. Each step may fail without cutting the rest short.
  if ($null -ne $process -and $null -ne $since -and $kids.Count -eq 0) {
    # A run that never got ready remembered none yet.
    try { $kids = Descendants ([uint32]$process.Id) $since } catch { }
  }
  if ($null -ne $process -and -not $process.HasExited) { try { $process.Kill() } catch { } }
  foreach ($id in @($kids.Keys)) {
    try {
      if (Still-Running $id $kids[$id]) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
    } catch { }
  }
  if ($null -ne $holdPid) {
    try { & wsl.exe -d $Distro -- sh -c "kill -9 $holdPid 2>/dev/null" | Out-Null } catch { }
  }
  try {
    & wsl.exe -d $Distro -- sh -c "grep -al 'CLOSTA_SMOKE_MARK=$Mark' /proc/[0-9]*/environ 2>/dev/null | cut -d/ -f3 | xargs -r kill -9 2>/dev/null" | Out-Null
  } catch { }
  Remove-Item -LiteralPath $ReadyFile -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath "$ReadyFile.tmp" -ErrorAction SilentlyContinue
}
exit 0
