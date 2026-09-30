#!/usr/bin/env bash
# FunnelBD backup — database dump + uploaded images → ./backups/<timestamp>/
# Keeps the last 14 days locally. Usage: bash scripts/backup.sh (schedule via cron)
#
# Optional off-server copy: if rclone is installed and BACKUP_REMOTE is set in
# .env (e.g. BACKUP_REMOTE=gdrive:funnelbd-backups), the new backup folder is
# uploaded there too. A backup that lives only on this server does not protect
# against the server/disk being lost.
set -euo pipefail

cd "$(dirname "$0")/.."

# Read values from .env without `export $(... | xargs)`, which mangles URIs
# containing characters like & or quotes.
env_value() { grep -E "^$1=" .env 2>/dev/null | head -n1 | cut -d= -f2- || true; }
MONGODB_URI="${MONGODB_URI:-$(env_value MONGODB_URI)}"
BACKUP_REMOTE="${BACKUP_REMOTE:-$(env_value BACKUP_REMOTE)}"
: "${MONGODB_URI:?MONGODB_URI not set}"

STAMP=$(date +%Y%m%d-%H%M%S)
OUT="backups/$STAMP"
mkdir -p "$OUT"

echo "[backup] dumping database to $OUT ..."
mongodump --uri="$MONGODB_URI" --gzip --archive="$OUT/funnelbd.archive.gz" --quiet

echo "[backup] archiving uploaded images ..."
tar -czf "$OUT/uploads.tar.gz" -C public uploads

if [ -n "$BACKUP_REMOTE" ] && command -v rclone >/dev/null 2>&1; then
  echo "[backup] copying to $BACKUP_REMOTE/$STAMP ..."
  rclone copy "$OUT" "$BACKUP_REMOTE/$STAMP" --quiet
else
  echo "[backup] NOTE: no off-server copy (set BACKUP_REMOTE in .env and install rclone)."
fi

# Retention: delete local backup dirs older than 14 days.
find backups -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} + 2>/dev/null || true
echo "[backup] done: $(du -sh "$OUT" | cut -f1) in $OUT"
