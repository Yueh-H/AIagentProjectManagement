from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTableWidget, QTableWidgetItem, QPlainTextEdit, QHeaderView,
)
from PyQt6.QtCore import pyqtSignal, Qt
from models import task as task_model
from models import execution as exec_model
from ui.widgets.status_badge import StatusBadge


class TaskDetailView(QWidget):
    back_to_project = pyqtSignal(int)  # project_id

    def __init__(self, parent=None):
        super().__init__(parent)
        self._task_id: int | None = None
        self._project_id: int | None = None

        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 20, 20, 20)
        layout.setSpacing(12)

        # Header
        header = QHBoxLayout()
        self._back_btn = QPushButton("< 返回專案")
        self._back_btn.setStyleSheet("font-size: 13px; border: none; color: #3b82f6;")
        self._back_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._back_btn.clicked.connect(self._go_back)
        header.addWidget(self._back_btn)

        self._title_label = QLabel()
        self._title_label.setStyleSheet("font-size: 18px; font-weight: bold; color: #1f2937;")
        header.addWidget(self._title_label)

        self._status_badge = StatusBadge()
        header.addWidget(self._status_badge)
        header.addStretch()
        layout.addLayout(header)

        # Prompt section
        layout.addWidget(QLabel("提示詞:"))
        self._prompt_edit = QPlainTextEdit()
        self._prompt_edit.setMaximumHeight(100)
        self._prompt_edit.setStyleSheet(
            "QPlainTextEdit { border: 1px solid #d1d5db; border-radius: 6px; padding: 8px; }"
        )
        layout.addWidget(self._prompt_edit)

        save_btn = QPushButton("儲存提示詞")
        save_btn.setStyleSheet(
            "QPushButton { background: #3b82f6; color: white; border: none; "
            "border-radius: 4px; padding: 6px 16px; }"
        )
        save_btn.clicked.connect(self._save_prompt)
        layout.addWidget(save_btn, alignment=Qt.AlignmentFlag.AlignLeft)

        # Execution history
        layout.addWidget(QLabel("執行歷史:"))
        self._table = QTableWidget()
        self._table.setColumnCount(5)
        self._table.setHorizontalHeaderLabels(["時間", "狀態", "費用", "時長", "回合"])
        self._table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self._table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self._table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self._table.setStyleSheet(
            "QTableWidget { border: 1px solid #e5e7eb; border-radius: 6px; }"
        )
        self._table.currentCellChanged.connect(self._on_execution_selected)
        layout.addWidget(self._table)

        # Execution output
        layout.addWidget(QLabel("執行輸出:"))
        self._output_text = QPlainTextEdit()
        self._output_text.setReadOnly(True)
        self._output_text.setStyleSheet(
            "QPlainTextEdit { background: #1e1e1e; color: #d4d4d4; "
            "border: 1px solid #333; border-radius: 6px; padding: 8px; "
            "font-family: Menlo; font-size: 12px; }"
        )
        layout.addWidget(self._output_text)

    def load_task(self, task_id: int):
        self._task_id = task_id
        task = task_model.get_task(task_id)
        if not task:
            return

        self._project_id = task["project_id"]
        self._title_label.setText(task["title"])
        self._status_badge.set_status(task["status"])
        self._prompt_edit.setPlainText(task.get("prompt", ""))

        # Load executions
        executions = exec_model.get_executions_by_task(task_id)
        self._table.setRowCount(len(executions))
        for i, ex in enumerate(executions):
            self._table.setItem(i, 0, QTableWidgetItem(ex.get("started_at", "")))
            self._table.setItem(i, 1, QTableWidgetItem(ex.get("status", "")))
            self._table.setItem(i, 2, QTableWidgetItem(f"${ex.get('cost_usd', 0):.4f}"))
            self._table.setItem(i, 3, QTableWidgetItem(f"{ex.get('duration_ms', 0)}ms"))
            self._table.setItem(i, 4, QTableWidgetItem(str(ex.get("num_turns", 0))))
            # Store execution id
            self._table.item(i, 0).setData(Qt.ItemDataRole.UserRole, ex["id"])

    def _save_prompt(self):
        if self._task_id:
            task_model.update_task(
                self._task_id, prompt=self._prompt_edit.toPlainText()
            )

    def _on_execution_selected(self, row, col, prev_row, prev_col):
        item = self._table.item(row, 0)
        if not item:
            return
        eid = item.data(Qt.ItemDataRole.UserRole)
        execution = exec_model.get_execution(eid)
        if execution:
            self._output_text.setPlainText(execution.get("result_text", ""))

    def _go_back(self):
        if self._project_id:
            self.back_to_project.emit(self._project_id)
