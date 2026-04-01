CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    path        TEXT NOT NULL,
    description TEXT DEFAULT '',
    status      TEXT DEFAULT 'idle'
        CHECK(status IN ('idle','running','completed','failed')),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    prompt      TEXT DEFAULT '',
    status      TEXT DEFAULT 'pending'
        CHECK(status IN ('pending','running','completed','failed')),
    sort_order  INTEGER DEFAULT 0,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS executions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id       INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    session_id    TEXT,
    prompt        TEXT NOT NULL,
    result_text   TEXT DEFAULT '',
    raw_output    TEXT DEFAULT '',
    status        TEXT DEFAULT 'running'
        CHECK(status IN ('running','success','error')),
    cost_usd      REAL DEFAULT 0.0,
    duration_ms   INTEGER DEFAULT 0,
    num_turns     INTEGER DEFAULT 0,
    started_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at   TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_executions_task ON executions(task_id);
