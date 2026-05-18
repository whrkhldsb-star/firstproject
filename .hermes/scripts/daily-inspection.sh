#!/usr/bin/env bash
# Daily Full Inspection Script for firstproject
# 15 phases, 200+ checks — comprehensive coverage of code, security, infrastructure
# Used by the Hermes cron job for automated daily checks.
set -euo pipefail

APP_DIR="/root/firstproject"
COOKIE_FILE="/tmp/daily_qc.txt"
REPORT="/tmp/daily_inspection_report.txt"
PASS=0
FAIL=0
WARN=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { printf "${GREEN}[✓]${NC} %s\n" "$*"; PASS=$((PASS+1)); }
warn() { printf "${YELLOW}[!]${NC} %s\n" "$*" >&2; WARN=$((WARN+1)); }
fail() { printf "${RED}[✗]${NC} %s\n" "$*" >&2; FAIL=$((FAIL+1)); }
section() { printf "\n${CYAN}═══ %s ═══${NC}\n" "$*"; }

# Helper: check HTTP status code
check_http() {
 local label="$1" url="$2" expect="$3"
 local code
 code=$(curl -s -b "$COOKIE_FILE" -o /dev/null -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || echo "000")
 if [ "$code" = "$expect" ]; then
  log "$label → $code"
 else
  warn "$label → $code (expected $expect)"
 fi
}

check_http_noauth() {
 local label="$1" url="$2"
 local code
 code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || echo "000")
 case "$code" in
  307|401|403) log "$label (no auth) → $code (rejected ✓)";;
  *) warn "$label (no auth) → $code (expected 307/401/403)";;
 esac
}

check_http_flex() {
 local label="$1" url="$2"; shift 2
 local code
 code=$(curl -s -b "$COOKIE_FILE" -o /dev/null -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || echo "000")
 for ok in "$@"; do
  if [ "$code" = "$ok" ]; then
   log "$label → $code"
   return 0
  fi
 done
 warn "$label → $code (expected $*)"
}

check_service() {
 local svc="$1"
 if systemctl is-active --quiet "$svc" 2>/dev/null; then
  log "$svc active"
 else
  fail "$svc NOT active"
 fi
}

# ──────────────────────────────────────────────
# Login first
# ──────────────────────────────────────────────
rm -f "$COOKIE_FILE"
LOGIN_CODE=$(curl -s -c "$COOKIE_FILE" -D /tmp/daily_login_h.txt \
 -X POST http://127.0.0.1:3000/api/login \
 -H "Content-Type: application/x-www-form-urlencoded" \
 -d "username=admin&password=Admin%402026changeMe%21" \
 -o /dev/null -w '%{http_code}' --max-time 10 2>/dev/null || echo "000")

if echo "$LOGIN_CODE" | grep -qE "302|303|307"; then
 log "Admin login → $LOGIN_CODE (redirect ✓)"
else
 fail "Admin login → $LOGIN_CODE (expected redirect)"
 # Try restarting service to clear lockout
 systemctl restart whrkhldsb-next 2>/dev/null || true
 sleep 5
 LOGIN_CODE=$(curl -s -c "$COOKIE_FILE" -D /tmp/daily_login_h.txt \
  -X POST http://127.0.0.1:3000/api/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=Admin%402026changeMe%21" \
  -o /dev/null -w '%{http_code}' --max-time 10 2>/dev/null || echo "000")
 if echo "$LOGIN_CODE" | grep -qE "302|303|307"; then
  log "Admin login (after restart) → $LOGIN_CODE ✓"
 else
  fail "Admin login failed even after restart — aborting"
  exit 1
 fi
fi

# ═══════════════════════════════════════════════
section "Phase 1: 核心基础与认证系统"
# ═══════════════════════════════════════════════

# Server resources
MEM_AVAIL=$(free -m | awk '/Mem:/{print $7}')
[ "$MEM_AVAIL" -gt 200 ] 2>/dev/null && log "Available memory: ${MEM_AVAIL}MB" || warn "Low memory: ${MEM_AVAIL}MB"

DISK_PCT=$(df / | awk 'NR==2{print $5}' | tr -d '%')
[ "$DISK_PCT" -lt 85 ] 2>/dev/null && log "Disk usage: ${DISK_PCT}%" || warn "Disk usage high: ${DISK_PCT}%"

INODE_PCT=$(df -i / | awk 'NR==2{print $5}' | tr -d '%')
[ "$INODE_PCT" -lt 80 ] 2>/dev/null && log "Inode usage: ${INODE_PCT}%" || warn "Inode usage high: ${INODE_PCT}%"

LOAD=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | tr -d ',')
log "Load average: $LOAD"

SWAP_TOTAL=$(free -m | awk '/Swap:/{print $2}')
SWAP_USED=$(free -m | awk '/Swap:/{print $3}')
if [ "$SWAP_TOTAL" -gt 0 ]; then
 log "Swap: ${SWAP_USED}MB / ${SWAP_TOTAL}MB"
else
 warn "No swap configured"
fi

# Services
for svc in whrkhldsb-next whrkhldsb-ssh-ws apache2 postgresql docker; do
 check_service "$svc"
done

# Auth
check_http_noauth "GET /api/users" "http://127.0.0.1:3000/api/users"
check_http "GET /api/users (auth)" "http://127.0.0.1:3000/api/users" "200"
check_http "GET /api/audit (auth)" "http://127.0.0.1:3000/api/audit" "200"
check_http "GET /api/api-tokens (auth)" "http://127.0.0.1:3000/api/api-tokens" "200"

# Service errors in last 24h
ERR_COUNT=$(journalctl -u whrkhldsb-next --no-pager --since "24 hours ago" 2>/dev/null | grep -ci "error\|crash\|fatal" || true)
if [ "$ERR_COUNT" -lt 10 ]; then
 log "Service errors (24h): $ERR_COUNT"
else
 warn "Service errors (24h): $ERR_COUNT — check logs"
fi

# Node process memory
NODE_MEM=$(ps aux | grep "node.*server" | grep -v grep | awk '{sum+=$6}END{printf "%.0f", sum/1024}')
log "Node.js memory: ${NODE_MEM}MB"

# Node uptime
NODE_UPTIME=$(ps aux | grep "node.*server" | grep -v grep | awk '{print $9}' | head -1)
log "Node.js started at: $NODE_UPTIME"

