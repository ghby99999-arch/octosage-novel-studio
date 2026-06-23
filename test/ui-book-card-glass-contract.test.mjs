import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("book cards are glassy work entries instead of hard light panels", async () => {
  const source = await readFile("pixso-react-ui/src/views/novel/BookCard.tsx", "utf8");
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(source, /className="octo-book-card octo-book-card-component polished premium glass"/);
  assert.match(source, /className="octo-book-card octo-book-card-component create premium glass"/);
  assert.match(css, /\.octo-book-card\.premium\.glass \{/);
  assert.match(css, /\.octo-book-card\.premium\.glass \{[\s\S]*backdrop-filter:\s*blur/);
  assert.match(css, /\.octo-book-card\.premium\.glass \{[\s\S]*rgba\(8,\s*12,\s*24/);
  assert.match(css, /\.octo-book-card\.premium\.glass \.octo-book-primary \{/);
  assert.match(css, /\.octo-book-card\.create\.premium\.glass \{/);
});
