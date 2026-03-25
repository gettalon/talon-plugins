# Talon Plugins — setup MCP server for AI coding tools (Windows)
# Usage: irm https://raw.githubusercontent.com/gettalon/talon-plugins/master/scripts/setup.ps1 | iex
# Or:    .\setup.ps1 [all|codex|cursor|windsurf|gemini]

$MCP_PKG = "@gettalon/mcp@2"

function Write-Ok($msg) { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Skip($msg) { Write-Host "  – $msg" -ForegroundColor DarkGray }
function Write-Info($msg) { Write-Host "  $msg" -ForegroundColor DarkGray }
function Write-Head($msg) { Write-Host "`n$msg" -ForegroundColor Cyan }

function Add-McpJson($file) {
    $dir = Split-Path $file -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    if ((Test-Path $file) -and (Select-String -Path $file -Pattern "talon-browser" -Quiet)) {
        Write-Ok "Already configured"
        return
    }
    $entry = @{ command = "npx"; args = @("-y", $MCP_PKG) }
    if (Test-Path $file) {
        $cfg = Get-Content $file -Raw | ConvertFrom-Json
        if (-not $cfg.mcpServers) { $cfg | Add-Member -NotePropertyName "mcpServers" -NotePropertyValue @{} -Force }
        $cfg.mcpServers | Add-Member -NotePropertyName "talon-browser" -NotePropertyValue $entry -Force
    } else {
        $cfg = @{ mcpServers = @{ "talon-browser" = $entry } }
    }
    $cfg | ConvertTo-Json -Depth 5 | Set-Content $file -Encoding UTF8
    Write-Ok "Added to $file"
}

function Setup-Codex {
    Write-Head "Codex"
    $dir = Join-Path $env:USERPROFILE ".codex"
    $cfg = Join-Path $dir "config.toml"
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    if ((Test-Path $cfg) -and (Select-String -Path $cfg -Pattern "talon-browser" -Quiet)) {
        Write-Ok "Already configured"
    } else {
        $toml = "`n[mcp_servers.talon-browser]`ncommand = `"npx`"`nargs = [`"-y`", `"$MCP_PKG`"]`n"
        Add-Content -Path $cfg -Value $toml -Encoding UTF8
        Write-Ok "Added to $cfg"
    }
}

function Setup-Cursor   { Write-Head "Cursor";     Add-McpJson (Join-Path $env:USERPROFILE ".cursor\mcp.json") }
function Setup-Windsurf { Write-Head "Windsurf";   Add-McpJson (Join-Path $env:USERPROFILE ".windsurf\mcp.json") }
function Setup-Gemini   { Write-Head "Gemini CLI"; Add-McpJson (Join-Path $env:USERPROFILE ".gemini\settings.json") }

function Setup-Claude {
    Write-Head "Claude Code"
    Write-Info "Run in Claude Code:"
    Write-Info "  /plugin marketplace add gettalon/talon-plugins"
    Write-Info "  /plugin install browser-control@gettalon-talon-plugins"
    Write-Info "  /reload-plugins"
}

# Detect
$detected = @()
if (Test-Path (Join-Path $env:USERPROFILE ".codex"))    { $detected += "codex" }
if (Test-Path (Join-Path $env:USERPROFILE ".cursor"))   { $detected += "cursor" }
if (Test-Path (Join-Path $env:USERPROFILE ".windsurf")) { $detected += "windsurf" }
if (Test-Path (Join-Path $env:USERPROFILE ".gemini"))   { $detected += "gemini" }
if (Get-Command claude -ErrorAction SilentlyContinue)   { $detected += "claude" }

Write-Host "`nTalon Setup" -ForegroundColor Cyan
Write-Host "MCP server: $MCP_PKG" -ForegroundColor DarkGray

Write-Head "Detected Tools"
$allTools = @("codex", "cursor", "windsurf", "gemini", "claude")
foreach ($t in $allTools) {
    if ($detected -contains $t) { Write-Ok $t } else { Write-Skip "$t (not found)" }
}

# Handle arg
$target = if ($args.Count -gt 0) { $args[0] } else { "" }

$setupMap = @{
    codex    = { Setup-Codex }
    cursor   = { Setup-Cursor }
    windsurf = { Setup-Windsurf }
    gemini   = { Setup-Gemini }
    claude   = { Setup-Claude }
}

function Run-All { foreach ($t in $allTools) { & $setupMap[$t] } }

if ($target -eq "all") {
    Run-All
} elseif ($target -and $setupMap.ContainsKey($target)) {
    & $setupMap[$target]
} elseif ($target) {
    Write-Host "Unknown target: $target" -ForegroundColor Red
    Write-Host "Usage: setup.ps1 [all|codex|cursor|windsurf|gemini|claude]"
    exit 1
} else {
    Write-Host ""
    Write-Host "Setup options:" -ForegroundColor White
    Write-Host "  a) All tools (default)"
    Write-Host "  d) Detected only ($($detected -join ', '))"
    Write-Host "  s) Select individually"
    Write-Host ""
    $choice = Read-Host "Choice [a/d/s] (default: a)"
    if (-not $choice) { $choice = "a" }

    switch ($choice.ToLower()) {
        "a" { Run-All }
        "d" { foreach ($t in $detected) { & $setupMap[$t] } }
        "s" {
            foreach ($t in $allTools) {
                $yn = Read-Host "  Setup ${t}? [Y/n]"
                if (-not $yn -or $yn -match "^[Yy]") { & $setupMap[$t] }
            }
        }
        default { Run-All }
    }
}

Write-Head "Done!"
Write-Ok "MCP server auto-starts when your tool connects"
Write-Host ""
