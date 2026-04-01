from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPlainTextEdit, QPushButton, QLabel,
)
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QTextCharFormat, QColor, QFont
from core.output_parser import StreamEvent


class OutputLog(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(4)

        # Header
        header = QHBoxLayout()
        header.addWidget(QLabel("輸出日誌"))
        header.addStretch()

        copy_btn = QPushButton("複製")
        copy_btn.setFixedWidth(60)
        copy_btn.setStyleSheet("font-size: 11px;")
        copy_btn.clicked.connect(self._copy_all)
        header.addWidget(copy_btn)

        clear_btn = QPushButton("清除")
        clear_btn.setFixedWidth(60)
        clear_btn.setStyleSheet("font-size: 11px;")
        clear_btn.clicked.connect(self.clear)
        header.addWidget(clear_btn)

        layout.addLayout(header)

        # Log area
        self._log = QPlainTextEdit()
        self._log.setReadOnly(True)
        self._log.setFont(QFont("Menlo", 12))
        self._log.setStyleSheet(
            "QPlainTextEdit { background: #1e1e1e; color: #d4d4d4; "
            "border: 1px solid #333; border-radius: 6px; padding: 8px; }"
        )
        layout.addWidget(self._log)

    def append_event(self, event: StreamEvent):
        if event.event_type == "init":
            self._append_colored(
                f"--- 工作階段開始: {event.session_id or '?'} ---\n",
                "#6b7280",
            )
        elif event.event_type == "assistant" and event.text:
            self._append_colored(event.text + "\n", "#d4d4d4")
        elif event.event_type == "tool_result" and event.text:
            self._append_colored(f"[工具結果] {event.text}\n", "#9ca3af")
        elif event.event_type == "result":
            color = "#ef4444" if event.is_error else "#10b981"
            self._append_colored(
                f"\n--- 執行完成 | 費用: ${event.cost_usd:.4f} | "
                f"時長: {event.duration_ms}ms | 回合: {event.num_turns} ---\n",
                color,
            )
            if event.text:
                self._append_colored(event.text + "\n", color)

    def _append_colored(self, text: str, color: str):
        fmt = QTextCharFormat()
        fmt.setForeground(QColor(color))
        cursor = self._log.textCursor()
        cursor.movePosition(cursor.MoveOperation.End)
        cursor.insertText(text, fmt)
        self._log.setTextCursor(cursor)
        # Auto-scroll
        scrollbar = self._log.verticalScrollBar()
        scrollbar.setValue(scrollbar.maximum())

    def append_error(self, message: str):
        self._append_colored(f"[錯誤] {message}\n", "#ef4444")

    def clear(self):
        self._log.clear()

    def _copy_all(self):
        from PyQt6.QtWidgets import QApplication
        QApplication.clipboard().setText(self._log.toPlainText())