# ═══════════════════════════════════════════════
section "Phase 2: API端点全面扫描 (37路由)"
# ═══════════════════════════════════════════════

# Core APIs — original set
for ep in /api/settings /api/preferences /api/dashboard/analytics /api/health /api/status /api/system-health /api/announcements /api/snippets /api/tickets /api/operation-tasks /api/alert-rules /api/scheduled-tasks /api/deployments /api/deploy-export /api/notifications /api/commands /api/command-templates /api/backups /api/share-links; do
 check_http "GET $ep" "http://127.0.0.1:3000$ep" "200"
done

# Auth endpoints
check_http "GET /api/auth/ws-token" "http://127.0.0.1:3000/api/auth/ws-token" "200"
check_http_noauth "GET /api/settings (no auth)" "http://127.0.0.1:3000/api/settings"

# NEW: Previously missing API routes
check_http "GET /api/docs/openapi" "http://127.0.0.1:3000/api/docs/openapi" "200"
# servers/monitor needs server id, 400 is acceptable
check_http_flex "GET /api/servers/monitor" "http://127.0.0.1:3000/api/servers/monitor" 200 400

# AI sub-routes
check_http "GET /api/ai/providers" "http://127.0.0.1:3000/api/ai/providers" "200"
check_http "GET /api/ai/conversations" "http://127.0.0.1:3000/api/ai/conversations" "200"
check_http "GET /api/ai/hosted-actions" "http://127.0.0.1:3000/api/ai/hosted-actions" "200"
# ai/models needs provider param, 400 is acceptable
AI_MODELS_CODE=$(curl -s -b "$COOKIE_FILE" -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:3000/api/ai/models" 2>/dev/null || echo "000")
case "$AI_MODELS_CODE" in 200|400) log "GET /api/ai/models → $AI_MODELS_CODE";; *) warn "GET /api/ai/models → $AI_MODELS_CODE";; esac
# ai/chat is POST-only
check_http_flex "GET /api/ai/chat (POST-only)" "http://127.0.0.1:3000/api/ai/chat" 405 400

# 2FA endpoints
check_http_flex "GET /api/auth/2fa/setup" "http://127.0.0.1:3000/api/auth/2fa/setup" 200 405
check_http_flex "GET /api/auth/2fa/enable" "http://127.0.0.1:3000/api/auth/2fa/enable" 200 405
check_http_flex "GET /api/auth/2fa/disable" "http://127.0.0.1:3000/api/auth/2fa/disable" 200 405
# Signout — POST expected
check_http_flex "GET /api/auth/signout" "http://127.0.0.1:3000/api/auth/signout" 200 405 302

# Image sub-routes
check_http "GET /api/images/list" "http://127.0.0.1:3000/api/images/list" "200"
check_http "GET /api/images/stats" "http://127.0.0.1:3000/api/images/stats" "200"
# upload is POST-only
check_http_flex "GET /api/images/upload (POST-only)" "http://127.0.0.1:3000/api/images/upload" 405 400
# publish-from-storage is POST-only
check_http_flex "GET /api/images/publish-from-storage (POST-only)" "http://127.0.0.1:3000/api/images/publish-from-storage" 405 400

# Quick-services /app-sources
check_http "GET /api/quick-services" "http://127.0.0.1:3000/api/quick-services" "200"
check_http "GET /api/quick-services/check-port?port=9999" "http://127.0.0.1:3000/api/quick-services/check-port?port=9999" "200"
check_http "GET /api/app-sources" "http://127.0.0.1:3000/api/app-sources" "200"

# Share token — expect 404 (no valid token) not 500
SHARE_CODE=$(curl -s -b "$COOKIE_FILE" -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:3000/api/share/nonexistent-test-token" 2>/dev/null || echo "000")
case "$SHARE_CODE" in 404|410) log "GET /api/share/[token] (invalid) → $SHARE_CODE ✓";; 500) fail "GET /api/share/[token] → 500 (server error)";; *) warn "GET /api/share/[token] → $SHARE_CODE";; esac

# Servers sub-routes
check_http "GET /api/servers/monitor" "http://127.0.0.1:3000/api/servers/monitor" "200"

# ═══════════════════════════════════════════════
section "Phase 3: 前端页面全覆盖 (35路由)"
# ═══════════════════════════════════════════════

# Core pages (original)
for page in /login /servers /files /storage /downloads /media /quick-services /settings /users /audit /docker /ai /monitoring /status /health; do
 check_http "Page $page" "http://127.0.0.1:3000$page" "200"
done

# NEW: Previously missing pages (20 pages)
for page in / /login/verify-2fa /files/preview /image-bed /backups /deployments /templates /scheduled-tasks /operation-tasks /alert-rules /announcements /snippets /notifications /shares /tickets /api-tokens /api-docs /preferences /requests /account/password; do
 check_http "Page $page" "http://127.0.0.1:3000$page" "200"
done

# ═══════════════════════════════════════════════
section "Phase 4: 安全深度扫描"
# ═══════════════════════════════════════════════

