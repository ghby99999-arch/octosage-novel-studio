# Contributing

Thanks for helping improve OctoSage.

## Development

```powershell
npm.cmd install
npm.cmd run check
npm.cmd test
cd pixso-react-ui
npm.cmd install
npm.cmd run build
```

## Contribution Guidelines

- Keep generated books, private manuscripts, API keys, and local logs out of commits.
- Add tests for workflow and UI contract changes.
- Do not add fake UI actions. Visible actions should either work or explain why they are disabled.
- Author-facing UI should use role labels such as planner, writer, reviewer, and memory keeper instead of raw provider/model names.
- Browser automation must remain visible and user-controlled.
