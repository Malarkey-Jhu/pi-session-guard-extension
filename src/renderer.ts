/**
 * Custom message renderer for scan/cleanup/quota reports.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";

export function registerReportRenderer(pi: ExtensionAPI): void {
  pi.registerMessageRenderer("session-guard-report", (message, _options, theme) => {
    const raw = typeof message.content === "string" ? message.content : "";
    const styled = raw
      .split("\n")
      .map((line) => {
        if (
          line === "Session Guard Scan" ||
          line === "Session Guard Cleanup Result" ||
          line === "Session Guard Quota Updated"
        ) {
          return `${theme.fg("accent", "◉")} ${theme.fg("accent", theme.bold(line))}`;
        }

        if (line.startsWith("Scope:")) {
          const value = line.slice("Scope:".length).trim();
          return `${theme.fg("muted", "Scope:")} ${theme.fg("accent", theme.bold(value))}`;
        }

        if (line.startsWith("Sort:")) {
          const value = line.slice("Sort:".length).trim();
          return `${theme.fg("muted", "Sort:")} ${theme.fg("accent", value)}`;
        }

        if (line.startsWith("Session dir:")) {
          const value = line.slice("Session dir:".length).trim();
          return `${theme.fg("muted", "Session dir:")} ${theme.fg("dim", value)}`;
        }

        if (line.startsWith("Namespace:")) {
          const value = line.slice("Namespace:".length).trim();
          return `${theme.fg("muted", "Namespace:")} ${theme.fg("text", value)}`;
        }

        if (line.startsWith("Total sessions:") || line.startsWith("Deleted:")) {
          const [k, ...rest] = line.split(":");
          return `${theme.fg("muted", `${k}:`)} ${theme.fg("text", theme.bold(rest.join(":").trim()))}`;
        }

        if (
          line.startsWith("Total size:") ||
          line.startsWith("Freed:") ||
          line.startsWith("Methods:") ||
          line.startsWith("Quota:") ||
          line.startsWith("Used:") ||
          line.startsWith("Usage:")
        ) {
          const [k, ...rest] = line.split(":");
          return `${theme.fg("muted", `${k}:`)} ${theme.fg("text", rest.join(":").trim())}`;
        }

        if (line.startsWith("State:")) {
          const value = line.slice("State:".length).trim();
          const color = value === "CRITICAL" ? "error" : value === "WARN" ? "warning" : value === "INFO" ? "accent" : "text";
          return `${theme.fg("muted", "State:")} ${theme.fg(color, theme.bold(value))}`;
        }

        if (line.startsWith("Advice:")) {
          const value = line.slice("Advice:".length).trim();
          return `${theme.fg("muted", "Advice:")} ${theme.fg("warning", value)}`;
        }

        if (
          line === "Top namespaces by size:" ||
          line === "Top 10 largest session files:" ||
          line === "Top 10 least recently updated sessions:" ||
          line === "Failures:"
        ) {
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
}
