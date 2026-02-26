/**
 * Slash-command argument parsers.
 */

import type { ParsedCleanArgs, ParsedQuotaArgs, ParsedScanArgs, SortMode } from "./types";

function parseSizeToBytes(raw: string): number | null {
  const normalized = raw.trim();
  const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)\s*(B|KB|MB|GB|TB)$/i);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;

  const unit = match[2]!.toUpperCase();
  const power = unit === "B" ? 0 : unit === "KB" ? 1 : unit === "MB" ? 2 : unit === "GB" ? 3 : 4;
  const bytes = value * 1024 ** power;
  if (!Number.isFinite(bytes) || bytes <= 0) return null;

  return Math.floor(bytes);
}

export function parseScanArgs(args: string | undefined): ParsedScanArgs {
  const tokens = (args ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) {
    return { sort: "size", isScanCommand: true };
  }

  if (tokens[0] !== "scan") {
    return { sort: "size", isScanCommand: false };
  }

  let sort: SortMode = "size";

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]!;

    if (token === "--sort") {
      const next = tokens[i + 1];
      if (!next) {
        return { sort, isScanCommand: true, error: "Missing value for --sort. Supported: size | lru" };
      }
      if (next !== "size" && next !== "lru") {
        return { sort, isScanCommand: true, error: `Invalid --sort value: ${next}. Supported: size | lru` };
      }
      sort = next;
      i += 1;
      continue;
    }

    if (token.startsWith("--")) {
      return { sort, isScanCommand: true, error: `Unknown option: ${token}. Supported: --sort <size|lru>` };
    }

    return { sort, isScanCommand: true, error: `Unknown argument: ${token}. Supported: --sort <size|lru>` };
  }

  return { sort, isScanCommand: true };
}

export function parseCleanArgs(args: string | undefined): ParsedCleanArgs {
  const tokens = (args ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0 || tokens[0] !== "clean") {
    return { isCleanCommand: false };
  }

  if (tokens.length > 1) {
    const token = tokens[1]!;
    if (token.startsWith("--")) {
      return { isCleanCommand: true, error: `Unknown option: ${token}. Use /session-guard clean` };
    }
    return { isCleanCommand: true, error: `Unknown argument: ${token}. Use /session-guard clean` };
  }

  return { isCleanCommand: true };
}

export function parseQuotaArgs(args: string | undefined): ParsedQuotaArgs {
  const tokens = (args ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0 || tokens[0] !== "quota") {
    return { isQuotaCommand: false };
  }

  if (tokens[1] !== "set") {
    return { isQuotaCommand: true, error: "Unknown quota command. Use /session-guard quota set <size>" };
  }

  const sizeRaw = tokens.slice(2).join("");
  if (!sizeRaw) {
    return { isQuotaCommand: true, error: "Missing size. Example: /session-guard quota set 10GB" };
  }

  const sizeBytes = parseSizeToBytes(sizeRaw);
  if (!sizeBytes) {
    return { isQuotaCommand: true, error: `Invalid size: ${sizeRaw}. Supported units: B, KB, MB, GB, TB` };
  }

  return { isQuotaCommand: true, sizeBytes };
}
