/**
 * Small text/format helpers used by scan report and interactive UI.
 */

export function formatBytes(bytes: number): string {
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

export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio < 0) return "0.0%";
  return `${(ratio * 100).toFixed(1)}%`;
}

export function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "-";
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export function ellipsizeMiddle(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  if (maxLen <= 3) return text.slice(0, maxLen);

  const keep = maxLen - 1;
  const left = Math.ceil(keep / 2);
  const right = Math.floor(keep / 2);
  return `${text.slice(0, left)}…${text.slice(text.length - right)}`;
}

export function pad(value: string, width: number, align: "left" | "right" = "left"): string {
  const clipped = value.length > width ? value.slice(0, width) : value;
  return align === "right" ? clipped.padStart(width, " ") : clipped.padEnd(width, " ");
}

export function clampRatio(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function normalizeInputText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}
