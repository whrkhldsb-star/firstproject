-- Rename tables to snake_case (matching @@map directives)
ALTER TABLE "AuditLog" RENAME TO "audit_logs";
ALTER TABLE "CommandRequest" RENAME TO "command_requests";
ALTER TABLE "CommandTarget" RENAME TO "command_targets";

-- Rename indexes to match new table names
ALTER INDEX "AuditLog_pkey" RENAME TO "audit_logs_pkey";
ALTER INDEX "CommandRequest_pkey" RENAME TO "command_requests_pkey";
ALTER INDEX "CommandTarget_pkey" RENAME TO "command_targets_pkey";
