from PyQt6.QtWidgets import (
    QMainWindow, QSplitter, QStackedWidget, QMessageBox, QLabel, QWidget,
)
from PyQt6.QtCore import Qt, QTimer
from models import project as project_model
from ui.widgets.sidebar import Sidebar
from ui.dashboard_view import DashboardView
from ui.project_detail_view import ProjectDetailView
from ui.task_detail_view import TaskDetailView
from ui.dialogs.new_project_dialog import NewProjectDialog
from core.session_manager import SessionManager


class MainWindow(QMainWindow):
    VIEW_DASHBOARD = 0
    VIEW_PROJECT = 1
    VIEW_TASK = 2

    def __init__(self):
        super().__init__()
        self.setWindowTitle("Claude Code 管理工具")
        self.resize(1200, 800)
        self.setMinimumSize(900, 600)
        self.setStyleSheet("QMainWindow { background: #f3f4f6; }")

        # Session manager
        self._session_mgr = SessionManager(self)
        self._session_mgr.execution_started.connect(self._update_status_bar)
        self._session_mgr.execution_finished.connect(self._update_status_bar)

        # Central splitter
        splitter = QSplitter(Qt.Orientation.Horizontal)

        # Sidebar
        self._sidebar = Sidebar()
        self._sidebar.dashboard_clicked.connect(self._show_dashboard)
        self._sidebar.project_selected.connect(self._show_project)
        self._sidebar.new_project_clicked.connect(self._new_project)
        self._sidebar.delete_project_requested.connect(self._delete_project)
        splitter.addWidget(self._sidebar)

        # Stacked views
        self._stack = QStackedWidget()

        self._dashboard = DashboardView()
        self._dashboard.project_clicked.connect(self._show_project)
        self._stack.addWidget(self._dashboard)

        self._project_view = ProjectDetailView(self._session_mgr)
        self._project_view.task_clicked.connect(self._show_task)
        self._project_view.back_to_dashboard.connect(self._show_dashboard)
        self._stack.addWidget(self._project_view)

        self._task_view = TaskDetailView()
        self._task_view.back_to_project.connect(self._show_project)
        self._stack.addWidget(self._task_view)

        splitter.addWidget(self._stack)
        splitter.setStretchFactor(0, 0)
        splitter.setStretchFactor(1, 1)
        self.setCentralWidget(splitter)

        # Status bar
        self._status_label = QLabel("就緒")
        self.statusBar().addPermanentWidget(self._status_label)

        # Auto-refresh timer
        self._refresh_timer = QTimer(self)
        self._refresh_timer.timeout.connect(self._auto_refresh)
        self._refresh_timer.start(3000)

        # Initial load
        self._refresh_all()

    def _refresh_all(self):
        projects = project_model.get_all_projects()
        self._sidebar.load_projects(projects)
        self._dashboard.refresh()

    def _show_dashboard(self):
        self._refresh_all()
        self._stack.setCurrentIndex(self.VIEW_DASHBOARD)

    def _show_project(self, project_id: int):
        self._project_view.load_project(project_id)
        self._stack.setCurrentIndex(self.VIEW_PROJECT)

    def _show_task(self, task_id: int):
        self._task_view.load_task(task_id)
        self._stack.setCurrentIndex(self.VIEW_TASK)

    def _new_project(self):
        dialog = NewProjectDialog(self)
        if dialog.exec():
            data = dialog.get_data()
            project_model.create_project(
                data["name"], data["path"], data["description"], data.get("conda_env", "")
            )
            self._refresh_all()

    def _delete_project(self, project_id: int):
        reply = QMessageBox.question(
            self, "確認刪除", "確定要刪除此專案及所有相關任務？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
        )
        if reply == QMessageBox.StandardButton.Yes:
            project_model.delete_project(project_id)
            self._refresh_all()
            self._stack.setCurrentIndex(self.VIEW_DASHBOARD)

    def _update_status_bar(self, _=None):
        active = self._session_mgr.get_active_count()
        if active > 0:
            self._status_label.setText(f"執行中的工作: {active}")
        else:
            self._status_label.setText("就緒")

    def _auto_refresh(self):
        # Refresh sidebar and current view periodically
        projects = project_model.get_all_projects()
        self._sidebar.load_projects(projects)
        current = self._stack.currentIndex()
        if current == self.VIEW_DASHBOARD:
            self._dashboard.refresh()
