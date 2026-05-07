-- AddMissingCriticalIndexes
-- AuditLog: time-series and filtered queries
CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "audit_logs_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "audit_logs_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CommandRequest: status filtering and user-scoped queries
CREATE INDEX IF NOT EXISTS "command_requests_status_createdAt_idx" ON "CommandRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "command_requests_requesterId_createdAt_idx" ON "CommandRequest"("requesterId", "createdAt");

-- CommandTarget: server-scoped status queries
CREATE INDEX IF NOT EXISTS "command_targets_serverId_status_idx" ON "CommandTarget"("serverId", "status");
