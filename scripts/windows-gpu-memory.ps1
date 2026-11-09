param(
  [Parameter(Mandatory = $true)][ValidateSet('baseline', 'sample')][string]$Mode,
  [Parameter(Mandatory = $true)][string]$OutputFile,
  [int]$RootProcessId = 0,
  [string]$BaselineFile = ''
)
$ErrorActionPreference = 'Stop'
$MiB = 1048576
$MaxMinutes = 40
$encoding = [Text.UTF8Encoding]::new($false)
$nvidiaSmi = Join-Path $env:SystemRoot 'System32\nvidia-smi.exe'
$adapterClass = 'Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory'
$processClass = 'Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory'

function Get-NvidiaMemory {
  if (-not (Test-Path -LiteralPath $nvidiaSmi)) {
    return [pscustomobject]@{ available = $false; usedMiB = $null; totalMiB = $null; error = 'NVIDIA_SMI_NOT_FOUND' }
  }
  try {
    $raw = & $nvidiaSmi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits 2>$null
    $line = @($raw)[0]
    if (-not $line) {
      return [pscustomobject]@{ available = $false; usedMiB = $null; totalMiB = $null; error = 'NVIDIA_SMI_EMPTY' }
    }
    $parts = @($line -split ',' | ForEach-Object { $_.Trim() })
    if ($parts.Count -lt 2) {
      return [pscustomobject]@{ available = $false; usedMiB = $null; totalMiB = $null; error = 'NVIDIA_SMI_UNPARSEABLE' }
    }
    return [pscustomobject]@{ available = $true; usedMiB = [long]$parts[0]; totalMiB = [long]$parts[1]; error = $null }
  } catch {
    return [pscustomobject]@{ available = $false; usedMiB = $null; totalMiB = $null; error = $_.Exception.GetType().Name }
  }
}

function Get-AdapterMemory {
  try {
    $counters = @(Get-CimInstance $adapterClass -ErrorAction Stop)
    if ($counters.Count -eq 0) {
      return [pscustomobject]@{ available = $false; error = 'NO_ADAPTER_INSTANCES'; dedicatedBytes = $null; totalDedicatedBytes = $null; committedBytes = $null; instances = @() }
    }
    $instances = @($counters | ForEach-Object {
        [pscustomobject]@{
          name           = [string]$_.Name
          dedicatedBytes = [long]$_.DedicatedUsage
          sharedBytes    = [long]$_.SharedUsage
          committedBytes = [long]$_.TotalCommitted
        }
      })
    $peak = [long]0
    $total = [long]0
    $committedPeak = [long]0
    foreach ($instance in $instances) {
      if ($instance.dedicatedBytes -gt $peak) { $peak = $instance.dedicatedBytes }
      $total += $instance.dedicatedBytes
      if ($instance.committedBytes -gt $committedPeak) { $committedPeak = $instance.committedBytes }
    }
    return [pscustomobject]@{
      available           = $true
      error               = $null
      dedicatedBytes      = $peak
      totalDedicatedBytes = $total
      committedBytes      = $committedPeak
      instances           = $instances
    }
  } catch {
    return [pscustomobject]@{ available = $false; error = $_.Exception.GetType().Name; dedicatedBytes = $null; totalDedicatedBytes = $null; committedBytes = $null; instances = @() }
  }
}

$reportMethod = 'Per-process WDDM GPU counters summed only for browser descendants of the benchmark process, plus adapter-level DedicatedUsage (peak across adapter instances) and nvidia-smi memory.used. The adapter delta is an upper bound that includes every process on the adapter, not app-only texture bytes. Per-process sums are unreliable when they exceed the adapter total; that condition is reported as perProcessReliable: false.'

