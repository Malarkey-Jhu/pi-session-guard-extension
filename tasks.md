# Session Retention Manager - Tasks

## 0) 專案初始化

- [ ] 建立 extension 目錄（建議）：`.pi/extensions/session-retention/index.ts`
- [ ] 建立設定檔路徑常數：`~/.pi/agent/session-retention.json`
- [ ] 建立模組結構：
  - [ ] `src/config.ts`（讀取/驗證設定）
  - [ ] `src/scanner.ts`（掃描與統計）
  - [ ] `src/policy.ts`（候選與保留規則）
  - [ ] `src/cleanup.ts`（soft delete / hard delete）
  - [ ] `src/commands.ts`（slash commands）
  - [ ] `src/guard.ts`（quota gate / hard-block）
  - [ ] `src/log.ts`（cleanup 審計日誌）

---

## 1) 設定與資料模型（M1 前置）

- [ ] 定義 `RetentionConfig` 型別（含預設值）
- [ ] 支援欄位：
  - [ ] `enabled`
  - [ ] `sessionDir`
  - [ ] `mode: off | warn-only | hard-block`（預設 `warn-only`）
  - [ ] `quota.maxTotalSizeBytes`
  - [ ] `quota.maxSessionCount`
  - [ ] `quota.warnRatio` / `quota.infoRatio`
  - [ ] `retention.maxAgeDays`
  - [ ] `retention.minKeepRecentCount`
  - [ ] `retention.autoClean`
  - [ ] `retention.autoCleanMaxDeletesPerRun`
  - [ ] `retention.dryRun`
  - [ ] `protection.protectedPatterns`
  - [ ] `protection.neverDeleteActiveSession`
- [ ] 讀取 JSON 設定（檔案不存在時自動用預設）
- [ ] 驗證設定值（邊界檢查，如 ratio 0~1、count >= 0）

**完成定義**：可從 command 呼叫並打印有效配置。

---

## 2) Session 掃描器（M1）

- [ ] 掃描 `sessionDir` 下所有 `.jsonl`
- [ ] 建立 `SessionMeta`：
  - [ ] `path`
  - [ ] `sizeBytes`
  - [ ] `ctimeMs`
  - [ ] `mtimeMs`
  - [ ] `lastUsedAtMs`（V1 = `mtimeMs`）
  - [ ] `estimatedMessageCount`（lineCount - 1）
  - [ ] `namespace`（由 sessions 子資料夾推導）
- [ ] 識別 active session（透過 `ctx.sessionManager.getSessionFile()`）
- [ ] 聚合統計 `ScanSummary`：
  - [ ] `totalSessions`
  - [ ] `totalSizeBytes`
  - [ ] `topLargest[]`
  - [ ] `byNamespace[]`
- [ ] 加入基本快取（避免每次命令都全量掃描）

**完成定義**：`/session-retention scan` 可顯示總數、總大小、Top-N。

---

## 3) 排序與候選生成（M1）

- [ ] 實作排序器：
  - [ ] `lru`（`lastUsedAtMs` 升序）
  - [ ] `size-desc`
  - [ ] `oldest`
- [ ] 實作保留過濾（永不刪）
  - [ ] active session 不可刪
  - [ ] 最近 `minKeepRecentCount` 不可刪
  - [ ] `protectedPatterns` 命中不可刪
  - [ ] 手動 protect 清單不可刪
- [ ] 建立候選清單與排除原因（方便 UI 顯示）

**完成定義**：可輸出「可刪候選」與「被保留原因」。

---

## 4) 命令骨架（M1）

- [ ] `/session-retention`：顯示總覽
- [ ] `/session-retention scan`：強制重掃
- [ ] `/session-retention clean`：啟動清理流程（先文字版）
- [ ] `/session-retention policy`：顯示目前政策
- [ ] `/session-retention protect <id|path>`
- [ ] `/session-retention unprotect <id|path>`

**完成定義**：所有命令可執行，至少有基本文字輸出。

---

## 5) 手動清理流程（M2）

- [ ] 設計 clean wizard（V1 可先 `select + confirm`）
- [ ] 支援多選候選
- [ ] 顯示預估可釋放空間
- [ ] 二次確認（顯示刪除數量、容量、示例檔案）
- [ ] 執行刪除前再驗證（避免 race condition）

### 5.1 Soft Delete（M2 核心）

