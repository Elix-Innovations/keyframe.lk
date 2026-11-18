# Phases

This is the plan for taking Keyframe.lk open source and what to improve once it is public.
It complements [`docs/ROADMAP.md`](ROADMAP.md), which tracks *features*. This file tracks the
*project*: legal readiness, quality, UI, and community.

Each item is written so it can become a GitHub issue. Suggested labels are in brackets.
Items marked 🟢 are good first issues.

> Findings below come from a read-through of the repo on 2026-11-14 (typecheck passes; the
> editor, API and Python service all start). Where something is an estimate rather than a
> measured fact, it says so.

---

## Phase 0: Open-source blockers

Do these **before** the repo goes public. None of them is much work, and each one blocks real use.

- [x] **Add a `LICENSE` file.** There is none, and the README does not mention a license. Without one, nobody may legally use or contribute to the code. Pick one (MIT or Apache-2.0 are the usual choices; Apache-2.0 adds a patent grant) and add a License section to the README. `[legal]` *Done: PolyForm Noncommercial 1.0.0, owned by Elix Innovations (Pvt) Ltd; README License section and CLA added.*
- [ ] **Audit third-party licenses.** `[legal]`
  - `web/public/feed/*.jpg` (4 stock photos used in the landing/phone feed): record where they came from and under what license, or replace them.
  - Legacy FM / Tharu fonts are correctly git-ignored and fetched by `npm run fonts:fetch`. Keep it that way, and say in the README that those fonts are not covered by the project license.
  - Confirm the terms for the services the app calls: Openverse/Freesound (commercial-use filter is already applied), Jamendo, and the forced-aligner model that `npm run align:fetch` downloads (~1.2 GB).
  - [x] Generate a `THIRD_PARTY_NOTICES.md` from the npm and Python dependency trees. *Done: `npm run notices`.*
- [x] **Check git history for secrets** before publishing (`server/.env` is ignored now, but old commits may not be clean). Rotate any key that ever appeared. `[security]` *Done: Scanned 2026-11-14: no key patterns (Google, Anthropic, OpenAI, ElevenLabs, GitHub, AWS, private keys) and no `.env` other than `.env.example` in history.*
- [x] **Add issue templates** (`.github/ISSUE_TEMPLATE/`): bug report, feature request, and a "Sinhala rendering / font bug" form (asks for the FM font, input text, expected vs. actual). Only a PR template exists today. `[community]` *Done: Bug, feature and Sinhala rendering forms; blank issues off.*
- [x] **Fill in contact details** in `CODE_OF_CONDUCT.md` and `SECURITY.md` (a real email or GitHub private vulnerability reporting). `[community]` *Done: GitHub private vulnerability reporting; CoC points to elix.lk and GitHub Report content.*
- [ ] **Add `CODEOWNERS` (done), repo topics, a description and a social preview image** (`docs/images/home.png` works). `[community]`
- [ ] **Create the label set**: `good first issue`, `help wanted`, `bug`, `ui`, `a11y`, `sinhala`, `export`, `desktop`, `docs`, `perf`, `security`, `legal`.
- [ ] **Enable GitHub Discussions** for questions, so Issues stay for actionable work.

**Exit criteria:** license present, no unlicensed assets, history clean, a stranger can file a well-formed issue.

---

## Phase 1: Make contributing safe

Goal: a first-time contributor can change code and know within minutes whether they broke something.

### CI and tests
- [x] **Add `npm run build` to CI.** CI runs typecheck and Python tests only, so a build break would not be caught. `[ci]`
- [ ] **Add a linter** (ESLint or Biome) for `web/` and `server/`. There is no `lint` script in any `package.json` today. `[tooling]`
- [ ] **Add JS/TS unit tests.** Only `python/tests/` exists. The pure logic is easy to test and valuable: `lib/srt.ts`, `lib/segment.ts`, `lib/speedCurve.ts`, `lib/clips.ts`, `lib/fm.ts`, `migrateProject` in the store. `test:parity` already compares TS and Python for the FM table; wire it into CI once its 9 failing checks (repaya `¾`, `ඒ`) are fixed. 🟢 `[tests]`
- [ ] **Add one end-to-end smoke test** (Playwright): open `/editor`, create a blank workspace, import a short fixture video, add a caption, confirm the timeline renders. `[tests]`
- [ ] **Run CI on Windows and macOS** for the desktop-relevant paths, not just Ubuntu. `[ci]`
- [x] **Add Dependabot or Renovate.** Dependencies use very recent majors (Next 16, React 19, TypeScript 7), which move fast. `[tooling]` *Done: Dependabot, monthly, grouped minor/patch.*

