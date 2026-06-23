import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const roots = [
  "pixso-react-ui/src/views",
  "pixso-react-ui/src/views/novel",
];

test("feature views do not use raw buttons or legacy base Button/Card imports", async () => {
  for (const root of roots) {
    const files = (await readdir(root)).filter((file) => file.endsWith(".tsx"));
    for (const file of files) {
      const relative = path.join(root, file);
      const source = await readFile(relative, "utf8");
      assert.doesNotMatch(source, /<button\b/, `${relative} should use OctoButton or a domain component`);
      assert.doesNotMatch(source, /@\/components\/ui\/Button/, `${relative} should not import base Button directly`);
      assert.doesNotMatch(source, /@\/components\/ui\/Card/, `${relative} should not import base Card directly`);
    }
  }
});
