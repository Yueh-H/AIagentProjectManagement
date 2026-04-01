from PyQt6.QtWidgets import QLabel
from PyQt6.QtCore import Qt

STATUS_COLORS = {
    "idle": ("#6b7280", "#f3f4f6"),
    "pending": ("#6b7280", "#f3f4f6"),
    "running": ("#2563eb", "#dbeafe"),
    "completed": ("#16a34a", "#dcfce7"),
    "success": ("#16a34a", "#dcfce7"),
    "failed": ("#dc2626", "#fee2e2"),
    "error": ("#dc2626", "#fee2e2"),
}

STATUS_LABELS = {
    "idle": "閒置",
    "pending": "待執行",
    "running": "執行中",
    "completed": "已完成",
    "success": "成功",
    "failed": "失敗",
    "error": "錯誤",
}


class StatusBadge(QLabel):
    def __init__(self, status: str = "idle", parent=None):
        super().__init__(parent)
        self.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.set_status(status)

    def set_status(self, status: str):
        self._status = status
        fg, bg = STATUS_COLORS.get(status, ("#6b7280", "#f3f4f6"))
        label = STATUS_LABELS.get(status, status)
        self.setText(label)
        self.setStyleSheet(
            f"background-color: {bg}; color: {fg}; "
            f"border-radius: 4px; padding: 2px 8px; font-size: 12px; font-weight: bold;"
        )
