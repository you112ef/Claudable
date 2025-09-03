-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "preview_url" TEXT,
    "preview_port" INTEGER,
    "repo_path" TEXT,
    "initial_prompt" TEXT,
    "template_type" TEXT,
    "active_claude_session_id" TEXT,
    "active_cursor_session_id" TEXT,
    "preferred_cli" TEXT NOT NULL DEFAULT 'claude',
    "selected_model" TEXT,
    "fallback_enabled" BOOLEAN NOT NULL DEFAULT true,
    "settings" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" DATETIME
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "message_type" TEXT,
    "content" TEXT NOT NULL,
    "metadata_json" TEXT,
    "parent_message_id" TEXT,
    "session_id" TEXT,
    "conversation_id" TEXT,
    "duration_ms" INTEGER,
    "token_count" INTEGER,
    "cost_usd" REAL,
    "commit_sha" TEXT,
    "cli_source" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "messages_parent_message_id_fkey" FOREIGN KEY ("parent_message_id") REFERENCES "messages" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "claude_session_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "model" TEXT,
    "cli_type" TEXT NOT NULL DEFAULT 'claude',
    "transcript_path" TEXT,
    "transcript_format" TEXT NOT NULL DEFAULT 'json',
    "instruction" TEXT,
    "summary" TEXT,
    "total_messages" INTEGER NOT NULL DEFAULT 0,
    "total_tools_used" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_cost_usd" REAL,
    "duration_ms" INTEGER,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" DATETIME,
    CONSTRAINT "sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "commits" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "session_id" TEXT,
    "commit_sha" TEXT NOT NULL,
    "parent_sha" TEXT,
    "message" TEXT NOT NULL,
    "author_type" TEXT,
    "author_name" TEXT,
    "author_email" TEXT,
    "files_changed" TEXT,
    "stats" TEXT,
    "diff" TEXT,
    "committed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "commits_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "commits_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "env_vars" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value_encrypted" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'runtime',
    "var_type" TEXT NOT NULL DEFAULT 'string',
    "is_secret" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "env_vars_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "service_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used" DATETIME
);

-- CreateTable
CREATE TABLE "project_service_connections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "service_data" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME,
    "last_sync_at" DATETIME,
    CONSTRAINT "project_service_connections_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tools_usage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "message_id" TEXT,
    "tool_name" TEXT NOT NULL,
    "tool_action" TEXT,
    "input_data" TEXT,
    "output_data" TEXT,
    "files_affected" TEXT,
    "lines_added" INTEGER,
    "lines_removed" INTEGER,
    "duration_ms" INTEGER,
    "is_error" BOOLEAN NOT NULL DEFAULT false,
    "error_message" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tools_usage_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tools_usage_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tools_usage_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "user_message_id" TEXT NOT NULL,
    "session_id" TEXT,
    "instruction" TEXT NOT NULL,
    "request_type" TEXT NOT NULL DEFAULT 'act',
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "is_successful" BOOLEAN,
    "result_metadata" TEXT,
    "error_message" TEXT,
    "cli_type_used" TEXT,
    "model_used" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" DATETIME,
    "completed_at" DATETIME,
    CONSTRAINT "user_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_requests_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "user_requests_user_message_id_fkey" FOREIGN KEY ("user_message_id") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "messages_session_id_idx" ON "messages"("session_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_idx" ON "messages"("conversation_id");

-- CreateIndex
CREATE INDEX "messages_cli_source_idx" ON "messages"("cli_source");

-- CreateIndex
CREATE INDEX "sessions_project_id_idx" ON "sessions"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "commits_commit_sha_key" ON "commits"("commit_sha");

-- CreateIndex
CREATE INDEX "commits_project_id_idx" ON "commits"("project_id");

-- CreateIndex
CREATE INDEX "env_vars_project_id_idx" ON "env_vars"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "unique_project_var" ON "env_vars"("project_id", "key", "scope");

-- CreateIndex
CREATE INDEX "service_tokens_provider_idx" ON "service_tokens"("provider");

-- CreateIndex
CREATE INDEX "idx_project_services" ON "project_service_connections"("projectId", "provider");

-- CreateIndex
CREATE INDEX "idx_provider_status" ON "project_service_connections"("provider", "status");

-- CreateIndex
CREATE INDEX "tools_usage_session_id_idx" ON "tools_usage"("session_id");

-- CreateIndex
CREATE INDEX "tools_usage_project_id_idx" ON "tools_usage"("project_id");

-- CreateIndex
CREATE INDEX "tools_usage_tool_name_idx" ON "tools_usage"("tool_name");

-- CreateIndex
CREATE UNIQUE INDEX "user_requests_user_message_id_key" ON "user_requests"("user_message_id");

-- CreateIndex
CREATE INDEX "user_requests_project_id_idx" ON "user_requests"("project_id");

-- CreateIndex
CREATE INDEX "user_requests_session_id_idx" ON "user_requests"("session_id");

-- CreateIndex
CREATE INDEX "user_requests_is_completed_idx" ON "user_requests"("is_completed");
