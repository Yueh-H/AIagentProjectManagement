from models.database import DatabaseManager


def create_project(name: str, path: str, description: str = "") -> int:
    db = DatabaseManager()
    cursor = db.execute(
        "INSERT INTO projects (name, path, description) VALUES (?, ?, ?)",
        (name, path, description),
    )
    return cursor.lastrowid


def get_all_projects() -> list[dict]:
    db = DatabaseManager()
    return db.fetch_all(
        "SELECT * FROM projects ORDER BY updated_at DESC"
    )


def get_project(project_id: int) -> dict | None:
    db = DatabaseManager()
    return db.fetch_one("SELECT * FROM projects WHERE id = ?", (project_id,))


def update_project(project_id: int, **kwargs) -> None:
    db = DatabaseManager()
    allowed = {"name", "path", "description", "status"}
    fields = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return
    sets = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [project_id]
    db.execute(
        f"UPDATE projects SET {sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        tuple(values),
    )


def delete_project(project_id: int) -> None:
    db = DatabaseManager()
    db.execute("DELETE FROM projects WHERE id = ?", (project_id,))


def get_project_stats(project_id: int) -> dict:
    db = DatabaseManager()
    total = db.fetch_one(
        "SELECT COUNT(*) as cnt FROM tasks WHERE project_id = ?", (project_id,)
    )
    completed = db.fetch_one(
        "SELECT COUNT(*) as cnt FROM tasks WHERE project_id = ? AND status = 'completed'",
        (project_id,),
    )
    return {
        "total_tasks": total["cnt"] if total else 0,
        "completed_tasks": completed["cnt"] if completed else 0,
    }
