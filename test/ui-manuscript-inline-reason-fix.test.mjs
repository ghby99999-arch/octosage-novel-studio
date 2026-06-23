import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("manuscript inline gate marks show compact reason and fix labels in the editor", async () => {
  const source = await readFile("pixso-react-ui/src/views/novel/ManuscriptEditor.tsx", "utf8");
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(source, /reason:\s*"前300字没有抓住读者"/);
  assert.match(source, /fix:\s*"补行动、冲突、压力或可见结果"/);
  assert.match(source, /data-inline-fix/);
  assert.match(source, /className="octo-inline-fix"/);
  assert.match(source, /aria-label="正文问题批注"/);
  assert.doesNotMatch(source, /这一章还没达到可直接发布水准，系统会继续按红黄标自动返工/);

  assert.match(css, /\.octo-inline-fix/);
  assert.match(css, /max-width:\s*min\(300px,\s*72%\)/);
});
