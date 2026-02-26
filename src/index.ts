import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

type SessionFileMeta = {
  path: string;
  sizeBytes: number;
  mtimeMs: number;
  isActive: boolean;
};

function getDefaultSessionDir(): string {
  const agentDir = process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent");
  return path.join(agentDir, "sessions");
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

async function scanSessions(sessionDir: string, activeSessionFile?: string): Promise<SessionFileMeta[]> {
  const files = await collectJsonlFiles(sessionDir);
  const metas = await Promise.all(
    files.map(async (filePath): Promise<SessionFileMeta | null> => {
      try {
        const stat = await fs.stat(filePath);
        return {
          path: filePath,
          sizeBytes: stat.size,
          mtimeMs: stat.mtimeMs,
          isActive: activeSessionFile ? path.resolve(filePath) === path.resolve(activeSessionFile) : false,
        };
      } catch {
        return null;
      }
    }),
  );

  return metas.filter((m): m is SessionFileMeta => m !== null);
}

function buildReport(sessionDir: string, sessions: SessionFileMeta[]): string {
  const totalSessions = sessions.length;
  const totalSizeBytes = sessions.reduce((acc, s) => acc + s.sizeBytes, 0);
  const topLargest = [...sessions].sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, 10);

  const lines: string[] = [];
  lines.push("Session Retention Scan");
  lines.push(`Session dir: ${sessionDir}`);
  lines.push(`Total sessions: ${totalSessions}`);
  lines.push(`Total size: ${formatBytes(totalSizeBytes)} (${totalSizeBytes} bytes)`);
  lines.push("");

  if (topLargest.length === 0) {
    lines.push("No session files found.");
    return lines.join("\n");
  }

  lines.push("Top 10 largest session files:");
  topLargest.forEach((s, i) => {
    const activeFlag = s.isActive ? " [ACTIVE]" : "";
    lines.push(`${i + 1}. ${formatBytes(s.sizeBytes)}${activeFlag}  ${s.path}`);
  });

  return lines.join("\n");
}

async function runScan(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
  const sessionDir = getDefaultSessionDir();
  const activeSessionFile = ctx.sessionManager.getSessionFile();

  try {
    await fs.access(sessionDir);
  } catch {
    ctx.ui.notify(`Session directory not found: ${sessionDir}`, "warning");
    return;
  }

  const sessions = await scanSessions(sessionDir, activeSessionFile);
  const report = buildReport(sessionDir, sessions);

  ctx.ui.notify(`Scanned ${sessions.length} session files`, "info");

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

        if (line.startsWith("Session dir:")) {
          const value = line.slice("Session dir:".length).trim();
          return `${theme.fg("muted", "Session dir:")} ${theme.fg("dim", value)}`;
        }

        if (line.startsWith("Total sessions:")) {
          const value = line.slice("Total sessions:".length).trim();
          return `${theme.fg("muted", "Total sessions:")} ${theme.fg("text", theme.bold(value))}`;
        }

        if (line.startsWith("Total size:")) {
          const value = line.slice("Total size:".length).trim();
          return `${theme.fg("muted", "Total size:")} ${theme.fg("text", theme.bold(value))}`;
        }

        if (line === "Top 10 largest session files:") {
          return theme.fg("accent", theme.bold("Top 10 largest session files")) + theme.fg("dim", ":");
        }

        if (/^\d+\.\s/.test(line)) {
          const withActive = line.replace("[ACTIVE]", theme.fg("warning", theme.bold("[ACTIVE]")));
          const dotIndex = withActive.indexOf(".");
          if (dotIndex > 0) {
            const rank = withActive.slice(0, dotIndex + 1);
            const rest = withActive.slice(dotIndex + 1);
            return `${theme.fg("accent", rank)}${rest}`;
          }
          return withActive;
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
      const sub = args?.trim().toLowerCase();

      if (!sub || sub === "scan") {
        await runScan(pi, ctx);
        return;
      }

      ctx.ui.notify(`Unknown subcommand: ${sub}. Use /session-retention scan`, "warning");
    },
  });
}
