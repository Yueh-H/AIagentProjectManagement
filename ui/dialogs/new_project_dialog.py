import subprocess
from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QFormLayout, QLineEdit, QTextEdit,
    QPushButton, QHBoxLayout, QFileDialog, QMessageBox, QComboBox,
)


def _list_conda_envs() -> list[str]:
    """List available conda environments."""
    try:
        result = subprocess.run(
            ["conda", "env", "list", "--json"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            import json
            data = json.loads(result.stdout)
            envs = []
            for p in data.get("envs", []):
                name = p.split("/")[-1]
                if name:
                    envs.append(name)
            return envs
    except Exception:
        pass
    return []


class NewProjectDialog(QDialog):
    def __init__(self, parent=None, edit_project: dict | None = None):
        super().__init__(parent)
        self._edit_mode = edit_project is not None
        self.setWindowTitle("編輯專案" if self._edit_mode else "新增專案")
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

        # Conda environment
        self._conda_combo = QComboBox()
        self._conda_combo.setEditable(True)
        self._conda_combo.addItem("（不使用 conda）", "")
        envs = _list_conda_envs()
        for env in envs:
            self._conda_combo.addItem(env, env)
        self._conda_combo.setToolTip(
            "選擇此專案使用的 conda 環境\n"
            "Claude Code 會在該環境下執行"
        )
        form.addRow("Conda 環境:", self._conda_combo)

        self._desc_edit = QTextEdit()
        self._desc_edit.setPlaceholderText("描述（選填）")
        self._desc_edit.setMaximumHeight(80)
        form.addRow("描述:", self._desc_edit)

        layout.addLayout(form)

        # Pre-fill if editing
        if edit_project:
            self._name_edit.setText(edit_project.get("name", ""))
            self._path_edit.setText(edit_project.get("path", ""))
            self._desc_edit.setPlainText(edit_project.get("description", ""))
            conda_env = edit_project.get("conda_env", "")
            if conda_env:
                idx = self._conda_combo.findData(conda_env)
                if idx >= 0:
                    self._conda_combo.setCurrentIndex(idx)
                else:
                    self._conda_combo.setEditText(conda_env)

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
        conda_env = self._conda_combo.currentData()
        if conda_env is None:
            conda_env = self._conda_combo.currentText().strip()
            if conda_env == "（不使用 conda）":
                conda_env = ""
        return {
            "name": self._name_edit.text().strip(),
            "path": self._path_edit.text().strip(),
            "description": self._desc_edit.toPlainText().strip(),
            "conda_env": conda_env,
        }