# Security headers via Apache — expanded set
SEC_COUNT=$(curl -sS -D- http://127.0.0.1:80/login 2>/dev/null | grep -ci "X-Content-Type-Options\|X-Frame-Options\|X-XSS-Protection\|Referrer-Policy" || true)
if [ "$SEC_COUNT" -ge 4 ]; then
 log "Security headers (core 4): $SEC_COUNT present"
else
 warn "Security headers (core 4): only $SEC_COUNT/4 present"
fi

# CSP header
CSP_COUNT=$(curl -sS -D- http://127.0.0.1:80/login 2>/dev/null | grep -ci "Content-Security-Policy" || true)
[ "$CSP_COUNT" -gt 0 ] && log "CSP header present" || warn "CSP header missing"

# Permissions-Policy header
PERM_COUNT=$(curl -sS -D- http://127.0.0.1:80/login 2>/dev/null | grep -ci "Permissions-Policy" || true)
[ "$PERM_COUNT" -gt 0 ] && log "Permissions-Policy header present" || warn "Permissions-Policy header missing"

# HSTS — check if set (only meaningful with HTTPS)
HSTS_COUNT=$(curl -sS -D- http://127.0.0.1:80/login 2>/dev/null | grep -ci "Strict-Transport-Security" || true)
[ "$HSTS_COUNT" -gt 0 ] && log "HSTS header present" || warn "HSTS header missing (no HTTPS)"

# Port exposure
if ss -tlnp 2>/dev/null | grep -q "0.0.0.0:3000"; then
 warn "Port 3000 bound on 0.0.0.0 (should be 127.0.0.1 only)"
else
 log "Port 3000 bound on 127.0.0.1 only ✓"
fi

# PostgreSQL port exposure
if ss -tlnp 2>/dev/null | grep -q "0.0.0.0:5432"; then
 fail "PostgreSQL port 5432 exposed on 0.0.0.0 (CRITICAL)"
else
 log "PostgreSQL port 5432 not exposed externally ✓"
fi

# Apache config
if apache2ctl configtest 2>&1 | grep -q "Syntax OK"; then
 log "Apache config syntax OK"
else
 fail "Apache config error"
fi

# CSRF protection test — POST without CSRF token should be rejected
CSRF_CODE=$(curl -s -b "$COOKIE_FILE" -o /dev/null -w '%{http_code}' \
 -X POST http://127.0.0.1:3000/api/settings \
 -H "Content-Type: application/json" \
 -d '{}' --max-time 10 2>/dev/null || echo "000")
case "$CSRF_CODE" in
 403) log "CSRF protection: POST without token → 403 ✓";;
 200) fail "CSRF protection: POST without token → 200 (NOT protected!)";;
 *) warn "CSRF protection: POST without token → $CSRF_CODE";;
esac

# Bearer token auth test — invalid token should be rejected
BEARER_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
 -H "Authorization: Bearer invalid-test-token-12345" \
 http://127.0.0.1:3000/api/users --max-time 10 2>/dev/null || echo "000")
case "$BEARER_CODE" in
 401|403) log "Bearer token auth: invalid token → $BEARER_CODE ✓";;
 200) fail "Bearer token auth: invalid token → 200 (NOT protected!)";;
 *) warn "Bearer token auth: invalid token → $BEARER_CODE";;
esac

# Session cookie security attributes
COOKIE_HEADER=$(curl -sS -D- -c /tmp/daily_cookie_check.txt \
 -X POST http://127.0.0.1:3000/api/login \
 -H "Content-Type: application/x-www-form-urlencoded" \
 -d "username=admin&password=Admin%402026changeMe%21" \
 -o /dev/null 2>/dev/null | grep -i "set-cookie" || true)
if echo "$COOKIE_HEADER" | grep -qi "httponly"; then
 log "Session cookie: HttpOnly ✓"
else
 warn "Session cookie: HttpOnly missing"
fi
if echo "$COOKIE_HEADER" | grep -qi "samesite"; then
 log "Session cookie: SameSite ✓"
else
 warn "Session cookie: SameSite missing"
fi

# .env.local file permissions
ENV_PERMS=$(stat -c '%a' "$APP_DIR/.env.local" 2>/dev/null || echo "missing")
case "$ENV_PERMS" in
 600|400) log ".env.local permissions: $ENV_PERMS ✓";;
 640) warn ".env.local permissions: $ENV_PERMS (group readable)";;
 *) warn ".env.local permissions: $ENV_PERMS (should be 600)";;
esac

# DEMO_FALLBACK safety check
if grep -q "DEMO_FALLBACK=true" "$APP_DIR/.env.local" 2>/dev/null; then
 fail "DEMO_FALLBACK=true in production — CRITICAL security risk!"
else
 log "DEMO_FALLBACK not set to true ✓"
fi

# ENCRYPTION_KEY check — should not be a placeholder
if grep -qE "ENCRYPTION_KEY.*(changeme|placeholder|test|example)" "$APP_DIR/.env.local" 2>/dev/null; then
 fail "ENCRYPTION_KEY is a placeholder — SSH keys NOT secure!"
else
 log "ENCRYPTION_KEY not a placeholder ✓"
fi

# Static assets
FIRST_JS=$(curl -s -b "$COOKIE_FILE" http://127.0.0.1:3000/login 2>/dev/null | grep -oP '"\/_next\/static\/chunks\/[^"]*\.js"' | head -1 | tr -d '"')
if [ -n "$FIRST_JS" ]; then
 check_http "JS chunk ${FIRST_JS:0:40}..." "http://127.0.0.1:3000${FIRST_JS}" "200"
else
 warn "No JS chunks found in login page"
fi

# ═══════════════════════════════════════════════
section "Phase 5: 服务器/SSH/文件/监控/Docker"
# ═══════════════════════════════════════════════

# SSH-WS
check_service "whrkhldsb-ssh-ws"
if ss -tlnp 2>/dev/null | grep -q "127.0.0.1:3001"; then
 log "SSH-WS on 127.0.0.1:3001 ✓"
else
 fail "SSH-WS not on 127.0.0.1:3001"
fi

# WebSocket handshake test — SSH proxy
WS_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
 -H "Upgrade: websocket" -H "Connection: Upgrade" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Sec-WebSocket-Version: 13" \
 http://127.0.0.1:3001/ --max-time 5 2>/dev/null || echo "000")
case "$WS_CODE" in
 101) log "WebSocket handshake (SSH proxy) → 101 ✓";;
 400|426) log "WebSocket endpoint reachable (→ $WS_CODE)";;
 *) warn "WebSocket handshake (SSH proxy) → $WS_CODE";;
esac

# File APIs
check_http "GET /api/files/list" "http://127.0.0.1:3000/api/files/list" "200"
ARCHIVE_CODE=$(curl -s -b "$COOKIE_FILE" -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:3000/api/files/archive-list" 2>/dev/null || echo "000")
case "$ARCHIVE_CODE" in 200|400) log "GET /api/files/archive-list → $ARCHIVE_CODE";; *) warn "GET /api/files/archive-list → $ARCHIVE_CODE";; esac
# files/extract is POST-only
check_http_flex "GET /api/files/extract (POST-only)" "http://127.0.0.1:3000/api/files/extract" 405 400

