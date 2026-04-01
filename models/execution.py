from models.database import DatabaseManager


def create_execution(task_id: int, prompt: str, agent_id: int | None = None) -> int:
    db = DatabaseManager()
    cursor = db.execute(
        "INSERT INTO executions (task_id, agent_id, prompt) VALUES (?, ?, ?)",
        (task_id, agent_id, prompt),
    )
    return cursor.lastrowid


def get_execution(execution_id: int) -> dict | None:
    db = DatabaseManager()
    return db.fetch_one("SELECT * FROM executions WHERE id = ?", (execution_id,))


def get_executions_by_task(task_id: int) -> list[dict]:
    db = DatabaseManager()
    return db.fetch_all(
        "SELECT * FROM executions WHERE task_id = ? ORDER BY started_at DESC",
        (task_id,),
    )


def get_executions_by_agent(agent_id: int) -> list[dict]:
    db = DatabaseManager()
    return db.fetch_all(
        "SELECT * FROM executions WHERE agent_id = ? ORDER BY started_at DESC",
        (agent_id,),
    )


def get_last_session_id(task_id: int) -> str | None:
    """Get the session_id from the most recent execution of a task."""
    db = DatabaseManager()
    row = db.fetch_one(
        "SELECT session_id FROM executions "
        "WHERE task_id = ? AND session_id IS NOT NULL AND session_id != '' "
        "ORDER BY started_at DESC, id DESC LIMIT 1",
        (task_id,),
    )
    return row["session_id"] if row else None


def get_last_session_id_by_agent(agent_id: int) -> str | None:
    """Get the session_id from the most recent execution of an agent."""
    db = DatabaseManager()
    row = db.fetch_one(
        "SELECT session_id FROM executions "
        "WHERE agent_id = ? AND session_id IS NOT NULL AND session_id != '' "
        "ORDER BY started_at DESC, id DESC LIMIT 1",
        (agent_id,),
    )
    return row["session_id"] if row else None


def update_execution(execution_id: int, **kwargs) -> None:
    db = DatabaseManager()
    allowed = {
        "session_id", "result_text", "raw_output", "status",
        "cost_usd", "duration_ms", "num_turns", "finished_at",
    }
    fields = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return
    sets = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [execution_id]
    db.execute(
        f"UPDATE executions SET {sets} WHERE id = ?",
        tuple(values),
    )
