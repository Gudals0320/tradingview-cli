# Selection belongs to this PowerShell process, never to User/Machine environment.
function Invoke-TvApplication {
    param([string[]]$Arguments)
    if ($env:TV_CLI_ENTRY) { & node $env:TV_CLI_ENTRY @Arguments }
    else {
        $application = Get-Command tv -CommandType Application -ErrorAction Stop | Select-Object -First 1
        & $application.Source @Arguments
    }
    $global:LASTEXITCODE = $LASTEXITCODE
}

function tv {
    if ($args.Count -eq 3 -and $args[0] -eq 'workspace' -and $args[1] -eq 'select') {
        $output = @(Invoke-TvApplication -Arguments @($args))
        $code = $LASTEXITCODE
        if ($code -eq 0) {
            $selected = ($output -join "`n") | ConvertFrom-Json
            if ($selected.success) { $env:TV_WORKSPACE = [string]$selected.name; $env:TV_LAYOUT = [string]$selected.layout }
        }
        $output
        $global:LASTEXITCODE = $code
        return
    }
    if ($args.Count -eq 3 -and $args[0] -eq 'layout' -and $args[1] -eq 'select') {
        # Selection is validated against the saved layout list, without switching tabs.
        $output = @(Invoke-TvApplication -Arguments @('layout', 'list'))
        $code = $LASTEXITCODE
        if ($code -ne 0) { $output; $global:LASTEXITCODE = $code; return }
        $result = ($output -join "`n") | ConvertFrom-Json
        $layouts = @($result.layouts | Where-Object { [string]$_.id -eq [string]$args[2] })
        if ($layouts.Count -ne 1) { Write-Error 'Exact saved layout ID required.'; $global:LASTEXITCODE = 1; return }
        $env:TV_LAYOUT = [string]$args[2]
        Remove-Item Env:TV_WORKSPACE -ErrorAction SilentlyContinue
        @{success=$true;layout=$env:TV_LAYOUT;workspace_selection_cleared=$true} | ConvertTo-Json -Compress
        $global:LASTEXITCODE = 0
        return
    }
    Invoke-TvApplication -Arguments @($args)
}

function Install-TvProfile {
    # Explicit and idempotent; preserve all existing profile contents.
    $module = $PSCommandPath.Replace("'", "''")
    $line = "Import-Module '$module' # tradingview-cli-selection"
    if (Test-Path -LiteralPath $PROFILE) {
        $contents = Get-Content -LiteralPath $PROFILE -Raw
        if ($contents.Contains('# tradingview-cli-selection')) { return }
    }
    $directory = Split-Path -Parent $PROFILE
    if (!(Test-Path -LiteralPath $directory)) { New-Item -ItemType Directory -Path $directory -Force | Out-Null }
    Add-Content -LiteralPath $PROFILE -Value "`n$line"
}
Export-ModuleMember -Function tv, Install-TvProfile