# Monitoring & Docker
check_http "GET /api/monitoring/stats" "http://127.0.0.1:3000/api/monitoring/stats" "200"
check_http "GET /api/docker/containers" "http://127.0.0.1:3000/api/docker/containers" "200"
if docker info >/dev/null 2>&1; then
 log "Docker daemon running ✓"
 RUNNING_CONTAINERS=$(docker ps -q 2>/dev/null | wc -l)
 log "Docker running containers: $RUNNING_CONTAINERS"
 STOPPED_CONTAINERS=$(docker ps -f "status=exited" -q 2>/dev/null | wc -l)
 if [ "$STOPPED_CONTAINERS" -gt 5 ]; then
  warn "Docker stopped containers: $STOPPED_CONTAINERS (consider pruning)"
 else
  log "Docker stopped containers: $STOPPED_CONTAINERS"
 fi
else
 warn "Docker daemon not accessible"
fi

# ═══════════════════════════════════════════════
section "Phase 6: 存储/下载/图床/媒体/分享"
# ═══════════════════════════════════════════════

# Storage APIs
for ep in /api/storage/sftp /api/storage/local; do
 CODE=$(curl -s -b "$COOKIE_FILE" -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:3000$ep" 2>/dev/null || echo "000")
 case "$CODE" in 200|400) log "GET $ep → $CODE";; *) warn "GET $ep → $CODE";; esac
done
for ep in /api/storage/sftp-ops /api/storage/sftp-sync /api/storage/sftp-download /api/storage/direct-access /api/images/batch; do
 CODE=$(curl -s -b "$COOKIE_FILE" -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:3000$ep" 2>/dev/null || echo "000")
 case "$CODE" in 200|400|405) log "GET $ep → $CODE (POST-only OK)";; *) warn "GET $ep → $CODE";; esac
done
for ep in /api/downloads /api/images/list /api/images/stats /api/media /api/share-links; do
 check_http "GET $ep" "http://127.0.0.1:3000$ep" "200"
done

# Runtime dirs
for d in storage tmp uploads downloads backups logs; do
 if [ -d "$APP_DIR/$d" ]; then
  log "Runtime dir $d exists"
  # Check permissions
  DIR_OWNER=$(stat -c '%U' "$APP_DIR/$d" 2>/dev/null || echo "?")
  log "  $d owner: $DIR_OWNER"
 else
  fail "Missing runtime dir: $d"
 fi
done

# ═══════════════════════════════════════════════
section "Phase 7: AI/快捷服务/应用商店/告警"
# ═══════════════════════════════════════════════

for ep in /api/quick-services /api/app-sources /api/alert-rules /api/scheduled-tasks /api/operation-tasks /api/announcements /api/snippets /api/notifications; do
 check_http "GET $ep" "http://127.0.0.1:3000$ep" "200"
done

