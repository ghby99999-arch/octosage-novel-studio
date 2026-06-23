import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("home hero uses a real idea input instead of a fake button", async () => {
  const bookshelf = await readFile("pixso-react-ui/src/views/novel/NovelBookshelf.tsx", "utf8");
  const modal = await readFile("pixso-react-ui/src/views/novel/NewBookModalUnified.tsx", "utf8");
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");

  assert.match(bookshelf, /idea:\s*string/);
  assert.match(bookshelf, /onIdeaChange:\s*\(value:\s*string\)\s*=>\s*void/);
  assert.match(bookshelf, /<form[\s\S]*className="octo-home-command-form[\w\s-]*"/);
  assert.match(bookshelf, /<input[\s\S]*value=\{idea\}[\s\S]*onChange=\{\(event\) => onIdeaChange\(event\.target\.value\)\}/);
  assert.doesNotMatch(bookshelf, /<button className="octo-home-command"/);
  assert.doesNotMatch(bookshelf, /octo-home-signal cinematic/);
  assert.match(bookshelf, /initialIdea=\{modalInitialIdea\}/);

  assert.match(modal, /initialIdea\?:\s*string/);
  assert.match(modal, /setIdea\(initialIdea\.trim\(\)\)/);

  assert.match(css, /\.octo-home-command-form \{/);
  assert.match(css, /\.octo-home-command-input \{/);
});
