from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QListWidget,
    QListWidgetItem, QPushButton, QSplitter, QMessageBox,
)
from PyQt6.QtCore import pyqtSignal, Qt
from models import project as project_model
from models import task as task_model
from ui.widgets.status_badge import StatusBadge, STATUS_LABELS
from ui.widgets.prompt_input import PromptInput
from ui.widgets.output_log import OutputLog
from ui.dialogs.new_task_dialog import NewTaskDialog
from core.session_manager import SessionManager
from core.output_parser import StreamEvent


class ProjectDetailView(QWidget):
    task_clicked = pyqtSignal(int)  # task_id
    back_to_dashboard = pyqtSignal()

    def __init__(self, session_manager: SessionManager, parent=None):
        super().__init__(parent)
        self._session_mgr = session_manager
        self._project_id: int | None = None
        self._current_task_id: int | None = None
        self._current_execution_id: int | None = None

        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 20, 20, 20)
        layout.setSpacing(12)

        # Header
        header = QHBoxLayout()
        back_btn = QPushButton("< 返回")
        back_btn.setStyleSheet("font-size: 13px; border: none; color: #3b82f6;")
        back_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        back_btn.clicked.connect(self.back_to_dashboard.emit)
        header.addWidget(back_btn)

        self._name_label = QLabel()
        self._name_label.setStyleSheet("font-size: 20px; font-weight: bold; color: #1f2937;")
        header.addWidget(self._name_label)

        self._status_badge = StatusBadge()
        header.addWidget(self._status_badge)
        header.addStretch()
        layout.addLayout(header)

        # Path label
        self._path_label = QLabel()
        self._path_label.setStyleSheet("font-size: 12px; color: #9ca3af;")
        layout.addWidget(self._path_label)

        # Main splitter: tasks on left, output on right
        splitter = QSplitter(Qt.Orientation.Horizontal)

        # Left: task list
        task_panel = QWidget()
        task_layout = QVBoxLayout(task_panel)
        task_layout.setContentsMargins(0, 0, 0, 0)

        task_header = QHBoxLayout()
        task_header.addWidget(QLabel("任務列表"))
        task_header.addStretch()
        add_task_btn = QPushButton("+ 新增任務")
        add_task_btn.setStyleSheet(
            "QPushButton { background: #10b981; color: white; border: none; "
            "border-radius: 4px; padding: 4px 12px; font-size: 12px; }"
            "QPushButton:hover { background: #059669; }"
        )
        add_task_btn.clicked.connect(self._add_task)
        task_header.addWidget(add_task_btn)
        task_layout.addLayout(task_header)

        self._task_list = QListWidget()
        self._task_list.setStyleSheet(
            "QListWidget { border: 1px solid #e5e7eb; border-radius: 6px; }"
            "QListWidget::item { padding: 8px; }"
            "QListWidget::item:selected { background: #dbeafe; }"
        )
        self._task_list.currentRowChanged.connect(self._on_task_selected)
        self._task_list.itemDoubleClicked.connect(self._on_task_double_clicked)
        task_layout.addWidget(self._task_list)

        # Delete task button
        del_task_btn = QPushButton("刪除選取任務")
        del_task_btn.setStyleSheet(
            "QPushButton { color: #ef4444; border: 1px solid #ef4444; "
            "border-radius: 4px; padding: 4px 12px; font-size: 12px; }"
            "QPushButton:hover { background: #fee2e2; }"
        )
        del_task_btn.clicked.connect(self._delete_task)
        task_layout.addWidget(del_task_btn)

        splitter.addWidget(task_panel)

        # Right: prompt + output
        right_panel = QWidget()
        right_layout = QVBoxLayout(right_panel)
        right_layout.setContentsMargins(0, 0, 0, 0)

        self._prompt_input = PromptInput()
        self._prompt_input.prompt_submitted.connect(self._run_prompt)
        right_layout.addWidget(self._prompt_input)

        self._output_log = OutputLog()
        right_layout.addWidget(self._output_log)

        splitter.addWidget(right_panel)
        splitter.setStretchFactor(0, 1)
        splitter.setStretchFactor(1, 2)

        layout.addWidget(splitter)

        # Connect session manager signals
        self._session_mgr.execution_output.connect(self._on_execution_output)
        self._session_mgr.execution_finished.connect(self._on_execution_finished)
        self._prompt_input.cancel_button.clicked.connect(self._cancel_execution)

    def load_project(self, project_id: int):
        self._project_id = project_id
        self._current_task_id = None
        self._current_execution_id = None
        self._output_log.clear()
        self._refresh()

    def _refresh(self):
        if not self._project_id:
            return
        project = project_model.get_project(self._project_id)
        if not project:
            return

        self._name_label.setText(project["name"])
        self._status_badge.set_status(project["status"])
        self._path_label.setText(project["path"])

        # Refresh task list
        tasks = task_model.get_tasks_by_project(self._project_id)
        self._task_list.clear()
        for t in tasks:
            status_text = STATUS_LABELS.get(t["status"], t["status"])
            item = QListWidgetItem(f"[{status_text}] {t['title']}")
            item.setData(Qt.ItemDataRole.UserRole, t["id"])
            self._task_list.addItem(item)

    def _add_task(self):
        if not self._project_id:
            return
        dialog = NewTaskDialog(self)
        if dialog.exec():
            data = dialog.get_data()
            task_model.create_task(self._project_id, data["title"], data["prompt"])
            self._refresh()

    def _delete_task(self):
        current = self._task_list.currentItem()
        if not current:
            return
        tid = current.data(Qt.ItemDataRole.UserRole)
        reply = QMessageBox.question(
            self, "確認刪除", "確定要刪除此任務？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
        )
        if reply == QMessageBox.StandardButton.Yes:
            task_model.delete_task(tid)
            self._refresh()

    def _on_task_selected(self, row: int):
        item = self._task_list.item(row)
        if item:
            self._current_task_id = item.data(Qt.ItemDataRole.UserRole)

    def _on_task_double_clicked(self, item: QListWidgetItem):
        tid = item.data(Qt.ItemDataRole.UserRole)
        self.task_clicked.emit(tid)

    def _run_prompt(self, prompt: str, max_turns: int):
        if not self._project_id:
            return

        project = project_model.get_project(self._project_id)
        if not project:
            return

        # If no task selected, create a quick task
        task_id = self._current_task_id
        if not task_id:
            task_id = task_model.create_task(
                self._project_id, prompt[:50], prompt
            )
            self._refresh()
            self._current_task_id = task_id

        self._output_log.clear()
        self._prompt_input.set_running(True)

        self._current_execution_id = self._session_mgr.start_execution(
            task_id=task_id,
            prompt=prompt,
            working_dir=project["path"],
            max_turns=max_turns,
        )

    def _on_execution_output(self, execution_id: int, event: StreamEvent):
        if execution_id == self._current_execution_id:
            self._output_log.append_event(event)

    def _on_execution_finished(self, execution_id: int):
        if execution_id == self._current_execution_id:
            self._prompt_input.set_running(False)
            self._prompt_input.clear()
            self._refresh()

    def _cancel_execution(self):
        if self._current_execution_id:
            self._session_mgr.cancel_execution(self._current_execution_id)
            self._prompt_input.set_running(False)
