import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { WARN_NOTIFY_COOLDOWN_MS, QUOTA_CACHE_TTL_MS } from "./constants";
import { parseCleanArgs, parseQuotaArgs, parseScanArgs } from "./args";
import { ensureSessionDir, runQuotaSet, runScan } from "./actions";
import { runClean } from "./clean";
import { applyQuotaStatus, isAllowedCriticalInput, loadQuotaSummary } from "./quota";
import { registerReportRenderer } from "./renderer";
import { resolveSessionLocation } from "./session";
import type { QuotaSummary } from "./types";
import { formatBytes, formatPercent } from "./utils";

/**
 * Extension entry: wires renderer, events, and slash commands.
 */
export default function sessionGuardExtension(pi: ExtensionAPI): void {
  let lastWarnNotificationAt = 0;
  let quotaCache:
    | {
        updatedAt: number;
        sessionRootDir: string;
        summary: QuotaSummary;
      }
    | null = null;

  async function getCurrentQuotaSummary(ctx: ExtensionContext, force = false): Promise<QuotaSummary | null> {
    const { sessionRootDir } = resolveSessionLocation(ctx);

    try {
      const now = Date.now();
      if (!force && quotaCache && quotaCache.sessionRootDir === sessionRootDir && now - quotaCache.updatedAt < QUOTA_CACHE_TTL_MS) {
        return quotaCache.summary;
      }

      const summary = await loadQuotaSummary(sessionRootDir);
      quotaCache = { sessionRootDir, summary, updatedAt: now };
      return summary;
    } catch {
      return null;
    }
  }

  function updateQuotaCache(ctx: ExtensionContext, summary: QuotaSummary | null): void {
    if (!summary) return;
    const { sessionRootDir } = resolveSessionLocation(ctx);
    quotaCache = { sessionRootDir, summary, updatedAt: Date.now() };
  }

  registerReportRenderer(pi);

  pi.on("session_start", async (_event, ctx) => {
    const summary = await getCurrentQuotaSummary(ctx, true);
    if (!summary) return;

    applyQuotaStatus(ctx, summary);
    if (summary.configured && summary.state === "warn") {
      ctx.ui.notify(
        `Session storage at ${formatPercent(summary.usageRatio)} (${formatBytes(summary.totalSizeBytes)} / ${formatBytes(summary.quotaBytes ?? 0)}). Consider /session-guard clean`,
        "warning",
      );
      lastWarnNotificationAt = Date.now();
    }
  });

  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") return { action: "continue" } as const;

    const summary = await getCurrentQuotaSummary(ctx);
    if (!summary || !summary.configured) return { action: "continue" } as const;

    applyQuotaStatus(ctx, summary);

    if (summary.state === "critical") {
      if (isAllowedCriticalInput(event.text)) return { action: "continue" } as const;

      ctx.ui.notify(
        `Session quota exceeded (${formatPercent(summary.usageRatio)}). Run /session-guard clean or /session-guard quota set <size>`,
        "error",
      );
      return { action: "handled" } as const;
    }

    if (summary.state === "warn") {
      const now = Date.now();
      if (now - lastWarnNotificationAt > WARN_NOTIFY_COOLDOWN_MS) {
        ctx.ui.notify(`Session storage warning: ${formatPercent(summary.usageRatio)} used. Run /session-guard clean`, "warning");
        lastWarnNotificationAt = now;
      }
    }

    return { action: "continue" } as const;
  });

  pi.registerCommand("session-guard", {
    description: "Session management (global scan, global clean, quota set <size>)",
    handler: async (args, ctx) => {
      const command = (args ?? "").trim().split(/\s+/).filter(Boolean)[0] ?? "scan";
      const { sessionRootDir } = resolveSessionLocation(ctx);

      if (!(await ensureSessionDir(ctx, sessionRootDir))) return;

      if (command === "scan") {
        const parsed = parseScanArgs(args);
        if (!parsed.isScanCommand) {
          ctx.ui.notify("Unknown subcommand. Use /session-guard scan [--sort size|lru]", "warning");
          return;
        }
        if (parsed.error) {
          ctx.ui.notify(parsed.error, "warning");
          return;
        }

        const summary = await runScan(pi, ctx, sessionRootDir, parsed.sort);
        updateQuotaCache(ctx, summary);
        applyQuotaStatus(ctx, summary);
        return;
      }

      if (command === "clean") {
        const parsed = parseCleanArgs(args);
        if (!parsed.isCleanCommand) {
          ctx.ui.notify("Unknown subcommand. Use /session-guard clean", "warning");
          return;
        }
        if (parsed.error) {
          ctx.ui.notify(parsed.error, "warning");
          return;
        }

        const summary = await runClean(pi, ctx, sessionRootDir);
        updateQuotaCache(ctx, summary);
        if (summary) applyQuotaStatus(ctx, summary);
        return;
      }

      if (command === "quota") {
        const parsed = parseQuotaArgs(args);
        if (!parsed.isQuotaCommand) {
          ctx.ui.notify("Unknown quota command. Use /session-guard quota set <size>", "warning");
          return;
        }
        if (parsed.error || !parsed.sizeBytes) {
          ctx.ui.notify(parsed.error ?? "Invalid quota size", "warning");
          return;
        }

        const summary = await runQuotaSet(pi, ctx, sessionRootDir, parsed.sizeBytes);
        updateQuotaCache(ctx, summary);
        applyQuotaStatus(ctx, summary);
        ctx.ui.notify(
          `Quota set to ${formatBytes(parsed.sizeBytes)}. Current usage: ${formatPercent(summary.usageRatio)} (${summary.state.toUpperCase()})`,
          summary.state === "critical" ? "warning" : "info",
        );
        return;
      }

      ctx.ui.notify("Unknown subcommand. Use /session-guard scan, /session-guard clean, or /session-guard quota set <size>", "warning");
    },
  });
}
