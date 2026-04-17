# 改造為實驗室管理工具可行性分析

> 分析日期：2026-04-17
> 分析分支：`claude/analyze-lab-management-feasibility-5YOt8`
> 範圍：評估將現有「AI Agent Project Management Workspace」改造為「實驗室管理工具（Lab Management）」的技術可行性

---

## 結論先行

**改造可行性：高度可行**（單使用者場景下）

- 最小可行版本估算：**3 ~ 5 週**
- 若需多人協作 / 權限系統：**+2 ~ 3 週**
- 核心架構（卡片 registry、SQLite 持久化、canvas、drag/resize、HTTP API）幾乎可 100% 重用
- 主要改造工作集中在「移除 PTY/終端耦合」與「新增實驗室領域卡片型別」

---

## 1. 專案結構盤點

| 模組 | 檔案 | 重用性 |
|------|------|--------|
| `server/state-store.js` | SQLite 持久化（`client_layouts`, `pane_buffers`） | 100% |
| `server/card-service.js` | 卡片 CRUD（無業務依賴） | 100% |
| `server/card-types.js` | 卡片欄位白名單 | 100%（擴充） |
| `server/api-router.js` | RESTful 端點 | 100% |
| `server/ws-handler.js` | WebSocket 路由 | 60%（移除 PTY 訊息） |
| `server/pty-manager.js` | node-pty 包裝 | 0%（刪除） |
| `server/claude-runner.js` | Claude CLI 整合 | 0%（刪除） |
| `public/js/base-card.js` | 拖拽、縮放、主題 | 100% |
| `public/js/card-registry.js` | 卡片型別註冊 | 100% |
| `public/js/pane-manager.js` | 畫布、群組拖拽、同步 | 99% |
| `public/js/gesture-manager.js` | 指標事件抽象 | 100% |
| `public/js/terminal-pane.js` | xterm + PTY | 0%（刪除） |
| `public/js/output-utils.js` | ANSI 解析、agent 偵測 | 0%（刪除） |

---

## 2. 資料層評估（成本：小）

現有 SQLite schema：

```
client_layouts: client_id (PK) | active_pane_id | panes_json | sections_json | updated_at
pane_buffers:   (client_id, pane_id) | buffer | program_buffer | updated_at
```

- `panes_json` 是任意 JSON，`type` 欄位無預設值 → 完全通用
- 新增實驗室領域欄位（樣本 ID、儀器預約、時間戳）直接放 `panes_json[i].data` 即可
- `pane_buffers` 是終端專屬，非終端卡片本來就不寫入 → 保留即可，亦不影響

**結論：無需 migration，不需動 schema。**

---

## 3. 卡片系統擴充（成本：中，每個卡片 1~2 小時）

CardRegistry 是這個專案最強的設計，已完全去耦合：

```javascript
CardRegistry.register({
  type: 'sample',
  cardClass: SampleCard,         // extends BaseCard
  buttonLabel: '新增樣本',
  order: 200,
  spawnBounds: { widthRatio: 0.4, heightRatio: 0.5 }
})
```

### 提案的實驗室卡片型別

| 卡片型別 | 用途 | 主要欄位 |
|---------|------|---------|
| `sample` | 實驗樣本 | sampleId, name, materialType, source, status, createdAt, notes |
| `equipment` | 儀器資產 | equipmentId, name, model, location, status, lastMaintained |
| `booking` | 儀器預約 | equipmentId, researcher, startTime, endTime, purpose, status |
| `experiment` | 實驗紀錄 | experimentId, title, procedure, startAt, endAt, sampleIds[], result |
| `inventory` | 試劑/耗材 | itemId, name, quantity, unit, expiryDate, supplier, location |
| `protocol` | 標準操作程序 | protocolId, title, version, steps[], approvedBy |

### 新增單一卡片型別需改動

| 檔案 | 改動 |
|------|------|
| `public/js/sample-card.js` | 新建（~200 行，extends BaseCard） |
| `server/card-types.js` | 加 `CARD_FIELDS.sample = [...]` |
| `public/index.html` | 加 `<script>` 標籤 |
| `server/card-service.js` | **無需改** |
| `public/js/pane-manager.js` | **無需改**（自動讀 registry） |

---

## 4. PTY / 終端耦合分析（成本：中）

### 強耦合（須移除）
- `server/pty-manager.js` —— 整個檔案
- `public/js/terminal-pane.js` —— 整個檔案（1400 行）
- `public/js/output-utils.js`、`public/js/output-card.js` —— 整個檔案
- `server/ws-handler.js` 中 `create`、`input`、`resize`、`close` 訊息分支
- `package.json` 移除 `node-pty`、`xterm` 相依

### 通用（保留）
- 拖拽、縮放、選擇、群組拖拽、無限畫布、平移縮放、顏色主題
- SQLite 持久化、HTTP CRUD、WebSocket 廣播、多標籤同步

