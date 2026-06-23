# OctoSage Novel Studio

OctoSage is a local-first desktop writing studio for Chinese long-form web fiction. It combines story planning, chapter cards, manuscript generation, quality gates, revision loops, reference-structure reading, comic/script adaptation, and browser-assisted publishing preparation in one Electron app.

The project is designed for authors who want a visible, auditable writing workflow rather than a black-box chat window. The app keeps each step explicit: plan, outline, chapter card, draft, review, targeted repair, re-review, and publish readiness.

## Highlights

- Local-first Electron desktop shell for author workflows.
- React/Vite frontend with a cinematic dark writing workspace.
- Multi-role model routing for planning, drafting, review, rewrite, memory extraction, dialogue polishing, and video prompt generation.
- Quality gate loop for chapter-level review, hard blockers, AI-taste scoring, and targeted repair evidence.
- Reference-reading workflow that stores structural fingerprints instead of copying source prose.
- Browser extension and publish helper scaffolding for visible, user-controlled browser workflows.
- Tests covering workflow contracts, model routing, publishing gates, UI migration, and desktop readiness.

## Safety Boundaries

OctoSage does not include API keys in source control. API keys are read from environment variables or local settings and should stay on the user's machine.

Reference-reading features are intended for visible, authorized content only:

- no login bypass
- no captcha bypass
- no paywall bypass
- no raw reference prose storage
- no automatic final submission without user control

## Quick Start

```powershell
npm.cmd install
npm.cmd run check
npm.cmd test
npm.cmd run build:ui
npm.cmd run desktop
```

The React frontend lives in `pixso-react-ui`:

```powershell
cd pixso-react-ui
npm.cmd install
npm.cmd run build
```

## Configuration

Model providers are optional and are selected by task role. Configure the providers you need through environment variables or the desktop settings page:

- `OPENAI_API_KEY` / `OPENAI_BASE_URL`
- `DEEPSEEK_API_KEY`
- `DOUBAO_API_KEY`
- `QIANFAN_API_KEY`
- `DASHSCOPE_API_KEY`
- `MOONSHOT_API_KEY`

The author-facing UI should describe model roles such as planner, writer, reviewer, rewriter, and memory keeper rather than exposing raw model names in the main writing workflow.

## Repository Layout

- `src/` - Electron main process, local server, CLI, workflow engine, model router.
- `pixso-react-ui/` - React/Vite desktop UI.
- `browser-extension/` - browser bridge for visible page workflows.
- `test/` - Node test suite for workflow, quality gates, routing, UI contracts, and release checks.
- `docs/` - user and developer documentation.
- `assets/` - icons and UI assets.

## Open Source Application Positioning

This repository is suitable for the Codex for Open Source application after it is pushed to GitHub as a public repository. The project benefits from Codex because maintainers need help reviewing pull requests, catching security issues in desktop/browser integration code, improving tests, and accelerating safe iteration on a complex AI-assisted authoring workflow.

See `OPEN_SOURCE_APPLICATION_DRAFT.md` for a ready-to-edit application draft.
