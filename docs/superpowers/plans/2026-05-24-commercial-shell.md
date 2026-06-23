# OctoSage Commercial Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OctoSage feel like a complete commercial desktop product, not an engineering workbench with many disconnected tools.

**Architecture:** Keep the existing writing/video/publish engines unchanged and harden the product shell around them. The shell owns navigation, onboarding, account state, workspace state, support, commercial readiness, and all ordinary-language entry points.

**Tech Stack:** Electron, local Node server, React/Vite Pixso UI, JSON readiness gates, Markdown product docs.

---

### Task 1: Product Shell Rules

**Files:**
- Create: `docs/COMMERCIAL_SHELL.md`
- Modify: `scripts/commercial-release-gate.mjs`
- Modify: `README.md`

- [ ] **Step 1: Add the commercial shell spec**

Create `docs/COMMERCIAL_SHELL.md` with these enforceable rules:

```markdown
# Commercial Shell Standard

OctoSage must feel like a finished desktop product before the user ever learns how deep the engine is.

## North Star

One ordinary user should be able to open OctoSage, sign in locally, choose a workspace, add an API key, create or continue a book, write chapters, export assets, prepare publishing, and get support without seeing engineering language.

## Required Product Surfaces

- Home: one primary next action, one idea input, current project summary, project directories.
- Writing: single-chapter writing and batch writing in the same workflow.
- Video: screenplay, storyboard, prompt, character reference, and full pack export.
- Publishing: package, plan, browser assistant, WebBridge status, final-submit safety line.
- Data: progress, grade distribution, latest activity, self-evolving template/reference actions.
- Settings: API keys, workspace, theme, support, diagnostics, commercial status.
- Account: login/register/local account state inside the same app shell.

## Visual Rules

- One shell, one sidebar, one account area, one typography scale.
- The active navigation item is purple; inactive items are gray.
- No duplicate workbench panels inside settings.
- No raw function names or engineering labels in visible primary UI.
- No overflowing modules; cards and rows must wrap or shrink before clipping.

## Interaction Rules

- Text inputs never trigger navigation on focus or click.
- Every visible `data-octo-action` has a handler.
- Long-running actions show feedback.
- Errors use user-facing Chinese copy.
- Publishing never clicks the final submit button automatically.
- Remote install commands are copied or explained, never silently executed.

## Commercial Readiness Gates

- Built Pixso UI is packaged into the installer.
- Quick Start, User Guide, Changelog, and this standard are packaged.
- Desktop smoke covers write, quality report, export, video pack, publish plan, domain plan, diagnostics.
- Commercial gate reports `formal-ready` only when P0 blockers and warnings are empty.
```

- [ ] **Step 2: Gate the shell spec**

In `scripts/commercial-release-gate.mjs`, add checks:

```js
const shellSpec = await readText("docs/COMMERCIAL_SHELL.md");

check("commercial-shell-standard", /Commercial Shell Standard/.test(shellSpec) && /Publishing never clicks the final submit button automatically/.test(shellSpec))
check("commercial-shell-packaged", (pkg.build?.files || []).includes("docs/**/*"))
```

- [ ] **Step 3: Link the standard from README**

Add `Commercial Shell Standard` to the README documentation list.

- [ ] **Step 4: Verify**

Run:

```powershell
npm.cmd run commercial:check
```

Expected: `status` is `formal-ready`.

### Task 2: Same-Shell Account Experience

**Files:**
- Modify: `pixso-react-ui/src/views/PixsoAppShell.tsx`
- Modify: `pixso-react-ui/src/views/AuthPages.tsx`
- Modify: `pixso-react-ui/src/pixso-bridge.ts`

- [ ] **Step 1: Keep login/register inside PixsoPageShell**

Use the same sidebar, account area, page head, and section style as the other pages.

- [ ] **Step 2: Make account state reactive**

Dispatch `octosage:account` after login/register and subscribe in the sidebar.

- [ ] **Step 3: Verify**

Run:

```powershell
npm.cmd --prefix pixso-react-ui run build
npm.cmd run commercial:check
```

Expected: build passes and `ui-login-state` is true.

### Task 3: First-Run and Ordinary-Language Flow

**Files:**
- Modify: `pixso-react-ui/src/views/Frame21.tsx`
- Modify: `pixso-react-ui/src/views/Frame2191.tsx`
- Modify: `pixso-react-ui/src/views/SystemPages.tsx`

- [ ] **Step 1: Home has four startup checks**

Home startup checklist must show only login, workspace, model API, and current project.

- [ ] **Step 2: Home has four quick actions**

Home quick actions must be continue writing, batch writing, review/rewrite, and publish/export.

- [ ] **Step 3: Settings avoids duplicate workbench**

Settings must not show repeated writing/video/publish workbench buttons.

- [ ] **Step 4: Verify**

Run:

```powershell
npm.cmd --prefix pixso-react-ui run build
npm.cmd run desktop:smoke
npm.cmd run commercial:check
```

Expected: build, smoke, and commercial gate pass.

### Task 4: Release Package Proof

**Files:**
- Modify: none unless validation fails.

- [ ] **Step 1: Build the installer**

Run:

```powershell
npm.cmd run build:win
npm.cmd run build:check
```

Expected: `dist/OctoSage-1.100.0-x64.exe` exists and build artifact check passes.

- [ ] **Step 2: Record remaining risks**

Report code signing, real platform selector live validation, real payment backend, and real cloud account system separately from local desktop readiness.