- [ ] 優先嘗試系統 Trash
- [ ] Trash 不可用時，移動至 `~/.pi/agent/session-trash`
- [ ] 保留原路徑結構或建立可回復映射
- [ ] 返回實際釋放空間（如果可計算）

### 5.2 Hard Delete（手動、非預設）

- [ ] 僅在顯式選項下可用
- [ ] 強制二次確認（可要求輸入 `DELETE`）
- [ ] 永不作用於 active / protected / keepRecent

**完成定義**：可完成一輪手動清理，且預設為 soft delete。

---

## 6) Quota 計算與提示（M3）

- [ ] 建立 quota state 計算：`ok | info | warn | critical`
- [ ] 同時計算：
  - [ ] 容量使用率（主）
  - [ ] session 數量使用率（輔）
- [ ] `session_start` 時更新狀態
- [ ] `ctx.ui.setStatus()` 顯示即時狀態
- [ ] 在 `/session-retention` 顯示詳細 quota breakdown

**完成定義**：70%/90%/100% 有對應提示與文案。

---

## 7) Input Guard（M4，可選 hard-block）

- [ ] 監聽 `input` event
- [ ] `mode=warn-only` 時：只提示不阻擋
- [ ] `mode=hard-block` 且 `critical` 時：
  - [ ] 攔截一般 prompt
  - [ ] 放行 retention 相關命令（避免鎖死）
  - [ ] 提示用戶先清理
- [ ] 增加防呆：任何 guard 失敗時 fail-open（至少保證可用命令清理）

**完成定義**：hard-block 可用但不會造成無法解鎖。

---

## 8) Auto-clean（M4，opt-in）

- [ ] 僅在 `retention.autoClean=true` 啟用
- [ ] 僅執行 soft-delete（V1 決策）
- [ ] 每次最多刪 `autoCleanMaxDeletesPerRun`
- [ ] 支援 `dryRun`（只報告不執行）
- [ ] 自動清理前顯示摘要，必要時 confirm

**完成定義**：可在啟動或手動觸發時自動清理低風險候選。

---

## 9) Protect 清單與審計（M2/M3）

- [ ] 持久化 protect 清單（建議獨立檔案）
- [ ] cleanup log（建議 `~/.pi/agent/session-retention.log`）
- [ ] 記錄欄位：
  - [ ] 時間
  - [ ] 模式（manual/auto, soft/hard）
  - [ ] 目標檔案
  - [ ] 釋放空間
  - [ ] 執行結果（success/fail + reason）

**完成定義**：每次清理可追蹤、可稽核。

---

## 10) 錯誤處理與邊界條件

- [ ] 無權限讀寫 session 目錄
- [ ] 檔案在掃描後被刪除/移動（TOCTOU）
- [ ] 正在寫入的 session（active 或剛更新）
- [ ] 超大目錄掃描時間過長（提供進度或 timeout）
- [ ] Trash 指令不可用 fallback 正常

**完成定義**：錯誤不 crash，且對使用者有可理解提示。

---

## 11) 測試任務

### 11.1 單元測試
- [ ] 配置驗證與預設值
- [ ] quota state 計算
- [ ] 排序器（LRU/size/oldest）
- [ ] 保留規則過濾（active/protected/keepRecent）

### 11.2 整合測試
- [ ] 建立 mock sessions，驗證掃描統計
- [ ] 驗證 clean wizard + soft delete
- [ ] 驗證 hard-block 只在 critical + hard-block 模式攔截
- [ ] 驗證 auto-clean 僅 soft-delete

### 11.3 手動驗證
- [ ] 在真實 `~/.pi/agent/sessions` 複本測試
- [ ] 驗證 recover/restore 流程（若已實作）
- [ ] 驗證性能（1k/5k/10k session）

---

## 12) 里程碑交付清單

### M1（觀測能力）
- [ ] 掃描 + 統計 + 排序 + 命令骨架

### M2（安全手動清理）
- [ ] clean wizard + soft delete + protect

### M3（治理能力）
- [ ] quota 狀態 + status 提示 + policy 展示

### M4（自動化與強治理）
- [ ] auto-clean（opt-in）+ hard-block（可選）

---

## 13) 對應驗收標準（追蹤）

- [ ] AC1: 命令可看總數/總容量
- [ ] AC2: 可依 LRU/size 排序並多選刪除
- [ ] AC3: 刪除前後可見預估/實際釋放量
- [ ] AC4: 70/90/100% 提示正確
- [ ] AC5: hard-block 超額攔截並引導清理
- [ ] AC6: active session 永不刪除
