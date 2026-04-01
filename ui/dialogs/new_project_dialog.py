from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QFormLayout, QLineEdit, QTextEdit,
    QPushButton, QHBoxLayout, QFileDialog, QMessageBox,
)


class NewProjectDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("新增專案")
        self.setMinimumWidth(450)

        layout = QVBoxLayout(self)
        form = QFormLayout()

        self._name_edit = QLineEdit()
        self._name_edit.setPlaceholderText("輸入專案名稱")
        form.addRow("專案名稱:", self._name_edit)

        # Path with browse button
        path_layout = QHBoxLayout()
        self._path_edit = QLineEdit()
        self._path_edit.setPlaceholderText("選擇專案路徑")
        browse_btn = QPushButton("瀏覽...")
        browse_btn.clicked.connect(self._browse_path)
        path_layout.addWidget(self._path_edit)
        path_layout.addWidget(browse_btn)
        form.addRow("專案路徑:", path_layout)

        self._desc_edit = QTextEdit()
        self._desc_edit.setPlaceholderText("描述（選填）")
        self._desc_edit.setMaximumHeight(80)
        form.addRow("描述:", self._desc_edit)

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

    def _browse_path(self):
        path = QFileDialog.getExistingDirectory(self, "選擇專案目錄")
        if path:
            self._path_edit.setText(path)

    def _accept(self):
        if not self._name_edit.text().strip():
            QMessageBox.warning(self, "錯誤", "請輸入專案名稱")
            return
        if not self._path_edit.text().strip():
            QMessageBox.warning(self, "錯誤", "請選擇專案路徑")
            return
        self.accept()

    def get_data(self) -> dict:
        return {
            "name": self._name_edit.text().strip(),
            "path": self._path_edit.text().strip(),
            "description": self._desc_edit.toPlainText().strip(),
        }
