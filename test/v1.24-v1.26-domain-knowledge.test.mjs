import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildWritingTaskPackage,
  createProject,
  importDomainKnowledge,
  planDomainKnowledge,
  retrieveRelevantDomainKnowledge,
} from "../src/core/workflow.mjs";
import {
  domainKnowledgeBaseFile,
  domainKnowledgePlanFile,
} from "../src/core/paths.mjs";
import { readJson } from "../src/core/fsx.mjs";

async function createTempProject(prefix = "novel-studio-v124-domain-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "v1.24 domain knowledge",
    idea: "我要写一本梦幻西游网文，主角从大唐官府开始，用门派技能和长安城经济做爽点",
    platform: "fanqie",
    genre: "game ip fanqie adventure",
  });
  return { root, project };
}

test("v1.24 planDomainKnowledge detects game-IP knowledge needs without network access", () => {
  const plan = planDomainKnowledge("我要写一本梦幻西游网文，主角从大唐官府开始");

  assert.equal(plan.domain, "梦幻西游");
  assert.equal(plan.domain_type, "game_ip");
  assert.equal(plan.risk_level, "ip_sensitive");
  assert.equal(plan.requires_user_confirmation_before_network, true);
  assert.ok(plan.knowledge_dimensions.includes("门派"));
  assert.ok(plan.knowledge_dimensions.includes("技能"));
  assert.ok(plan.knowledge_dimensions.includes("地图"));
  assert.equal(plan.network_status, "not_started");
});

test("v1.24 createProject writes a domain knowledge plan automatically", async () => {
  const { root, project } = await createTempProject();
  try {
    const plan = await readJson(domainKnowledgePlanFile(project));

    assert.equal(plan.domain, "梦幻西游");
    assert.equal(plan.risk_level, "ip_sensitive");
    assert.equal(plan.project_title, project.title);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.25 importDomainKnowledge stores structured manual entries without source prose", async () => {
  const { root, project } = await createTempProject("novel-studio-v125-domain-import-");
  try {
    const knowledge = await importDomainKnowledge(project, {
      source: "manual_import",
      entries: [
        {
          type: "faction",
          name: "大唐官府",
          aliases: ["大唐"],
          facts: ["物理输出门派", "代表技能横扫千军"],
          constraints: ["不能写成法术主输出门派"],
          source_excerpt: "大唐官府门派介绍原文不应保存。",
        },
        {
          type: "location",
          name: "长安城",
          aliases: ["长安"],
          facts: ["主城", "商业活动密集"],
          constraints: ["不要写成荒野副本"],
        },
      ],
    });
    const serialized = JSON.stringify(knowledge);

    assert.equal(knowledge.entries.length, 2);
    assert.equal(knowledge.saved_source_text, false);
    assert.equal(serialized.includes("原文不应保存"), false);
    assert.ok(knowledge.forbidden_to_copy.includes("source_sentences"));
    assert.equal(knowledge.path, domainKnowledgeBaseFile(project));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.26 buildWritingTaskPackage injects relevant domain knowledge for the chapter card", async () => {
  const { root, project } = await createTempProject("novel-studio-v126-domain-task-");
  try {
    await importDomainKnowledge(project, {
      entries: [
        {
          type: "faction",
          name: "大唐官府",
          aliases: ["大唐"],
          facts: ["物理输出门派", "代表技能横扫千军"],
          constraints: ["不能写成法术主输出门派"],
        },
        {
          type: "location",
          name: "长安城",
          aliases: ["长安"],
          facts: ["主城", "商业活动密集"],
          constraints: ["不要写成荒野副本"],
        },
      ],
    });
    const router = {
      async invoke(task) {
        if (task.task_type === "generate_chapter_card") {
          return {
            chapter_no: task.chapter_no,
            display_title: "长安城里的横扫千军",
            opening_hook: "大唐官府弟子在长安城接到第一笔订单。",
            main_event: "主角用横扫千军制造第一波误判兑现。",
            protagonist_action: "他在长安城公开演示门派技能。",
            conflict: "围观者以为大唐只会莽撞输出。",
            cool_point_type: "domain_fact_payoff",
            visible_result: "长安城商人当场改变态度。",
            tail_hook: "另一个门派弟子在人群后认出了横扫千军。",
            characters_in_scene: ["主角", "长安商人"],
            character_anchors: [
              {
                name: "长安商人",
                surface: "精明",
                core: "会被真实客流打动",
                anchor: "精明但会被真实客流打动",
                signature_action: "拨算盘前先看人群",
                signature_line: "先看客流，再谈价。",
              },
            ],
            facts_required: ["大唐官府", "长安城", "横扫千军"],
            forbidden_items: ["不要把大唐官府写成法术主输出"],
          };
        }
        throw new Error(`unexpected task ${task.task_type}`);
      },
    };

    const taskPackage = await buildWritingTaskPackage(project, 1, { router, force: true });
    const retrieved = await retrieveRelevantDomainKnowledge(project, taskPackage.chapter_card);

    assert.ok(taskPackage.domain_knowledge);
    assert.ok(taskPackage.domain_knowledge.relevant_entries.some((entry) => entry.name === "大唐官府"));
    assert.ok(taskPackage.domain_knowledge.relevant_entries.some((entry) => entry.name === "长安城"));
    assert.ok(taskPackage.domain_knowledge.hard_rules.some((rule) => rule.includes("不能写成法术主输出门派")));
    assert.ok(retrieved.relevant_entries.length >= 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
