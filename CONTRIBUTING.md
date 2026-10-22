# Contributing

## Setup
```bash
npm run setup      # web + server packages, Python deps, server/.env
npm run dev        # server (8787), Python service (8788), web (5180)
```

## Before you open a PR
```bash
npm run typecheck
npm run test:py
```
Both must pass. CI runs the same commands.

## Layout
- `web/` Next.js editor. Panels live in `web/src/components/panels/`. The compositor is `web/src/render/compose.ts`; preview and export share it, so a visual change there shows up in both.
- `web/src/store.ts` holds project state. Add new fields to `types.ts`, give them a default, and migrate old projects in `migrateProject`.
- `server/` API proxy for transcription and AI. `python/` Sinhala / FM service.

## Style
Match the surrounding code. Keep comments for the non-obvious why. Put user-facing shortcuts in `web/src/lib/shortcuts.ts` and update `docs/KEYBOARD_SHORTCUTS.md`.
