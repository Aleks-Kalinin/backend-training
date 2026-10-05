$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$envFile = Join-Path $repoRoot '.env'

if (-not (Test-Path $envFile)) {
    throw "Missing .env file at $envFile. Create one from .env.example before starting the PostgreSQL MCP server."
}

Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ([string]::IsNullOrWhiteSpace($line)) { return }
    if ($line.StartsWith('#')) { return }

    $parts = $line.Split('=', 2)
    if ($parts.Length -ne 2) { return }

    $name = $parts[0].Trim()
    $value = $parts[1].Trim()

    if ($name -and $value) {
        [System.Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
}

if (-not $env:DATABASE_URL) {
    $host = [System.Environment]::GetEnvironmentVariable('POSTGRES_HOST', 'Process')
    $port = [System.Environment]::GetEnvironmentVariable('POSTGRES_PORT', 'Process')
    $user = [System.Environment]::GetEnvironmentVariable('POSTGRES_USER', 'Process')
    $pass = [System.Environment]::GetEnvironmentVariable('POSTGRES_PASSWORD', 'Process')
    $db = [System.Environment]::GetEnvironmentVariable('POSTGRES_DB', 'Process')

    if (-not $host -or -not $port -or -not $user -or -not $db) {
        throw 'Missing PostgreSQL settings in .env. Expected POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB.'
    }

    $env:DATABASE_URL = "postgresql://$user:$pass@$host:$port/$db"
}

Write-Host 'Starting PostgreSQL MCP server...'
& npx -y @modelcontextprotocol/server-postgres
exit $LASTEXITCODE
