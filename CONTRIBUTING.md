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
Both must pass.

## Layout
- `web/` Next.js editor. Panels live in `web/src/components/panels/`. The compositor is `web/src/render/compose.ts`; preview and export share it, so a visual change there shows up in both.
- `web/src/store.ts` holds project state. Add new fields to `types.ts`, give them a default, and migrate old projects in `migrateProject`.
- `server/` API proxy for transcription and AI. `python/` Sinhala / FM service.

## Style
Match the surrounding code. Keep comments for the non-obvious why. Put user-facing shortcuts in `web/src/lib/shortcuts.ts` and update `docs/KEYBOARD_SHORTCUTS.md`.

## Contributor License Agreement
Keyframe.lk is owned by Elix Innovations (Pvt) Ltd (https://elix.lk) and released under the [PolyForm Noncommercial License 1.0.0](LICENSE). By submitting a contribution (a pull request, patch, issue attachment or any other material), you agree that:

1. You wrote the contribution yourself, or you have the right to submit it under these terms.
2. You assign all copyright in the contribution to Elix Innovations (Pvt) Ltd. Where such an assignment is not possible under applicable law, you grant Elix Innovations (Pvt) Ltd a perpetual, worldwide, irrevocable, royalty-free, non-exclusive license to use, copy, modify, sublicense, relicense and distribute the contribution, including under commercial licenses.
3. The contribution will be distributed under this repository's [LICENSE](LICENSE).
4. You will not receive payment for the contribution unless you have a separate written agreement with Elix Innovations (Pvt) Ltd.

If you can't agree to these terms, please don't submit a contribution.
