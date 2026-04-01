from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QFormLayout, QLineEdit, QPlainTextEdit,
    QPushButton, QHBoxLayout, QMessageBox,
)


class NewTaskDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("新增任務")
        self.setMinimumWidth(450)

        layout = QVBoxLayout(self)
        form = QFormLayout()

        self._title_edit = QLineEdit()
        self._title_edit.setPlaceholderText("輸入任務標題")
        form.addRow("任務標題:", self._title_edit)

        self._prompt_edit = QPlainTextEdit()
        self._prompt_edit.setPlaceholderText("輸入提示詞（選填，可稍後再輸入）")
        self._prompt_edit.setMaximumHeight(120)
        form.addRow("提示詞:", self._prompt_edit)

        layout.addLayout(form)

        # Buttons
        btn_layout = QHBoxLayout()
        btn_layout.addStretch()
        cancel_btn = QPushButton("取消")
        cancel_btn.clicked.connect(self.reject)
        ok_btn = QPushButton("確認")
        ok_btn.setStyleSheet(
            "QPushButton { background: #3b82f6; color: white; border: none; "
            "border-radius: 4px; padding: 8px 20px; }"
        )
        ok_btn.clicked.connect(self._accept)
        btn_layout.addWidget(cancel_btn)
        btn_layout.addWidget(ok_btn)
        layout.addLayout(btn_layout)

    def _accept(self):
        if not self._title_edit.text().strip():
            QMessageBox.warning(self, "錯誤", "請輸入任務標題")
            return
        self.accept()

    def get_data(self) -> dict:
        return {
            "title": self._title_edit.text().strip(),
            "prompt": self._prompt_edit.toPlainText().strip(),
        }
