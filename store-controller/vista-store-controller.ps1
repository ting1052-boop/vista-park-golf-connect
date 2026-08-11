param(
  [string]$ConfigPath = "$PSScriptRoot\controller.config.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-ControllerConfig {
  if (-not (Test-Path -LiteralPath $ConfigPath)) {
    throw "Configuration file not found: $ConfigPath"
  }

  $config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
  foreach ($name in @("controllerId", "apiBaseUrl", "controllerToken", "homeAssistantUrl", "homeAssistantToken")) {
    if ([string]::IsNullOrWhiteSpace([string]$config.$name) -or [string]$config.$name -like "REPLACE_WITH*") {
      throw "Set '$name' in $ConfigPath before starting the controller."
    }
  }

  return $config
}

function Invoke-JsonRequest {
  param(
    [string]$Method,
    [string]$Uri,
    [hashtable]$Headers,
    [object]$Body = $null
  )

  $parameters = @{ Method = $Method; Uri = $Uri; Headers = $Headers; UseBasicParsing = $true; TimeoutSec = 20 }
  if ($null -ne $Body) {
    $parameters.ContentType = "application/json"
    $parameters.Body = $Body | ConvertTo-Json -Depth 20 -Compress
  }

  try {
    $response = Invoke-WebRequest @parameters
    if ([string]::IsNullOrWhiteSpace($response.Content)) { return $null }
    return $response.Content | ConvertFrom-Json
  } catch {
    $details = $_.Exception.Message
    if ($_.ErrorDetails.Message) { $details = $_.ErrorDetails.Message }
    throw $details
  }
}

function Invoke-HomeAssistantScript {
  param(
    [pscustomobject]$Config,
    [pscustomobject]$Step,
    [object]$Variables
  )

  $url = $Config.homeAssistantUrl.TrimEnd('/') + "/api/services/script/turn_on"
  $headers = @{ Authorization = "Bearer $($Config.homeAssistantToken)" }
  $payload = @{ entity_id = [string]$Step.script; variables = $Variables }
  Invoke-JsonRequest -Method "POST" -Uri $url -Headers $headers -Body $payload | Out-Null
}

function Process-Command {
  param(
    [pscustomobject]$Config,
    [pscustomobject]$Command
  )

  $steps = @()
  $ok = $true
  $errorMessage = $null

  foreach ($step in @($Command.payload.scripts)) {
    try {
      Invoke-HomeAssistantScript -Config $Config -Step $step -Variables $Command.payload.variables
      $steps += @{ name = [string]$step.name; script = [string]$step.script; ok = $true; status = 200 }
      Write-Host "[$($Command.id)] $($step.script) completed"
    } catch {
      $ok = $false
      $errorMessage = $_.Exception.Message
      $steps += @{ name = [string]$step.name; script = [string]$step.script; ok = $false; status = 500; error = $errorMessage }
      Write-Warning "[$($Command.id)] $($step.script) failed: $errorMessage"
    }
  }

  return @{ commandId = [string]$Command.id; ok = $ok; steps = $steps; error = $errorMessage }
}

$config = Read-ControllerConfig
$apiBase = $config.apiBaseUrl.TrimEnd('/')
$headers = @{ Authorization = "Bearer $($config.controllerToken)"; "x-store-controller-id" = [string]$config.controllerId }
$configuredInterval = if ($null -eq $config.pollIntervalSeconds) { 5 } else { [int]$config.pollIntervalSeconds }
$interval = [Math]::Max(3, $configuredInterval)

Write-Host "VISTA Store Controller started: $($config.controllerId)"
Write-Host "Home Assistant: $($config.homeAssistantUrl)"

while ($true) {
  try {
    $response = Invoke-JsonRequest -Method "GET" -Uri "$apiBase/api/store-controller/commands?limit=5" -Headers $headers
    foreach ($command in @($response.commands)) {
      $result = Process-Command -Config $config -Command $command
      Invoke-JsonRequest -Method "POST" -Uri "$apiBase/api/store-controller/commands" -Headers $headers -Body $result | Out-Null
    }
  } catch {
    Write-Warning "Controller poll failed: $($_.Exception.Message)"
  }

  Start-Sleep -Seconds $interval
}
