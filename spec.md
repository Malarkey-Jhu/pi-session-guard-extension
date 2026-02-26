# Pi Extension Spec: Session Retention Manager

## 1) 背景與問題

Pi 將 session 以 JSONL 儲存在本地（預設 `~/.pi/agent/sessions`），長期使用後會快速累積，造成：

- 磁碟空間持續成長，可能爆滿
- 用戶難以知道哪些 session 可安全清理
- 缺乏 retention policy（保留策略）與風險防護

本 extension 的目標是提供「可視化 + 可控 + 安全」的 session 管理能力，優先避免誤刪重要資料。

---

## 2) 目標（Goals）

1. **可見性**：顯示目前 session 數量、總容量、成長趨勢（可選）
2. **可操作性**：依策略排序候選（如 LRU）並讓使用者選擇刪除
3. **可設定 retention**：提供手動、半自動、自動清理模式
4. **安全優先**：刪除前確認、防誤刪、可回復（優先使用 trash）
5. **配額治理（quota）**：接近/超過門檻時提示，必要時限制新操作直到處理

---

## 3) 非目標（Non-Goals）

- 不修改 Pi 核心 session 格式
- 不做跨機器同步/雲端備份（V1）
- 不嘗試內容語義摘要（例如自動判斷商業價值）

---

## 4) 使用者故事（User Stories）

- 作為重度使用者，我想知道現在 sessions 佔了多少空間，避免磁碟突然爆掉。
- 作為謹慎使用者，我希望刪除前能看到「最近使用時間、大小、訊息數」再決定。
- 作為團隊管理者，我希望設定 quota 與保留規則，在接近上限時強提示。
- 作為風險敏感使用者，我希望自動清理只刪除「明確低風險」session，且可撤回。

---

## 5) 核心功能範圍（V1）

### 5.1 Session 掃描與統計

- 掃描 session root（預設 `~/.pi/agent/sessions`；支援自訂）
- 聚合指標：
  - session 檔案總數
  - 總大小（bytes / human readable）
  - Top-N 最大檔案
  - 每個工作目錄 namespace 的占用

### 5.2 Session 列表與排序

每個 session 顯示：

- 檔案路徑
- 檔案大小
- 建立時間（ctime）
- 最後修改時間（mtime）
- 最後使用時間（`lastUsedAt`，見 §7）
- 估計訊息數（line count - header）
- 是否為「目前活躍 session」
- 是否被標記保護（protected）

排序方式（至少提供）：

- LRU（最久未使用優先）
- 最大檔案優先
- 最舊建立時間

### 5.3 刪除流程（手動）

- 支援多選刪除候選
- 預設使用 **soft delete**：
  1. 先嘗試系統 trash（若可用）
  2. 否則移動到 quarantine 目錄（例：`~/.pi/agent/session-trash`）
- 最終才允許 hard delete（需二次確認）
- 顯示預估可釋放空間

### 5.4 Retention Policy（基礎）

支援規則（可組合）：

- `maxTotalSizeBytes`
- `maxSessionCount`
- `maxAgeDays`
- `minKeepRecentCount`（至少保留最近 N 個）
- `protectedPatterns`（路徑/名稱白名單）

### 5.5 Quota 提示與保護

門檻等級：

- **Info**：達到 70% quota（提示）
- **Warn**：達到 90% quota（強提示 + 引導清理）
- **Critical**：超過 100%（預設強提示 + 引導清理；可選 hard-block）

> 註：阻擋策略可配置（`off | warn-only | hard-block`），**預設 `warn-only`**

---

## 6) 進階功能（V1.1 / V2 候選）

- 成長趨勢（最近 7/30 天）
- 專案維度配額（每個 cwd namespace）
- 匯出清理報告（Markdown/JSON）
- 定時自動清理（如每日啟動時）
- 「最近建立但未再開啟」特別規則

---

## 7) LRU 定義與排序策略

`lastUsedAt` 在 **V1 採 mtime 為主**（效能優先）：

1. 使用 session 檔案 mtime 作為 `lastUsedAt`
2. 若 session 正在使用（當前 session file），視為最高優先保留
3. V1.1 再評估「解析最後一個 entry timestamp」作為可選精準模式

V1 先用 deterministic 排序（LRU -> size -> path），避免黑箱分數。

---

## 8) 安全與防呆設計（重點）

1. **預設不自動刪除**（先提示與建議）
2. 自動清理需明確 opt-in
3. 永不刪除：
   - 當前活躍 session
   - 最近 N 個 session（可配置）
   - 使用者標記 protected 的 session
