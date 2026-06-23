import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("new book modal is presented as a compact world-builder console", async () => {
  const source = await readFile("pixso-react-ui/src/views/novel/NewBookModalUnified.tsx", "utf8");
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(source, /octo-new-book world-builder/);
  assert.match(source, /className="octo-new-book-top span-3"/);
  assert.match(source, /className="octo-new-book-layout span-3"/);
  assert.match(source, /className="octo-book-main-panel"/);
  assert.match(source, /className="octo-book-side-panel"/);

  assert.match(css, /\.octo-new-book\.world-builder \{/);
  assert.match(css, /\.octo-new-book\.world-builder \.octo-modal-head \{/);
  assert.match(css, /\.octo-new-book\.world-builder \.octo-dialog-body \{/);
  assert.match(css, /\.octo-new-book\.world-builder \.octo-book-main-panel,/);
  assert.match(css, /\.octo-new-book\.world-builder \.octo-field input,/);
  assert.match(css, /backdrop-filter: blur\(18px\)/);
  assert.match(css, /rgba\(56,\s*213,\s*199,\s*0\.16\)/);
});
