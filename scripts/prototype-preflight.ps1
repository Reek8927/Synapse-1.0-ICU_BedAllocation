[CmdletBinding()]
param(
  [switch]$SkipFrontendBuild,
  [switch]$SkipMlTests,
  [switch]$SkipSecretTrackingCheck
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $projectRoot 'backend'
$frontendDir = Join-Path $projectRoot 'frontend'
$mlDir = Join-Path $projectRoot 'ml-service'

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory
  )
  Write-Host "`n=== $Name ===" -ForegroundColor Cyan
  Push-Location $WorkingDirectory
  try {
    & $Name @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "$Name $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
  }
  finally {
    Pop-Location
  }
}

Write-Host 'BedAllocation local prototype preflight' -ForegroundColor Green
Write-Host 'This script runs local checks only. It does not connect to or modify MongoDB records.'

if (-not (Test-Path (Join-Path $backendDir 'node_modules'))) {
  throw 'backend/node_modules is missing. Run npm install inside backend first.'
}
Invoke-CheckedCommand -Name 'npm' -Arguments @('run', 'check') -WorkingDirectory $backendDir
Invoke-CheckedCommand -Name 'npm' -Arguments @('test') -WorkingDirectory $backendDir

if (-not $SkipFrontendBuild) {
  if (-not (Test-Path (Join-Path $frontendDir 'node_modules'))) {
    throw 'frontend/node_modules is missing. Run npm install inside frontend first, or pass -SkipFrontendBuild.'
  }
  Invoke-CheckedCommand -Name 'npm' -Arguments @('run', 'build') -WorkingDirectory $frontendDir
}
else {
  Write-Host 'Skipped Next.js production build by request.' -ForegroundColor Yellow
}

# Accept the ML virtual environment in either the ml-service folder (recommended)
# or the project root. This supports projects created before the scaffold was standardized.
$pythonCandidates = @(
  (Join-Path $mlDir '.venv/Scripts/python.exe'),
  (Join-Path $projectRoot '.venv/Scripts/python.exe')
)
$python = $pythonCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $SkipMlTests -and $python -and (Test-Path (Join-Path $mlDir 'tests'))) {
  Write-Host "Using ML Python: $python" -ForegroundColor DarkGray
  Invoke-CheckedCommand -Name $python -Arguments @('-m', 'unittest', 'discover', '-s', 'tests', '-v') -WorkingDirectory $mlDir
}
elseif ($SkipMlTests) {
  Write-Host 'Skipped ML tests by request.' -ForegroundColor Yellow
}
else {
  Write-Host 'ML virtual environment or tests not found; Python checks skipped.' -ForegroundColor Yellow
  Write-Host 'Checked these Python paths:' -ForegroundColor Yellow
  $pythonCandidates | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
  Write-Host 'If your environment is elsewhere, run ML tests manually from ml-service.' -ForegroundColor Yellow
}

if (-not $SkipSecretTrackingCheck) {
  $git = Get-Command git -ErrorAction SilentlyContinue
  $gitMarker = Join-Path $projectRoot '.git'
  if (-not $git) {
    Write-Host 'Git is unavailable; secret-tracking check skipped.' -ForegroundColor Yellow
  }
  elseif (-not (Test-Path $gitMarker)) {
    # Do not invoke git in a non-repository; Windows PowerShell can surface its
    # expected fatal stderr as a terminating NativeCommandError.
    Write-Host 'Project is not a Git working tree (.git marker not found); secret-tracking check skipped.' -ForegroundColor Yellow
    Write-Host 'Before your first commit, verify .env, .env.local and .ml-api-key.local are ignored.' -ForegroundColor Yellow
  }
  else {
    $gitRootOutput = @(& git -C $projectRoot rev-parse --show-toplevel 2>&1)
    $gitExitCode = $LASTEXITCODE
    $gitRoot = ($gitRootOutput | Out-String).Trim()
    if ($gitExitCode -eq 0 -and $gitRoot) {
      $secretPaths = @('backend/.env', 'frontend/.env.local', 'ml-service/.ml-api-key.local')
      foreach ($relativePath in $secretPaths) {
        $absolutePath = Join-Path $projectRoot $relativePath
        if (Test-Path $absolutePath) {
          & git -C $projectRoot ls-files --error-unmatch -- $relativePath *> $null
          if ($LASTEXITCODE -eq 0) {
            throw "Security check failed: $relativePath is tracked by Git. Untrack it and rotate any exposed secrets."
          }
          & git -C $projectRoot check-ignore --quiet -- $relativePath
          if ($LASTEXITCODE -ne 0) {
            throw "Security check failed: $relativePath is not ignored by Git. Add it to .gitignore before staging files."
          }
        }
      }
      Write-Host 'Checked that local secret files are not tracked by Git.' -ForegroundColor Green
    }
    else {
      Write-Host 'Unable to resolve Git repository root; secret-tracking check skipped.' -ForegroundColor Yellow
    }
  }
}

Write-Host "`nPreflight checks completed successfully." -ForegroundColor Green
Write-Host 'This is not a penetration test, clinical validation, or proof of production readiness.'
