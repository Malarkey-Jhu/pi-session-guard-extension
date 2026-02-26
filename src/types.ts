/**
 * Shared domain types for session guard commands, quota, scan, and cleanup.
 */

export type SortMode = "size" | "lru";

export type SessionFileMeta = {
  path: string;
  sizeBytes: number;
  mtimeMs: number;
  isActive: boolean;
  namespace: string;
  title: string;
};

export type NamespaceStat = {
  namespace: string;
  count: number;
  sizeBytes: number;
  latestMtimeMs: number;
};

export type ParsedScanArgs = {
  sort: SortMode;
  isScanCommand: boolean;
  error?: string;
};

export type ParsedCleanArgs = {
  isCleanCommand: boolean;
  error?: string;
};

export type ParsedQuotaArgs = {
  isQuotaCommand: boolean;
  sizeBytes?: number;
  error?: string;
};

export type QuotaState = "disabled" | "ok" | "info" | "warn" | "critical";

export type QuotaConfig = {
  maxTotalSizeBytes: number;
  infoRatio: number;
  warnRatio: number;
};

export type QuotaSummary = {
  configured: boolean;
  state: QuotaState;
  quotaBytes?: number;
  usageRatio: number;
  totalSizeBytes: number;
  totalSessions: number;
  infoRatio: number;
  warnRatio: number;
};

export type SessionLocation = {
  sessionRootDir: string;
};

export type CleanCandidate = {
  path: string;
  namespace: string;
  sizeBytes: number;
  mtimeMs: number;
  title: string;
  selectable: boolean;
  defaultSelected: boolean;
  reason?: "ACTIVE" | "KEEP_RECENT";
};

export type SoftDeleteResult =
  | { ok: true; method: "trash" | "quarantine"; target?: string }
  | { ok: false; error: string };
