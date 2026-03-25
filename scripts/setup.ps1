# Talon Plugins — setup MCP server for all detected AI coding tools (Windows)
# Usage: irm https://raw.githubusercontent.com/gettalon/talon-plugins/master/scripts/setup.ps1 | iex

$MCP_PKG = "@gettalon/mcp@2"

function Write-Ok($msg) { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Info($msg) { Write-Host "  $msg" -ForegroundColor DarkGray }
function Write-Head($msg) { Write-Host "`n$msg" -ForegroundColor Cyan -NoNewline; Write-Host "" }

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
        if (-not $cfg.mcpServers) {
            $cfg | Add-Member -NotePropertyName "mcpServers" -NotePropertyValue @{} -Force
        }
        $cfg.mcpServers | Add-Member -NotePropertyName "talon-browser" -NotePropertyValue $entry -Force
    } else {
        $cfg = @{ mcpServers = @{ "talon-browser" = $entry } }
    }

    $cfg | ConvertTo-Json -Depth 5 | Set-Content $file -Encoding UTF8
    Write-Ok "Added to $file"
}

Write-Host "`nTalon Setup — configure MCP server for your AI tools" -ForegroundColor Cyan
Write-Host "Server: $MCP_PKG" -ForegroundColor DarkGray

# Codex — ~/.codex/config.toml
Write-Head "Codex"
$codexDir = Join-Path $env:USERPROFILE ".codex"
$codexCfg = Join-Path $codexDir "config.toml"
if (-not (Test-Path $codexDir)) { New-Item -ItemType Directory -Path $codexDir -Force | Out-Null }
if ((Test-Path $codexCfg) -and (Select-String -Path $codexCfg -Pattern "talon-browser" -Quiet)) {
    Write-Ok "Already configured"
} else {
    $toml = @"

[mcp_servers.talon-browser]
command = "npx"
args = ["-y", "$MCP_PKG"]
"@
    Add-Content -Path $codexCfg -Value $toml -Encoding UTF8
    Write-Ok "Added to $codexCfg"
}

# Cursor
Write-Head "Cursor"
Add-McpJson (Join-Path $env:USERPROFILE ".cursor\mcp.json")

# Windsurf
Write-Head "Windsurf"
Add-McpJson (Join-Path $env:USERPROFILE ".windsurf\mcp.json")

# Gemini CLI
Write-Head "Gemini CLI"
Add-McpJson (Join-Path $env:USERPROFILE ".gemini\settings.json")

# Claude Code
Write-Head "Claude Code"
Write-Info "Run in Claude Code:"
Write-Info "  /plugin marketplace add gettalon/talon-plugins"
Write-Info "  /plugin install browser-control@gettalon-talon-plugins"
Write-Info "  /reload-plugins"

Write-Head "Done!"
Write-Ok "MCP server auto-starts when your tool connects"
Write-Host ""
