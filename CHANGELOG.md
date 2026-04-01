# 變更紀錄

這份文件用來記錄這個專案的重要變更。

目前這個 repository 已經進入第一代 web workspace 版本，因此最重要的是先把目前專案的整體狀態整理清楚。

## [1.0.0] - 2026-04-01

### 專案現況

`AI Agent Project Management Workspace` 目前是一個以瀏覽器為操作介面的本地工作空間，主要用來協調由 CLI 驅動的 AI 工作流程，並透過可拖曳的卡片在無限畫布上進行整理。

目前版本的核心方向包括：

- 在瀏覽器中執行 PTY 終端機工作流程
- 用可拖曳、可調整大小的卡片管理工作內容
- 以 AI 任務為中心的卡片型別，例如專案、任務、agent 輸出與 markdown 筆記
- 使用 SQLite 儲存版面、卡片資料與 terminal 緩衝內容
- 以 registry 為核心，方便後續擴充新的卡片型別

### 新增

- 以 `Express`、`ws`、`node-pty`、`xterm.js` 建立的 Web Terminal 執行環境
- 使用 `CardRegistry` 的動態卡片註冊系統
- 支援卡片拖曳、縮放與自由擺放的無限畫布工作區
- `CLI Card`：用來執行指令與承載 AI agent session 的終端卡片
- `Project Card`：用來管理目標、完成條件、下一步與 terminal 健康狀態
- `Mission Card`：用來管理單一 AI 任務單元、任務狀態與結果摘要
- `Agent Output Card`：用來追蹤指定 terminal 的 agent 回應與輸出內容
- `Markdown Card`：用來保留完整 `.md` 原始內容，不轉成 rich text
- 透過 SQLite 儲存以下資料：
  - 卡片版面位置與大小
  - 卡片標題與欄位資料
  - terminal 緩衝輸出
  - 過濾後的程式輸出緩衝
- 當 `3000` 埠被佔用時自動往下一個可用 port 重試
- 工具列改為由卡片註冊資訊自動產生，不再將按鈕寫死在版面中
- 主題切換功能
- pane geometry、PTY lifecycle、websocket 與 persistence 的單元測試
- 驗證卡片建立與 reload persistence 的瀏覽器 UI smoke test

### 調整

- 由原本偏桌面應用的 Python 專案結構，轉為瀏覽器導向的 workspace 架構
- 專案目錄改成以 `public/`、`server/`、`scripts/`、`test/` 為主的組織方式
- 從原本較分散的 UI widget 架構，改為以 `BaseCard` 與 `PaneManager` 為核心的可重複使用卡片系統

### 目前限制

- 瀏覽器斷線後，terminal process 不會自動重新接回原本的連線
- 目前是 local-first 設計，並不是多使用者的 hosted 服務
- 現階段的 persistence 主要是為了在重整頁面後恢復狀態，還不是長時間 session 編排系統

### 建議下一步

- 加入 PTY reattach 或類似 `tmux` 的 session 保留能力
- 讓 markdown 卡片可以匯出成真正的 `.md` 檔案
- 針對特定 CLI agent 做更完整的輸出解析
- 擴充自動化 UI 測試，涵蓋拖曳、縮放與卡片互動行為
