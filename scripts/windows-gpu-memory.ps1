param([Parameter(Mandatory=$true)][int]$RootProcessId, [Parameter(Mandatory=$true)][string]$OutputFile)
$ErrorActionPreference = 'Stop'
$clock = [Diagnostics.Stopwatch]::StartNew()
$rows = [Collections.Generic.List[object]]::new()
$encoding = [Text.UTF8Encoding]::new($false)
try {
  while ($clock.Elapsed.TotalMinutes -lt 40 -and !(Test-Path -LiteralPath ($OutputFile + '.stop'))) {
    $processes = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name)
    $owned = [Collections.Generic.HashSet[int]]::new()
    [void]$owned.Add($RootProcessId)
    do {
      $added = $false
      foreach ($process in $processes) {
        if ($owned.Contains([int]$process.ParentProcessId) -and $owned.Add([int]$process.ProcessId)) { $added = $true }
      }
    } while ($added)
    $browserIds = @($processes | Where-Object { $owned.Contains([int]$_.ProcessId) -and $_.Name -match '^(chrome|msedge|firefox|chrome-headless-shell)\.exe$' } | ForEach-Object { [int]$_.ProcessId })
    $counters = @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory | Where-Object {
      $_.Name -match '^pid_(\d+)_' -and $browserIds -contains [int]$Matches[1]
    })
    if ($counters.Count -gt 0) {
      $dedicated = [long](($counters | Measure-Object DedicatedUsage -Sum).Sum)
      $shared = [long](($counters | Measure-Object SharedUsage -Sum).Sum)
      $committed = [long](($counters | Measure-Object TotalCommitted -Sum).Sum)
      $rows.Add(@{ elapsedMs=[math]::Round($clock.Elapsed.TotalMilliseconds); dedicatedBytes=$dedicated; sharedBytes=$shared; residentAllocationBytes=($dedicated+$shared); committedBytes=$committed })
    }
    $report = @{ status= $(if ($rows.Count) {'MEASURED'} else {'NOT_VERIFIED'}); method='Windows WDDM per-process GPU memory counters, summed only for browser descendants of the benchmark process. Includes browser allocation overhead; not app-only texture bytes or a physical VRAM census.'; samples=$rows.ToArray() }
    [IO.File]::WriteAllText($OutputFile, ($report | ConvertTo-Json -Depth 5), $encoding)
    Start-Sleep -Seconds 1
  }
} catch {
  [IO.File]::WriteAllText($OutputFile, (@{status='NOT_VERIFIED'; errorType=$_.Exception.GetType().Name; samples=$rows.ToArray()} | ConvertTo-Json -Depth 5), $encoding)
  exit 1
}