# Verify remote catalog
REMOTE_COUNT=$(curl -s -b "$COOKIE_FILE" "http://127.0.0.1:3000/api/quick-services" 2>/dev/null | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(len(d.get('remoteCatalog',[])))" 2>/dev/null || echo "0")
if [ "$REMOTE_COUNT" -gt 100 ]; then
 log "Remote catalog: $REMOTE_COUNT apps"
else
 warn "Remote catalog low: $REMOTE_COUNT apps (expected ~187)"
fi

LOCAL_COUNT=$(curl -s -b "$COOKIE_FILE" "http://127.0.0.1:3000/api/quick-services" 2>/dev/null | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(len(d.get('catalog',[])))" 2>/dev/null || echo "0")
log "Local catalog: $LOCAL_COUNT apps"

# ═══════════════════════════════════════════════
section "Phase 8: 数据库深度检查 (43模型)"
# ═══════════════════════════════════════════════

DB_SIZE=$(sudo -u postgres psql -d whrkhldsb -t -c "SELECT pg_database_size('whrkhldsb')/1024/1024;" 2>/dev/null | xargs || echo "?")
log "Database size: ${DB_SIZE}MB"

MIG_COUNT=$(sudo -u postgres psql -d whrkhldsb -t -c "SELECT count(*) FROM _prisma_migrations;" 2>/dev/null | xargs || echo "?")
log "Prisma migrations: $MIG_COUNT"

# Check for pending/failed migrations
MIG_FAILED=$(sudo -u postgres psql -d whrkhldsb -t -c "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL;" 2>/dev/null | xargs || echo "?")
if [ "$MIG_FAILED" = "0" ]; then
 log "Pending/failed migrations: 0 ✓"
else
 fail "Pending/failed migrations: $MIG_FAILED"
fi

USER_COUNT=$(sudo -u postgres psql -d whrkhldsb -t -c 'SELECT count(*) FROM "User";' 2>/dev/null | xargs || echo "?")
log "Users in DB: $USER_COUNT"

REMOTE_APP_COUNT=$(sudo -u postgres psql -d whrkhldsb -t -c "SELECT count(*) FROM app_source_apps;" 2>/dev/null | xargs || echo "?")
log "Remote apps in DB: $REMOTE_APP_COUNT"

# NEW: Key table stats
SERVER_ONLINE=$(sudo -u postgres psql -d whrkhldsb -t -c "SELECT count(*) FROM servers WHERE status='online';" 2>/dev/null | xargs || echo "0")
SERVER_TOTAL=$(sudo -u postgres psql -d whrkhldsb -t -c "SELECT count(*) FROM servers;" 2>/dev/null | xargs || echo "0")
log "Servers: $SERVER_ONLINE online / $SERVER_TOTAL total"

SCHEDULED_ACTIVE=$(sudo -u postgres psql -d whrkhldsb -t -c "SELECT count(*) FROM scheduled_tasks WHERE enabled=true;" 2>/dev/null | xargs || echo "0")
SCHEDULED_FAILED=$(sudo -u postgres psql -d whrkhldsb -t -c "SELECT count(*) FROM scheduled_tasks WHERE last_result='error';" 2>/dev/null | xargs || echo "0")
log "Scheduled tasks: $SCHEDULED_ACTIVE active, $SCHEDULED_FAILED last-error"

SYNC_ERROR=$(sudo -u postgres psql -d whrkhldsb -t -c "SELECT count(*) FROM sync_jobs WHERE status='ERROR';" 2>/dev/null | xargs || echo "0")
SYNC_RUNNING=$(sudo -u postgres psql -d whrkhldsb -t -c "SELECT count(*) FROM sync_jobs WHERE status='RUNNING';" 2>/dev/null | xargs ||echo "0")
log "Sync jobs: $SYNC_RUNNING running, $SYNC_ERROR error"
[ "$SYNC_ERROR" -gt 0 ] 2>/dev/null && warn "Sync jobs in ERROR state: $SYNC_ERROR" || true

NOTIF_UNREAD=$(sudo -u postgres psql -d whrkhldsb -t -c "SELECT count(*) FROM notifications WHERE read=false;" 2>/dev/null | xargs || echo "0")
log "Unread notifications: $NOTIF_UNREAD"
[ "$NOTIF_UNREAD" -gt 100 ] 2>/dev/null && warn "Unread notification backlog: $NOTIF_UNREAD" || true

CMD_PENDING=$(sudo -u postgres psql -d whrkhldsb -t -c "SELECT count(*) FROM command_requests WHERE status='pending';" 2>/dev/null | xargs || echo "0")
log "Pending command requests: $CMD_PENDING"
[ "$CMD_PENDING" -gt 10 ] 2>/dev/null && warn "High pending command requests: $CMD_PENDING" || true

AI_PENDING=$(sudo -u postgres psql -d whrkhldsb -t -c "SELECT count(*) FROM ai_hosted_actions WHERE status='pending';" 2>/dev/null | xargs || echo "0")
log "Pending AI actions: $AI_PENDING"

AUDIT_CRITICAL=$(sudo -u postgres psql -d whrkhldsb -t -c "SELECT count(*) FROM audit_logs WHERE level='CRITICAL' AND created_at > NOW() - INTERVAL '24 hours';" 2>/dev/null | xargs || echo "0")
log "Critical audit events (24h): $AUDIT_CRITICAL"
[ "$AUDIT_CRITICAL" -gt 0 ] 2>/dev/null && warn "Critical audit events in 24h: $AUDIT_CRITICAL" || true

# API tokens
TOKEN_ACTIVE=$(sudo -u postgres psql -d whrkhldsb -t -c "SELECT count(*) FROM api_tokens WHERE revoked=false;" 2>/dev/null | xargs || echo "0")
log "Active API tokens: $TOKEN_ACTIVE"

TOKEN_EXPIRING=$(sudo -u postgres psql -d whrkhldsb -t -c "SELECT count(*) FROM api_tokens WHERE revoked=false AND expires_at IS NOT NULL AND expires_at < NOW() + INTERVAL '7 days';" 2>/dev/null | xargs || echo "0")
if [ "$TOKEN_EXPIRING" -gt 0 ] 2>/dev/null; then
 warn "API tokens expiring within 7 days: $TOKEN_EXPIRING"
else
 log "No API tokens expiring soon"
fi

# Share links
SHARE_EXPIRED=$(sudo -u postgres psql -d whrkhldsb -t -c "SELECT count(*) FROM share_links WHERE expires_at IS NOT NULL AND expires_at < NOW() AND (revoked IS NULL OR revoked=false);" 2>/dev/null | xargs || echo "0")
log "Expired but unrevoked share links: $SHARE_EXPIRED"

# Latest backup
LATEST_BACKUP=$(sudo -u postgres psql -d whrkhldsb -t -c "SELECT created_at FROM backup_records ORDER BY created_at DESC LIMIT 1;" 2>/dev/null | xargs || echo "none")
log "Latest backup record: $LATEST_BACKUP"

# Metric snapshots — check for table bloat
METRIC_COUNT=$(sudo -u postgres psql -d whrkhldsb -t -c "SELECT count(*) FROM metric_snapshots;" 2>/dev/null | xargs || echo "0")
if [ "$METRIC_COUNT" -gt 100000 ] 2>/dev/null; then
 warn "metric_snapshots table large: $METRIC_COUNT rows (consider cleanup)"
else
 log "metric_snapshots rows: $METRIC_COUNT"
fi

# PostgreSQL connection stats
PG_ACTIVE=$(sudo -u postgres psql -d whrkhldsb -t -c "SELECT count(*) FROM pg_stat_activity WHERE state='active';" 2>/dev/null | xargs || echo "?")
PG_IDLE=$(sudo -u postgres psql -d whrkhldsb -t -c "SELECT count(*) FROM pg_stat_activity WHERE state='idle';" 2>/dev/null | xargs || echo "?")
log "PostgreSQL connections: $PG_ACTIVE active, $PG_IDLE idle"

# ═══════════════════════════════════════════════
section "Phase 9: 部署脚本/配置一致性"
# ═══════════════════════════════════════════════

# Install script syntax
if CHECK_SYNTAX_ONLY=1 bash "$APP_DIR/install.sh" 2>/dev/null; then
 log "install.sh syntax OK"
else
 fail "install.sh syntax error"
fi

# Preflight & check
if APP_DIR="$APP_DIR" ENV_FILE="$APP_DIR/.env.local" bash "$APP_DIR/deploy/preflight.sh" >/dev/null 2>&1; then
 log "preflight.sh passed"
else
 warn "preflight.sh failed"
fi

if APP_DIR="$APP_DIR" bash "$APP_DIR/deploy/check.sh" >/dev/null 2>&1; then
 log "check.sh passed"
else
 warn "check.sh failed"
fi

# NEW: Additional deploy script syntax checks
for script in upgrade.sh backup.sh smoke-test.sh package.sh; do
 if [ -f "$APP_DIR/deploy/$script" ]; then
  if bash -n "$APP_DIR/deploy/$script" 2>/dev/null; then
   log "deploy/$script syntax OK"
  else
   fail "deploy/$script syntax error"
  fi
 else
  warn "deploy/$script not found"
 fi
done

# NEW: Systemd service vs template consistency
for svc in whrkhldsb-next whrkhldsb-ssh-ws; do
 if [ -f "/etc/systemd/system/${svc}.service" ] && [ -f "$APP_DIR/deploy/systemd/${svc}.service.example" ]; then
  DIFF_COUNT=$(diff "/etc/systemd/system/${svc}.service" "$APP_DIR/deploy/systemd/${svc}.service.example" 2>/dev/null | grep -c "^[<>]" || true)
  DIFF_COUNT=$(echo "$DIFF_COUNT" | tr -d '[:space:]')
  DIFF_COUNT=${DIFF_COUNT:-0}
  if [ "$DIFF_COUNT" -le 5 ]; then
   log "${svc}.service consistent with template (diff=$DIFF_COUNT lines)"
  else
   warn "${svc}.service differs from template by $DIFF_COUNT lines"
  fi
 else
  warn "Cannot compare ${svc}.service with template"
 fi
done

# NEW: Apache config vs template consistency
if [ -f "/etc/apache2/sites-enabled/next-proxy.conf" ] && [ -f "$APP_DIR/deploy/apache-next-proxy.example.conf" ]; then
 APACHE_DIFF=$(diff "/etc/apache2/sites-enabled/next-proxy.conf" "$APP_DIR/deploy/apache-next-proxy.example.conf" 2>/dev/null | grep -c "^[<>]" || true)
 APACHE_DIFF=$(echo "$APACHE_DIFF" | tr -d '[:space:]')
 APACHE_DIFF=${APACHE_DIFF:-0}
 if [ "$APACHE_DIFF" -le 8 ]; then
  log "Apache config consistent with template (diff=$APACHE_DIFF lines)"
 else
  warn "Apache config differs from template by $APACHE_DIFF lines"
 fi
fi

# npm audit (high/critical only)
VULN_HIGH=$(cd "$APP_DIR" && npm audit --production 2>/dev/null | grep -oE '[0-9]+ high' | grep -oE '[0-9]+' || echo "0")
VULN_CRIT=$(cd "$APP_DIR" && npm audit --production 2>/dev/null | grep -oE '[0-9]+ critical' | grep -oE '[0-9]+' || echo "0")
TOTAL_VULN=$((VULN_HIGH + VULN_CRIT))
if [ "$TOTAL_VULN" = "0" ]; then
 log "npm audit: no high/critical vulnerabilities"
else
 warn "npm audit: $VULN_HIGH high + $VULN_CRIT critical vulnerabilities"
fi

# ═══════════════════════════════════════════════
section "Phase 10: 系统级安全与基础设施"
# ═══════════════════════════════════════════════

# Firewall rules
FW_POLICY=$(iptables -L INPUT -n 2>/dev/null | head -1 | grep -oP 'policy (\w+)' | awk '{print $2}' || echo "unknown")
if [ "$FW_POLICY" = "ACCEPT" ]; then
 warn "Firewall INPUT policy: ACCEPT (all open — consider hardening)"
elif [ "$FW_POLICY" = "DROP" ] || [ "$FW_POLICY" = "REJECT" ]; then
 log "Firewall INPUT policy: $FW_POLICY ✓"
else
 warn "Firewall status: $FW_POLICY (check iptables/nftables)"
fi

# Check specific port exposure
for port in 22 80 443; do
 if ss -tlnp 2>/dev/null | grep -qE "0\.0\.0\.0:$port|:::$port"; then
  log "Port $port exposed (expected for public service)"
 fi
done
for port in 3000 3001 5432; do
 if ss -tlnp 2>/dev/null | grep -qE "0\.0\.0\.0:$port|:::$port"; then
  fail "Port $port exposed on 0.0.0.0 (should be localhost only!)"
 else
  log "Port $port not externally exposed ✓"
 fi
done

# SSH security config
if [ -f /etc/ssh/sshd_config ]; then
 if grep -qE "^PermitRootLogin\s+no" /etc/ssh/sshd_config 2>/dev/null || grep -qE "^PermitRootLogin\s+prohibit-password" /etc/ssh/sshd_config 2>/dev/null; then
  log "SSH: PermitRootLogin restricted ✓"
 else
  warn "SSH: PermitRootLogin not restricted"
 fi
 if grep -qE "^PasswordAuthentication\s+no" /etc/ssh/sshd_config 2>/dev/null; then
  log "SSH: PasswordAuthentication disabled ✓"
 else
  warn "SSH: PasswordAuthentication enabled (consider key-only)"
 fi
else
 warn "sshd_config not found"
fi

# SSL/TLS status
if [ -f /etc/letsencrypt/live/*/cert.pem ] 2>/dev/null || ls /etc/letsencrypt/live/*/cert.pem >/dev/null 2>&1; then
 log "SSL/TLS: Let's Encrypt certificate found"
 # Check expiry
 CERT_EXPIRY=$(openssl x509 -enddate -noout -in /etc/letsencrypt/live/*/cert.pem 2>/dev/null | head -1 | cut -d= -f2 || echo "unknown")
 log "Certificate expiry: $CERT_EXPIRY"
else
 warn "SSL/TLS: No certificate found — site running HTTP only"
fi

# Log rotation check
if [ -f /etc/logrotate.d/apache2 ]; then
 log "Apache log rotation configured ✓"
else
 warn "Apache log rotation not configured"
fi

# Check for whrkhldsb-specific logrotate
if ls /etc/logrotate.d/*whrkhldsb* >/dev/null 2>&1 || [ -f /etc/logrotate.d/whrkhldsb ]; then
 log "whrkhldsb log rotation configured ✓"
else
 warn "No whrkhldsb log rotation config — logs may grow unbounded"
fi

# Check large log files
LARGEST_LOG=$(find /var/log -name "*.log" -size +100M 2>/dev/null | head -5 || true)
if [ -n "$LARGEST_LOG" ]; then
 warn "Large log files (>100MB): $LARGEST_LOG"
else
 log "No log files >100MB"
fi

# System auto-updates
if systemctl is-active --quiet apt-daily.timer 2>/dev/null; then
 log "apt-daily.timer active (auto-updates enabled) ✓"
else
 warn "apt-daily.timer not active (no auto security updates)"
fi

# NTP time sync
TIMEDATECTL=$(timedatectl show 2>/dev/null || true)
if echo "$TIMEDATECTL" | grep -q "NTPSynchronized=yes"; then
 log "NTP time synchronized ✓"
elif command -v ntpq >/dev/null 2>&1 && ntpq -p 2>/dev/null | grep -q "^\*"; then
 log "NTP time synchronized (ntpd) ✓"
else
 warn "NTP time may not be synchronized (affects 2FA TOTP / logs)"
fi

# Zombie processes
ZOMBIE_COUNT=$(ps aux | awk '{if($8=="Z") print}' | wc -l)
if [ "$ZOMBIE_COUNT" -eq 0 ]; then
 log "No zombie processes ✓"
else
 warn "Zombie processes: $ZOMBIE_COUNT"
fi

# ═══════════════════════════════════════════════
section "Phase 11: 备份与恢复验证"
# ═══════════════════════════════════════════════

# Check cron backup job
BACKUP_CRON=$(crontab -l 2>/dev/null | grep -c "backup" || echo "0")
if [ "$BACKUP_CRON" -gt 0 ]; then
 log "Backup cron job configured ($BACKUP_CRON entries)"
else
 warn "No backup cron job found"
fi

# Check latest backup file
LATEST_BACKUP_FILE=$(find "$APP_DIR/backups" -name "*.sql.gz" -o -name "*.sql" 2>/dev/null | xargs ls -t 2>/dev/null | head -1 || true)
if [ -n "$LATEST_BACKUP_FILE" ]; then
 BACKUP_AGE_SEC=$(( $(date +%s) - $(stat -c '%Y' "$LATEST_BACKUP_FILE" 2>/dev/null || echo "0") ))
 BACKUP_AGE_HOURS=$((BACKUP_AGE_SEC / 3600))
 BACKUP_SIZE=$(stat -c '%s' "$LATEST_BACKUP_FILE" 2>/dev/null || echo "0")
 if [ "$BACKUP_AGE_HOURS" -le 48 ]; then
  log "Latest backup: ${BACKUP_AGE_HOURS}h ago, size: $BACKUP_SIZE bytes ✓"
 else
  warn "Latest backup: ${BACKUP_AGE_HOURS}h ago (older than 48h)"
 fi
 if [ "$BACKUP_SIZE" -lt 1000 ] 2>/dev/null; then
  warn "Backup file suspiciously small: $BACKUP_SIZE bytes"
 fi
else
 warn "No backup files found in $APP_DIR/backups"
fi

# Verify backup script is executable
if [ -x "$APP_DIR/deploy/backup.sh" ]; then
 log "deploy/backup.sh executable ✓"
elif [ -f "$APP_DIR/deploy/backup.sh" ]; then
 warn "deploy/backup.sh not executable"
else
 warn "deploy/backup.sh not found"
fi

# ═══════════════════════════════════════════════
section "Phase 12: RBAC权限系统验证"
# ═══════════════════════════════════════════════

# Check role system in DB
ROLE_COUNT=$(sudo -u postgres psql -d whrkhldsb -t -c "SELECT count(*) FROM \"Role\";" 2>/dev/null | xargs || echo "0")
log "Roles in DB: $ROLE_COUNT"

PERM_COUNT=$(sudo -u postgres psql -d whrkhldsb -t -c "SELECT count(*) FROM \"Permission\";" 2>/dev/null | xargs || echo "0")
log "Permissions in DB: $PERM_COUNT"

# Verify non-admin cannot access admin APIs (basic RBAC test)
# We can't create test users via API easily, so check role-permission assignments
ADMIN_PERMS=$(sudo -u postgres psql -d whrkhldsb -t -c "SELECT count(*) FROM \"RolePermission\" rp JOIN \"Role\" r ON rp.\"roleId\"=r.\"id\" WHERE r.\"name\"='admin';" 2>/dev/null | xargs || echo "0")
log "Admin role permissions: $ADMIN_PERMS"

VIEWER_PERMS=$(sudo -u postgres psql -d whrkhldsb -t -c "SELECT count(*) FROM \"RolePermission\" rp JOIN \"Role\" r ON rp.\"roleId\"=r.\"id\" WHERE r.\"name\"='viewer';" 2>/dev/null | xargs || echo "0")
log "Viewer role permissions: $VIEWER_PERMS"

# ═══════════════════════════════════════════════
section "Phase 13: 运行时状态深度检查"
# ═══════════════════════════════════════════════

# Node.js heap usage (from /api/monitoring/stats)
HEAP_DATA=$(curl -s -b "$COOKIE_FILE" http://127.0.0.1:3000/api/monitoring/stats 2>/dev/null || echo "{}")
HEAP_USED=$(echo "$HEAP_DATA" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('memory',{}).get('heapUsed','?'))" 2>/dev/null || echo "?")
HEAP_TOTAL=$(echo "$HEAP_DATA" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('memory',{}).get('heapTotal','?'))" 2>/dev/null || echo "?")
log "Node.js heap: ${HEAP_USED} / ${HEAP_TOTAL}"

# Process uptime
NEXT_UPTIME=$(systemctl show whrkhldsb-next --property=ActiveEnterTimestamp 2>/dev/null | cut -d= -f2 || echo "?")
log "whrkhldsb-next since: $NEXT_UPTIME"

SSHWS_UPTIME=$(systemctl show whrkhldsb-ssh-ws --property=ActiveEnterTimestamp 2>/dev/null | cut -d= -f2 || echo "?")
log "whrkhldsb-ssh-ws since: $SSHWS_UPTIME"

# Service restart counts (instability indicator)
NEXT_RESTARTS=$(journalctl -u whrkhldsb-next --no-pager --since "7 days ago" 2>/dev/null | grep -ci "Started\|start-post" || echo "0")
log "whrkhldsb-next restarts (7d): $NEXT_RESTARTS"
[ "$NEXT_RESTARTS" -gt 10 ] 2>/dev/null && warn "Frequent restarts: $NEXT_RESTARTS in 7d" || true

# Disk usage detail
log "Disk: $(df -h / | awk 'NR==2{print $5 " used, " $4 " free"}')"
log "Memory: $(free -h | awk '/Mem:/{print $3 " used, " $2 " total"}')"

# Docker disk usage
if command -v docker >/dev/null 2>&1; then
 DOCKER_DISK=$(docker system df 2>/dev/null | head -2 | tail -1 | awk '{print $3}' || echo "?")
 log "Docker disk: $DOCKER_DISK"
 # Docker images that could be pruned
 DANGLING=$(docker images -f "dangling=true" -q 2>/dev/null | wc -l)
 if [ "$DANGLING" -gt 3 ]; then
  warn "Dangling Docker images: $DANGLING (consider prune)"
 else
  log "Dangling Docker images: $DANGLING"
 fi
fi

# ═══════════════════════════════════════════════
section "Phase 14: 速率限制与2FA验证"
# ═══════════════════════════════════════════════

# Rate limiting — rapid fire requests to check if limited
# Make 15 rapid requests to /api/login; if all return 200/302/401, rate limiting may be off
RATE_LIMIT_TRIGGERED=0
for i in $(seq 1 15); do
 RL_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST http://127.0.0.1:3000/api/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=test&password=wrong" --max-time 3 2>/dev/null || echo "000")
 if [ "$RL_CODE" = "429" ]; then
  RATE_LIMIT_TRIGGERED=1
  break
 fi
done
if [ "$RATE_LIMIT_TRIGGERED" = "1" ]; then
 log "Rate limiting: login endpoint returns 429 ✓"
else
 warn "Rate limiting: no 429 after 15 rapid login attempts (may not be enforced)"
fi

# 2FA system check — verify setup endpoint responds
TWOFA_CODE=$(curl -s -b "$COOKIE_FILE" -o /dev/null -w '%{http_code}' \
 http://127.0.0.1:3000/api/auth/2fa/setup --max-time 10 2>/dev/null || echo "000")
case "$TWOFA_CODE" in
 200) log "2FA setup endpoint accessible ✓";;
 405) log "2FA setup endpoint exists (POST-only) ✓";;
 404) warn "2FA setup endpoint not found";;
 *) warn "2FA setup endpoint → $TWOFA_CODE";;
esac

# ═══════════════════════════════════════════════
section "Phase 15: 中间件与构建一致性"
# ═══════════════════════════════════════════════

# Middleware existence check
if [ -f "$APP_DIR/middleware.ts" ] || [ -f "$APP_DIR/src/middleware.ts" ]; then
 log "middleware.ts exists ✓"
else
 warn "middleware.ts not found"
fi

# Build artifacts check — .next directory
if [ -d "$APP_DIR/.next" ]; then
 BUILD_TIME=$(stat -c '%Y' "$APP_DIR/.next/BUILD_ID" 2>/dev/null || echo "0")
 SERVER_TIME=$(stat -c '%Y' "$APP_DIR/src/server.ts" 2>/dev/null || echo "0")
 if [ "$BUILD_TIME" -ge "$SERVER_TIME" ] 2>/dev/null; then
  log "Build artifacts up-to-date (build ≥ source) ✓"
 else
  warn "Build artifacts older than source — may need rebuild"
 fi
else
 fail ".next directory missing — no build artifacts!"
fi

# .next cache size
NEXT_CACHE_SIZE=$(du -sm "$APP_DIR/.next" 2>/dev/null | awk '{print $1}' || echo "?")
log ".next cache size: ${NEXT_CACHE_SIZE}MB"
[ "$NEXT_CACHE_SIZE" -gt 2000 ] 2>/dev/null && warn ".next cache large: ${NEXT_CACHE_SIZE}MB" || true

# package.json vs installed node_modules consistency
if [ -f "$APP_DIR/package.json" ] && [ -d "$APP_DIR/node_modules" ]; then
 PKG_COUNT=$(cd "$APP_DIR" && node -e "const p=require('./package.json'); const deps=Object.keys(p.dependencies||{}); const dev=Object.keys(p.devDependencies||{}); console.log(deps.length+dev.length)" 2>/dev/null || echo "?")
 log "package.json dependencies: $PKG_COUNT"
fi

# Git repo status
if [ -d "$APP_DIR/.git" ]; then
 GIT_BRANCH=$(cd "$APP_DIR" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")
 GIT_COMMIT=$(cd "$APP_DIR" && git rev-parse --short HEAD 2>/dev/null || echo "?")
 GIT_DIRTY=$(cd "$APP_DIR" && git status --porcelain 2>/dev/null | wc -l || echo "0")
 log "Git: branch=$GIT_BRANCH commit=$GIT_COMMIT dirty=$GIT_DIRTY"
 [ "$GIT_DIRTY" -gt 0 ] 2>/dev/null && warn "Git working tree has $GIT_DIRTY uncommitted changes" || true
else
 warn "No .git directory found"
fi

# ═══════════════════════════════════════════════
# Final Summary
# ═══════════════════════════════════════════════
printf "\n${CYAN}═══════════════════════════════════════${NC}\n"
printf "${CYAN} 📊 每日巡检报告 — $(date '+%Y-%m-%d %H:%M')${NC}\n"
printf "${CYAN} 📋 15阶段全覆盖巡检${NC}\n"
printf "${CYAN}═══════════════════════════════════════${NC}\n"
printf " ✅ 正常: %d\n" "$PASS"
printf " ⚠️ 警告: %d\n" "$WARN"
printf " ❌ 异常: %d\n" "$FAIL"
printf "${CYAN}═══════════════════════════════════════${NC}\n"

# Save report
{
 echo "=== 每日巡检报告 $(date '+%Y-%m-%d %H:%M') ==="
 echo "✅ 正常: $PASS ⚠️ 警告: $WARN ❌ 异常: $FAIL"
 echo "磁盘: $(df -h / | awk 'NR==2{print $5}') 内存: $(free -h | awk '/Mem:/{print $3"/"$2}') 负载: $LOAD Inode: ${INODE_PCT}%"
 echo "Swap: ${SWAP_USED}MB/${SWAP_TOTAL}MB"
 echo "服务: next=$(systemctl is-active whrkhldsb-next) ssh-ws=$(systemctl is-active whrkhldsb-ssh-ws) apache=$(systemctl is-active apache2) pg=$(systemctl is-active postgresql) docker=$(systemctl is-active docker)"
 echo "DB: ${DB_SIZE}MB 迁移: $MIG_COUNT(pending:$MIG_FAILED) 用户: $USER_COUNT 远程应用: $REMOTE_APP_COUNT"
 echo "服务器: $SERVER_ONLINE/$SERVER_TOTAL 在线 定时任务: $SCHEDULED_ACTIVE 活跃/$SCHEDULED_FAILED 错误"
 echo "同步: $SYNC_RUNNING 运行/$SYNC_ERROR 错误 通知: $NOTIF_UNREAD 未读"
 echo "24h错误: $ERR_COUNT npm高危: $VULN_HIGH critical: $VULN_CRIT"
 echo "防火墙: $FW_POLICY CSRF: tested 2FA: tested"
 echo "备份: $LATEST_BACKUP_FILE"
 echo "Git: branch=$GIT_BRANCH commit=$GIT_COMMIT dirty=$GIT_DIRTY"
} > "$REPORT"

# Cleanup
rm -f "$COOKIE_FILE" /tmp/daily_cookie_check.txt /tmp/daily_login_h.txt 2>/dev/null || true

# Exit with failure if any critical issues
if [ "$FAIL" -gt 0 ]; then
 exit 1
fi
