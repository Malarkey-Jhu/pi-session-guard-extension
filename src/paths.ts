/**
 * Filesystem path helpers for agent/session-guard data.
 */

import os from "node:os";
import path from "node:path";

export function getAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent");
}

export function getFallbackSessionDir(): string {
  return path.join(getAgentDir(), "sessions");
}

export function getQuotaConfigPath(): string {
  return path.join(getAgentDir(), "session-guard.json");
}
