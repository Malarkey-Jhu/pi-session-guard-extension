# Pi Session Retention Extension

安全管理 Pi 本地 session，避免磁碟空間爆炸。

English README: [`README.md`](./README.md)

---

## 專案說明

Pi 會把對話 session 以 JSONL 檔案儲存在本地（預設：`~/.pi/agent/sessions`）。
長期使用下，session 容量會快速成長，可能導致磁碟空間壓力。

本 extension 目標：

- 提供 session 可視化（數量、容量、最大檔案）
- 提供安全清理流程（預設 soft-delete）
- 提供 retention policy（依容量/數量/時間）
- 提供 quota 提示與可選 hard-block

## 目前進度

目前在規劃階段（已完成規格與任務拆解）：

- `spec.md`：產品與技術規格
- `tasks.md`：開發 checklist 與里程碑

## 預計功能（V1）

- 掃描並統計 session 空間使用
- 依 LRU / 大小 / 時間排序 session
- 手動清理精靈（含確認流程）
- 預設 soft-delete（trash/quarantine）
- 保護重要 session 避免誤刪
- quota 狀態：info / warn / critical

## 安全原則

- 預設不自動刪除
- auto-clean 必須明確啟用
- V1 的 auto-clean 僅 soft-delete
- 永不刪除 active session
- 保留最近與受保護 session

## 路線圖

- M1: 掃描統計 + 排序 + 命令骨架
- M2: 手動清理 + soft-delete + protect
- M3: quota 狀態提示 + policy 命令
- M4: auto-clean（opt-in）+ hard-block（可選）

## 開發與發佈結構

此 repo 現在使用可發佈的目錄結構：

- `src/index.ts`：extension 主入口（發佈使用）
- `.pi/extensions/session-retention/index.ts`：本地開發載入器（re-export，方便 `/reload`）

本地開發可直接在此 repo 執行 pi 並使用 `/reload`。
未來發佈時，`package.json` 的 `pi.extensions` 已指向 `./src/index.ts`。
