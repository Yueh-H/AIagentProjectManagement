from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QListWidget,
    QListWidgetItem, QPushButton, QSplitter, QMessageBox, QTabWidget,
)
from PyQt6.QtCore import pyqtSignal, Qt
from models import project as project_model
from models import task as task_model
from models import agent as agent_model
from models import execution as exec_model
from ui.widgets.status_badge import StatusBadge, STATUS_LABELS
from ui.widgets.agent_panel import AgentPanel
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
        # Map execution_id -> agent_panel for routing output
        self._exec_to_panel: dict[int, AgentPanel] = {}

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

        self._path_label = QLabel()
        self._path_label.setStyleSheet("font-size: 12px; color: #9ca3af;")
        layout.addWidget(self._path_label)

        # Main splitter: tasks on left, agents on right
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

        del_task_btn = QPushButton("刪除選取任務")
        del_task_btn.setStyleSheet(
            "QPushButton { color: #ef4444; border: 1px solid #ef4444; "
            "border-radius: 4px; padding: 4px 12px; font-size: 12px; }"
            "QPushButton:hover { background: #fee2e2; }"
        )
        del_task_btn.clicked.connect(self._delete_task)
        task_layout.addWidget(del_task_btn)

        splitter.addWidget(task_panel)

        # Right: agent tabs
        right_panel = QWidget()
        right_layout = QVBoxLayout(right_panel)
        right_layout.setContentsMargins(0, 0, 0, 0)

        # Placeholder shown when no task selected
        self._placeholder = QLabel("請選擇左側的任務，或新增一個任務")
        self._placeholder.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._placeholder.setStyleSheet("font-size: 14px; color: #9ca3af; padding: 40px;")

        # Agent tab area
        self._agent_tabs = QTabWidget()
        self._agent_tabs.setTabsClosable(True)
        self._agent_tabs.tabCloseRequested.connect(self._close_agent_tab)
        self._agent_tabs.setStyleSheet(
            "QTabWidget::pane { border: 1px solid #e5e7eb; border-radius: 6px; }"
            "QTabBar::tab { padding: 6px 16px; font-size: 13px; }"
            "QTabBar::tab:selected { background: #dbeafe; color: #1e40af; }"
        )

        # Add agent button in header
        agent_header = QHBoxLayout()
        agent_header.addWidget(QLabel("Agents"))
        agent_header.addStretch()
        self._add_agent_btn = QPushButton("+ 新增 Agent")
        self._add_agent_btn.setStyleSheet(
            "QPushButton { background: #8b5cf6; color: white; border: none; "
            "border-radius: 4px; padding: 4px 12px; font-size: 12px; }"
            "QPushButton:hover { background: #7c3aed; }"
        )
        self._add_agent_btn.clicked.connect(self._add_agent)
        self._add_agent_btn.setEnabled(False)
        agent_header.addWidget(self._add_agent_btn)
        right_layout.addLayout(agent_header)

        right_layout.addWidget(self._placeholder)
        right_layout.addWidget(self._agent_tabs)
        self._agent_tabs.hide()

        splitter.addWidget(right_panel)
        splitter.setStretchFactor(0, 1)
        splitter.setStretchFactor(1, 3)

        layout.addWidget(splitter)

        # Connect session manager signals
        self._session_mgr.execution_output.connect(self._on_execution_output)
        self._session_mgr.execution_finished.connect(self._on_execution_finished)

    def load_project(self, project_id: int):
        self._project_id = project_id
        self._current_task_id = None
        self._exec_to_panel.clear()
        self._clear_agent_tabs()
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

        # Refresh task list, preserve selection
        tasks = task_model.get_tasks_by_project(self._project_id)
        old_task_id = self._current_task_id
        self._task_list.blockSignals(True)
        self._task_list.clear()
        select_row = -1
        for i, t in enumerate(tasks):
            status_text = STATUS_LABELS.get(t["status"], t["status"])
            item = QListWidgetItem(f"[{status_text}] {t['title']}")
            item.setData(Qt.ItemDataRole.UserRole, t["id"])
            self._task_list.addItem(item)
            if t["id"] == old_task_id:
                select_row = i
        self._task_list.blockSignals(False)
        if select_row >= 0:
            self._task_list.setCurrentRow(select_row)

    def _on_task_selected(self, row: int):
        item = self._task_list.item(row)
        if not item:
            self._current_task_id = None
            self._show_placeholder(True)
            return

        task_id = item.data(Qt.ItemDataRole.UserRole)
        if task_id == self._current_task_id:
            return

        self._current_task_id = task_id
        self._add_agent_btn.setEnabled(True)
        self._load_agents_for_task(task_id)

    def _load_agents_for_task(self, task_id: int):
        """Load existing agents for this task, or create a default one."""
        self._clear_agent_tabs()
        agents = agent_model.get_agents_by_task(task_id)

        if not agents:
            # Auto-create first agent
            agent_id = agent_model.create_agent(task_id)
            agents = agent_model.get_agents_by_task(task_id)

        for agent in agents:
            self._add_agent_tab(agent)

        self._show_placeholder(False)

    def _add_agent_tab(self, agent: dict):
        panel = AgentPanel(agent["id"], agent["name"])
        panel.session_id = agent.get("session_id")
        panel.set_status(agent.get("status", "idle"))
        panel.prompt_submitted.connect(self._run_agent_prompt)
        panel.cancel_requested.connect(self._cancel_agent)
        self._agent_tabs.addTab(panel, agent["name"])

    def _add_agent(self):
        if not self._current_task_id:
            return
        agent_id = agent_model.create_agent(self._current_task_id)
        agent = agent_model.get_agent(agent_id)
        if agent:
            self._add_agent_tab(agent)
            self._agent_tabs.setCurrentIndex(self._agent_tabs.count() - 1)

    def _close_agent_tab(self, index: int):
        panel: AgentPanel = self._agent_tabs.widget(index)
        if not panel:
            return
        # Don't allow closing the last tab
        if self._agent_tabs.count() <= 1:
            QMessageBox.information(self, "提示", "至少需要保留一個 Agent")
            return

        reply = QMessageBox.question(
            self, "確認刪除",
            f"確定要刪除此 Agent 及其所有執行紀錄？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
        )
        if reply == QMessageBox.StandardButton.Yes:
            agent_model.delete_agent(panel.agent_id)
            # Clean up execution mapping
            self._exec_to_panel = {
                eid: p for eid, p in self._exec_to_panel.items()
                if p is not panel
            }
            self._agent_tabs.removeTab(index)

    def _clear_agent_tabs(self):
        self._exec_to_panel.clear()
        while self._agent_tabs.count() > 0:
            self._agent_tabs.removeTab(0)

    def _show_placeholder(self, show: bool):
        self._placeholder.setVisible(show)
        self._agent_tabs.setVisible(not show)
        self._add_agent_btn.setEnabled(not show)

    def _run_agent_prompt(self, agent_id: int, prompt: str, max_turns: int,
                          continue_session: bool, permission_mode: str):
        if not self._project_id or not self._current_task_id:
            return

        project = project_model.get_project(self._project_id)
        if not project:
            return

        # Find the panel for this agent
        panel = self._find_panel_by_agent_id(agent_id)
        if not panel:
            return

        # Resolve session_id
        session_id = None
        if continue_session:
            session_id = panel.session_id
            if not session_id:
                session_id = exec_model.get_last_session_id_by_agent(agent_id)

        panel.clear_output()
        panel.set_running(True)
        panel.set_status("running")

        execution_id = self._session_mgr.start_execution(
            task_id=self._current_task_id,
            prompt=prompt,
            working_dir=project["path"],
            agent_id=agent_id,
            max_turns=max_turns,
            session_id=session_id,
            permission_mode=permission_mode,
        )
        panel.execution_id = execution_id
        self._exec_to_panel[execution_id] = panel

    def _on_execution_output(self, execution_id: int, event: StreamEvent):
        panel = self._exec_to_panel.get(execution_id)
        if panel:
            panel.append_event(event)

    def _on_execution_finished(self, execution_id: int):
        panel = self._exec_to_panel.get(execution_id)
        if panel:
            panel.set_running(False)
            # Reload agent status from DB
            agent = agent_model.get_agent(panel.agent_id)
            if agent:
                panel.set_status(agent["status"])
                panel.session_id = agent.get("session_id")
        self._refresh()

    def _cancel_agent(self, agent_id: int):
        panel = self._find_panel_by_agent_id(agent_id)
        if panel and panel.execution_id:
            self._session_mgr.cancel_execution(panel.execution_id)
            panel.set_running(False)
            panel.set_status("idle")

    def _find_panel_by_agent_id(self, agent_id: int) -> AgentPanel | None:
        for i in range(self._agent_tabs.count()):
            panel: AgentPanel = self._agent_tabs.widget(i)
            if panel.agent_id == agent_id:
                return panel
        return None

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
            self, "確認刪除", "確定要刪除此任務及其所有 Agent？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
        )
        if reply == QMessageBox.StandardButton.Yes:
            task_model.delete_task(tid)
            if tid == self._current_task_id:
                self._current_task_id = None
                self._clear_agent_tabs()
                self._show_placeholder(True)
            self._refresh()

    def _on_task_double_clicked(self, item: QListWidgetItem):
        tid = item.data(Qt.ItemDataRole.UserRole)
        self.task_clicked.emit(tid)
