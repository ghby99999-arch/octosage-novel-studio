import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  createProject,
  growPublicReferenceLibrary,
  recommendPublicReferenceFingerprints,
  writeRhythmTransferPlanFromPublicReference,
} from "../src/core/workflow.mjs";
import {
  publicReferenceLibraryFile,
  rhythmTransferPlanFile,
} from "../src/core/paths.mjs";
import { readJson } from "../src/core/fsx.mjs";
import { serveLocal } from "../src/server.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function createTempProject(prefix = "novel-studio-v186-public-ref-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  const project = await createProject({
    root,
    title: "public reference target",
    idea: "梦幻西游 大唐官府 长安城经济流",
    platform: "fanqie",
    genre: "game-ip economy",
  });
  return { root, project };
}

const rankingSource = [
  {
    name: "dream-game-economy-rhythm",
    source_url: "https://example.test/rank/book-a",
    tags: ["game_ip", "commerce", "梦幻西游", "长安城"],
    chapters: [
      {
        chapter_no: 1,
        text: [
          "The order bell rang before the Tang officer could deny the stall ledger.",
          "\"Who changed the Chang'an market price?\" he asked, but the protagonist only pointed at the guild board.",
          "Everyone thought he was bluffing. The count jumped from 0 to 47, and the street stopped laughing.",
          "Behind the weapon shop, someone copied the route without telling him.",
        ].join("\n\n"),
      },
      {
        chapter_no: 2,
        text: [
          "The guild notice arrived before breakfast.",
          "The merchant expected an apology, yet the board showed three factions bidding for one delivery path.",
          "\"Then we sell the path,\" the protagonist said.",
          "The rival did not know readers had already seen his copied seal.",
        ].join("\n\n"),
      },
    ],
  },
  {
    name: "quiet-romance-rhythm",
    source_url: "https://example.test/rank/book-b",
    tags: ["romance", "slow"],
    chapters: [
      {
        chapter_no: 1,
        text: "The morning light crossed the quiet room. Two people talked about old letters and remembered the past.",
      },
    ],
  },
];

function template() {
  return {
    template_id: "game-ip-template-a",
    title: "game-ip-template-a",
    template_prompt: "梦幻西游 大唐官府 长安城经济流 商会信息差",
    keywords: ["梦幻西游", "大唐官府", "长安城", "commerce", "game_ip"],
    angles: ["game_ip", "commerce"],
    domain: "梦幻西游",
    rise_score: 92,
  };
}

