from PyQt6.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QLabel
from PyQt6.QtCore import pyqtSignal
from ui.widgets.prompt_input import PromptInput
from ui.widgets.output_log import OutputLog
from ui.widgets.status_badge import StatusBadge
from core.output_parser import StreamEvent


class AgentPanel(QWidget):
    """A single agent's panel with its own prompt input and output log."""

    prompt_submitted = pyqtSignal(int, str, int, bool, str)
    # agent_id, prompt, max_turns, continue_session, permission_mode
    cancel_requested = pyqtSignal(int)  # agent_id

    def __init__(self, agent_id: int, agent_name: str, parent=None):
        super().__init__(parent)
        self._agent_id = agent_id
        self._execution_id: int | None = None
        self._session_id: str | None = None

        layout = QVBoxLayout(self)
        layout.setContentsMargins(4, 4, 4, 4)
        layout.setSpacing(8)

        # Agent header
        header = QHBoxLayout()
        name_label = QLabel(agent_name)
        name_label.setStyleSheet("font-size: 14px; font-weight: bold; color: #374151;")
        header.addWidget(name_label)
        self._status_badge = StatusBadge("idle")
        header.addWidget(self._status_badge)
        header.addStretch()
        layout.addLayout(header)

        # Prompt input
        self._prompt_input = PromptInput()
        self._prompt_input.prompt_submitted.connect(self._on_prompt_submitted)
        self._prompt_input.cancel_button.clicked.connect(
            lambda: self.cancel_requested.emit(self._agent_id)
        )
        layout.addWidget(self._prompt_input)

        # Output log
        self._output_log = OutputLog()
        layout.addWidget(self._output_log)

    @property
    def agent_id(self) -> int:
        return self._agent_id

    @property
    def execution_id(self) -> int | None:
        return self._execution_id

    @execution_id.setter
    def execution_id(self, value: int | None):
        self._execution_id = value

    @property
    def session_id(self) -> str | None:
        return self._session_id

    @session_id.setter
    def session_id(self, value: str | None):
        self._session_id = value

    def set_status(self, status: str):
        self._status_badge.set_status(status)

    def set_running(self, running: bool):
        self._prompt_input.set_running(running)

    def append_event(self, event: StreamEvent):
        self._output_log.append_event(event)
        if event.event_type in ("init", "result") and event.session_id:
            self._session_id = event.session_id

    def append_error(self, message: str):
        self._output_log.append_error(message)

    def clear_output(self):
        self._output_log.clear()

    def _on_prompt_submitted(self, prompt: str, max_turns: int, continue_session: bool, permission_mode: str):
        self.prompt_submitted.emit(
            self._agent_id, prompt, max_turns, continue_session, permission_mode
        )
