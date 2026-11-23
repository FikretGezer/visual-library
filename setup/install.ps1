# Installs the visual-library skills and rules into this computer's Claude Code user config.
# Safe to run again: it overwrites the two skills and replaces only its own block in CLAUDE.md.
#
# Usage (PowerShell), from anywhere:
#   powershell -ExecutionPolicy Bypass -File "<repo>\setup\install.ps1"

$ErrorActionPreference = 'Stop'

$setup  = Split-Path -Parent $MyInvocation.MyCommand.Path
$lib    = (Resolve-Path (Join-Path $setup '..')).Path          # the cloned repo = the library
$homeDir = if ($env:VL_HOME) { $env:VL_HOME } else { $HOME }    # VL_HOME only for testing
$claude = Join-Path $homeDir '.claude'
$utf8   = New-Object System.Text.UTF8Encoding($false)

New-Item -ItemType Directory -Force -Path (Join-Path $claude 'skills') | Out-Null

# 1) skills
foreach ($name in 'visual', 'ship') {
  $src = Join-Path $setup "skills\$name\SKILL.md"
  $dst = Join-Path $claude "skills\$name"
  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  $text = [IO.File]::ReadAllText($src, $utf8).Replace('{{LIB}}', $lib)
  [IO.File]::WriteAllText((Join-Path $dst 'SKILL.md'), $text, $utf8)
  Write-Host "skill installed: $name"
}

# 2) CLAUDE.md block (between markers, so re-running replaces instead of duplicating)
$start = '<!-- visual-library:start -->'
$end   = '<!-- visual-library:end -->'
$block = $start + "`n" + [IO.File]::ReadAllText((Join-Path $setup 'claude-md.template.md'), $utf8).Replace('{{LIB}}', $lib).TrimEnd() + "`n" + $end + "`n"
$file  = Join-Path $claude 'CLAUDE.md'
$cur   = if (Test-Path $file) { [IO.File]::ReadAllText($file, $utf8) } else { '' }
$pat   = '(?s)' + [regex]::Escape($start) + '.*?' + [regex]::Escape($end) + "\r?\n?"
if ($cur -match [regex]::Escape($start)) { $cur = [regex]::Replace($cur, $pat, '') }
$cur = $cur.TrimEnd()
if ($cur.Length -gt 0) { $cur += "`n`n" }
[IO.File]::WriteAllText($file, $cur + $block, $utf8)
Write-Host "CLAUDE.md updated: $file"

Write-Host ""
Write-Host "Library path: $lib"
Write-Host "Done. Start a NEW Claude Code session; /visual and /ship will be available."
Write-Host "Still manual: caveman plugin and superpowers plugin (see setup\README.md)."
