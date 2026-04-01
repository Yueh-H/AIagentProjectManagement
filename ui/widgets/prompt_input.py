from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPlainTextEdit,
    QPushButton, QSpinBox, QLabel,
)
from PyQt6.QtCore import pyqtSignal, Qt
from PyQt6.QtGui import QKeyEvent


class PromptInput(QWidget):
    prompt_submitted = pyqtSignal(str, int)  # prompt, max_turns

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
            self.prompt_submitted.emit(text, self._max_turns.value())

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