function postJson(port, route, body) {
  return fetch(`http://127.0.0.1:${port}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (response) => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || response.statusText);
    return data;
  });
}

test("v1.86 growPublicReferenceLibrary stores only structure fingerprints from ranked sources", async () => {
  const { root } = await createTempProject();
  try {
    const library = await growPublicReferenceLibrary({
      root,
      sources: rankingSource,
      sourceBatch: "weekly-top-20",
    });

    assert.equal(library.root, root);
    assert.equal(library.saved_source_text, false);
    assert.equal(library.update_policy, "auto_from_authorized_visible_reference_sources");
    assert.equal(library.references.length, 2);
    assert.equal(library.references[0].reference_name, "dream-game-economy-rhythm");
    assert.ok(library.references[0].structure_fingerprint.avg_micro_hook_density >= 0);
    assert.equal(library.references[0].chapter_count, 2);
    assert.equal(library.references[0].source_url, "https://example.test/rank/book-a");
    assert.equal(JSON.stringify(library).includes("Who changed the Chang'an market price"), false);
    assert.equal(library.path, publicReferenceLibraryFile(root));

    const saved = await readJson(publicReferenceLibraryFile(root));
    assert.equal(saved.references.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.87 recommendPublicReferenceFingerprints matches dynamic templates to closest rhythms", async () => {
  const { root } = await createTempProject("novel-studio-v187-public-rec-");
  try {
    await growPublicReferenceLibrary({ root, sources: rankingSource });
    const recommendations = await recommendPublicReferenceFingerprints({
      root,
      template: template(),
      limit: 2,
    });

    assert.equal(recommendations.length >= 1, true);
    assert.equal(recommendations[0].reference_name, "dream-game-economy-rhythm");
    assert.ok(recommendations[0].reasons.includes("tag_overlap") || recommendations[0].reasons.includes("keyword_overlap"));
    assert.equal(JSON.stringify(recommendations).includes("guild notice arrived"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.88 writeRhythmTransferPlanFromPublicReference creates a safe target-project rhythm plan", async () => {
  const { root, project } = await createTempProject("novel-studio-v188-public-plan-");
  try {
    await growPublicReferenceLibrary({ root, sources: rankingSource });
    const plan = await writeRhythmTransferPlanFromPublicReference(project, {
      root,
      referenceName: "dream-game-economy-rhythm",
      name: "public-rhythm-game-ip",
      from: 1,
      to: 3,
      targetIdea: project.idea,
    });

    assert.equal(plan.name, "public-rhythm-game-ip");
    assert.equal(plan.reference_name, "dream-game-economy-rhythm");
    assert.equal(plan.saved_source_text, false);
    assert.equal(plan.copy_policy.mode, "rhythm_and_structure_only");
    assert.equal(plan.constraints.length, 3);
    assert.equal(plan.path, rhythmTransferPlanFile(project, "public-rhythm-game-ip"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.89 CLI exposes public reference growth and recommendation commands", async () => {
  const { root, project } = await createTempProject("novel-studio-v189-cli-public-ref-");
  try {
    const sourcesJson = JSON.stringify(rankingSource);
    const grow = spawnSync("node", [
      "src/cli.mjs",
      "public-refs-grow",
      "--root",
      root,
      "--sources-json",
      sourcesJson,
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(grow.status, 0, grow.stderr);
    assert.match(grow.stdout, /public-refs-grow: 2/);
    assert.match(grow.stdout, /saved-source-text: false/);

    const recommend = spawnSync("node", [
      "src/cli.mjs",
      "public-refs-recommend",
      "--root",
      root,
      "--template-json",
      JSON.stringify(template()),
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(recommend.status, 0, recommend.stderr);
    assert.match(recommend.stdout, /public-refs-recommend:/);
    assert.match(recommend.stdout, /dream-game-economy-rhythm/);

    const plan = spawnSync("node", [
      "src/cli.mjs",
      "public-refs-plan",
      "--root",
      root,
      "--project",
      project.path,
      "--reference-name",
      "dream-game-economy-rhythm",
      "--name",
      "cli-public-rhythm",
      "--from",
      "1",
      "--to",
      "2",
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(plan.status, 0, plan.stderr);
    assert.match(plan.stdout, /public-refs-plan: cli-public-rhythm/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.90 server and workbench expose public reference endpoints", async () => {
  const { root } = await createTempProject("novel-studio-v190-api-public-ref-");
  const app = await serveLocal({ port: 0 });
  try {
    const port = app.server.address().port;
    const library = await postJson(port, "/api/public-references/grow", {
      root,
      sources: rankingSource,
    });
    assert.equal(library.references.length, 2);
    const recommended = await postJson(port, "/api/public-references/recommend", {
      root,
      template: template(),
      limit: 2,
    });
    assert.equal(recommended.references[0].reference_name, "dream-game-economy-rhythm");

    const source = await readFile(path.join(repoRoot, "src", "server.mjs"), "utf8");
    assert.match(source, /Public Reference Library/);
    assert.match(source, /publicRefsGrowAction/);
    assert.match(source, /publicRefsRecommendAction/);
  } finally {
    await new Promise((resolve, reject) => app.server.close((error) => (error ? reject(error) : resolve())));
    await rm(root, { recursive: true, force: true });
  }
});
