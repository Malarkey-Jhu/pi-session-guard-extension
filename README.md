# Pi Session Guard Extension

A Pi extension for **managing local sessions safely** with a focus on:

- visibility (how much space sessions use)
- manual cleanup (safe, review-first deletion)
- quota guardrails (warn/block when disk usage is too high)

---

## Why this exists

Pi stores sessions as local JSONL files (`~/.pi/agent/sessions`).
For heavy users, these files can grow quickly and cause disk pressure.

`session-guard` helps you:

1. understand what sessions consume space,
2. review before deleting,
3. prevent runaway growth with quota warnings/guard.

---

## Core behavior (MVP)

- **Global-only scan/clean** (no scope switching)
- Session list uses **first user message summary** (not raw JSONL filename)
- Cleanup is **manual** and **soft-delete first** (`trash` then quarantine fallback)
- Quota is **size-only** and set by command
- Quota states:
  - `ok`
  - `info`
  - `warn` (>= 90%)
  - `critical` (>= 100%, blocks normal chat input)

In `critical`, unlock commands are still allowed:

- `/session-guard scan`
- `/session-guard clean`
- `/session-guard quota set <size>`

---

## Commands

- `/session-guard scan [--sort size|lru]`
- `/session-guard clean`
- `/session-guard quota set <size>`

Examples:

- `/session-guard quota set 10GB`
- `/session-guard scan`
- `/session-guard clean`

---

## Quota config file

You do **not** need to create config manually.

When you run:

- `/session-guard quota set <size>`

the extension auto-creates/updates:

- `~/.pi/agent/session-guard.json`

---

## Development

Project layout:

- `src/index.ts` - extension entry
- `src/session.ts` - session discovery + title extraction
- `src/clean.ts` - cleanup UI + soft-delete flow
- `src/quota.ts` - quota config/state/guard logic
- `src/report.ts` - scan report formatting
- `src/renderer.ts` - custom report renderer
- `src/args.ts`, `src/actions.ts`, `src/types.ts`, `src/utils.ts` - supporting modules

Local run:

1. Run Pi in this repository
2. Use `/reload` after code changes

Packaging:

- `package.json` → `pi.extensions` points to `./src/index.ts`

---

## Docs

- Spec: `spec.md`
- Tasks: `tasks.md`
- Chinese README: `README.zh-TW.md`
