import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

export async function writeJson(file, data) {
  await ensureDir(path.dirname(file));
  const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(tempFile, file);
}

export async function appendJsonLine(file, data) {
  await ensureDir(path.dirname(file));
  await appendFile(file, `${JSON.stringify(data)}\n`, "utf8");
}

export async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`无法解析 JSON: ${file}\n${error.message}`);
    }
    throw error;
  }
}

export async function writeText(file, text) {
  await ensureDir(path.dirname(file));
  await writeFile(file, text, "utf8");
}

export function padChapter(chapterNo) {
  const text = String(chapterNo);
  return text.padStart(Math.max(4, text.length), "0");
}
