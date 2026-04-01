import sys
from PyQt6.QtWidgets import QApplication
from models.database import DatabaseManager
from ui.main_window import MainWindow


def main():
    app = QApplication(sys.argv)
    app.setApplicationName("Claude Code 管理工具")

    # Initialize database
    DatabaseManager()

    window = MainWindow()
    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
