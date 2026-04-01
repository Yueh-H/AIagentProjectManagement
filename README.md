# Claude Code 管理工具

PyQt6 桌面應用，用於管理多個 Claude Code 專案。

## 功能

- **專案儀表板** — 一目了然查看所有專案狀態
- **任務管理** — 為每個專案建立子任務
- **即時執行** — 直接在 UI 中輸入 Prompt，即時串流顯示 Claude Code 輸出
- **多工並行** — 同時執行多個 Claude Code 工作
- **狀態追蹤** — 自動更新任務與專案的完成狀態

## 安裝

```bash
pip install -r requirements.txt
```

## 使用

```bash
python main.py
```

## 需求

- Python 3.10+
- PyQt6
- [Claude Code CLI](https://claude.ai/code) 已安裝並可用
