/**
 * Quota configuration, state calculation, and input-guard helpers.
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_QUOTA_INFO_RATIO, DEFAULT_QUOTA_WARN_RATIO, STATUS_KEY } from "./constants";
import { getQuotaConfigPath } from "./paths";
import { collectJsonlFiles } from "./session";
import type { QuotaConfig, QuotaState, QuotaSummary } from "./types";
import { clampRatio, formatBytes, formatPercent, normalizeInputText } from "./utils";

export function computeQuotaState(usageRatio: number, infoRatio: number, warnRatio: number): QuotaState {
  if (!Number.isFinite(usageRatio) || usageRatio < infoRatio) return "ok";
  if (usageRatio < warnRatio) return "info";
  if (usageRatio < 1) return "warn";
  return "critical";
}

export function buildStatusText(summary: QuotaSummary): string {
  if (!summary.configured || !summary.quotaBytes) {
    return "Session quota: not set";
  }
  const stateLabel = summary.state.toUpperCase();
  return `Session quota ${stateLabel} ${formatPercent(summary.usageRatio)} (${formatBytes(summary.totalSizeBytes)}/${formatBytes(summary.quotaBytes)})`;
}

export function applyQuotaStatus(ctx: ExtensionContext, summary: QuotaSummary): void {
  ctx.ui.setStatus(STATUS_KEY, buildStatusText(summary));
}

export async function readQuotaConfig(): Promise<QuotaConfig | null> {
  const configPath = getQuotaConfigPath();

  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const candidate = parsed as { quota?: { maxTotalSizeBytes?: unknown; infoRatio?: unknown; warnRatio?: unknown } };
    const max = Number(candidate.quota?.maxTotalSizeBytes);
    if (!Number.isFinite(max) || max <= 0) return null;

    const infoRatio = clampRatio(Number(candidate.quota?.infoRatio), DEFAULT_QUOTA_INFO_RATIO);
    const warnRatio = clampRatio(Number(candidate.quota?.warnRatio), DEFAULT_QUOTA_WARN_RATIO);

    return {
      maxTotalSizeBytes: Math.floor(max),
      infoRatio: Math.min(infoRatio, warnRatio),
      warnRatio: Math.max(infoRatio, warnRatio),
    };
  } catch {
    return null;
  }
}

export async function writeQuotaConfig(maxTotalSizeBytes: number): Promise<void> {
  const configPath = getQuotaConfigPath();

  let root: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      root = { ...(parsed as Record<string, unknown>) };
    }
  } catch {
    root = {};
  }

  const quotaObject: Record<string, unknown> =
    root.quota && typeof root.quota === "object" && !Array.isArray(root.quota)
      ? { ...(root.quota as Record<string, unknown>) }
      : {};

  quotaObject.maxTotalSizeBytes = Math.floor(maxTotalSizeBytes);
  quotaObject.infoRatio = DEFAULT_QUOTA_INFO_RATIO;
  quotaObject.warnRatio = DEFAULT_QUOTA_WARN_RATIO;
  root.quota = quotaObject;

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(root, null, 2) + "\n", "utf8");
}

async function scanSessionUsageFast(sessionDir: string): Promise<{ totalSizeBytes: number; totalSessions: number }> {
  const files = await collectJsonlFiles(sessionDir);
  if (files.length === 0) return { totalSizeBytes: 0, totalSessions: 0 };

  const sizes = await Promise.all(
    files.map(async (filePath) => {
      try {
        const stat = await fs.stat(filePath);
        return stat.size;
      } catch {
        return 0;
      }
    }),
  );

  return {
    totalSizeBytes: sizes.reduce((acc, n) => acc + n, 0),
    totalSessions: files.length,
  };
}

function normalizeQuotaSummary(
  usage: { totalSizeBytes: number; totalSessions: number },
  config: QuotaConfig | null,
): QuotaSummary {
  if (!config) {
    return {
      configured: false,
      state: "disabled",
      usageRatio: 0,
      totalSizeBytes: usage.totalSizeBytes,
      totalSessions: usage.totalSessions,
      infoRatio: DEFAULT_QUOTA_INFO_RATIO,
      warnRatio: DEFAULT_QUOTA_WARN_RATIO,
    };
  }

  const usageRatio = usage.totalSizeBytes / config.maxTotalSizeBytes;
  return {
    configured: true,
    state: computeQuotaState(usageRatio, config.infoRatio, config.warnRatio),
    quotaBytes: config.maxTotalSizeBytes,
    usageRatio,
    totalSizeBytes: usage.totalSizeBytes,
    totalSessions: usage.totalSessions,
    infoRatio: config.infoRatio,
    warnRatio: config.warnRatio,
  };
}

export async function loadQuotaSummary(sessionDir: string): Promise<QuotaSummary> {
  const [usage, config] = await Promise.all([scanSessionUsageFast(sessionDir), readQuotaConfig()]);
  return normalizeQuotaSummary(usage, config);
}

export function isAllowedCriticalInput(text: string): boolean {
  const normalized = normalizeInputText(text);
  if (normalized === "/help") return true;
  if (!normalized.startsWith("/session-guard")) return false;

  return (
    normalized === "/session-guard" ||
    normalized.startsWith("/session-guard scan") ||
    normalized.startsWith("/session-guard clean") ||
    normalized.startsWith("/session-guard quota set")
  );
}