if ($Mode -eq 'baseline') {
  $adapter = Get-AdapterMemory
  $nvidia = Get-NvidiaMemory
  $report = [ordered]@{
    status               = $(if ($adapter.available) { 'BASELINE' } else { 'NOT_VERIFIED' })
    method               = 'Adapter-level WDDM dedicated GPU memory (GPUAdapterMemory DedicatedUsage, peak across adapter instances) plus nvidia-smi memory.used, captured before the measured browser process tree starts. Includes every process that uses the adapter, so a delta is an upper bound, not app-only texture bytes.'
    adapterAvailable     = $adapter.available
    adapterError         = $adapter.error
    adapterBaselineBytes = $adapter.dedicatedBytes
    adapterTotalBytes    = $adapter.totalDedicatedBytes
    adapterCommittedBytes = $adapter.committedBytes
    adapterInstances     = $adapter.instances
    nvidiaSmiAvailable   = $nvidia.available
    nvidiaSmiUsedMiB     = $nvidia.usedMiB
    nvidiaSmiTotalMiB    = $nvidia.totalMiB
    nvidiaSmiError       = $nvidia.error
    capturedAt           = [DateTime]::UtcNow.ToString('o')
  }
  [IO.File]::WriteAllText($OutputFile, ($report | ConvertTo-Json -Depth 6), $encoding)
  exit 0
}

$baseline = $null
if ($BaselineFile -and (Test-Path -LiteralPath $BaselineFile)) {
  try { $baseline = Get-Content -LiteralPath $BaselineFile -Raw | ConvertFrom-Json } catch { $baseline = $null }
}
$baselineAdapter = $null
if ($null -ne $baseline -and $null -ne $baseline.adapterBaselineBytes) { $baselineAdapter = [long]$baseline.adapterBaselineBytes }
$baselineNvidia = $null
if ($null -ne $baseline -and $null -ne $baseline.nvidiaSmiUsedMiB) { $baselineNvidia = [long]$baseline.nvidiaSmiUsedMiB }
$baselineLoaded = ($null -ne $baseline)

$clock = [Diagnostics.Stopwatch]::StartNew()
$rows = [Collections.Generic.List[object]]::new()

function Write-Report {
  $perProcessPeak = [long]0
  $adapterPeak = $null
  $adapterTotalPeak = [long]0
  $nvidiaPeak = $null
  foreach ($row in $rows) {
    if ([long]$row.perProcess.residentAllocationBytes -gt $perProcessPeak) { $perProcessPeak = [long]$row.perProcess.residentAllocationBytes }
    if ([long]$row.adapter.totalDedicatedBytes -gt $adapterTotalPeak) { $adapterTotalPeak = [long]$row.adapter.totalDedicatedBytes }
    if ($row.adapter.available) {
      if ($null -eq $adapterPeak -or [long]$row.adapter.dedicatedBytes -gt $adapterPeak) { $adapterPeak = [long]$row.adapter.dedicatedBytes }
    }
    if ($row.nvidia.supported) {
      if ($null -eq $nvidiaPeak -or [long]$row.nvidia.usedMiB -gt $nvidiaPeak) { $nvidiaPeak = [long]$row.nvidia.usedMiB }
    }
  }
  $adapterDelta = $null
  if ($null -ne $adapterPeak -and $null -ne $baselineAdapter) {
    $adapterDelta = [long][math]::Max(0, ($adapterPeak - $baselineAdapter))
  }
  $nvidiaDeltaMiB = $null
  if ($null -ne $nvidiaPeak -and $null -ne $baselineNvidia) {
    $nvidiaDeltaMiB = [long][math]::Max(0, ($nvidiaPeak - $baselineNvidia))
  }
  $perProcessReliable = $null
  if ($adapterTotalPeak -gt 0) { $perProcessReliable = ($perProcessPeak -le [long]($adapterTotalPeak * 1.05)) }
  $adapterMatchesNvidia = $null
  if ($null -ne $adapterDelta -and $null -ne $nvidiaDeltaMiB) {
    $nvidiaBytes = [long]($nvidiaDeltaMiB * $MiB)
    $tolerance = [long][math]::Max(134217728, ($nvidiaBytes * 0.25))
    $adapterMatchesNvidia = ([math]::Abs([double]($adapterDelta - $nvidiaBytes)) -le $tolerance)
  }
  $status = 'NOT_VERIFIED'
  if ($rows.Count -gt 0 -and $null -ne $adapterDelta) { $status = 'MEASURED' }
  elseif ($rows.Count -gt 0) { $status = 'PARTIAL' }
  $report = [ordered]@{
    status                 = $status
    method                 = $reportMethod
    baselineLoaded         = $baselineLoaded
    adapterBaselineBytes   = $baselineAdapter
    adapterPeakBytes       = $adapterPeak
    adapterPeakDeltaBytes  = $adapterDelta
    adapterUpperBoundBytes = $adapterDelta
    nvidiaSmiBaselineMiB   = $baselineNvidia
    nvidiaSmiPeakMiB       = $nvidiaPeak
    nvidiaSmiPeakDeltaMiB  = $nvidiaDeltaMiB
    adapterMatchesNvidia   = $adapterMatchesNvidia
    perProcessPeakBytes    = $perProcessPeak
    adapterTotalBytesSeen  = $adapterTotalPeak
    perProcessReliable     = $perProcessReliable
    browserKind            = $env:BENCH_BROWSER
    samples                = $rows.ToArray()
    completedAt            = [DateTime]::UtcNow.ToString('o')
  }
  [IO.File]::WriteAllText($OutputFile, ($report | ConvertTo-Json -Depth 8), $encoding)
}

