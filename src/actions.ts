/**
 * Command actions for scan and quota updates.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { promises as fs } from "node:fs";
import { buildReport } from "./report";
import { loadQuotaSummary, writeQuotaConfig } from "./quota";
import { scanSessions } from "./session";
import type { QuotaSummary, SortMode } from "./types";
import { formatBytes, formatPercent } from "./utils";

export async function ensureSessionDir(ctx: ExtensionCommandContext, sessionRootDir: string): Promise<boolean> {
  try {
    await fs.access(sessionRootDir);
    return true;
  } catch {
    ctx.ui.notify(`Session directory not found: ${sessionRootDir}`, "warning");
    return false;
  }
}

export async function runScan(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  sessionRootDir: string,
  sort: SortMode,
): Promise<QuotaSummary> {
  const activeSessionFile = ctx.sessionManager.getSessionFile();

  const [sessions, quotaSummary] = await Promise.all([
    scanSessions(sessionRootDir, activeSessionFile),
    loadQuotaSummary(sessionRootDir),
  ]);

  const report = buildReport(sessionRootDir, sessions, sort, quotaSummary);

  ctx.ui.notify(`Scanned ${sessions.length} session files (global, sort=${sort})`, "info");
  pi.sendMessage({ customType: "session-retention-report", content: report, display: true });

  return quotaSummary;
}

export async function runQuotaSet(
  pi: ExtensionAPI,
  _ctx: ExtensionCommandContext,
  sessionRootDir: string,
  sizeBytes: number,
): Promise<QuotaSummary> {
  await writeQuotaConfig(sizeBytes);
  const summary = await loadQuotaSummary(sessionRootDir);

  const lines: string[] = [];
  lines.push("Session Retention Quota Updated");
  lines.push(`Quota: ${formatBytes(sizeBytes)} (${sizeBytes} bytes)`);
  lines.push(`Used: ${formatBytes(summary.totalSizeBytes)} (${summary.totalSizeBytes} bytes)`);
  lines.push(`Usage: ${formatPercent(summary.usageRatio)}`);
  lines.push(`State: ${summary.state.toUpperCase()}`);
  if (summary.state === "warn" || summary.state === "critical") {
    lines.push("Advice: Run /session-retention clean to free space");
  }

  pi.sendMessage({ customType: "session-retention-report", content: lines.join("\n"), display: true });
  return summary;
}
