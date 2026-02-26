# AGENTS.md

Guidance for coding agents working in this repository.

## Project

- Name: `pi-session-guard-extension`
- Purpose: Session management extension for Pi coding agent
- Current focus: **MVP** (manual cleanup + quota governance)

## Key Product Decisions (Current)

1. `scan` and `clean` are **global-only** (no scope switch).
2. Session rows show **summary from first user message** (not jsonl filename).
3. Quota is **size-only** via:
   - `/session-guard quota set <size>`
4. Quota behavior:
   - warn at >= 90%
   - block normal chat at >= 100% (critical)
   - allow unlock commands in critical mode

## Commands

- `/session-guard scan [--sort size|lru]`
- `/session-guard clean`
- `/session-guard quota set <size>`

## UX Notes

### Scan report

- Do not show `Scope` line.
- Show quota usage and state (`ok/info/warn/critical`).

### Clean list

- Active session is locked and cannot be deleted.
- Use clear lock affordance (`[×]`, `[LOCKED]`, warning style).
- Support preview mode:
  - `p` open/close preview
  - preview shows **user + assistant only**
  - `↑/↓` or `j/k` scroll preview

### Cleanup result

- Do not show `Scope` line.

## Code Structure

- `src/index.ts` - extension entry (event wiring + command routing)
- `src/types.ts` - shared types
- `src/constants.ts` - defaults and thresholds
- `src/paths.ts` - filesystem path helpers
- `src/utils.ts` - formatting/string helpers
- `src/args.ts` - command argument parsers
- `src/session.ts` - session discovery + metadata + title extraction
- `src/quota.ts` - quota config/state/guard helpers
- `src/report.ts` - scan report formatting
- `src/clean.ts` - cleanup UI + deletion flow
- `src/actions.ts` - scan/quota command actions
- `src/renderer.ts` - custom message renderer

## Editing Rules

- Keep files modular; avoid growing `src/index.ts`.
- Preserve global-only behavior unless explicitly requested.
- Prefer incremental, minimal-risk changes.
- Keep user-facing copy concise and action-oriented.

## Validation Checklist (before finishing)

1. `scan` works and shows summary title, quota, and state.
2. `clean` multi-select works; active session stays locked.
3. `clean` preview shows only user/assistant messages.
4. `quota set` persists and immediately affects status/guard behavior.
5. No regressions in message renderer styling.

## Out of Scope (for now)

- auto-clean
- advanced retention policies (age/pattern/count)
- semantic LLM summary generation
- cache/index optimization
