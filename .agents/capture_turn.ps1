# capture_turn.ps1
# Reads hook stdin payload, extracts the transcript path, finds the latest
# PROMPT and RESPONSE entries, and appends them to a session log file in
# .agent-logs/.
#
# Fired by the "Stop" lifecycle hook in hooks.json.

param()

$payload = $null
try {
    $rawInput = [Console]::In.ReadToEnd()
    $payload  = $rawInput | ConvertFrom-Json
} catch {
    exit 0
}

$transcriptPath = $payload.transcriptPath
$conversationId = $payload.conversationId
$modelName      = if ($payload.modelName) { $payload.modelName } else { "unknown" }

if (-not $transcriptPath -or -not (Test-Path $transcriptPath)) {
    exit 0
}

# Determine log file path
$logsDir  = Join-Path $PSScriptRoot "..\\.agent-logs"
$logsDir  = [System.IO.Path]::GetFullPath($logsDir)
if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir -Force | Out-Null }

$sessionFile = Join-Path $logsDir "2026-09-25_session_$($conversationId.Substring(0,8)).md"

# Read transcript lines
$lines = Get-Content -Path $transcriptPath -Encoding UTF8 -ErrorAction SilentlyContinue
if (-not $lines) { exit 0 }

# Parse all steps, collect the LAST user input and the LAST model response
$lastPrompt   = $null
$lastResponse = $null
$lastPromptTs = $null
$lastRespTs   = $null
$exchangeNum  = 0

foreach ($line in $lines) {
    $step = $null
    try { $step = $line | ConvertFrom-Json -ErrorAction Stop } catch { continue }

    if ($step.type -eq "USER_INPUT" -and $step.source -eq "USER_EXPLICIT") {
        $lastPrompt   = $step.content
        $lastPromptTs = $step.timestamp
        $exchangeNum  = [int]$step.step_index
    }
    if ($step.type -eq "PLANNER_RESPONSE" -and $step.status -eq "DONE") {
        $lastResponse = $step.content
        $lastRespTs   = $step.timestamp
    }
}

if (-not $lastPrompt -and -not $lastResponse) { exit 0 }

$utcNow   = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$promptTs = if ($lastPromptTs) { $lastPromptTs } else { $utcNow }
$respTs   = if ($lastRespTs)   { $lastRespTs }   else { $utcNow }

# Write header if file is new
if (-not (Test-Path $sessionFile)) {
    $header = @"
---
session_id: $conversationId
date: $(Get-Date -Format "yyyy-MM-dd")
author: tickr-builder
model: $modelName
tool: antigravity-ide
project: tickr
---

# Session Log - $(Get-Date -Format "yyyy-MM-dd")

Session: ``$($conversationId.Substring(0,8))`` | Project: ``tickr`` | Model: ``$modelName``

---

"@
    Set-Content -Path $sessionFile -Value $header -Encoding UTF8
}

# Append exchange
$entry = @"

[LOG_ENTRY type=PROMPT num=$exchangeNum session=$($conversationId.Substring(0,8))]
timestamp: $promptTs
model: $modelName

$lastPrompt


[LOG_ENTRY type=RESPONSE num=$exchangeNum session=$($conversationId.Substring(0,8))]
timestamp: $respTs
model: $modelName

$lastResponse

---
"@

Add-Content -Path $sessionFile -Value $entry -Encoding UTF8

# Return empty JSON as required
Write-Output "{}"
exit 0
