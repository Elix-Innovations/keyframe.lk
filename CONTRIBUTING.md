# Contributing

## You need
Node.js 20+ (see `.nvmrc`), [uv](https://docs.astral.sh/uv/) for the Python service, and ffmpeg on your PATH. Works on macOS, Linux and Windows.

## Setup
```bash
npm run setup      # web + server packages, Python deps, server/.env
npm run dev        # server (8787), Python service (8788), web (5180)
npm run fonts:fetch  # optional: legacy FM fonts (needed for the desktop build)
```

## Branches and pull requests
- Branch from `dev` and open your pull request against `dev`. `main` is protected: it only takes reviewed pull requests from `dev`.
- CI runs `npm run typecheck` and `npm run test:py` on every pull request. It must be green before merging. Run both locally first:
```bash
npm run typecheck
npm run test:py
```
- Commit with your GitHub noreply email (GitHub → Settings → Emails), not a personal address: `git config user.email <id>+<user>@users.noreply.github.com`.
- Never commit `server/.env`, API keys, or files with your own paths in them.

## Layout
- `web/` Next.js editor. Panels live in `web/src/components/panels/`. The compositor is `web/src/render/compose.ts`; preview and export share it, so a visual change there shows up in both.
- `web/src/store.ts` holds project state. Add new fields to `types.ts`, give them a default, and migrate old projects in `migrateProject`.
- `server/` API proxy for transcription and AI. `python/` Sinhala / FM service.

## Style
Match the surrounding code. Keep comments for the non-obvious why. Put user-facing shortcuts in `web/src/lib/shortcuts.ts` and update `docs/KEYBOARD_SHORTCUTS.md`.

## Licensing of contributions
Keyframe.lk is open source under the [MIT License](LICENSE), copyright Elix Innovations (Pvt) Ltd (https://elix.lk). By submitting a contribution (a pull request, patch or any other material), you agree that:

1. You wrote the contribution yourself, or you have the right to submit it under these terms.
2. The contribution is licensed under this repository's [MIT License](LICENSE), the same as the rest of the project.
3. You keep the copyright in your contribution. You will not receive payment for it unless you have a separate written agreement with Elix Innovations (Pvt) Ltd.

If you can't agree to these terms, please don't submit a contribution.
