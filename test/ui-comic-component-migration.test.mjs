import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";

test("comic pages use shared octo cockpit components for cards, actions, and episode tree", async () => {
  const source = await readFile("pixso-react-ui/src/views/ComicPages.tsx", "utf8");

  assert.match(source, /from "@\/components\/octo-ui"/);
  assert.match(source, /OctoButton/);
  assert.match(source, /OctoBookCard/);
  assert.match(source, /OctoFileTree/);
  assert.match(source, /OctoPanel/);
  assert.match(source, /type OctoFileTreeItem/);

  assert.doesNotMatch(source, /className="octo-book-card"/);
  assert.doesNotMatch(source, /className=\{episode === no \? "octo-chapter-row/);
  assert.doesNotMatch(source, /className="octo-left-actions"[\s\S]*?<button/);
});
