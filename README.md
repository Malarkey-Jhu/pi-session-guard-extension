# Pi Session Retention Extension

Manage and retain local Pi sessions safely to prevent disk bloat.

中文說明請見：[`README.zh-TW.md`](./README.zh-TW.md)

---

## Overview

Pi stores sessions as local JSONL files (default: `~/.pi/agent/sessions`).
Over time, these files can grow quickly and consume a lot of disk space.

This extension focuses on:

- Session visibility (count, size, largest files)
- Safe cleanup workflows (soft-delete first)
- Retention policies (size/count/age based)
- Quota warnings and optional hard-block mode

## Current Status

Planning phase (spec + tasks):

- `spec.md`: Product/technical specification
- `tasks.md`: Implementation checklist and milestones

## Planned Features (V1)

- Scan and summarize session storage usage
- Sort sessions by LRU / size / age
- Manual cleanup wizard with confirmation
- Soft-delete by default (trash/quarantine)
- Protect important sessions from deletion
- Quota states: info / warn / critical

## Safety Principles

- No auto-delete by default
- Auto-clean is opt-in
- Auto-clean only performs soft-delete in V1
- Never delete active session
- Keep recent sessions and protected sessions

## Roadmap

- M1: Scan + summary + sorting + command skeleton
- M2: Manual cleanup + soft-delete + protect
- M3: Quota status + policy UI/commands
- M4: Auto-clean (opt-in) + optional hard-block

## Development and Packaging

This repository now uses a publish-friendly layout:

- `src/index.ts`: main extension entry (used for packaging)
- `.pi/extensions/session-retention/index.ts`: local dev loader (re-export for `/reload` convenience)

For local development, run pi in this repo and use `/reload`.
For package distribution, the `pi` manifest in `package.json` points to `./src/index.ts`.
