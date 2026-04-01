from models.database import DatabaseManager


def create_agent(task_id: int, name: str = "") -> int:
    db = DatabaseManager()
    if not name:
        # Auto-name: Agent 1, Agent 2, ...
        existing = get_agents_by_task(task_id)
        name = f"Agent {len(existing) + 1}"
    cursor = db.execute(
        "INSERT INTO agents (task_id, name) VALUES (?, ?)",
        (task_id, name),
    )
    return cursor.lastrowid


def get_agent(agent_id: int) -> dict | None:
    db = DatabaseManager()
    return db.fetch_one("SELECT * FROM agents WHERE id = ?", (agent_id,))


def get_agents_by_task(task_id: int) -> list[dict]:
    db = DatabaseManager()
    return db.fetch_all(
        "SELECT * FROM agents WHERE task_id = ? ORDER BY id",
        (task_id,),
    )


def update_agent(agent_id: int, **kwargs) -> None:
    db = DatabaseManager()
    allowed = {"name", "session_id", "status"}
    fields = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return
    sets = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [agent_id]
    db.execute(
        f"UPDATE agents SET {sets} WHERE id = ?",
        tuple(values),
    )


def delete_agent(agent_id: int) -> None:
    db = DatabaseManager()
    db.execute("DELETE FROM agents WHERE id = ?", (agent_id,))
