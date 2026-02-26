# Pi Session Guard Extension

Keep Pi session storage under control with a **safe, manual-first cleanup workflow** and **quota guardrails**.

---

## Why this extension?

Pi stores conversations as local JSONL files in:

- `~/.pi/agent/sessions`

Heavy usage can grow this folder quickly. Without guardrails, disk usage can become a problem.

Session Guard helps by providing:

- clear storage visibility (size + top sessions)
- review-before-delete cleanup flow
- quota warning and hard-stop behavior

---

## Key behaviors (MVP)

- Global scan/cleanup (default Pi session path: `~/.pi/agent/sessions`)
- Session label uses the **first user message** (not raw filename)
- Cleanup is **manual** and **soft-delete first**
- Quota is size-based (`ok`, `info`, `warn`, `critical`)

### 1) Quota hard-stop at 100%

When usage reaches/exceeds 100% (`critical`), normal chat input is blocked until you clean up or raise quota.

Allowed commands in critical mode:

- `/session-guard scan`
- `/session-guard clean`
- `/session-guard quota set <size>`
- `/help`

### 2) Soft-delete by default (recoverable)

Cleanup does **not** hard-delete by default.

Deletion flow:

1. Move to system Trash first (recoverable)
2. If Trash is unavailable, move to fallback folder:
   - `~/.pi/agent/session-trash`

---

## Install

### Option A: Run from this repository (local/dev)

```bash
pi -e ./src/index.ts
```

### Option B: Install as a package (when published)

```bash
pi install npm:<your-package>
```

---

## Usage

### Set quota (auto-creates config)

```bash
/session-guard quota set 10GB
```

Supported units: `B`, `KB`, `MB`, `GB`, `TB`.

This command automatically creates/updates:

- `~/.pi/agent/session-guard.json`

### Scan

```bash
/session-guard scan
/session-guard scan --sort lru
```

### Clean

```bash
/session-guard clean
```

In cleanup list:

- `p` to preview selected session (user + assistant messages only)
- `space` to select/unselect
- `enter` to confirm selection

---

## Development

Main modules:

- `src/index.ts` - extension entry (events + command routing)
- `src/session.ts` - session scan + title extraction
- `src/clean.ts` - cleanup UI + soft-delete flow
- `src/quota.ts` - quota config/state/input guard
- `src/report.ts` - scan report formatting
- `src/renderer.ts` - custom message rendering

For detailed plan and acceptance criteria:

- `spec.md`
- `tasks.md`
- Chinese README: `README.zh-TW.md`
