from PyQt6.QtWidgets import (
    QFrame, QVBoxLayout, QHBoxLayout, QLabel, QSizePolicy,
)
from PyQt6.QtCore import pyqtSignal, Qt
from ui.widgets.status_badge import StatusBadge


class ProjectCard(QFrame):
    clicked = pyqtSignal(int)  # project_id

    def __init__(self, project: dict, stats: dict, parent=None):
        super().__init__(parent)
        self._project_id = project["id"]
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setFrameShape(QFrame.Shape.Box)
        self.setSizePolicy(QSizePolicy.Policy.Preferred, QSizePolicy.Policy.Fixed)
        self.setFixedHeight(120)
        self.setMinimumWidth(250)
        self.setStyleSheet(
            "ProjectCard { background: white; border: 1px solid #e5e7eb; "
            "border-radius: 8px; padding: 12px; }"
            "ProjectCard:hover { border-color: #3b82f6; }"
        )

        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 12, 12, 12)

        # Header: name + status
        header = QHBoxLayout()
        name_label = QLabel(project["name"])
        name_label.setStyleSheet("font-size: 16px; font-weight: bold; color: #1f2937;")
        header.addWidget(name_label)
        header.addStretch()
        self._badge = StatusBadge(project["status"])
        header.addWidget(self._badge)
        layout.addLayout(header)

        # Path
        path_label = QLabel(project["path"])
        path_label.setStyleSheet("font-size: 11px; color: #9ca3af;")
        path_label.setWordWrap(True)
        layout.addWidget(path_label)

        layout.addStretch()

        # Footer: task progress
        total = stats.get("total_tasks", 0)
        done = stats.get("completed_tasks", 0)
        progress_label = QLabel(f"{done}/{total} 任務完成")
        progress_label.setStyleSheet("font-size: 12px; color: #6b7280;")
        layout.addWidget(progress_label)

    def mousePressEvent(self, event):
        self.clicked.emit(self._project_id)

    def update_data(self, project: dict, stats: dict):
        # Simplified: recreate would be easier, but for live updates:
        self._badge.set_status(project["status"])