4. 刪除前確認：
   - 顯示「將刪除數量/空間」
   - 列出前 5 個最大風險目標
5. 支援 `dry-run`
6. 操作可審計：記錄 cleanup log（時間、目標、釋放空間、執行模式）

---

## 9) Extension UX（命令與互動草案）

### 9.1 Commands

- `/session-retention`：開啟總覽面板
- `/session-retention scan`：重新掃描
- `/session-retention clean`：進入清理精靈
- `/session-retention policy`：設定保留策略
- `/session-retention protect <sessionId|path>`：保護某 session
- `/session-retention unprotect <sessionId|path>`：取消保護

### 9.2 互動流程（clean wizard）

1. 顯示目前容量與 quota 狀態
2. 依策略生成候選清單
3. 使用者多選 + 預覽釋放空間
4. 二次確認（自動模式可要求輸入 `DELETE`）
5. 執行 soft delete 並顯示結果

---

## 10) 系統整合設計（pi extension）

- `session_start`：啟動後掃描並設定狀態提示
- `input`：在 `hard-block` 且 critical 時攔截普通輸入，引導清理
- `session_switch` / `session_fork`：更新使用熱度與統計快取
- `session_shutdown`：flush 掃描快取/操作日誌

可用 UI：

- `ctx.ui.setStatus()` 顯示 quota 狀態
- `ctx.ui.custom()` 實作多選清理面板（後續）
- 初版可先用 `select/confirm/notify` 完成

---

## 11) 設定檔草案

建議路徑：`~/.pi/agent/session-retention.json`

```json
{
  "enabled": true,
  "sessionDir": "~/.pi/agent/sessions",
  "mode": "warn-only",
  "quota": {
    "maxTotalSizeBytes": 21474836480,
    "maxSessionCount": 2000,
    "warnRatio": 0.9,
    "infoRatio": 0.7
  },
  "retention": {
    "maxAgeDays": 180,
    "minKeepRecentCount": 30,
    "autoClean": false,
    "autoCleanMaxDeletesPerRun": 20,
    "dryRun": true
  },
  "protection": {
    "protectedPatterns": ["*important*", "*prod-incident*"],
    "neverDeleteActiveSession": true
  }
}
```

---

## 12) 風險與對策

- **誤刪重要 session** → soft delete + protect + keep recent + 二次確認
- **掃描成本過高** → 增量掃描 + 快取 metadata
- **與 Pi 寫入競爭** → 跳過正在活躍寫入的 session（或重試）
- **hard-block 影響體驗** → 預設 warn-only，hard-block 需使用者明確開啟

---

## 13) 驗收標準（Acceptance Criteria）

1. 可在命令中看到總 session 數與總容量
2. 可依 LRU/size 排序並多選刪除
3. 刪除前可預覽釋放空間，刪除後顯示實際釋放量
4. 啟用 quota 後，在 70/90/100% 出現對應提示
5. 啟用 hard-block 時，超額會攔截一般輸入並引導清理
6. 當前 active session 永不會被刪除

---

## 14) 決策紀錄（Decision Log）

1. **hard-block 不作為預設**  
   - 預設模式為 `warn-only`，避免過度干擾日常使用。

2. **自動清理（auto-clean）在 V1 僅允許 soft delete**  
   - 不允許 auto hard delete，降低不可逆風險。

3. **`lastUsedAt` 在 V1 以 mtime 計算**  
   - 先確保掃描性能與可預測性；精準模式（解析最後 entry）延後至 V1.1 評估。

4. **quota 同時納管容量與數量，容量為主、數量為輔**  
   - `maxTotalSizeBytes` 為主要治理指標；`maxSessionCount` 作為補充限制與告警。

5. **V1 先採全域 quota，不做 per-project hard limit**  
   - V1.1 可增加 per-project 告警與觀測，V2 再評估雙層配額治理。

---

## 15) 建議實作里程碑

- **M1**：掃描統計 + 命令列輸出（無刪除）
- **M2**：手動清理（soft delete + confirm + protect）
- **M3**：policy + quota 狀態提示
- **M4**：auto-clean（opt-in）+ hard-block（可選）

---

如果你同意，我下一步可以把這份 spec 拆成：
1) `architecture.md`（資料模型與事件流程）
2) `tasks.md`（可直接開工的 checklist）
3) `risk-matrix.md`（誤刪與阻擋策略）
