# Pi Session Guard Extension

一個用來**安全管理 Pi 本地 session**的 extension，核心重點：

- 可視化（session 佔多少空間）
- 手動清理（刪除前可檢視）
- Quota 防護（接近上限警告、超額阻擋）

---

## 這個 extension 解決什麼問題

Pi 會把對話 session 儲存在本機 JSONL（`~/.pi/agent/sessions`）。
長期使用後，session 檔案會持續變大，容易造成磁碟壓力。

`session-guard` 讓你可以：

1. 看清楚空間是被哪些 session 佔用，
2. 先看內容再決定是否刪除，
3. 用 quota 控制成長風險。

---

## 目前 MVP 行為

- **只支援 global 掃描/清理**（不切 scope）
- session 顯示採用**第一個 user 訊息摘要**（不是 jsonl 檔名）
- 清理為**手動流程**，且預設 **soft-delete**（先 trash，失敗才 quarantine）
- quota 目前只管「容量大小」
- quota 狀態：
  - `ok`
  - `info`
  - `warn`（>= 90%）
  - `critical`（>= 100%，阻擋一般對話輸入）

`critical` 狀態仍可執行解鎖命令：

- `/session-guard scan`
- `/session-guard clean`
- `/session-guard quota set <size>`

---

## 使用方式

### Commands

- `/session-guard scan [--sort size|lru]`
- `/session-guard clean`
- `/session-guard quota set <size>`

### 範例

- `/session-guard quota set 10GB`
- `/session-guard scan --sort lru`
- `/session-guard clean`

---

## Quota 設定檔

你**不需要**手動建立設定檔。

當你執行：

- `/session-guard quota set <size>`

extension 會自動建立/更新：

- `~/.pi/agent/session-guard.json`

---

## 開發說明

主要檔案：

- `src/index.ts`：extension 入口（事件與命令路由）
- `src/session.ts`：session 掃描與摘要提取
- `src/clean.ts`：清理 UI 與 soft-delete 流程
- `src/quota.ts`：quota 設定、狀態、輸入阻擋
- `src/report.ts`：scan 報表格式化
- `src/renderer.ts`：客製訊息渲染
- `src/args.ts`、`src/actions.ts`、`src/types.ts`、`src/utils.ts`：支援模組

本地開發：

1. 在此 repo 啟動 Pi
2. 修改後執行 `/reload`

封裝入口：

- `package.json` 的 `pi.extensions` 指向 `./src/index.ts`

---

## 相關文件

- 規格：`spec.md`
- 任務拆解：`tasks.md`
- English README：`README.md`
