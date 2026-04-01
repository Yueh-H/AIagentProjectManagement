from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPlainTextEdit,
    QPushButton, QSpinBox, QLabel, QCheckBox, QComboBox,
)
from PyQt6.QtCore import pyqtSignal, Qt
from PyQt6.QtGui import QKeyEvent

PERMISSION_MODES = [
    ("自動跳過權限", "dangerously-skip-permissions"),
    ("自動接受編輯", "accept-edits"),
    ("規劃模式（唯讀）", "plan"),
    ("預設（需確認）", "default"),
]


class PromptInput(QWidget):
    prompt_submitted = pyqtSignal(str, int, bool, str)  # prompt, max_turns, continue_session, permission_mode

    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(4)

        # Text input
        self._text_edit = _PromptTextEdit()
        self._text_edit.setPlaceholderText("輸入提示詞... (Ctrl+Enter 送出)")
        self._text_edit.setMaximumHeight(120)
        self._text_edit.setStyleSheet(
            "QPlainTextEdit { border: 1px solid #d1d5db; border-radius: 6px; "
            "padding: 8px; font-size: 13px; }"
            "QPlainTextEdit:focus { border-color: #3b82f6; }"
        )
        self._text_edit.submitted.connect(self._on_submit)
        layout.addWidget(self._text_edit)

        # Controls row
        controls = QHBoxLayout()

        # Continue session checkbox
        self._continue_cb = QCheckBox("繼續對話")
        self._continue_cb.setChecked(True)
        self._continue_cb.setToolTip(
            "勾選時會使用上次的 session_id (--resume)，"
            "讓 Claude 記得之前的對話內容"
        )
        self._continue_cb.setStyleSheet("font-size: 13px;")
        controls.addWidget(self._continue_cb)

        controls.addSpacing(12)

        # Permission mode
        controls.addWidget(QLabel("權限:"))
        self._perm_combo = QComboBox()
        for label, value in PERMISSION_MODES:
            self._perm_combo.addItem(label, value)
        self._perm_combo.setToolTip(
            "自動跳過權限：不需確認任何操作（適合信任的專案）\n"
            "自動接受編輯：自動接受檔案修改，其他操作需確認\n"
            "規劃模式：Claude 只能讀取，不能修改\n"
            "預設：所有操作都需確認（會卡住，不建議）"
        )
        self._perm_combo.setStyleSheet("font-size: 13px;")
        self._perm_combo.setFixedWidth(160)
        controls.addWidget(self._perm_combo)

        controls.addSpacing(12)
        controls.addWidget(QLabel("最大回合:"))
        self._max_turns = QSpinBox()
        self._max_turns.setRange(1, 100)
        self._max_turns.setValue(10)
        self._max_turns.setFixedWidth(70)
        controls.addWidget(self._max_turns)

        controls.addStretch()

        # Cancel button (hidden by default)
        self._cancel_btn = QPushButton("取消")
        self._cancel_btn.setStyleSheet(
            "QPushButton { background: #ef4444; color: white; border: none; "
            "border-radius: 4px; padding: 8px 16px; font-size: 13px; }"
            "QPushButton:hover { background: #dc2626; }"
        )
        self._cancel_btn.hide()
        controls.addWidget(self._cancel_btn)

        self._run_btn = QPushButton("執行")
        self._run_btn.setStyleSheet(
            "QPushButton { background: #3b82f6; color: white; border: none; "
            "border-radius: 4px; padding: 8px 20px; font-size: 13px; font-weight: bold; }"
            "QPushButton:hover { background: #2563eb; }"
            "QPushButton:disabled { background: #9ca3af; }"
        )
        self._run_btn.clicked.connect(self._on_submit)
        controls.addWidget(self._run_btn)

        layout.addLayout(controls)

    def _on_submit(self):
        text = self._text_edit.toPlainText().strip()
        if text:
            perm_mode = self._perm_combo.currentData()
            self.prompt_submitted.emit(
                text, self._max_turns.value(), self._continue_cb.isChecked(), perm_mode
            )

    def set_running(self, running: bool):
        self._run_btn.setEnabled(not running)
        self._run_btn.setText("執行中..." if running else "執行")
        self._cancel_btn.setVisible(running)
        self._text_edit.setReadOnly(running)

    @property
    def cancel_button(self):
        return self._cancel_btn

    def clear(self):
        self._text_edit.clear()


class _PromptTextEdit(QPlainTextEdit):
    submitted = pyqtSignal()

    def keyPressEvent(self, event: QKeyEvent):
        if (
            event.key() == Qt.Key.Key_Return
            and event.modifiers() == Qt.KeyboardModifier.ControlModifier
        ):
            self.submitted.emit()
            return
        super().keyPressEvent(event)
