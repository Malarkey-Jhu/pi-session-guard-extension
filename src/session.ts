/**
 * Session storage helpers: location resolution, file scanning, and title extraction.
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { MAX_SESSION_TITLE_LEN } from "./constants";
import { getFallbackSessionDir } from "./paths";
import type { NamespaceStat, SessionFileMeta, SessionLocation, SortMode } from "./types";

export function resolveSessionLocation(ctx: ExtensionContext): SessionLocation {
  const activeSessionFile = ctx.sessionManager.getSessionFile();
  if (activeSessionFile) {
    const namespaceDir = path.dirname(path.resolve(activeSessionFile));
    return {
      sessionRootDir: path.dirname(namespaceDir),
    };
  }

  const fromSessionManager = ctx.sessionManager.getSessionDir();
  const candidate = path.resolve(fromSessionManager || getFallbackSessionDir());
  const base = path.basename(candidate);

  if (base.startsWith("--") && base.endsWith("--")) {
    return {
      sessionRootDir: path.dirname(candidate),
    };
  }

  return {
    sessionRootDir: candidate,
  };
}

export async function collectJsonlFiles(rootDir: string): Promise<string[]> {
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

export function getNamespaceFromFilePath(filePath: string, sessionDir: string): string {
  const relative = path.relative(sessionDir, filePath);
  const [namespace] = relative.split(path.sep);
  return namespace || "(unknown)";
}

function normalizeTitle(text: string, maxLen: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "(No user prompt yet)";
  return normalized.length <= maxLen ? normalized : `${normalized.slice(0, Math.max(1, maxLen - 1)).trimEnd()}…`;
}

function extractUserText(content: unknown): string {
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

async function extractSessionTitle(filePath: string, maxLen: number): Promise<string> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      if (!line || !line.includes('"type":"message"')) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      if (!parsed || typeof parsed !== "object") continue;
      const record = parsed as { type?: unknown; message?: { role?: unknown; content?: unknown } };
      if (record.type !== "message") continue;
      if (record.message?.role !== "user") continue;

      const text = extractUserText(record.message?.content);
      if (text) return normalizeTitle(text, maxLen);
    }
    return "(No user prompt yet)";
  } finally {
    rl.close();
    if (!stream.destroyed) stream.destroy();
  }
}

export async function scanSessions(sessionDir: string, activeSessionFile: string | undefined): Promise<SessionFileMeta[]> {
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
          namespace: getNamespaceFromFilePath(filePath, sessionDir),
          title: await extractSessionTitle(filePath, MAX_SESSION_TITLE_LEN),
        };
      } catch {
        return null;
      }
    }),
  );

  return metas.filter((m): m is SessionFileMeta => m !== null);
}

export function sortSessions(sessions: SessionFileMeta[], sort: SortMode): SessionFileMeta[] {
  if (sort === "lru") {
    return [...sessions].sort((a, b) => a.mtimeMs - b.mtimeMs || b.sizeBytes - a.sizeBytes || a.path.localeCompare(b.path));
  }
  return [...sessions].sort((a, b) => b.sizeBytes - a.sizeBytes || b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path));
}

export function buildNamespaceStats(sessions: SessionFileMeta[]): NamespaceStat[] {
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
