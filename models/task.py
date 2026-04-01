from models.database import DatabaseManager


def create_task(project_id: int, title: str, prompt: str = "") -> int:
    db = DatabaseManager()
    cursor = db.execute(
        "INSERT INTO tasks (project_id, title, prompt) VALUES (?, ?, ?)",
        (project_id, title, prompt),
    )
    return cursor.lastrowid


def get_tasks_by_project(project_id: int) -> list[dict]:
    db = DatabaseManager()
    return db.fetch_all(
        "SELECT * FROM tasks WHERE project_id = ? ORDER BY sort_order, id",
        (project_id,),
    )


def get_task(task_id: int) -> dict | None:
    db = DatabaseManager()
    return db.fetch_one("SELECT * FROM tasks WHERE id = ?", (task_id,))


def update_task(task_id: int, **kwargs) -> None:
    db = DatabaseManager()
    allowed = {"title", "prompt", "status", "sort_order"}
    fields = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return
    sets = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [task_id]
    db.execute(
        f"UPDATE tasks SET {sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        tuple(values),
    )


def delete_task(task_id: int) -> None:
    db = DatabaseManager()
    db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
