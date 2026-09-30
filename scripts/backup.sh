#!/usr/bin/env bash
# FunnelBD MongoDB backup — mongodump to ./backups/, keeps last 14 days.
# Usage: bash scripts/backup.sh   (schedule via cron)
set -euo pipefail

cd "$(dirname "$0")/.."

# Load MONGODB_URI from .env
if [ -f .env ]; then
  export "$(grep -E '^MONGODB_URI=' .env | xargs)"
fi
: "${MONGODB_URI:?MONGODB_URI not set}"

STAMP=$(date +%Y%m%d-%H%M%S)
OUT="backups/$STAMP"
mkdir -p "$OUT"

echo "[backup] dumping to $OUT ..."
mongodump --uri="$MONGODB_URI" --gzip --archive="$OUT/funnelbd.archive.gz"
echo "[backup] done."

# Retention: delete backup dirs older than 14 days.
find backups -maxdepth 1 -type d -mtime +14 -exec rm -rf {} \; 2>/dev/null || true
echo "[backup] old backups pruned."