---

## 5. WebSocket 訊息協定（成本：小）

現有訊息已足夠支援實驗室領域：

```
hydrate              — 初始化（通用）
card_created         — 廣播新卡片（通用）
card_updated         — 廣播卡片更新（通用）
card_deleted         — 廣播卡片刪除（通用）
persist_state        — 客戶端持久化請求（通用）
output / error / exit / claude-* — 終端相關（移除）
```

實驗室領域資料透過現有 `card_updated.data` 傳遞即可，無需新增訊息型別。

---

## 6. HTTP API 評估（成本：小）

`server/card-types.js` 的 `CARD_FIELDS` 白名單機制是天生擴充點：

```javascript
CARD_FIELDS = {
  sample:     ['sampleId', 'name', 'materialType', 'status', 'notes'],
  equipment:  ['equipmentId', 'name', 'model', 'location', 'status'],
  booking:    ['equipmentId', 'researcher', 'startTime', 'endTime', 'status'],
  experiment: ['experimentId', 'title', 'procedure', 'startAt', 'sampleIds', 'result']
}
```

`POST/PATCH/DELETE /api/cards` 自動支援。可額外加 domain endpoint（例 `GET /api/samples?status=active`）以支援查詢，但非必要。

---

## 7. 多人協作 / 權限（成本：大）

| 項目 | 現狀 | 缺口 |
|------|------|------|
| 使用者驗證 | 無 | 需引入 auth（JWT / session） |
| 跨裝置同步 | clientId 各自獨立，無跨裝置同步 | 需重構 state-store 改以 workspaceId 為主鍵 |
| 權限模型 | 無 RBAC | 需新增 user / role / permission 表 |
| 操作稽核 | 無 audit log | 需新增 events 表 |

實驗室場景通常需要：
- 多研究員共用同一個工作空間
- 樣本 / 儀器有 owner / borrower 關係
- 部分操作（刪除樣本、修改 protocol）需主管審核

**這是改造的最大瓶頸。** 若可接受「單研究員 / 單機」場景，可先跳過。

---

## 8. 風險與限制

| 風險 | 影響 | 緩解 |
|------|------|------|
| 無權限系統 | 多人場景不可用 | 第二階段加上 |
| SQLite 單機 | 無雲端同步 | 第二階段改 PostgreSQL + 後端 sync |
| 無檔案上傳 | 無法附實驗照片 / 數據檔 | 加 multer + 物件儲存 |
| 無條碼 / QR 掃描 | 樣本識別需手動輸入 | 加瀏覽器 BarcodeDetector API |
| 無報表匯出 | 法規 / 結案需求受限 | 加 PDF / CSV 匯出端點 |
| 無時間排程 | 儀器預約衝突偵測需自製 | 引入排程函式庫（rrule.js 等） |

---

## 9. 改造工作量分階段

### 第一階段：核心 MVP（2 ~ 3 週）
- 新增 4 個基礎卡片：sample, equipment, booking, experiment
- 移除 PTY / 終端 / Claude 相關模組
- 簡化 ws-handler 與 index.html
- 調整品牌（README, package.json, UI 文案）
- 既有測試移除 / 改寫

### 第二階段：實驗室專屬功能（1 ~ 2 週）
- 樣本批次匯入（CSV）
- 儀器預約衝突偵測
- 實驗紀錄關聯樣本
- PDF / CSV 匯出
- 檔案附件上傳

### 第三階段：多人協作（2 ~ 3 週，可選）
- 使用者認證
- workspaceId 重構 state-store
- RBAC + 操作稽核
- 跨裝置即時同步（重做 workspace-sync）

---

## 10. 建議

1. **先做 PoC**：建立 1 個 `sample-card.js` 試水溫，驗證 registry 擴充流程是否真如評估般順暢，預計 1 ~ 2 天
2. **若 PoC 順利 → 進第一階段**：建立完整 4 個卡片，產出可單機跑的實驗室 demo
3. **驗證使用者價值**後再決定是否投資多人協作（最大成本）
4. **不建議從零重寫** —— 現有 canvas、drag、persist、registry 已經是高品質基礎建設，重寫成本遠高於改造

---

## 附錄：核心架構優勢

這個專案能輕鬆改造成實驗室管理工具的根本原因：

- **卡片 registry 模式**：型別與行為完全解耦
- **欄位白名單 API**：新增領域不需改服務層
- **事件抽象（GestureManager）**：UI 互動與裝置無關
- **狀態 / UI 分離**：BaseCard 的 `getPersistData` / `hashUiState` 鉤點清楚
- **依賴注入測試模式**：新增領域邏輯易測試

這些是**通用的工作空間框架**特性。實驗室管理只是它眾多可能領域之一（同樣可以變成 CRM、看板、知識庫、設計畫布等）。
