import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

type ScanScope = "current" | "global";

type SessionFileMeta = {
  path: string;
  sizeBytes: number;
  mtimeMs: number;
  isActive: boolean;
  namespace: string;
};

type NamespaceStat = {
  namespace: string;
  count: number;
  sizeBytes: number;
  latestMtimeMs: number;
};

function getFallbackSessionDir(): string {
  const agentDir = process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent");
  return path.join(agentDir, "sessions");
}

function encodeCwdNamespace(cwd: string): string {
  const normalized = path.resolve(cwd).replace(/\\/g, "/");
  return `--${normalized.replace(/\//g, "-")}--`;
}

type SessionLocation = {
  sessionRootDir: string;
  currentNamespace: string;
};

function resolveSessionLocation(ctx: ExtensionCommandContext): SessionLocation {
  const activeSessionFile = ctx.sessionManager.getSessionFile();
  if (activeSessionFile) {
    const namespaceDir = path.dirname(path.resolve(activeSessionFile));
    return {
      sessionRootDir: path.dirname(namespaceDir),
      currentNamespace: path.basename(namespaceDir),
    };
  }

  const fromSessionManager = ctx.sessionManager.getSessionDir();
  const candidate = path.resolve(fromSessionManager || getFallbackSessionDir());
  const base = path.basename(candidate);

  if (base.startsWith("--") && base.endsWith("--")) {
    return {
      sessionRootDir: path.dirname(candidate),
      currentNamespace: base,
    };
  }

  return {
    sessionRootDir: candidate,
    currentNamespace: encodeCwdNamespace(ctx.cwd),
  };
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "-";
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function ellipsizeMiddle(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  if (maxLen <= 3) return text.slice(0, maxLen);

  const keep = maxLen - 1;
  const left = Math.ceil(keep / 2);
  const right = Math.floor(keep / 2);
  return `${text.slice(0, left)}…${text.slice(text.length - right)}`;
}

function pad(value: string, width: number, align: "left" | "right" = "left"): string {
  const clipped = value.length > width ? value.slice(0, width) : value;
  return align === "right" ? clipped.padStart(width, " ") : clipped.padEnd(width, " ");
}

async function collectJsonlFiles(rootDir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        results.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return results;
}

function getNamespaceFromFilePath(filePath: string, sessionDir: string): string {
  const relative = path.relative(sessionDir, filePath);
  const [namespace] = relative.split(path.sep);
  return namespace || "(unknown)";
}

async function scanSessions(
  sessionDir: string,
  activeSessionFile: string | undefined,
  scope: ScanScope,
  currentNamespace: string,
): Promise<SessionFileMeta[]> {
  const files = await collectJsonlFiles(sessionDir);

  const scopedFiles =
    scope === "global"
      ? files
      : files.filter((filePath) => getNamespaceFromFilePath(filePath, sessionDir) === currentNamespace);

  const metas = await Promise.all(
    scopedFiles.map(async (filePath): Promise<SessionFileMeta | null> => {
      try {
        const stat = await fs.stat(filePath);
        return {
          path: filePath,
          sizeBytes: stat.size,
          mtimeMs: stat.mtimeMs,
          isActive: activeSessionFile ? path.resolve(filePath) === path.resolve(activeSessionFile) : false,
          namespace: getNamespaceFromFilePath(filePath, sessionDir),
        };
      } catch {
        return null;
      }
    }),
  );

  return metas.filter((m): m is SessionFileMeta => m !== null);
}

function buildNamespaceStats(sessions: SessionFileMeta[]): NamespaceStat[] {
  const map = new Map<string, NamespaceStat>();

  for (const session of sessions) {
    const stat =
      map.get(session.namespace) ??
      ({ namespace: session.namespace, count: 0, sizeBytes: 0, latestMtimeMs: 0 } satisfies NamespaceStat);
    stat.count += 1;
    stat.sizeBytes += session.sizeBytes;
    stat.latestMtimeMs = Math.max(stat.latestMtimeMs, session.mtimeMs);
    map.set(session.namespace, stat);
  }

  return [...map.values()].sort((a, b) => b.sizeBytes - a.sizeBytes);
}

function buildReport(
  sessionDir: string,
  sessions: SessionFileMeta[],
  scope: ScanScope,
  currentNamespace: string,
): string {
  const totalSessions = sessions.length;
  const totalSizeBytes = sessions.reduce((acc, s) => acc + s.sizeBytes, 0);
  const topLargest = [...sessions]
    .sort((a, b) => b.sizeBytes - a.sizeBytes || b.mtimeMs - a.mtimeMs)
    .slice(0, 10);

  const lines: string[] = [];
  lines.push("Session Retention Scan");
  lines.push(`Scope: ${scope}`);
  lines.push(`Session dir: ${sessionDir}`);
  if (scope === "current") {
    lines.push(`Namespace: ${currentNamespace}`);
  }
  lines.push(`Total sessions: ${totalSessions}`);
  lines.push(`Total size: ${formatBytes(totalSizeBytes)} (${totalSizeBytes} bytes)`);
  lines.push("");

  if (scope === "global") {
    const namespaceStats = buildNamespaceStats(sessions).slice(0, 10);
    lines.push("Top namespaces by size:");
    if (namespaceStats.length === 0) {
      lines.push("(none)");
    } else {
      const header =
        `${pad("#", 3, "right")}  ${pad("Size", 10, "right")}  ${pad("Count", 5, "right")}  ` +
        `${pad("Updated", 16)}  Namespace`;
      lines.push(header);
      lines.push(`${"-".repeat(3)}  ${"-".repeat(10)}  ${"-".repeat(5)}  ${"-".repeat(16)}  ${"-".repeat(36)}`);

      namespaceStats.forEach((ns, i) => {
        const namespaceLabel = ellipsizeMiddle(ns.namespace, 36);
        lines.push(
          `${pad(String(i + 1), 3, "right")}  ${pad(formatBytes(ns.sizeBytes), 10, "right")}  ${pad(String(ns.count), 5, "right")}  ` +
            `${pad(formatTime(ns.latestMtimeMs), 16)}  ${namespaceLabel}`,
        );
      });
    }
    lines.push("");
  }

  if (topLargest.length === 0) {
    lines.push("No session files found.");
    return lines.join("\n");
  }

  lines.push("Top 10 largest session files:");
  if (scope === "global") {
    const header =
      `${pad("#", 3, "right")}  ${pad("Size", 10, "right")}  ${pad("Updated", 16)}  ${pad("State", 8)}  ` +
      `${pad("Namespace", 26)}  Session`;
    lines.push(header);
    lines.push(
      `${"-".repeat(3)}  ${"-".repeat(10)}  ${"-".repeat(16)}  ${"-".repeat(8)}  ${"-".repeat(26)}  ${"-".repeat(34)}`,
    );

    topLargest.forEach((s, i) => {
      const state = s.isActive ? "[ACTIVE]" : "-";
      const namespaceLabel = ellipsizeMiddle(s.namespace, 26);
      const sessionLabel = ellipsizeMiddle(path.basename(s.path), 34);
      lines.push(
        `${pad(String(i + 1), 3, "right")}  ${pad(formatBytes(s.sizeBytes), 10, "right")}  ${pad(formatTime(s.mtimeMs), 16)}  ${pad(state, 8)}  ` +
          `${pad(namespaceLabel, 26)}  ${sessionLabel}`,
      );
    });
  } else {
    const header =
      `${pad("#", 3, "right")}  ${pad("Size", 10, "right")}  ${pad("Updated", 16)}  ${pad("State", 8)}  Session`;
    lines.push(header);
    lines.push(`${"-".repeat(3)}  ${"-".repeat(10)}  ${"-".repeat(16)}  ${"-".repeat(8)}  ${"-".repeat(52)}`);

    topLargest.forEach((s, i) => {
      const state = s.isActive ? "[ACTIVE]" : "-";
      const sessionLabel = ellipsizeMiddle(path.basename(s.path), 52);
      lines.push(
        `${pad(String(i + 1), 3, "right")}  ${pad(formatBytes(s.sizeBytes), 10, "right")}  ${pad(formatTime(s.mtimeMs), 16)}  ${pad(state, 8)}  ${sessionLabel}`,
      );
    });
  }

  return lines.join("\n");
}

function parseScanScope(args: string | undefined): { scope: ScanScope; isScanCommand: boolean; error?: string } {
  const tokens = (args ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) {
    return { scope: "current", isScanCommand: true };
  }

  if (tokens[0] !== "scan") {
    return { scope: "current", isScanCommand: false };
  }

  const flags = tokens.slice(1);
  if (flags.length === 0) {
    return { scope: "current", isScanCommand: true };
  }

  const unknownFlag = flags.find((f) => f.startsWith("--") && f !== "--global");
  if (unknownFlag) {
    return {
      scope: "current",
      isScanCommand: true,
      error: `Unknown option: ${unknownFlag}. Supported: --global`,
    };
  }

  const scope: ScanScope = flags.includes("--global") ? "global" : "current";
  return { scope, isScanCommand: true };
}

async function runScan(pi: ExtensionAPI, ctx: ExtensionCommandContext, scope: ScanScope): Promise<void> {
  const { sessionRootDir, currentNamespace } = resolveSessionLocation(ctx);
  const activeSessionFile = ctx.sessionManager.getSessionFile();

  try {
    await fs.access(sessionRootDir);
  } catch {
    ctx.ui.notify(`Session directory not found: ${sessionRootDir}`, "warning");
    return;
  }

  const sessions = await scanSessions(sessionRootDir, activeSessionFile, scope, currentNamespace);
  const report = buildReport(sessionRootDir, sessions, scope, currentNamespace);

  ctx.ui.notify(`Scanned ${sessions.length} session files (${scope})`, "info");

  pi.sendMessage({
    customType: "session-retention-report",
    content: report,
    display: true,
  });
}

export default function sessionRetentionExtension(pi: ExtensionAPI): void {
  pi.registerMessageRenderer("session-retention-report", (message, _options, theme) => {
    const raw = typeof message.content === "string" ? message.content : "";
    const styled = raw
      .split("\n")
      .map((line) => {
        if (line === "Session Retention Scan") {
          return `${theme.fg("accent", "◉")} ${theme.fg("accent", theme.bold(line))}`;
        }

        if (line.startsWith("Scope:")) {
          const value = line.slice("Scope:".length).trim();
          return `${theme.fg("muted", "Scope:")} ${theme.fg("accent", theme.bold(value))}`;
        }

        if (line.startsWith("Session dir:")) {
          const value = line.slice("Session dir:".length).trim();
          return `${theme.fg("muted", "Session dir:")} ${theme.fg("dim", value)}`;
        }

        if (line.startsWith("Namespace:")) {
          const value = line.slice("Namespace:".length).trim();
          return `${theme.fg("muted", "Namespace:")} ${theme.fg("text", value)}`;
        }

        if (line.startsWith("Total sessions:")) {
          const value = line.slice("Total sessions:".length).trim();
          return `${theme.fg("muted", "Total sessions:")} ${theme.fg("text", theme.bold(value))}`;
        }

        if (line.startsWith("Total size:")) {
          const value = line.slice("Total size:".length).trim();
          return `${theme.fg("muted", "Total size:")} ${theme.fg("text", theme.bold(value))}`;
        }

        if (line === "Top namespaces by size:" || line === "Top 10 largest session files:") {
          const title = line.slice(0, -1);
          return theme.fg("accent", theme.bold(title)) + theme.fg("dim", ":");
        }

        if (line.includes("[ACTIVE]")) {
          return line.replace("[ACTIVE]", theme.fg("warning", theme.bold("[ACTIVE]")));
        }

        return line;
      })
      .join("\n");

    const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
    box.addChild(new Text(styled, 0, 0));
    return box;
  });

  pi.registerCommand("session-retention", {
    description: "Scan session storage usage (count, size, top largest)",
    handler: async (args, ctx) => {
      const parsed = parseScanScope(args);

      if (!parsed.isScanCommand) {
        ctx.ui.notify("Unknown subcommand. Use /session-retention scan [--global]", "warning");
        return;
      }

      if (parsed.error) {
        ctx.ui.notify(parsed.error, "warning");
        return;
      }

      await runScan(pi, ctx, parsed.scope);
    },
  });
}
