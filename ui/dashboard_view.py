from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QLabel, QScrollArea, QGridLayout, QFrame,
)
from PyQt6.QtCore import pyqtSignal, Qt
from models import project as project_model
from ui.widgets.project_card import ProjectCard


class DashboardView(QWidget):
    project_clicked = pyqtSignal(int)

    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 20, 20, 20)

        title = QLabel("專案總覽")
        title.setStyleSheet("font-size: 22px; font-weight: bold; color: #1f2937;")
        layout.addWidget(title)

        # Scroll area for cards
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setStyleSheet("QScrollArea { border: none; background: transparent; }")

        self._container = QWidget()
        self._grid = QGridLayout(self._container)
        self._grid.setSpacing(16)
        self._grid.setAlignment(Qt.AlignmentFlag.AlignTop | Qt.AlignmentFlag.AlignLeft)
        scroll.setWidget(self._container)
        layout.addWidget(scroll)

        self._cards: list[ProjectCard] = []

    def refresh(self):
        # Clear existing cards
        for card in self._cards:
            card.setParent(None)
            card.deleteLater()
        self._cards.clear()

        projects = project_model.get_all_projects()
        cols = 3
        for i, p in enumerate(projects):
            stats = project_model.get_project_stats(p["id"])
            card = ProjectCard(p, stats)
            card.clicked.connect(self.project_clicked.emit)
            self._grid.addWidget(card, i // cols, i % cols)
            self._cards.append(card)