### Reliability
- [x] **Add error boundaries** (`app/error.tsx`, `app/editor/error.tsx`, plus one around the preview/compositor). None exist. A render error in a panel currently risks a blank editor, which for a tool that holds unsaved work is the worst failure mode. `[bug]` *Done: `app/error.tsx`, `app/editor/error.tsx` and a boundary around the preview.*
- [ ] **Surface autosave state** (saved / saving / failed) in the editor header. Autosave runs every 5 s into IndexedDB; if IndexedDB is blocked or full the user should know. `[ui]`
- [ ] **Project backup/restore.** Projects live only in the browser. Add "Export project (.keyframe)" and "Import project" so users can move machines and survive cleared site data. `[feature]`

### Server hardening (matters as soon as anyone hosts it)
- [x] **Limit `/api/transcribe` upload size.** The server comments say there is no body limit on that route (JSON routes are capped at 20 MB). Add a configurable cap and a clear error. `[security]` *Done: `MAX_UPLOAD_MB`, default 2048, returns 413.*
- [ ] **Rate limiting and optional auth.** CORS is correctly restricted to localhost, but there is no rate limit or token, so anyone who can reach a hosted instance can spend the owner's API keys. Document "local use only" prominently, and add an optional `API_TOKEN`. `[security]`
- [ ] **Redact keys in logs and the usage tab**; add a startup check that warns when no provider key is set (health already reports it). 🟢 `[security]`

### Code health
- [ ] **Split the largest files.** Biggest are `lib/motionLibrary.ts` (898 lines, mostly data, fine), `types.ts` (883), `Timeline.tsx` (806), `render/captions.ts` (708), `render/matte.ts` (663), `CaptionsPanel.tsx` (652), `Preview.tsx` (651). Break up components and compositor code along their existing seams. `[refactor]`
- [ ] **Document the compositor architecture** (`render/compose.ts` is shared by preview and export): one diagram and a "how to add an effect / transition / filter" walkthrough in `docs/ARCHITECTURE.md`. This is the single most useful doc for contributors. `[docs]`
- [ ] **Add `docs/DEVELOPMENT.md`**: ports, the three services, how to run with no API keys, how to run Python tests, how to debug export. `[docs]`

**Exit criteria:** PRs run lint, typecheck, unit tests, build and e2e smoke; the editor survives a component crash; a hosted instance cannot be trivially abused.

---

## Phase 2: UI and UX improvements

Goal: the editor feels finished to someone who has never seen CapCut or Premiere.
Items tagged *(verified)* were confirmed in the code or by running the app; *(suggested)* are
design recommendations that need a decision.

### First run and navigation
- [ ] **Better empty state on the Workspace page.** *(verified)* With no projects the page is a large dark area with one line of small, low-contrast text. Add a drop zone, a "try a sample project" button, and a 3-step "how it works" strip. `[ui]`
- [ ] **Guided first project.** *(suggested)* A short coach-mark tour (import → generate captions → style → export) that can be skipped and replayed from `?`. `[ui]`
- [ ] **Sample project bundled with the app** (a 10 s CC0 clip with captions) so people can explore without an API key. *(suggested)* `[ui]`
- [ ] **Explain missing API keys in context.** *(verified: health reports no engine key)* When Generate is disabled, show a one-click "Set up a key" panel with the exact `.env` line, instead of a silent disabled button. `[ui]`

### Accessibility
- [ ] **Label icon-only buttons.** *(verified)* There are about 267 button usages and about 82 `aria-label`s. Many of the rest have visible text, so the real gap is smaller, but a pass over every icon-only button is needed. Use a lint rule (`jsx-a11y`) to keep it fixed. 🟢 `[a11y]`
- [ ] **Keyboard access to the timeline.** *(suggested)* Clips, handles and keyframes are likely mouse-only. Define arrow-key move/trim, `Tab` through clips, and announce selection. `[a11y]`
- [ ] **Contrast audit** of the dark theme: small grey-on-black helper text (e.g. the Workspace empty state and the sidebar section labels) looks below WCAG AA. Run axe and fix tokens in `globals.css`. 🟢 `[a11y]`
- [x] **Respect `prefers-reduced-motion`** on the landing marquee, hero animation and editor transitions. `[a11y]` *Done: Landing marquee and drift animations already stop under reduced motion.*
- [x] **Fix the document language.** *(verified)* `<html lang="si">` is set globally, but the interface text is English. Screen readers will mispronounce it. Set `lang="en"` on the shell and `lang="si"` only on Sinhala content, or localize the UI (below). 🟢 `[a11y]` *Done: `lang="en"` on the shell, `lang="si"` on Sinhala landing text.*

