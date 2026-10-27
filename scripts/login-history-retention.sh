#!/usr/bin/env bash
# Standalone Login History Retention Script (P1)
# Can be scheduled via system cron as fallback to NestJS @Cron job.
# Usage: RETENTION_PURGE_ENABLED=true ./scripts/login-history-retention.sh

set -euo pipefail

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Login history retention started"

# Example SQL (run via psql in production)
cat << 'SQL'
-- Archive candidates (>90 days)
-- INSERT INTO login_histories_archive
-- SELECT * FROM login_histories WHERE login_at < NOW() - INTERVAL '90 days';

-- Purge (>180 days) – only if RETENTION_PURGE_ENABLED=true
-- DELETE FROM login_histories WHERE login_at < NOW() - INTERVAL '180 days';
SQL

if [[ "${RETENTION_PURGE_ENABLED:-false}" == "true" ]]; then
  echo "Purge enabled – would delete rows older than 180 days"
else
  echo "Purge disabled (set RETENTION_PURGE_ENABLED=true to enable)"
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Login history retention finished"
