# Session Retention Manager - Tasks (MVP)

## 0) 目標定義（本輪）

- [ ] 以「手動清理 + 容量 quota」完成 MVP
- [ ] 保留現有 scan/clean 能力
- [ ] 不做 auto-clean、不做進階 retention policy

---

## 1) Quota 設定（唯一入口）

- [ ] 新增命令：`/session-retention quota set <size>`
- [ ] 支援 size parser：`B | KB | MB | GB | TB`（大小寫皆可）
- [ ] 輸入驗證：
  - [ ] 格式錯誤時提示可用範例（如 `10GB`, `500MB`）
  - [ ] 數值需 > 0
- [ ] 寫入設定檔：`~/.pi/agent/session-retention.json`
- [ ] 設定後立即重算並回覆目前使用率與狀態

**完成定義**：可成功 set quota，重啟後設定仍存在。

---

## 2) Quota 模型與狀態計算

- [ ] 定義 `QuotaConfig`：
  - [ ] `maxTotalSizeBytes`
  - [ ] `infoRatio=0.7`
  - [ ] `warnRatio=0.9`
- [ ] 計算使用率：`usage = totalSizeBytes / maxTotalSizeBytes`
- [ ] 狀態分級：
  - [ ] `<0.7 => ok`
  - [ ] `>=0.7 && <0.9 => info`
  - [ ] `>=0.9 && <1.0 => warn`
  - [ ] `>=1.0 => critical`

**完成定義**：任意 scan 結果都能得到 deterministic quota state。

---

## 3) Scan 報表整合 Quota

- [ ] 在 scan 輸出新增：
  - [ ] Quota（human-readable）
  - [ ] Used（bytes + human-readable）
  - [ ] Usage ratio（百分比）
  - [ ] State（ok/info/warn/critical）
- [ ] 依狀態加入提示文案：
  - [ ] warn/critical 顯示 `Run /session-retention clean`
- [ ] renderer 加上狀態顏色（accent/warning）

**完成定義**：`/session-retention scan` 可直接用於容量決策。

---

## 4) 進入對話提示（Warn）

- [ ] 在 `session_start` 或首次 input 前計算 quota state
- [ ] 若 `warn`：顯示一次提示（避免每條訊息都 spam）
- [ ] 提示內容包含目前百分比與建議命令

**完成定義**：>=90% 會被明確提醒，但不阻擋。

---

## 5) 超額阻擋（Critical）

- [ ] 監聽 `input` event
- [ ] `critical` 時阻擋一般 prompt
- [ ] 放行白名單命令：
  - [ ] `/session-retention scan`
  - [ ] `/session-retention clean`
  - [ ] `/session-retention quota set ...`
  - [ ] `/help`
- [ ] 阻擋文案需清楚告知解鎖路徑（clean 或提高 quota）
- [ ] fail-open 防呆：guard 例外時至少保證可執行 retention 命令

**完成定義**：>=100% 無法繼續一般對話，但可自助解鎖。

---

## 6) 既有功能回歸檢查

- [ ] scan（global）仍正常
- [ ] clean 多選與 soft delete 仍正常
- [ ] active session 不可刪
- [ ] summary 顯示（user 第一訊息）仍正常

---

## 7) 測試任務

### 7.1 單元測試
- [ ] size parser（合法與非法案例）
- [ ] quota state 計算邊界（69.9/70/89.9/90/99.9/100）
- [ ] guard 白名單命令判斷

### 7.2 整合測試
- [ ] set quota 後 scan 立即反映
- [ ] warn 顯示提示但可正常對話
- [ ] critical 阻擋一般輸入
- [ ] critical 下可執行 clean 與 quota set

### 7.3 手動驗證
- [ ] 真實 sessions 複本測試（至少 3 種容量區間）
- [ ] 清理後狀態從 critical/warn 回落
- [ ] 重啟後 quota 設定仍生效

---

## 8) MVP 驗收清單

- [ ] AC1: `/session-retention quota set <size>` 可設定且持久化
- [ ] AC2: scan 顯示 quota/使用率/狀態
- [ ] AC3: >=90% 會提示
- [ ] AC4: >=100% 阻擋一般對話
- [ ] AC5: critical 狀態可透過 retention 命令解鎖
- [ ] AC6: clean 與 soft delete 功能無回歸

---

## 9) 明確延後項目（Post-MVP）

- [ ] auto-clean（opt-in）
- [ ] maxSessionCount quota
- [ ] maxAgeDays / protectedPatterns 等進階 policy
- [ ] cache/index 優化
