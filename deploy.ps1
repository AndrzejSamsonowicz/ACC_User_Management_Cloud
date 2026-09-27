# Deploy to production: push main to GitHub, then fast-forward the VM's git clone,
# install deps if the lockfile changed, reload PM2, and health-check. Rolls back
# automatically if the app doesn't come back healthy.
#
# The VM's .env and service-account credentials are never touched - they live
# only on the VM and are gitignored.
#
# Usage:
#   .\deploy.ps1            # push + deploy
#   .\deploy.ps1 -DryRun    # show what would be deployed, change nothing
#   .\deploy.ps1 -Force     # reload PM2 even if the VM is already up to date

param(
    [switch]$DryRun,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

# --- Production target (VM "forma-user-management", europe-west6-c, project forma-user-management-b0656)
$VmHost    = "34.158.26.232"
$SshUser   = "samsona"                 # SSH login; app itself runs as $AppUser
$SshKey    = "$env:USERPROFILE\.ssh\google_compute_engine"
$AppUser   = "developer"
$AppDir    = "/home/developer/acc-user-management"
$Pm2Name   = "forma-user-management"
$Branch    = "main"
$PublicUrl = "https://usermgt.digibuild.ch/"

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "`nDEPLOY FAILED: $msg" -ForegroundColor Red; exit 1 }

Set-Location $PSScriptRoot

# --- 1. Local preflight
Step "Checking local repo"
$current = (git rev-parse --abbrev-ref HEAD).Trim()
if ($current -ne $Branch) { Fail "on branch '$current', expected '$Branch'" }
$dirty = git status --porcelain --untracked-files=no
if ($dirty) { Fail "uncommitted changes to tracked files:`n$dirty" }
git fetch origin $Branch --quiet
if ($LASTEXITCODE -ne 0) { Fail "git fetch failed" }
$behind = [int](git rev-list --count "HEAD..origin/$Branch")
if ($behind -gt 0) { Fail "local $Branch is $behind commit(s) behind origin - pull first" }
$target = (git rev-parse HEAD).Trim()
Write-Host "Deploying commit $($target.Substring(0,7)): $(git log -1 --format=%s)"

# --- 2. Push to GitHub
$ahead = [int](git rev-list --count "origin/$Branch..HEAD")
if ($ahead -gt 0) {
    if ($DryRun) {
        Step "[dry run] would push $ahead commit(s) to GitHub"
    } else {
        Step "Pushing $ahead commit(s) to GitHub"
        git push origin $Branch
        if ($LASTEXITCODE -ne 0) { Fail "git push failed" }
    }
} else {
    Step "GitHub already has this commit"
}

# --- 3. Deploy on the VM
# Runs as the app user. Exit codes: 0 deployed, 10 already up to date, 20 dry run, other = failure.
$remote = @'
set -euo pipefail
cd "__APPDIR__"
TARGET="__TARGET__"; DRYRUN="__DRYRUN__"; FORCE="__FORCE__"; PM2="__PM2__"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "VM working tree has local modifications to tracked files - refusing to deploy:"
  git status --short --untracked-files=no
  exit 3
fi

PREV=$(git rev-parse HEAD)
GIT_TERMINAL_PROMPT=0 git fetch --quiet origin
echo "VM is at:    $(git log -1 --format='%h %s' "$PREV")"

if [ "$PREV" = "$TARGET" ] && [ "$FORCE" != "1" ]; then
  echo "VM is already up to date."
  exit 10
fi

if [ "$DRYRUN" = "1" ]; then
  if git cat-file -e "$TARGET^{commit}" 2>/dev/null; then
    echo "Would deploy:"; git log --oneline "$PREV..$TARGET"
    echo "Files changed:"; git diff --stat "$PREV" "$TARGET" | tail -n 20
  else
    echo "Would deploy $TARGET (not pushed to GitHub yet)."
  fi
  exit 20
fi

git merge --ff-only --quiet "$TARGET"
LOCK_CHANGED=0
git diff --quiet "$PREV" "$TARGET" -- package.json package-lock.json || LOCK_CHANGED=1
if [ "$LOCK_CHANGED" = "1" ]; then
  echo "Dependencies changed - running npm ci"
  npm ci --omit=dev --no-audit --no-fund
fi

health() {
  for i in $(seq 1 15); do
    sleep 2
    code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || true)
    status=$(pm2 jlist | node -pe "(JSON.parse(require('fs').readFileSync(0)).find(p=>p.name==='$PM2')||{pm2_env:{}}).pm2_env.status")
    if [ "$code" = "200" ] && [ "$status" = "online" ]; then return 0; fi
  done
  return 1
}

pm2 reload "$PM2" >/dev/null
if health; then
  echo "Deployed:    $(git log -1 --format='%h %s')"
  exit 0
fi

echo "Health check FAILED after reload - rolling back to ${PREV:0:7}"
pm2 logs "$PM2" --lines 30 --nostream || true
git reset --hard --quiet "$PREV"
[ "$LOCK_CHANGED" = "1" ] && npm ci --omit=dev --no-audit --no-fund
pm2 reload "$PM2" >/dev/null
if health; then echo "Rollback OK - production is back on ${PREV:0:7}"; else echo "ROLLBACK ALSO UNHEALTHY - check the VM now"; fi
exit 4
'@
$remote = $remote.Replace("__APPDIR__", $AppDir).Replace("__TARGET__", $target).Replace("__PM2__", $Pm2Name)
$remote = $remote.Replace("__DRYRUN__", $(if ($DryRun) { "1" } else { "0" }))
$remote = $remote.Replace("__FORCE__",  $(if ($Force)  { "1" } else { "0" }))
$remote = $remote -replace "`r", ""

Step "Deploying on VM ($VmHost)"
# Sent base64-encoded as an argument rather than piped: PowerShell 5.1 prepends a
# BOM when piping to native commands, which would break the script's first line.
$b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($remote))
ssh -i $SshKey -o BatchMode=yes -o ConnectTimeout=15 "$SshUser@$VmHost" "echo $b64 | base64 -d | sudo -n -u $AppUser -H bash"
$code = $LASTEXITCODE

switch ($code) {
    0  { }
    10 { if (-not $Force) { Write-Host "`nNothing to deploy." -ForegroundColor Green; exit 0 } }
    20 { Write-Host "`nDry run complete - nothing changed." -ForegroundColor Yellow; exit 0 }
    3  { Fail "VM has uncommitted local edits (see above) - resolve on the VM first" }
    4  { Fail "new version was unhealthy and was rolled back" }
    default { Fail "remote step exited with code $code" }
}

# --- 4. Public check through nginx/HTTPS
Step "Checking $PublicUrl"
try {
    $resp = Invoke-WebRequest -Uri $PublicUrl -UseBasicParsing -TimeoutSec 20
    Write-Host "HTTP $($resp.StatusCode)" -ForegroundColor Green
} catch {
    Fail "public URL check failed: $($_.Exception.Message)"
}

Write-Host "`nDeploy complete: $($target.Substring(0,7)) is live." -ForegroundColor Green
