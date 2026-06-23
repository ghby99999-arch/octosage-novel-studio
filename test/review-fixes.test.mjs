import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createProject,
  draftFileFor,
  exportChapter,
  getLatestDraftVersion,
  loadProject,
  reviewChapter,
  rewriteChapter,
} from "../src/core/workflow.mjs";

async function makeProject() {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-fixes-"));
  const project = await createProject({
    root,
    title: "修复验证",
    idea: "2016年重生校园外卖",
    platform: "fanqie",
    genre: "都市重生商业爽文",
  });
  return { root, project };
}

test("rewriteChapter increments draft versions instead of overwriting v2", async () => {
  const { root, project } = await makeProject();
  try {
    const first = await rewriteChapter(project, 1);
    const second = await rewriteChapter(project, 1);

    assert.equal(first.version, "v2");
    assert.equal(second.version, "v3");
    assert.equal(await getLatestDraftVersion(project, 1), "v3");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reviewChapter reads the latest draft when version is omitted", async () => {
  const { root, project } = await makeProject();
  try {
    await writeFile(
      draftFileFor(project, 1, "v1"),
      "解释解释解释，校园O2O在未来拥有巨大的商业价值。",
      "utf8",
    );
    await writeFile(
      draftFileFor(project, 1, "v3"),
      [
        "重回报到日，先把法拉利退了",
        "",
        "陆川把二维码贴到赵鹏胸口。",
        "",
        "老周后台订单列表开始往下滚。",
        "",
        "排队的新生抬起手机。",
        "",
        "有人问能不能加辣。",
        "",
        "赵鹏站在旁边，嘴巴张了半天。",
        "",
        "陆川没解释，只让他把群二维码举高一点。",
        "",
        "老周盯着屏幕，手里的夹子慢慢停住。",
        "",
        "手机又震。",
        "",
        "订单还在进。",
        "",
        "创业中心公众号忽然推送了一条登记通知。",
        "",
        "陆川看了一眼，把手机扣回掌心。",
      ].join("\n"),
      "utf8",
    );

    const review = await reviewChapter(project, 1);
    assert.equal(review.grade, "B");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("exportChapter removes only the leading title line", async () => {
  const { root, project } = await makeProject();
  try {
    const title = "重回报到日，先把法拉利退了";
    await writeFile(
      draftFileFor(project, 1, "v1"),
      `${title}\n\n正文里再次提到${title}这个说法，但不应该被删除。`,
      "utf8",
    );

    const exported = await exportChapter(project, 1);
    const output = await readFile(exported.path, "utf8");
    assert.match(output, /正文里再次提到重回报到日，先把法拉利退了这个说法/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("project json contains v1 planning fields", async () => {
  const { root, project } = await makeProject();
  try {
    const loaded = await loadProject(project.path);
    assert.equal(loaded.current_chapter, 1);
    assert.equal(loaded.batch_size, 5);
    assert.equal(loaded.target_words, 2000000);
    assert.equal(loaded.canon_version, "v1");
    assert.equal(loaded.status, "planning");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
