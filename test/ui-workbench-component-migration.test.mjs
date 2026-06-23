import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";

test("workbench catalog uses octo file tree instead of hand-built leaf buttons", async () => {
  const source = await readFile("pixso-react-ui/src/views/novel/WorkbenchCatalog.tsx", "utf8");

  assert.match(source, /from "@\/components\/octo-ui"/);
  assert.match(source, /OctoFileTree/);
  assert.match(source, /type OctoFileTreeItem/);
  assert.doesNotMatch(source, /className="octo-tree-leaf/);
  assert.doesNotMatch(source, /className=\{`octo-chapter-node/);
});

test("workbench pipeline uses the shared octo progress flow component", async () => {
  const source = await readFile("pixso-react-ui/src/views/NovelPages.tsx", "utf8");

  assert.match(source, /OctoProgressFlow/);
  assert.match(source, /from "@\/components\/octo-ui"/);
  assert.doesNotMatch(source, /className="octo-production-pipeline"/);
});
