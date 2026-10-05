$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$scriptPath = Join-Path $repoRoot 'tools\postgres-mcp.ps1'
$appDataClaudeDir = Join-Path $env:APPDATA 'Claude'
$appConfigPath = Join-Path $appDataClaudeDir 'claude_desktop_config.json'

if (-not (Test-Path $appDataClaudeDir)) {
    New-Item -ItemType Directory -Path $appDataClaudeDir -Force | Out-Null
}

$config = @{
    mcpServers = @{
        postgres = @{
            command = 'powershell'
            args = @(
                '-ExecutionPolicy', 'Bypass',
                '-File', $scriptPath
            )
        }
    }
}

$config | ConvertTo-Json -Depth 8 | Set-Content -Path $appConfigPath -Encoding UTF8

Write-Host "Claude Desktop config written to: $appConfigPath"
Write-Host "This config uses the repo-local .env file and does not hardcode database credentials."
