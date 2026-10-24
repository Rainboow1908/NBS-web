param(
  [string]$Source,
  [string]$Work,
  [string]$Out,
  [string]$Runtime,
  [string]$User
)

$ErrorActionPreference = "Stop"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $Source) { $Source = Join-Path $Repo "NoteBlockStudio-3.12.0-beta.5" }
if (-not $Work)   { $Work   = Join-Path $Repo "work" }
if (-not $Out)    { $Out    = Join-Path $Repo "dist" }
$Source = (Resolve-Path $Source).Path
$Build = Join-Path $Work "src"
$Raw = Join-Path $Work "out"
$Temp = Join-Path $Work "temp"
$Cache = Join-Path $Work "cache"
New-Item -ItemType Directory -Force -Path $Work | Out-Null

Write-Host "[1/4] Copying pristine upstream source"
if (Test-Path $Build) { Remove-Item $Build -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Build | Out-Null
robocopy $Source $Build /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed: $LASTEXITCODE" }

Write-Host "[1.5/4] Applying minimal file-bridge patches"
Push-Location $Repo
try {
  & node "web\scripts\patch-project.mjs" $Build
  if ($LASTEXITCODE -ne 0) { throw "patch-project failed: $LASTEXITCODE" }
} finally {
  Pop-Location
}

Write-Host "[2/4] Building stock HTML5 export"
if (-not $Runtime) {
  $Runtime = $env:GAMEMAKER_RUNTIME
  if (-not $Runtime) {
    $Runtime = Get-ChildItem "C:\ProgramData\GameMakerStudio2-LTS\Cache\runtimes" -Directory -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty FullName
  }
}
if (-not $Runtime -or -not (Test-Path $Runtime)) { throw "GameMaker runtime not found. Set GAMEMAKER_RUNTIME." }
if (-not $User) {
  $User = $env:GAMEMAKER_USER
  if (-not $User) {
    $User = Get-ChildItem (Join-Path $env:APPDATA "GameMakerStudio2-LTS") -Directory -ErrorAction SilentlyContinue |
      Where-Object { Test-Path (Join-Path $_.FullName "licence.plist") } |
      Select-Object -First 1 -ExpandProperty FullName
  }
}
if (-not $User -or -not (Test-Path (Join-Path $User "licence.plist"))) { throw "GameMaker user/licence not found. Set GAMEMAKER_USER." }

$Igor = Join-Path $Runtime "bin\igor\windows\x64\Igor.exe"
if (-not (Test-Path $Igor)) { throw "Igor.exe not found at $Igor" }
$Project = Get-ChildItem $Build -Filter "*.yyp" | Select-Object -First 1 -ExpandProperty FullName
if (-not $Project) { throw "No .yyp found in $Build" }

if (Test-Path $Raw)   { Remove-Item $Raw -Recurse -Force }
if (Test-Path $Temp)  { Remove-Item $Temp -Recurse -Force }
if (Test-Path $Cache) { Remove-Item $Cache -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Raw, $Temp, $Cache | Out-Null

# Keep build/runtime caches on the repo drive. Igor already gets --temp and
# --cache, but Node and GameMaker child processes also honor these.
$SysTemp = Join-Path $Work "system-temp"
$XdgCache = Join-Path $Work "xdg-cache"
$NpmCache = Join-Path $Work "npm-cache"
New-Item -ItemType Directory -Force -Path $SysTemp, $XdgCache, $NpmCache | Out-Null
$env:TEMP = $SysTemp
$env:TMP = $SysTemp
$env:XDG_CACHE_HOME = $XdgCache
$env:npm_config_cache = $NpmCache

& $Igor `
  --project="$Project" `
  --runtimePath="$Runtime" `
  --user="$User" `
  --licencefile="$(Join-Path $User 'licence.plist')" `
  --temp="$Temp" `
  --cache="$Cache" `
  --tf="$Raw" `
  html5 folder
if ($LASTEXITCODE -ne 0) { throw "Igor failed: $LASTEXITCODE" }
if (-not (Test-Path (Join-Path $Raw "nbsweb.html"))) { throw "HTML5 output missing nbsweb.html" }

Write-Host "[3/4] Applying post-build web wrapper"
Push-Location $Repo
try {
  & node "web\postbuild.mjs" $Raw
  if ($LASTEXITCODE -ne 0) { throw "postbuild failed: $LASTEXITCODE" }
} finally {
  Pop-Location
}

Write-Host "[4/4] Publishing to $Out"
if (Test-Path $Out) { Remove-Item $Out -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Out | Out-Null
robocopy $Raw $Out /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "publish failed: $LASTEXITCODE" }

$files = Get-ChildItem $Out -Recurse -File
$mb = [math]::Round((($files | Measure-Object Length -Sum).Sum) / 1MB, 2)
Write-Host "Done: $($files.Count) files, $mb MB -> $Out"
