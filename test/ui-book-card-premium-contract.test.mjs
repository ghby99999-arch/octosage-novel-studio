import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("book cards keep only decision-critical information and hide low-frequency actions", async () => {
  const source = await readFile("pixso-react-ui/src/views/novel/BookCard.tsx", "utf8");

  assert.match(source, /className="octo-book-card octo-book-card-component polished premium glass"/);
  assert.match(source, /className="octo-book-primary"/);
  assert.match(source, /className="octo-book-menu"/);
  assert.match(source, /copyPath\(project\.path\)/);
  assert.doesNotMatch(source, /<span>\{project\.path\}<\/span>|<em>\{project\.path\}<\/em>|title=\{project\.path\}/);
});

test("book card visual system uses premium cover proportions and dark-gold palettes", async () => {
  const source = await readFile("pixso-react-ui/src/views/novel/BookCard.tsx", "utf8");
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.doesNotMatch(source, /#7c3aed|#2563eb|#6366f1/);
  assert.match(source, /"#c9963e"/);
  assert.match(source, /"#2f7d7d"/);
  assert.match(css, /\.octo-book-card\.premium \{/);
  assert.match(css, /\.octo-book-card\.premium\s+\.octo-book-cover \{[\s\S]*width: 64px;[\s\S]*height: 96px;/);
  assert.match(css, /\.octo-book-primary \{/);
});
