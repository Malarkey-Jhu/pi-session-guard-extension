# Pi Extension Spec: Session Retention Manager (MVP)

## 1) 背景與問題

Pi 會把 session 存成本地 JSONL（預設 `~/.pi/agent/sessions`）。長期使用後常見問題：

- 磁碟持續膨脹
- 使用者不清楚哪些 session 可以清
- 若無容量治理，可能在關鍵時刻爆滿

本專案 MVP 目標：先做「**手動清理 + quota 治理**」，不引入自動刪除複雜度。

---

## 2) MVP 目標（本階段）

1. **可見性**：scan 顯示總容量、使用率、quota 狀態
2. **可操作性**：保留手動 clean（多選 + soft delete）
3. **可治理性**：提供單一 quota（容量上限）與明確告警
4. **可防護**：超過 100% 時阻擋一般對話，強制先清理

---

## 3) 非目標（Out of Scope for MVP）

- 自動刪除（auto-clean）
- 多條 retention policy（maxAgeDays / protectedPatterns 等）
- session count quota
- 內容語義摘要（LLM 產生標題）

> 註：目前 session 摘要僅採「第一個 user 訊息 + 截斷」。

---

## 4) 核心功能範圍（MVP）

### 4.1 Session 掃描與顯示

- 掃描/清理都固定在 `global` scope（不提供 scope 切換）
- 顯示：
  - `totalSessions`
  - `totalSizeBytes`
  - Top-N session（含 summary，不顯示 jsonl 檔名）
  - quota 使用率與狀態（見 4.3）

### 4.2 手動清理（維持現有）

- `/session-retention clean`
- 多選候選 + 預估釋放空間
- 預設 soft delete（trash -> quarantine fallback）
- active session 永不刪除

### 4.3 Quota（本次重點）

只支援一種配額：

- `maxTotalSizeBytes`

狀態分級（以容量使用率判定）：

- `ok`：< 70%
- `info`：>= 70% 且 < 90%
- `warn`：>= 90% 且 < 100%
- `critical`：>= 100%

### 4.4 Quota 命令與設定流程

唯一設定入口：

- `/session-retention quota set <size>`

範例：

- `/session-retention quota set 10GB`
- `/session-retention quota set 500MB`

行為：

1. 解析 size（支援 B/KB/MB/GB/TB）
2. 寫入設定檔 `~/.pi/agent/session-retention.json`
3. 立即重新計算目前使用率並回報狀態

### 4.5 進入對話提示與阻擋

- `warn`（>=90%）：進入對話提示清理建議
- `critical`（>=100%）：阻擋一般對話輸入

在 `critical` 時，必須放行以下命令避免鎖死：

- `/session-retention scan`
- `/session-retention clean`
- `/session-retention quota set ...`
- `/help`

---

## 5) UX 草案

### 5.1 Commands

- `/session-retention scan [--sort size|lru]`
- `/session-retention clean`
- `/session-retention quota set <size>`

### 5.2 Scan 顯示（新增）

- `Quota: 10.00 GB`
- `Used: 9.21 GB (92.1%)`
- `State: WARN`
- 建議文案：`Run /session-retention clean to free space`

---

## 6) 設定檔（MVP）

路徑：`~/.pi/agent/session-retention.json`

```json
{
  "quota": {
    "maxTotalSizeBytes": 10737418240,
    "infoRatio": 0.7,
    "warnRatio": 0.9
  }
}
```

---

## 7) 驗收標準（MVP AC）

1. 可透過 `/session-retention quota set <size>` 設定容量上限
2. `/session-retention scan` 可顯示 quota、使用率%、狀態
3. 使用率 >=90% 會提示清理
4. 使用率 >=100% 會阻擋一般對話輸入
5. `critical` 狀態下仍可使用 retention 相關命令完成解鎖
6. 手動 clean 仍正常運作（soft delete）

---

## 8) 決策紀錄（本次）

1. 先做單一容量 quota，避免 policy 過度複雜。
2. 自動刪除與進階 retention 延後到後續版本。
3. 以手動清理為主，阻擋僅發生在 quota critical。
4. session 顯示改為 user 第一個訊息摘要，提升可讀性。
