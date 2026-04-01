import sys
import sqlite3
import pytest
from pathlib import Path
from unittest.mock import patch

# Ensure project root is on path
sys.path.insert(0, str(Path(__file__).parent.parent))


@pytest.fixture(autouse=True)
def reset_db(tmp_path):
    """Replace DatabaseManager singleton with a temp in-memory DB for each test."""
    from models.database import DatabaseManager

    # Reset singleton
    DatabaseManager._instance = None

    # Patch the DB path to use tmp_path
    db_path = tmp_path / "test.db"
    with patch.object(DatabaseManager, "__init__", _make_test_init(db_path)):
        DatabaseManager._instance = None
        yield
        DatabaseManager._instance = None


def _make_test_init(db_path):
    def __init__(self):
        if getattr(self, "_initialized", False):
            return
        self._initialized = True
        self._db_path = db_path
        self._conn = sqlite3.connect(str(db_path))
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        # Read schema
        schema_path = Path(__file__).parent.parent / "db" / "schema.sql"
        with open(schema_path, "r") as f:
            self._conn.executescript(f.read())
        self._conn.commit()

    return __init__


@pytest.fixture(scope="session")
def qapp():
    """Create a single QApplication for all tests that need it."""
    from PyQt6.QtWidgets import QApplication

    app = QApplication.instance()
    if app is None:
        app = QApplication([])
    return app
