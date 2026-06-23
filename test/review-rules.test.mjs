import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createProject,
  draftFileFor,
  generateChapterCard,
  reviewChapter,
} from "../src/core/workflow.mjs";

test("reviewChapter checks forbidden items from chapter card", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "novel-studio-rule-review-"));
  try {
    const project = await createProject({
      root,
      title: "规则审稿",
      idea: "2016年重生校园外卖",
      platform: "fanqie",
      genre: "都市重生商业爽文",
    });
    await generateChapterCard(project, 1);
    await writeFile(
      draftFileFor(project, 1, "v1"),
      [
        "重回报到日，先把法拉利退了",
        "",
        "陆川把二维码贴到赵鹏胸口。",
        "",
        "他忽然想起可以马上做小程序。",
        "",
        "老周后台订单列表开始往下滚。",
        "",
        "创业中心公众号忽然推送了一条登记通知。",
        "",
        "赵鹏把群二维码举高。",
        "",
        "订单还在进。",
      ].join("\n"),
      "utf8",
    );

    const review = await reviewChapter(project, 1, "v1");
    assert.equal(review.grade, "D");
    assert.ok(review.hard_rule_violations.some((item) => item.includes("小程序")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
