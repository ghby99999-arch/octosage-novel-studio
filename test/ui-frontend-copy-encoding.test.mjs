import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const sourceRoot = path.join("pixso-react-ui", "src");
const textFilePattern = /\.(css|ts|tsx)$/;
const mojibakePattern = /锟|�|鐣|寗|灏|璧|偣|涓|绔|瀹|閽|瑙|棰|熬|寰|鍛|鍙|||||[ÃÂ]{2,}/;

const listSourceFiles = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    return textFilePattern.test(entry.name) ? [fullPath] : [];
  }));
  return files.flat();
};

test("frontend source copy does not contain mojibake in reader-facing source", async () => {
  const files = await listSourceFiles(sourceRoot);
  const broken = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const visibleCopy = source
      .split("\n")
      .filter((line) => (
        !line.includes("mojibakePattern")
        && !line.includes("probablyMojibake")
      ))
      .join("\n");
    if (mojibakePattern.test(visibleCopy)) broken.push(file);
  }

  assert.deepEqual(broken, []);
});

test("manuscript editor gate copy stays readable", async () => {
  const source = await readFile(path.join(sourceRoot, "views", "novel", "ManuscriptEditor.tsx"), "utf8");

  assert.match(source, /过程说明泄露/);
  assert.match(source, /章尾钩子不足/);
  assert.match(source, /前300字留存不足/);
  assert.match(source, /弃读风险/);
  assert.match(source, /正文问题标记预览/);
});

test("quality panel gate copy stays readable", async () => {
  const source = await readFile(path.join(sourceRoot, "views", "novel", "QualityPanels.tsx"), "utf8");

  assert.match(source, /可发布/);
  assert.match(source, /审查员无效/);
  assert.match(source, /质检等级未到发布线/);
  assert.match(source, /前300字留存不足/);
  assert.match(source, /AI味偏重/);
});
