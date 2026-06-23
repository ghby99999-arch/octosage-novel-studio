# Public Release Checklist

Before making this repository public:

- [x] Replace GitHub owner placeholders in public metadata.
- [ ] Review `assets/` for image ownership and decide which generated/mock assets are safe to publish.
- [ ] Confirm the chosen license is MIT, or replace `LICENSE` before publishing.
- [ ] Run secret scan:

```powershell
rg -n "sk-[A-Za-z0-9_-]{10,}|ark-[A-Za-z0-9_-]{10,}|bce-[A-Za-z0-9_-]{10,}|appSecret|private_key|BEGIN .* KEY" .
```

Expected hits should only be fake test fixtures such as `sk-should-not-save`.

- [ ] Run validation:

```powershell
npm.cmd install
npm.cmd run check
npm.cmd test
cd pixso-react-ui
npm.cmd install
npm.cmd run build
```

- [x] Create a fresh GitHub repository named `octosage-novel-studio`.
- [ ] Push this cleaned package, not the original working folder.
- [ ] Use `OPEN_SOURCE_APPLICATION_DRAFT.md` to fill the Codex for Open Source form.

Do not publish:

- generated manuscripts
- local workspaces
- API keys or `.env` files
- `node_modules`
- `dist`
- local smoke-test projects
- screenshots/log files unless intentionally curated

