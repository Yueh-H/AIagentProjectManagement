from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QPushButton, QListWidget, QListWidgetItem,
    QAbstractItemView, QMenu,
)
from PyQt6.QtCore import pyqtSignal, Qt
from PyQt6.QtGui import QAction
from ui.widgets.status_badge import STATUS_COLORS


class Sidebar(QWidget):
    dashboard_clicked = pyqtSignal()
    project_selected = pyqtSignal(int)  # project_id
    new_project_clicked = pyqtSignal()
    delete_project_requested = pyqtSignal(int)  # project_id

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedWidth(240)
        self.setStyleSheet("background-color: #f9fafb;")

        layout = QVBoxLayout(self)
        layout.setContentsMargins(8, 8, 8, 8)
        layout.setSpacing(6)

        # Dashboard button
        dash_btn = QPushButton("儀表板")
        dash_btn.setStyleSheet(
            "QPushButton { background: #3b82f6; color: white; border: none; "
            "border-radius: 6px; padding: 10px; font-size: 14px; font-weight: bold; }"
            "QPushButton:hover { background: #2563eb; }"
        )
        dash_btn.clicked.connect(self.dashboard_clicked.emit)
        layout.addWidget(dash_btn)

        # New project button
        new_btn = QPushButton("+ 新增專案")
        new_btn.setStyleSheet(
            "QPushButton { background: #10b981; color: white; border: none; "
            "border-radius: 6px; padding: 8px; font-size: 13px; }"
            "QPushButton:hover { background: #059669; }"
        )
        new_btn.clicked.connect(self.new_project_clicked.emit)
        layout.addWidget(new_btn)

        # Project list
        self._list = QListWidget()
        self._list.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self._list.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self._list.customContextMenuRequested.connect(self._show_context_menu)
        self._list.currentRowChanged.connect(self._on_row_changed)
        self._list.setStyleSheet(
            "QListWidget { border: none; background: transparent; font-size: 13px; }"
            "QListWidget::item { padding: 8px 10px; border-radius: 4px; }"
            "QListWidget::item:selected { background: #dbeafe; color: #1e40af; }"
            "QListWidget::item:hover { background: #e5e7eb; }"
        )
        layout.addWidget(self._list)

        self._projects: list[dict] = []

    def load_projects(self, projects: list[dict]):
        self._projects = projects
        self._list.clear()
        for p in projects:
            fg, _ = STATUS_COLORS.get(p["status"], ("#6b7280", "#f3f4f6"))
            item = QListWidgetItem(f"  {p['name']}")
            item.setData(Qt.ItemDataRole.UserRole, p["id"])
            self._list.addItem(item)

    def _on_row_changed(self, row: int):
        if 0 <= row < len(self._projects):
            self.project_selected.emit(self._projects[row]["id"])

    def _show_context_menu(self, pos):
        item = self._list.itemAt(pos)
        if not item:
            return
        project_id = item.data(Qt.ItemDataRole.UserRole)
        menu = QMenu(self)
        delete_action = QAction("刪除專案", self)
        delete_action.triggered.connect(lambda: self.delete_project_requested.emit(project_id))
        menu.addAction(delete_action)
        menu.exec(self._list.mapToGlobal(pos))
