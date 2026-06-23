import { readdir } from "node:fs/promises";
import path from "node:path";

async function findFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findFiles(file));
    } else {
      files.push(file);
    }
  }
  return files;
}

async function main() {
  const dist = path.resolve("dist");
  let files;
  try {
    files = await findFiles(dist);
  } catch (error) {
    throw new Error(`dist not found. Run npm.cmd run build:win first. Detail: ${error.message}`);
  }
  const exeFiles = files.filter((file) => file.toLowerCase().endsWith(".exe"));
  const report = {
    status: exeFiles.length ? "ready" : "blocked",
    dist,
    exe_count: exeFiles.length,
    exe_files: exeFiles,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!exeFiles.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
