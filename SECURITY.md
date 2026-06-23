# Security Policy

## Supported Scope

This project contains a local Electron desktop app, a local HTTP API, a React frontend, and a browser extension bridge. Security reports are welcome for issues that affect local secrets, filesystem access, browser automation boundaries, extension behavior, or unsafe network handling.

## Sensitive Data Rules

- Do not commit API keys, tokens, local account files, generated manuscripts, private reference material, or local workspace paths.
- Keep `.env` and local settings out of source control.
- Generated author projects are excluded by `.gitignore`.

## Reporting

Please open a private security advisory on GitHub once the repository is public. If private advisories are not available, create a minimal public issue without exploit details and ask for a secure contact path.

## Browser and Reference Reading Boundaries

Reference-reading and publishing helpers must not bypass login, captcha, paywalls, platform policy, or final user confirmation.
