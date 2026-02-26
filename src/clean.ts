/**
 * Manual cleanup flow: candidate selection UI and soft-delete execution.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_KEEP_RECENT } from "./constants";
import { loadQuotaSummary } from "./quota";
import { scanSessions, sortSessions } from "./session";
import type { CleanCandidate, QuotaSummary, SessionFileMeta, SoftDeleteResult } from "./types";
import { ellipsizeMiddle, formatBytes, formatTime, pad } from "./utils";

function extractPreviewText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const candidate = block as { type?: unknown; text?: unknown };
    if (candidate.type === "text" && typeof candidate.text === "string") {
      parts.push(candidate.text);
    }
  }

  return parts.join(" ").trim();
}

function normalizePreviewLine(text: string, maxLen = 140): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (compact.length <= maxLen) return compact;
  return `${compact.slice(0, Math.max(1, maxLen - 1)).trimEnd()}…`;
}

async function buildSessionPreviewLines(sessionPath: string, maxMessages = 60): Promise<string[]> {
  const raw = await fs.readFile(sessionPath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);

  const preview: string[] = [];
  preview.push("Session Preview");
  preview.push(`File: ${path.basename(sessionPath)}`);
  preview.push("");

  let shown = 0;
  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (!parsed || typeof parsed !== "object") continue;
    const entry = parsed as {
      type?: unknown;
      message?: { role?: unknown; content?: unknown; toolName?: unknown };
    };

    if (entry.type !== "message") continue;
    const role = typeof entry.message?.role === "string" ? entry.message.role : "unknown";
    if (role !== "user" && role !== "assistant") continue;

    const text = normalizePreviewLine(extractPreviewText(entry.message?.content));
    if (!text) continue;

    preview.push(`${role}> ${text}`);

    shown += 1;
    if (shown >= maxMessages) {
      preview.push("");
      preview.push(`… preview truncated (${shown} messages shown)`);
      break;
    }
  }

  if (shown === 0) {
    preview.push("(No message content found)");
  }

  return preview;
}

function buildCleanCandidates(sessions: SessionFileMeta[], keepRecentCount: number): CleanCandidate[] {
  const active = sessions.filter((s) => s.isActive);
  const nonActive = sortSessions(
    sessions.filter((s) => !s.isActive),
    "lru",
  );

  const cutoff = Math.max(0, nonActive.length - keepRecentCount);

  const activeCandidates: CleanCandidate[] = active.map((s) => ({
    path: s.path,
    namespace: s.namespace,
    sizeBytes: s.sizeBytes,
    mtimeMs: s.mtimeMs,
    title: s.title,
    selectable: false,
    defaultSelected: false,
    reason: "ACTIVE",
  }));

  const nonActiveCandidates: CleanCandidate[] = nonActive.map((s, index) => {
    const selected = index < cutoff;
    return {
      path: s.path,
      namespace: s.namespace,
      sizeBytes: s.sizeBytes,
      mtimeMs: s.mtimeMs,
      title: s.title,
      selectable: true,
      defaultSelected: selected,
      reason: selected ? undefined : "KEEP_RECENT",
    };
  });

  return [...activeCandidates, ...nonActiveCandidates];
}

function nextSelectableIndex(candidates: CleanCandidate[], start: number, dir: -1 | 1): number {
  if (candidates.length === 0) return 0;

  let idx = start;
  for (let tries = 0; tries < candidates.length; tries++) {
    idx += dir;
    if (idx < 0) idx = 0;
    if (idx >= candidates.length) idx = candidates.length - 1;
    if (candidates[idx]?.selectable) return idx;
    if ((idx === 0 && dir === -1) || (idx === candidates.length - 1 && dir === 1)) break;
  }

  return start;
}

async function chooseCleanupCandidates(ctx: ExtensionCommandContext, candidates: CleanCandidate[]): Promise<string[] | null> {
  return ctx.ui.custom<string[] | null>((tui, theme, _keybindings, done) => {
    let cursor = Math.max(0, candidates.findIndex((c) => c.selectable));
    if (cursor === -1) cursor = 0;

    let scroll = 0;
    let mode: "list" | "preview" = "list";
    let previewLines: string[] = [];
    let previewScroll = 0;
    let previewLoading = false;
    let previewError = "";

    const selected = new Set<number>();
    for (let i = 0; i < candidates.length; i++) {
      if (candidates[i]?.defaultSelected && candidates[i]?.selectable) selected.add(i);
    }

    const visibleRows = 10;
    const contextRowsAboveCursor = 1;

    const ensureCursorVisible = () => {
      if (cursor < scroll) {
        scroll = Math.max(0, cursor - contextRowsAboveCursor);
      }
      if (cursor >= scroll + visibleRows) {
        scroll = cursor - visibleRows + 1;
      }
      if (scroll < 0) scroll = 0;
    };

    const getSelectedSummary = () => {
      let count = 0;
      let bytes = 0;
      for (const idx of selected) {
        const item = candidates[idx];
        if (!item) continue;
        count += 1;
        bytes += item.sizeBytes;
      }
      return { count, bytes };
    };

    const openPreview = async () => {
      const item = candidates[cursor];
      if (!item) return;

      mode = "preview";
      previewLoading = true;
      previewError = "";
      previewLines = [];
      previewScroll = 0;
      tui.requestRender();

      try {
        previewLines = await buildSessionPreviewLines(item.path);
      } catch (error) {
        previewError = error instanceof Error ? error.message : String(error);
      } finally {
        previewLoading = false;
        tui.requestRender();
      }
    };

    ensureCursorVisible();

    return {
      invalidate() {},
      handleInput(data: string) {
        if (mode === "preview") {
          const maxScroll = Math.max(0, previewLines.length - visibleRows);

          if (matchesKey(data, Key.up) || data === "k") {
            previewScroll = Math.max(0, previewScroll - 1);
            tui.requestRender();
            return;
          }

          if (matchesKey(data, Key.down) || data === "j") {
            previewScroll = Math.min(maxScroll, previewScroll + 1);
            tui.requestRender();
            return;
          }

          if (matchesKey(data, Key.escape) || data === "p") {
            mode = "list";
            tui.requestRender();
            return;
          }

          return;
        }

        if (matchesKey(data, Key.up) || data === "k") {
          cursor = nextSelectableIndex(candidates, cursor, -1);
          ensureCursorVisible();
          tui.requestRender();
          return;
        }

        if (matchesKey(data, Key.down) || data === "j") {
          cursor = nextSelectableIndex(candidates, cursor, 1);
          ensureCursorVisible();
          tui.requestRender();
          return;
        }

        if (data === "p") {
          void openPreview();
          return;
        }

        if (matchesKey(data, Key.space)) {
          const item = candidates[cursor];
          if (item?.selectable) {
            if (selected.has(cursor)) selected.delete(cursor);
            else selected.add(cursor);
            tui.requestRender();
          }
          return;
        }

        if (data === "a") {
          const selectable = candidates
            .map((c, idx) => ({ c, idx }))
            .filter(({ c }) => c.selectable)
            .map(({ idx }) => idx);
          const allSelected = selectable.every((idx) => selected.has(idx));
          if (allSelected) selectable.forEach((idx) => selected.delete(idx));
          else selectable.forEach((idx) => selected.add(idx));
          tui.requestRender();
          return;
        }

        if (matchesKey(data, Key.enter)) {
          const selectedPaths = [...selected].sort((a, b) => a - b).map((idx) => candidates[idx]!.path);
          done(selectedPaths);
          return;
        }

        if (matchesKey(data, Key.escape)) {
          done(null);
        }
      },
      render(width: number) {
        if (mode === "preview") {
          const lines: string[] = [];
          lines.push(theme.fg("accent", theme.bold("Session Preview")));
          lines.push(theme.fg("dim", "↑/↓ scroll  •  p/esc back"));
          lines.push("");

          if (previewLoading) {
            lines.push(theme.fg("muted", "Loading preview..."));
            return lines.map((line) => truncateToWidth(line, width));
          }

          if (previewError) {
            lines.push(theme.fg("error", `Failed to load preview: ${previewError}`));
            return lines.map((line) => truncateToWidth(line, width));
          }

          const end = Math.min(previewLines.length, previewScroll + visibleRows);
          for (let i = previewScroll; i < end; i++) {
            lines.push(previewLines[i] ?? "");
          }

          if (end < previewLines.length) {
            lines.push(theme.fg("dim", `… ${previewLines.length - end} more lines`));
          }

          return lines.map((line) => truncateToWidth(line, width));
        }

        const lines: string[] = [];
        const summary = getSelectedSummary();

        lines.push(theme.fg("accent", theme.bold("Session Guard Cleanup")));
        lines.push(theme.fg("dim", "↑/↓ move  •  space toggle  •  a all/none  •  p preview  •  enter confirm  •  esc cancel"));
        lines.push(theme.fg("warning", "[×] locked: active session cannot be deleted"));
        lines.push(theme.fg("muted", "Selected: ") + theme.fg("text", `${summary.count} files, ${formatBytes(summary.bytes)}`));
        lines.push("");

        const header =
          `${pad("#", 3, "right")}  ${pad("Sel", 5)}  ${pad("Size", 10, "right")}  ${pad("Updated", 16)}  Summary`;
        lines.push(theme.fg("dim", header));
        lines.push(theme.fg("dim", `${"-".repeat(3)}  ${"-".repeat(5)}  ${"-".repeat(10)}  ${"-".repeat(16)}  ${"-".repeat(48)}`));

        const end = Math.min(candidates.length, scroll + visibleRows);
        for (let i = scroll; i < end; i++) {
          const item = candidates[i]!;
          const isCursor = i === cursor;
          const sel = item.selectable ? (selected.has(i) ? "[x]" : "[ ]") : "[×]";
          const baseLabel = item.reason === "ACTIVE" ? `${item.title} [LOCKED]` : item.title;
          const label = ellipsizeMiddle(baseLabel, 48);
          const row = `${pad(String(i + 1), 3, "right")}  ${pad(sel, 5)}  ${pad(formatBytes(item.sizeBytes), 10, "right")}  ${pad(formatTime(item.mtimeMs), 16)}  ${label}`;

          if (isCursor) {
            const cursorLine = item.selectable ? row : theme.fg("warning", row);
            lines.push(truncateToWidth(theme.fg("accent", `❯ ${cursorLine}`), width));
          } else {
            let line = row;
            if (item.reason === "ACTIVE") line = theme.fg("warning", row);
            else if (!item.selectable) line = theme.fg("dim", row);
            lines.push(truncateToWidth(`  ${line}`, width));
          }
        }

        if (end < candidates.length) lines.push(theme.fg("dim", `… ${candidates.length - end} more`));
        return lines.map((line) => truncateToWidth(line, width));
      },
    };
  });
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function uniquePath(p: string): Promise<string> {
  if (!(await pathExists(p))) return p;
  const dir = path.dirname(p);
  const ext = path.extname(p);
  const base = path.basename(p, ext);
  const candidate = path.join(dir, `${base}_${Date.now()}${ext}`);
  if (!(await pathExists(candidate))) return candidate;
  return path.join(dir, `${base}_${Date.now()}_${Math.random().toString(16).slice(2, 6)}${ext}`);
}

async function softDeleteSessionFile(pi: ExtensionAPI, sessionPath: string, sessionRootDir: string): Promise<SoftDeleteResult> {
  try {
    const trashResult = await pi.exec("trash", [sessionPath], { timeout: 10000 });
    if (trashResult.code === 0) return { ok: true, method: "trash" };
  } catch {
    // fallback below
  }

  try {
    const quarantineRoot = path.join(path.dirname(sessionRootDir), "session-trash");
    const relative = path.relative(sessionRootDir, sessionPath);
    const target = await uniquePath(path.join(quarantineRoot, relative));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.rename(sessionPath, target);
    return { ok: true, method: "quarantine", target };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function runClean(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  sessionRootDir: string,
): Promise<QuotaSummary | null> {
  const activeSessionFile = ctx.sessionManager.getSessionFile();
  const sessions = await scanSessions(sessionRootDir, activeSessionFile);
  if (sessions.length === 0) {
    ctx.ui.notify("No sessions found", "info");
    return null;
  }

  const candidates = buildCleanCandidates(sessions, DEFAULT_KEEP_RECENT);
  const selectableCount = candidates.filter((c) => c.selectable).length;
  if (selectableCount === 0) {
    ctx.ui.notify("No deletable sessions found (only active sessions remain)", "info");
    return null;
  }

  const selectedPaths = await chooseCleanupCandidates(ctx, candidates);
  if (selectedPaths === null) {
    ctx.ui.notify("Cleanup cancelled", "info");
    return null;
  }

  const selectedSet = new Set(selectedPaths.map((p) => path.resolve(p)));
  const selectedSessions = sessions.filter((s) => selectedSet.has(path.resolve(s.path)) && !s.isActive);
  if (selectedSessions.length === 0) {
    ctx.ui.notify("No sessions selected", "warning");
    return null;
  }

  const totalBytes = selectedSessions.reduce((acc, s) => acc + s.sizeBytes, 0);
  const confirmed = await ctx.ui.confirm(
    "Confirm cleanup",
    `Soft-delete ${selectedSessions.length} sessions (${formatBytes(totalBytes)}). Continue?`,
  );
  if (!confirmed) {
    ctx.ui.notify("Cleanup cancelled", "info");
    return null;
  }

  let successCount = 0;
  let failedCount = 0;
  let freedBytes = 0;
  let trashedCount = 0;
  let quarantinedCount = 0;
  const failures: string[] = [];

  for (const session of selectedSessions) {
    const result = await softDeleteSessionFile(pi, session.path, sessionRootDir);
    if (result.ok) {
      successCount += 1;
      freedBytes += session.sizeBytes;
      if (result.method === "trash") trashedCount += 1;
      else quarantinedCount += 1;
    } else {
      failedCount += 1;
      failures.push(`${path.basename(session.path)}: ${result.error}`);
    }
  }

  const lines: string[] = [];
  lines.push("Session Guard Cleanup Result");
  lines.push(`Deleted: ${successCount}/${selectedSessions.length}`);
  lines.push(`Freed: ${formatBytes(freedBytes)} (${freedBytes} bytes)`);
  lines.push(`Methods: trash=${trashedCount}, quarantine=${quarantinedCount}`);
  if (failedCount > 0) {
    lines.push("");
    lines.push("Failures:");
    failures.slice(0, 5).forEach((f, i) => lines.push(`${i + 1}. ${f}`));
    if (failures.length > 5) lines.push(`... ${failures.length - 5} more`);
  }

  pi.sendMessage({ customType: "session-guard-report", content: lines.join("\n"), display: true });

  if (failedCount > 0) ctx.ui.notify(`Cleanup finished with ${failedCount} failure(s)`, "warning");
  else ctx.ui.notify(`Cleanup completed. Freed ${formatBytes(freedBytes)}`, "info");

  return loadQuotaSummary(sessionRootDir);
}
