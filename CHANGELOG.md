# 變更紀錄

這份文件用來記錄這個專案的重要變更。

本文件從 `2026-04-01` 起開始採用固定版本說明格式。

## 如何閱讀版本

- 版本編號採用 `MAJOR.MINOR.PATCH`
- `MAJOR`：有不相容變更，升級後可能需要調整既有流程或資料
- `MINOR`：向下相容的新功能、新卡片能力或新的工作流支援
- `PATCH`：向下相容的修正、穩定性改善、文件補充或測試更新
- 尚未發版的內容先放在 `Unreleased`
- 正式發版時，再把 `Unreleased` 內容整理到對應版本節點

## [Unreleased]

### 新增

- 建立後續可持續維護的 changelog 與版本說明規則
- 開始以 `Unreleased` 區塊記錄尚未發版的變更

## [1.1.0] - 2026-04-03

### 新增

- **Claude CLI 整合**：新增 `server/claude-runner.js`，透過 `claude -p` 指令管理 Claude Code CLI session
  - 支援 session 持久化（`--session-id` / `-r`）
  - 支援 model、effort、permissionMode 參數
  - 並行上限控制（maxConcurrent），超額自動排隊
  - WebSocket 新增 `claude-exec` / `claude-abort` 訊息類型
- **Input Card**（`public/js/input-card.js`）：需求輸入卡片，可設定需求、完成標準、工作目錄、限制條件
  - 支援任務拆分（呼叫 Claude 自動拆解為子任務）
  - 支援逐一執行 / 平行執行子任務
  - 內建資料夾瀏覽器選擇工作目錄
- **Output Card**（`public/js/output-card.js`）：執行結果匯總卡片
  - 顯示各子任務進度與狀態
  - 一鍵產生驗收摘要報告
- **Prompt Card**（`public/js/prompt-card.js`）：指令發送卡片
  - 可選擇目標 Mission Card 發送 prompt
  - 支援檔案上傳附加、歷史紀錄重送
  - 支援 Claude CLI session 模式與 terminal 直接輸入模式切換
- **Workspace Section**（`public/js/workspace-section.js`）：卡片群組容器
  - 視覺化群組標題與邊界框
  - 支援拖曳整組移動、右鍵選單管理
- **Terminal Card 增強**：新增工作目錄選擇列（cwd bar）與資料夾瀏覽器
- **Mission Card 增強**：
  - 新增 AI 回應區塊，接收 Claude session 的結構化輸出
  - 新增執行區塊，可直接從 Mission 卡片呼叫 Claude
  - 支援 sessionId 綁定，自動接收對應 session 的回應
- **Agent Output Card 增強**：支援 Claude session 綁定，接收並渲染結構化訊息
- **PaneManager 增強**：
  - Claude session 訊息路由（廣播至所有匹配 sessionId 的卡片）
  - 多選卡片右鍵選單（批次關閉、批次換色）
  - Section 群組選取狀態同步
  - `translate3d` 優化 canvas 位移效能
- **Server**：新增 `/api/browse` 目錄瀏覽 API

## [1.0.1] - 2026-04-03

### 重構

- CSS 模組化：將單一 `style.css`（2883 行）拆分為 16 個獨立模組，對應 JS 卡片模組結構
  - 基礎：`variables.css`、`base.css`、`toolbar.css`
  - 工作區：`workspace.css`、`context-menu.css`、`card-base.css`
  - 卡片類型：`terminal-card.css`、`project-card.css`、`agent-output-card.css`、`prompt-card.css`、`markdown-card.css`、`mission-card.css`、`input-card.css`、`output-card.css`
  - 主題與響應式：`theme-light.css`、`responsive.css`
- 移除 Prompt Card 樣式的 3 份重複定義，合併為單一完整版本
- Light theme overrides 集中管理至 `theme-light.css`

### 測試

- 新增 `test/css-modules.test.js`（15 個測試），驗證 CSS 模組結構完整性、selector 不重複、括號平衡、JS↔CSS 對應關係等

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