### Localization
- [ ] **Localize the interface.** *(verified: no i18n library or string tables)* This is a Sinhala-first product with an English-only UI. Extract strings (e.g. `next-intl`), ship `en` and `si`, and invite Tamil. It is also the best "help wanted" entry point for local contributors. `[i18n]`
- [ ] **Sinhala-aware UI typography:** line-height and font stack for the interface itself, not just for captions. `[ui]`

### Layout and responsiveness
- [ ] **Define the small-screen story.** *(verified: no viewport/width handling in the editor or workspace components; the landing page is responsive)* Either show a friendly "use a larger screen" notice below a minimum width, or make the panels collapsible. Today a narrow window likely breaks the three-pane layout. `[ui]`
- [ ] **Persist panel sizes and tab selection** per project (resizable panels are already used). `[ui]`
- [ ] **Presets for layout**: "Captions", "Timeline-focused", "Preview-focused". *(suggested)* `[ui]`

### Timeline and editing feel
- [ ] **Clip thumbnails and filmstrip** on video clips (on the roadmap's gap list; `lib/filmstrip.ts` exists, so check how far it got). `[ui]`
- [ ] **Waveforms on every audio clip**, with a loading state. `[ui]`
- [ ] **Better drag feedback**: ghost clip, snap guides that are clearly visible, a visible drop target when dragging from panels. `[ui]`
- [ ] **Undo/redo history in the UI** (the store already has undo/redo with coalescing): show the buttons in the header and a history popover. 🟢 `[ui]`
- [ ] **Context menus everywhere** for clips, captions and tracks, with shortcut hints. Components exist in `components/ui/context-menu.tsx`. `[ui]`
- [ ] **Command palette** (`cmdk` is already a dependency): search every action, effect and filter. *(suggested)* `[ui]`

### Preview and export
- [ ] **Export dialog with presets** (TikTok/Reels 9:16, YouTube 16:9, square, 4K), an estimated file size, and a real progress bar with cancel. `[ui]`
- [x] **Clear unsupported-browser notice.** *(verified: export needs WebCodecs, so Firefox and older Safari cannot export)* Detect up front and explain on the Export button, not after a failed attempt. 🟢 `[ui]` *Done: Export panel shows a notice and disables video export without `VideoEncoder`.*
- [ ] **"Keep tab visible" warning** during export, with a Wake Lock request so the screen does not sleep mid-render. `[ui]`
- [ ] **Safe-area guides** for vertical video (platform UI overlays) as a toggle in the preview. 🟢 `[ui]`

### Visual polish
- [ ] **Replace raw `<img>`** *(verified: 7 usages, no `next/image`)* with optimized images on the landing page; check LCP. 🟢 `[perf]`
- [ ] **Loading skeletons** for the media bin, templates and sound search instead of empty panels. `[ui]`
- [ ] **A consistent toast/error pattern** (sonner is installed): every failure gets a message, a cause, and a next step. `[ui]`
- [ ] **Light theme review.** Light is the base theme and dark is a switch; make sure every panel, the timeline, and the landing page look right in both. `[ui]`

**Exit criteria:** a new user can produce and export captions without reading the README; the editor passes an automated accessibility scan; the UI is available in Sinhala and English.

---

## Phase 3: Product and performance

Goal: close the gap with other editors where the browser can do it well. The detailed gap list lives in
[`docs/ROADMAP.md`](ROADMAP.md); this is the suggested order.

### Performance
- [ ] **Code-split the editor.** *(verified: only one `dynamic()` / `lazy()` in the web source)* Lazy-load heavy modules: RNNoise WASM, the WebGL grade/matte pipeline, template and motion libraries, the Unicode ⇄ FM converter. Measure with `next build` output before and after. `[perf]`
- [ ] **Memory budget for long videos**: test 10, 30 and 60 minute sources; document limits; stream rather than buffer where possible. `[perf]`
- [ ] **Move heavy work to Web Workers / OffscreenCanvas** (matte, effects, waveform generation) so the UI thread stays responsive. `[perf]`
- [ ] **Export benchmarks** published in the docs per browser and OS. `[perf]`

### Editing features (from the roadmap gap list)
Order chosen by value versus effort:
1. [ ] Reverse clip
2. [ ] Volume keyframes and a curve editor
3. [ ] Picture-in-picture presets
4. [ ] Chroma key
5. [ ] Masks
6. [ ] Text-to-speech
7. [ ] Voice changer
8. [ ] Background removal (browser model first, ONNX sidecar later)
9. [ ] Auto-reframe and stabilization

### Sinhala quality (the project's differentiator)
- [ ] **A test corpus of tricky Sinhala strings** (conjuncts, repaya, ZWJ, rakaransaya, yansaya) with golden renders for each font. `[sinhala]`
- [ ] **Fix the known FM edge cases** called out in the README (repaya `¾`, some `ු/ූ` forms) and add each as a regression test in `python/tests/`. `[sinhala]`
- [ ] **Word-level timing quality**: report the gap between Gemini's times and aligner-corrected times, and make the aligner download optional with a clear explanation. `[sinhala]`
- [ ] **More engines**: local Whisper (see sidecar below) and a provider-agnostic transcription interface so contributors can add engines without touching the UI. `[sinhala]`

### Desktop app
- [ ] **More platforms.** macOS arm64 (dmg) and Windows x64 (NSIS) ship today. Add Intel mac and Linux (AppImage) targets. `[desktop]`
- [ ] **Code signing and notarization.** The mac build is ad-hoc signed for now. The Developer ID, notarization and Azure Trusted Signing setup is wired up in the release workflow; it activates once the secrets are added (see `docs/SIGNING.md`). `[desktop]`
- [ ] **Auto-update** through GitHub Releases. `[desktop]`

### Optional local engine (from the roadmap)
- [ ] Hardware-accelerated export (FFmpeg: 4K, HEVC, AV1)
- [ ] Local Whisper via whisper.cpp
- [ ] Local text-to-speech
- [ ] Background removal via ONNX Runtime

**Exit criteria:** long videos export reliably; the top editing gaps are closed; desktop installs on all three OSes.

---

## Phase 4: Community and growth

- [ ] **Tagged releases with a changelog** (`CHANGELOG.md`, semver, GitHub Releases with desktop installers attached). `[release]`
- [ ] **A public site and docs** (the landing page is already in the app). Add a short demo video and an online sample project. `[docs]`
- [ ] **Triage routine**: label new issues within a few days; keep 10 or more `good first issue` items open at all times (every 🟢 above is a candidate). `[community]`
- [ ] **Contributor guides by area**: "add a template", "add a filter or transition", "add a font", "add a language". Each one is a self-contained first PR. `[docs]`
- [ ] **Template and style gallery**: accept community templates as JSON PRs, with a review checklist (license, performance, readability). `[community]`
- [ ] **Plugin/extension points** for effects and transcription engines, once the compositor API has settled. `[architecture]`
- [ ] **Telemetry stance**: document that there is none (the app is local-first), and keep it that way unless users opt in. `[docs]`
- [ ] **Sustainability**: add a funding link and a statement on what the project will and will not accept (for example, hosted-service features). `[community]`

---

## Suggested first 10 issues to file

| # | Title | Phase | Labels |
|---|---|---|---|
| 1 | Add a LICENSE and a License section to the README | 0 | `legal` |
| 2 | Document provenance and license of `web/public/feed/*.jpg` | 0 | `legal`, 🟢 |
| 3 | Add issue templates (bug, feature, Sinhala rendering) | 0 | `community`, 🟢 |
| 4 | Add `npm run build` to CI | 1 | `ci`, 🟢 |
| 5 | Add ESLint/Biome with `jsx-a11y` | 1 | `tooling`, `a11y` |
| 6 | Unit tests for `srt.ts`, `segment.ts`, `speedCurve.ts` | 1 | `tests`, 🟢 |
| 7 | Add error boundaries for app, editor and preview | 1 | `bug` |
| 8 | Cap upload size on `/api/transcribe` | 1 | `security` |
| 9 | Set the correct `lang` attribute; plan Sinhala UI localization | 2 | `a11y`, `i18n`, 🟢 |
| 10 | Friendlier Workspace empty state with sample project | 2 | `ui` |

---

## How we will track progress

- One GitHub **milestone** per phase; every checkbox above becomes an issue linked to it.
- A phase is done when its **exit criteria** are met, not when every box is ticked. Items can move between phases.
- Update this file when a phase closes, and move shipped features into the "Shipped" list in `docs/ROADMAP.md`.
