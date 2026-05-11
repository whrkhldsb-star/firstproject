#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# PostgreSQL backup script for VPS management platform
# Usage: ./scripts/db-backup.sh
# Crontab (daily at 03:00): 0 3 * * * /root/firstproject/scripts/db-backup.sh
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config ─────────────────────────────────────────────────────────
DB_NAME="whrkhldsb"
DB_USER="whrkhldsb"
BACKUP_DIR="/root/backups/postgresql"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

# ── Ensure backup directory ────────────────────────────────────────
mkdir -p "${BACKUP_DIR}"

# ── Dump (use peer auth via postgres user) ─────────────────────────
echo "[backup] Starting PostgreSQL backup: ${DB_NAME}"
sudo -u postgres pg_dump \
    -d "${DB_NAME}" \
    --format=plain \
    --no-owner \
    --no-privileges \
    2>/dev/null | gzip > "${BACKUP_FILE}"

FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[backup] ✅ Saved: ${BACKUP_FILE} (${FILE_SIZE})"

# ── Retention: remove backups older than N days ────────────────────
DELETED=$(find "${BACKUP_DIR}" -name "${DB_NAME}_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [ "${DELETED}" -gt 0 ]; then
    echo "[backup] 🗑️  Removed ${DELETED} backup(s) older than ${RETENTION_DAYS} days"
fi

# ── Summary ────────────────────────────────────────────────────────
TOTAL=$(find "${BACKUP_DIR}" -name "${DB_NAME}_*.sql.gz" | wc -l)
echo "[backup] Total backups: ${TOTAL}"