try {
  while ($clock.Elapsed.TotalMinutes -lt $MaxMinutes -and !(Test-Path -LiteralPath ($OutputFile + '.stop'))) {
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
    $counters = @(Get-CimInstance $processClass | Where-Object {
        $_.Name -match '^pid_(\d+)_' -and $browserIds -contains [int]$Matches[1]
      })
    $dedicated = [long]0
    $shared = [long]0
    $committed = [long]0
    if ($counters.Count -gt 0) {
      foreach ($counter in $counters) {
        $dedicated += [long]$counter.DedicatedUsage
        $shared += [long]$counter.SharedUsage
        $committed += [long]$counter.TotalCommitted
      }
    }
    $adapter = Get-AdapterMemory
    $nvidia = Get-NvidiaMemory
    $rows.Add([ordered]@{
        elapsedMs  = [math]::Round($clock.Elapsed.TotalMilliseconds)
        perProcess = [ordered]@{
          dedicatedBytes          = $dedicated
          sharedBytes             = $shared
          residentAllocationBytes = ($dedicated + $shared)
          committedBytes          = $committed
          browserProcesses        = $browserIds.Count
          matchedCounters         = $counters.Count
        }
        adapter    = [ordered]@{
          available           = $adapter.available
          error               = $adapter.error
          dedicatedBytes      = $adapter.dedicatedBytes
          totalDedicatedBytes = $adapter.totalDedicatedBytes
          committedBytes      = $adapter.committedBytes
          instances           = $adapter.instances
        }
        nvidia     = [ordered]@{
          supported = $nvidia.available
          usedMiB   = $nvidia.usedMiB
          totalMiB  = $nvidia.totalMiB
          error     = $nvidia.error
        }
      })
    Write-Report
    Start-Sleep -Seconds 1
  }
} catch {
  $failure = [ordered]@{
    status         = 'NOT_VERIFIED'
    method         = $reportMethod
    errorType      = $_.Exception.GetType().Name
    errorText      = $_.Exception.Message
    baselineLoaded = $baselineLoaded
    samples        = $rows.ToArray()
  }
  [IO.File]::WriteAllText($OutputFile, ($failure | ConvertTo-Json -Depth 8), $encoding)
  exit 1
}
if ($rows.Count -eq 0) {
  [IO.File]::WriteAllText($OutputFile, ([ordered]@{ status = 'NOT_VERIFIED'; method = $reportMethod; errorType = 'NO_SAMPLES'; baselineLoaded = $baselineLoaded; samples = @() } | ConvertTo-Json -Depth 8), $encoding)
}
exit 0
