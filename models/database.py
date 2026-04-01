import os
import sqlite3
from pathlib import Path


class DatabaseManager:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        db_dir = Path.home() / ".claude_code_manager"
        db_dir.mkdir(parents=True, exist_ok=True)
        self._db_path = db_dir / "data.db"
        self._conn = sqlite3.connect(str(self._db_path))
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._initialize_schema()

    def _initialize_schema(self):
        schema_path = Path(__file__).parent.parent / "db" / "schema.sql"
        with open(schema_path, "r") as f:
            self._conn.executescript(f.read())
        self._conn.commit()

    @property
    def conn(self) -> sqlite3.Connection:
        return self._conn

    def execute(self, sql: str, params: tuple = ()) -> sqlite3.Cursor:
        cursor = self._conn.execute(sql, params)
        self._conn.commit()
        return cursor

    def fetch_one(self, sql: str, params: tuple = ()) -> dict | None:
        row = self._conn.execute(sql, params).fetchone()
        return dict(row) if row else None

    def fetch_all(self, sql: str, params: tuple = ()) -> list[dict]:
        rows = self._conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]

    def close(self):
        self._conn.close()
