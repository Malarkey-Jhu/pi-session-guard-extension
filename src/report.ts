/**
 * Human-readable report builder for scan output.
 */

import type { QuotaSummary, SessionFileMeta, SortMode } from "./types";
import { buildNamespaceStats, sortSessions } from "./session";
import { ellipsizeMiddle, formatBytes, formatPercent, formatTime, pad } from "./utils";

export function buildReport(
  sessionDir: string,
  sessions: SessionFileMeta[],
  sort: SortMode,
  quotaSummary: QuotaSummary,
): string {
  const totalSessions = sessions.length;
  const totalSizeBytes = sessions.reduce((acc, s) => acc + s.sizeBytes, 0);
  const topLargest = sortSessions(sessions, sort).slice(0, 10);

  const lines: string[] = [];
  lines.push("Session Retention Scan");
  lines.push(`Sort: ${sort}`);
  lines.push(`Session dir: ${sessionDir}`);
  lines.push(`Total sessions: ${totalSessions}`);
  lines.push(`Total size: ${formatBytes(totalSizeBytes)} (${totalSizeBytes} bytes)`);

  if (quotaSummary.configured && quotaSummary.quotaBytes) {
    lines.push(`Quota: ${formatBytes(quotaSummary.quotaBytes)} (${quotaSummary.quotaBytes} bytes)`);
    lines.push(`Used: ${formatBytes(quotaSummary.totalSizeBytes)} (${quotaSummary.totalSizeBytes} bytes)`);
    lines.push(`Usage: ${formatPercent(quotaSummary.usageRatio)}`);
    lines.push(`State: ${quotaSummary.state.toUpperCase()}`);
    if (quotaSummary.state === "warn" || quotaSummary.state === "critical") {
      lines.push("Advice: Run /session-retention clean to free space");
    }
  } else {
    lines.push("Quota: (not set)");
    lines.push("Advice: Use /session-retention quota set <size>");
  }

  lines.push("");

  const namespaceStats = buildNamespaceStats(sessions).slice(0, 10);
  lines.push("Top namespaces by size:");
  if (namespaceStats.length === 0) {
    lines.push("(none)");
  } else {
    lines.push(`${pad("#", 3, "right")}  ${pad("Size", 10, "right")}  ${pad("Count", 5, "right")}  ${pad("Updated", 16)}  Namespace`);
    lines.push(`${"-".repeat(3)}  ${"-".repeat(10)}  ${"-".repeat(5)}  ${"-".repeat(16)}  ${"-".repeat(36)}`);
    namespaceStats.forEach((ns, i) => {
      const namespaceLabel = ellipsizeMiddle(ns.namespace, 36);
      lines.push(
        `${pad(String(i + 1), 3, "right")}  ${pad(formatBytes(ns.sizeBytes), 10, "right")}  ${pad(String(ns.count), 5, "right")}  ${pad(formatTime(ns.latestMtimeMs), 16)}  ${namespaceLabel}`,
      );
    });
  }
  lines.push("");

  if (topLargest.length === 0) {
    lines.push("No session files found.");
    return lines.join("\n");
  }

  lines.push(sort === "lru" ? "Top 10 least recently updated sessions:" : "Top 10 largest session files:");
  lines.push(`${pad("#", 3, "right")}  ${pad("Size", 10, "right")}  ${pad("Updated", 16)}  ${pad("Namespace", 26)}  Summary`);
  lines.push(`${"-".repeat(3)}  ${"-".repeat(10)}  ${"-".repeat(16)}  ${"-".repeat(26)}  ${"-".repeat(34)}`);
  topLargest.forEach((s, i) => {
    const namespaceLabel = ellipsizeMiddle(s.namespace, 26);
    const summaryLabel = s.isActive ? `${s.title} [ACTIVE]` : s.title;
    lines.push(
      `${pad(String(i + 1), 3, "right")}  ${pad(formatBytes(s.sizeBytes), 10, "right")}  ${pad(formatTime(s.mtimeMs), 16)}  ${pad(namespaceLabel, 26)}  ${ellipsizeMiddle(summaryLabel, 34)}`,
    );
  });

  return lines.join("\n");
}
