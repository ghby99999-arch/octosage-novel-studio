# Codex for Open Source Application Draft

Use this as a draft when filling the Codex for Open Source form.

## Project URL

https://github.com/YOUR_GITHUB/octosage-novel-studio

## What does this repository do?

OctoSage Novel Studio is an actively maintained open-source desktop writing studio for Chinese long-form web fiction. It combines story planning, chapter-card generation, manuscript drafting, quality review, targeted rewrite loops, reference-structure reading, comic/script adaptation, and browser-assisted publishing preparation in one local-first Electron app.

The project is not a generic chatbot wrapper. It models the writing workflow as an auditable production pipeline: idea -> planning -> story bible -> volume outline -> chapter card -> draft -> quality gate -> targeted repair -> re-review -> publish readiness. The goal is to help authors build consistent long novels without losing context, while keeping user-controlled publishing and local file ownership.

## Why is this project actively maintained?

The codebase already includes a desktop app, React/Vite UI, browser extension, local server, workflow engine, model router, quality gates, reference-reading utilities, and an extensive Node test suite. The project is under continuous iteration, especially around writing quality, safe browser workflows, UI clarity, and security boundaries for API keys and local files.

## Why do you need Codex Security?

OctoSage touches several sensitive surfaces: local filesystem access, API keys, browser extension messaging, visible browser automation, generated author manuscripts, local HTTP endpoints, and desktop packaging. Codex Security would help review pull requests, detect unsafe patterns, audit dependency risk, and catch edge cases in the browser/desktop boundary before releases.

## How would you use the API credits?

API credits would be used for development and testing of model-routing workflows, not for reselling model access. The main uses are:

- validating planning, drafting, review, rewrite, and memory-extraction pipelines
- running quality regression tests on sample projects
- comparing model roles for specific writing tasks
- testing safe fallback behavior when a provider fails or times out
- generating non-private demo material for documentation and examples

## Maintainer constraints

This is a small project with limited maintainer time. Codex access would reduce the cost of reviewing complex workflow changes, improving tests, and keeping the desktop/browser integration safe.

## Responsible-use statement

The project is designed for author-owned work. Reference-reading workflows should only process visible, authorized content and store structure-level fingerprints rather than copying source prose. Publishing helpers should keep final submission under user control.
