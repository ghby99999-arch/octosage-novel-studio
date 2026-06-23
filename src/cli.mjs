#!/usr/bin/env node
import path from "node:path";
import { readFileSync } from "node:fs";
import { cwd, exit } from "node:process";
import {
  aggregateBatchState,
  allocatePortfolioBudget,
  buildChapterContext,
  calibratePublishPlatformSelectors,
  continueBatch,
  createCalibratedVisiblePublishBrowserDriver,
  analyzeAiTaste,
  collectDomainKnowledgeFromSources,
  analyzeReferenceStructure,
  compareModelsForChapter,
  createPlatformPublishPlan,
  createDomainKnowledgeBuildPlan,
  createPortfolio,
  createPremiumIncubationPlan,
  createProject,
  createPublicReferenceReadPlan,
  createReferenceReadPlan,
  createSafeAutoReaderAdapter,
  createSingleChapterPreflight,
  exportChapterScreenplay,
  exportChapter,
  exportFullVideoPack,
  exportMerged,
  exportPublishPackage,
  extractStateCandidates,
  estimateSingleChapterCost,
  generateDomainSourceCandidates,
  generateChapterCard,
  getLatestPremiumIncubationReport,
  generateProjectCharacterRefs,
  generateProjectSceneRefs,
  generateVideoPromptsForChapter,
  listPlatformPublishAdapters,
  growPublicReferenceLibrary,
  growPublicReferenceLibraryFromReadSources,
  importDomainKnowledge,
  ingestPortfolioProjectObservation,
  indexProjectMemory,
  loadProject,
  planDomainKnowledge,
  publishToPlatform,
  detectPortfolioRisers,
  recommendDynamicTemplates,
  recommendPublicReferenceFingerprints,
  readDomainKnowledgeSourceAudit,
  readTaskCheckpoint,
  rebuildDomainKnowledgeFromAudit,
  repairQueueSummaryFromPremiumReport,
  reviewChapter,
  runVisibleBrowserPublishAssistant,
  runPremiumRepairSweep,
  runSingleChapterQualityLoop,
  runDomainKnowledgeBuild,
  runReferenceStructureRead,
  runOpenAiSmoke,
  resumeBatch,
  rewriteChapter,
  runBatch,
  runPortfolioFrontlist,
  runPremiumIncubation,
  runProject,
  refreshDynamicTemplateLibrary,
  saveProjectConfig,
  searchProjectMemory,
  simulateReaders,
  summarizeProjectCost,
  writePremiumGateReport,
  writeWebStatus,
  writeChapter,
  writeRhythmTransferPlanFromPublicReference,
} from "./core/workflow.mjs";
import { runReportFile } from "./core/paths.mjs";
import { readJson } from "./core/fsx.mjs";
import { serveLocal } from "./server.mjs";
import { listPublishPlatformProfiles } from "./core/browser/publish-browser-driver.mjs";

const PACKAGE_VERSION = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;
const PAID_PROVIDERS = new Set(["openai", "deepseek", "doubao"]);

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { _: [] };
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = rest[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    } else {
      args._.push(token);
    }
  }
  return { command, args };
}

function usage() {
  console.log(`novel v${PACKAGE_VERSION}

Quick start:
  novel init --title "my book" --idea "2016 rebirth campus business story"
  novel serve --project ".\\my-book" --port 8787
  novel real-single 1 --project ".\\my-book"

Project:
  init --title <title> --idea <idea> [--root <dir>]
  serve --project <project-dir> [--port 8787]
  use-openai --project <project-dir> --model gpt-5.1

Writing:
  real-single <chapter> --project <project-dir>
  write-batch --from 1 --to 5 --project <project-dir>
  run --until 10 --project <project-dir>

Quality:
  review <chapter> --project <project-dir>
  rewrite <chapter> --project <project-dir>
  reader-sim <chapter> --project <project-dir>

Commands:
  init --title <title> --idea <idea>
  card <chapter> --project <project-dir>
  write <chapter> --project <project-dir>
  write <chapter> --provider openai --allow-network --project <project-dir>
  review <chapter> --project <project-dir>
  real-single <chapter> --project <project-dir>
  real-single <chapter> --dry-run-cost --project <project-dir>
  real-single <chapter> --preflight --project <project-dir>
  real-single <chapter> --provider openai --allow-network --confirm-cost --project <project-dir>
  rewrite <chapter> --project <project-dir>
  export <chapter> --project <project-dir>
  export-merged --from 1 --to 5 --project <project-dir>
  state <chapter> --project <project-dir>
  batch-state --from 1 --to 5 --project <project-dir>
  context <chapter> --project <project-dir>
  write-batch --from 1 --to 5 --project <project-dir>
  continue-batch --project <project-dir>
  run --until 10 --project <project-dir>
  run --resume --until 10 --project <project-dir>
  checkpoint --from 1 --to 5 --project <project-dir>
  resume-batch --from 1 --to 5 --project <project-dir>
  report --project <project-dir>
  cost-report --project <project-dir>
  compare-models <chapter> --providers mock,mock-always-d --project <project-dir>
  ai-taste <chapter> --project <project-dir>
  memory-index --from 1 --to 5 --project <project-dir>
  memory-search --query 陆川 --project <project-dir>
  reference-structure --name sample --text "..." --project <project-dir>
  reader-sim <chapter> --project <project-dir>
  web-status --project <project-dir>
  serve --project <project-dir> --port 8787
  use-openai --project <project-dir> --model gpt-5.1
  use-premium-router --project <project-dir>
  openai-smoke --allow-network --project <project-dir>
  domain-plan --project <project-dir>
  domain-import --entries-json '[{"name":"..."}]' --project <project-dir>
  domain-knowledge --project <project-dir>
  domain-collect --confirm --sources-json '[{"url":"https://..."}]' --project <project-dir>
  domain-sources --project <project-dir>
  domain-build-plan --project <project-dir>
  domain-build --confirm --project <project-dir>
  reference-read-plan --project <project-dir> --name benchmark --start-url <visible-url>
  reference-read-run --confirm --project <project-dir> --name benchmark --chapters-json '[...]'
  domain-audit --project <project-dir>
  domain-rebuild --confirm --project <project-dir>
  portfolio-create --root <dir> --name <name> --projects "<p1>;<p2>"
  portfolio-run --root <dir> --until 30
  portfolio-risers --root <dir>
  portfolio-allocate --root <dir> --budget-cny 1000
  templates-refresh --root <dir>
  templates-recommend --root <dir> --idea "..."
  public-refs-grow --root <dir> --sources-json '[...]'
  public-refs-recommend --root <dir> --template-json '{...}'
  public-refs-plan --root <dir> --project <project-dir> --reference-name <name>
  public-refs-read-plan --root <dir> --sources-json '[...]'
  public-refs-read-run --confirm --root <dir> --sources-json '[...]'
  char-refs --project <project-dir> --from 1 --to 30
  scene-refs --project <project-dir> --from 1 --to 30
  script <chapter> --project <project-dir>
  storyboard <chapter> --project <project-dir>
  video-prompt <chapter> --project <project-dir> --tool jimeng
  full-video-pack --from 1 --to 30 --project <project-dir> --tool jimeng
  publish-package --project <project-dir> --platform fanqie --from 1 --to 30
  publish-plan --project <project-dir> --platform fanqie --from 1 --to 30
  publish-platform --project <project-dir> --platform fanqie --from 1 --to 30 --confirm
  publish-browser --project <project-dir> --platform fanqie --from 1 --to 30 --confirm [--launch-browser]
  publish-adapters
  publish-profiles
  publish-calibrate-selectors --project <project-dir> --platform fanqie --confirm
  premium-plan --root <dir> --ideas "idea1|idea2"
  premium-run --root <dir> --until 30
  premium-latest --root <dir>
  premium-repair-queue --root <dir>
  premium-repair-sweep --root <dir> --limit 10
  premium-gate --from 1 --to 30 --target-score 95 --project <project-dir>
  portfolio-ingest --root <dir> --project-path <project-dir> --metrics-json '{"retention_prediction":88}'

Memory and export:
  memory-index --from 1 --to 5 --project <project-dir>
  memory-search --query 陆川 --project <project-dir>
  export-merged --from 1 --to 5 --project <project-dir>
  domain-plan --project <project-dir>
  domain-import --entries-json <json> --project <project-dir>
  domain-knowledge --project <project-dir>
  domain-sources --project <project-dir>
  domain-build-plan --project <project-dir>
  domain-build --confirm --project <project-dir>
  domain-audit --project <project-dir>
  portfolio-create --root <dir> --projects "<p1>;<p2>"
  portfolio-risers --root <dir>
  portfolio-allocate --root <dir> --budget-cny 1000
  premium-plan --root <dir> --ideas "idea1|idea2"
  premium-run --root <dir> --until 30
  premium-latest --root <dir>
  premium-repair-queue --root <dir>
  premium-repair-sweep --root <dir> --limit 10
  premium-gate --from 1 --to 30 --target-score 95 --project <project-dir>
  publish-package --project <project-dir> --platform fanqie --from 1 --to 30
  publish-plan --project <project-dir> --platform fanqie --from 1 --to 30
  publish-platform --project <project-dir> --platform fanqie --from 1 --to 30 --confirm
  publish-browser --project <project-dir> --platform fanqie --from 1 --to 30 --confirm [--launch-browser]
  publish-adapters
  publish-profiles
  publish-calibrate-selectors --project <project-dir> --platform fanqie --confirm
  portfolio-ingest --root <dir> --project-path <project-dir> --metrics-json <json>

Reports:
  report --project <project-dir>
  cost-report --project <project-dir>
  real-single <chapter> --dry-run-cost --project <project-dir>
  real-single <chapter> --provider deepseek --allow-network --confirm-cost --project <project-dir>
`);
}

async function requireProject(args) {
  const projectPath = args.project ? path.resolve(args.project) : cwd();
  return loadProject(projectPath);
}

function parseChapterNo(value) {
  const chapterNo = Number(value || 1);
  if (!Number.isInteger(chapterNo) || chapterNo < 1) {
    throw new Error(`chapter must be a positive integer: ${value}`);
  }
  return chapterNo;
}

function parsePositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${name} must be a positive integer: ${value}`);
  }
  return number;
}

function parseNonNegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${name} must be a non-negative integer: ${value}`);
  }
  return number;
}

function parseNonNegativeNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${name} must be a non-negative number: ${value}`);
  }
  return number;
}

function routerOptionsFromArgs(args) {
  if (!args.provider) return undefined;
  return {
    provider: args.provider,
    model: args.model,
    allowNetwork: Boolean(args["allow-network"]),
  };
}

function printCostEstimate(estimate) {
  console.log(`chapter: ${estimate.chapter_no}`);
  console.log(`provider: ${estimate.provider}`);
  console.log(`model: ${estimate.model}`);
  console.log(`base-calls: ${estimate.base.total_calls}`);
  console.log(`base-input-tokens: ${estimate.base.estimated_input_tokens}`);
  console.log(`base-output-tokens: ${estimate.base.estimated_output_tokens}`);
  console.log(`base-cost-cny: ${estimate.base.estimated_cost_cny}`);
  console.log(`worst-calls: ${estimate.worst_case.total_calls}`);
  console.log(`worst-input-tokens: ${estimate.worst_case.estimated_input_tokens}`);
  console.log(`worst-output-tokens: ${estimate.worst_case.estimated_output_tokens}`);
  console.log(`estimated-cost-cny: ${estimate.worst_case.estimated_cost_cny}`);
}

async function requireCostConfirmationForRealRun(project, chapterNo, args, maxRewrites) {
  const routerOptions = routerOptionsFromArgs(args);
  const provider = routerOptions?.provider || "mock";
  if (!PAID_PROVIDERS.has(provider) || args["confirm-cost"]) {
    return;
  }
  const estimate = await estimateSingleChapterCost(project, chapterNo, {
    routerOptions,
    maxRewrites,
  });
  throw new Error(
    [
      "cost confirmation required.",
      `provider: ${provider}`,
      `estimated-cost-cny: ${estimate.worst_case.estimated_cost_cny}`,
      `worst-calls: ${estimate.worst_case.total_calls}`,
      `worst-input-tokens: ${estimate.worst_case.estimated_input_tokens}`,
      `worst-output-tokens: ${estimate.worst_case.estimated_output_tokens}`,
      "Run --dry-run-cost to inspect the estimate, then add --confirm-cost to start real paid model calls.",
    ].join("\n"),
  );
}

function printBatchResult(result) {
  for (const chapter of result.chapters) {
    console.log(
      `chapter ${chapter.chapter_no}: ${chapter.review_grade} ${chapter.version} ${chapter.export_path} state=${chapter.state_candidates_path}`,
    );
  }
  if (result.status === "stopped") {
    console.log(`stopped chapter ${result.stop.chapter_no}: ${result.stop.grade} ${result.stop.reason}`);
  } else if (result.batch_state_path) {
    console.log(`batch-state: ${result.batch_state_path}`);
  }
}

function formatCliError(error) {
  const message = error.message || "";
  if (/OPENAI_API_KEY is required/.test(message)) {
    return [
      "OPENAI_API_KEY is missing.",
      "Set it in the current terminal before running OpenAI model calls:",
      '  $env:OPENAI_API_KEY="sk-..."',
      "Then run smoke or real writing:",
      "  node src\\cli.mjs openai-smoke --allow-network --project <project-dir>",
      "  node src\\cli.mjs write 1 --provider openai --allow-network --project <project-dir>",
      "OctoSage does not store API keys in project files.",
    ].join("\n");
  }
  if (/DEEPSEEK_API_KEY is required/.test(message)) {
    return [
      "DEEPSEEK_API_KEY is missing.",
      'Set it in the current terminal before running DeepSeek calls: $env:DEEPSEEK_API_KEY="..."',
      "OctoSage does not store API keys in project files.",
    ].join("\n");
  }
  if (/DOUBAO_API_KEY is required/.test(message)) {
    return [
      "DOUBAO_API_KEY is missing.",
      'Set it in the current terminal before running Doubao calls: $env:DOUBAO_API_KEY="..."',
      "OctoSage does not store API keys in project files.",
    ].join("\n");
  }
  if (error.code === "ENOENT" || /ENOENT|未找到 project\.json|项目目录无效/.test(message)) {
    return [
      "Project not found or required file is missing.",
      "Check --project points to an OctoSage project folder.",
      'Create one first: novel init --title "my book" --idea "your story idea"',
      `Detail: ${message}`,
    ].join("\n");
  }
  if (/无法解析 JSON|JSON|Unexpected token|Unexpected end of JSON input/.test(message)) {
    return [
      "Project data file is damaged or not valid JSON.",
      "Open the file mentioned below, fix the JSON, or restore from a previous project copy.",
      `Detail: ${message}`,
    ].join("\n");
  }
  if (/timeout|ECONNREFUSED|ENOTFOUND|network|fetch failed/i.test(message)) {
    return [
      "Network or model service request failed.",
      "Check your connection, API provider status, proxy settings, and --allow-network flag.",
      `Detail: ${message}`,
    ].join("\n");
  }
  if (/\b401\b|\b403\b|unauthorized|forbidden/i.test(message)) {
    return [
      "Model provider rejected the request.",
      "Check the API key, account quota, and selected model name.",
      `Detail: ${message}`,
    ].join("\n");
  }
  return message;
}

async function main() {
  const { command, args } = parseArgs(process.argv.slice(2));

  if (!command || command === "help" || command === "--help") {
    usage();
    return;
  }

  if (command === "init") {
    if (!args.title || !args.idea) {
      throw new Error("init requires --title and --idea");
    }
    const project = await createProject({
      root: args.root ? path.resolve(args.root) : cwd(),
      title: args.title,
      idea: args.idea,
      platform: args.platform || "fanqie",
      genre: args.genre || "urban business rebirth",
    });
    console.log(`created: ${project.path}`);
    return;
  }

  if (command === "portfolio-create") {
    if (!args.root) throw new Error("portfolio-create requires --root");
    const projects = String(args.projects || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean);
    const portfolio = await createPortfolio({
      root: path.resolve(args.root),
      name: args.name || "portfolio",
      projects,
      target_chapters: args["target-chapters"] ? parsePositiveInteger(args["target-chapters"], "target-chapters") : 30,
    });
    console.log(`portfolio: ${portfolio.name}`);
    console.log(`projects: ${portfolio.projects.length}`);
    console.log(`path: ${portfolio.path}`);
    return;
  }

  if (command === "portfolio-run") {
    if (!args.root) throw new Error("portfolio-run requires --root");
    const report = await runPortfolioFrontlist({
      root: path.resolve(args.root),
      untilChapter: args.until ? parsePositiveInteger(args.until, "until") : 30,
      maxRewrites: args["max-rewrites"] ? parsePositiveInteger(args["max-rewrites"], "max-rewrites") : 1,
    });
    console.log(`portfolio-run: ${report.status}`);
    console.log(`projects: ${report.results.length}`);
    console.log(`path: ${report.path}`);
    return;
  }

  if (command === "portfolio-risers") {
    if (!args.root) throw new Error("portfolio-risers requires --root");
    const report = await detectPortfolioRisers({ root: path.resolve(args.root) });
    console.log(`risers: ${report.risers.length}`);
    for (const riser of report.risers) {
      console.log(`${riser.rise_score} ${riser.title} ${riser.recommendation}`);
    }
    return;
  }

  if (command === "portfolio-allocate") {
    if (!args.root) throw new Error("portfolio-allocate requires --root");
    const allocation = await allocatePortfolioBudget({
      root: path.resolve(args.root),
      totalBudgetCny: Number(args["budget-cny"] || 0),
    });
    console.log(`portfolio-allocation: ${allocation.total_budget_cny}`);
    for (const item of allocation.allocations) {
      console.log(`${item.budget_cny} ${item.title} ${item.action}`);
    }
    return;
  }

  if (command === "templates-refresh") {
    if (!args.root) throw new Error("templates-refresh requires --root");
    const library = await refreshDynamicTemplateLibrary({
      root: path.resolve(args.root),
      minRiseScore: args["min-rise-score"] ? Number(args["min-rise-score"]) : 70,
      limit: args.limit ? parsePositiveInteger(args.limit, "limit") : 5,
    });
    console.log(`templates-refresh: ${library.templates.length}`);
    console.log(`saved-source-text: ${library.saved_source_text}`);
    console.log(`path: ${library.path}`);
    for (const template of library.templates) {
      console.log(`${template.rise_score} ${template.template_id} ${template.title}`);
    }
    return;
  }

  if (command === "templates-recommend") {
    if (!args.root) throw new Error("templates-recommend requires --root");
    const templates = await recommendDynamicTemplates({
      root: path.resolve(args.root),
      idea: args.idea || "",
      limit: args.limit ? parsePositiveInteger(args.limit, "limit") : 5,
    });
    console.log(`templates-recommend: ${templates.length}`);
    for (const template of templates) {
      console.log(`${template.match_score} ${template.template_id} ${template.title}`);
    }
    return;
  }

  if (command === "public-refs-grow") {
    if (!args.root) throw new Error("public-refs-grow requires --root");
    if (!args["sources-json"]) throw new Error("public-refs-grow requires --sources-json");
    const sources = JSON.parse(args["sources-json"]);
    if (!Array.isArray(sources)) throw new Error("public-refs-grow --sources-json must be a JSON array");
    const library = await growPublicReferenceLibrary({
      root: path.resolve(args.root),
      sources,
      sourceBatch: args["source-batch"] || "manual_cli",
    });
    console.log(`public-refs-grow: ${library.references.length}`);
    console.log(`saved-source-text: ${library.saved_source_text}`);
    console.log(`path: ${library.path}`);
    return;
  }

  if (command === "public-refs-recommend") {
    if (!args.root) throw new Error("public-refs-recommend requires --root");
    if (!args["template-json"]) throw new Error("public-refs-recommend requires --template-json");
    const references = await recommendPublicReferenceFingerprints({
      root: path.resolve(args.root),
      template: JSON.parse(args["template-json"]),
      limit: args.limit ? parsePositiveInteger(args.limit, "limit") : 3,
    });
    console.log(`public-refs-recommend: ${references.length}`);
    for (const reference of references) {
      console.log(`${reference.match_score} ${reference.reference_name}`);
    }
    return;
  }

  if (command === "public-refs-plan") {
    if (!args.root) throw new Error("public-refs-plan requires --root");
    if (!args["reference-name"]) throw new Error("public-refs-plan requires --reference-name");
    const targetProject = await loadProject(path.resolve(args.project || cwd()));
    const plan = await writeRhythmTransferPlanFromPublicReference(targetProject, {
      root: path.resolve(args.root),
      referenceName: args["reference-name"],
      name: args.name || "public-reference-rhythm",
      from: args.from ? parsePositiveInteger(args.from, "from") : 1,
      to: args.to ? parsePositiveInteger(args.to, "to") : 1,
      targetIdea: targetProject.idea,
    });
    console.log(`public-refs-plan: ${plan.name}`);
    console.log(`reference: ${plan.reference_name}`);
    console.log(`constraints: ${plan.constraints.length}`);
    console.log(`path: ${plan.path}`);
    return;
  }

  if (command === "public-refs-read-plan") {
    if (!args.root) throw new Error("public-refs-read-plan requires --root");
    if (!args["sources-json"]) throw new Error("public-refs-read-plan requires --sources-json");
    const sources = JSON.parse(args["sources-json"]);
    if (!Array.isArray(sources)) throw new Error("public-refs-read-plan --sources-json must be a JSON array");
    const plan = await createPublicReferenceReadPlan({
      root: path.resolve(args.root),
      sources,
      chapterLimit: args["chapter-limit"] ? parsePositiveInteger(args["chapter-limit"], "chapter-limit") : 30,
      sourceBatch: args["source-batch"] || "manual_cli",
    });
    console.log(`public-refs-read-plan: ${plan.status}`);
    console.log(`sources: ${plan.source_count}`);
    console.log(`confirmation-required: ${plan.requires_user_confirmation_before_browser_read}`);
    console.log(`saved-source-text: ${plan.saved_source_text}`);
    console.log(`path: ${plan.path}`);
    return;
  }

  if (command === "public-refs-read-run") {
    if (!args.root) throw new Error("public-refs-read-run requires --root");
    if (!args.confirm) throw new Error("public-refs-read-run requires --confirm");
    if (!args["sources-json"]) throw new Error("public-refs-read-run requires --sources-json");
    const sources = JSON.parse(args["sources-json"]);
    if (!Array.isArray(sources)) throw new Error("public-refs-read-run --sources-json must be a JSON array");
    const library = await growPublicReferenceLibraryFromReadSources({
      root: path.resolve(args.root),
      confirmed: true,
      readSources: sources,
      chapterLimit: args["chapter-limit"] ? parsePositiveInteger(args["chapter-limit"], "chapter-limit") : 30,
      sourceBatch: args["source-batch"] || "manual_cli_visible_read",
      browserAdapterFactory: ({ source }) => createSafeAutoReaderAdapter({
        reader: async () => ({
          chapters: Array.isArray(source.chapters) ? source.chapters : [],
          stopped: source.stopped || { reason: "manual_visible_chapters_exhausted" },
        }),
        minDelayMs: 0,
        maxDelayMs: 0,
      }),
    });
    console.log(`public-refs-read-run: ${library.references.length}`);
    console.log(`saved-source-text: ${library.saved_source_text}`);
    console.log(`path: ${library.path}`);
    return;
  }

  if (command === "char-refs") {
    const project = await requireProject(args);
    const result = await generateProjectCharacterRefs(project, {
      from: args.from ? parsePositiveInteger(args.from, "from") : 1,
      to: args.to ? parsePositiveInteger(args.to, "to") : 30,
      style: args.style || "realistic-3d",
    });
    console.log(`char-refs: ${result.characters.length}`);
    console.log(`saved-source-text: ${result.saved_source_text}`);
    console.log(`path: ${result.path}`);
    return;
  }

  if (command === "scene-refs") {
    const project = await requireProject(args);
    const result = await generateProjectSceneRefs(project, {
      from: args.from ? parsePositiveInteger(args.from, "from") : 1,
      to: args.to ? parsePositiveInteger(args.to, "to") : 30,
      style: args.style || "cinematic-realistic",
    });
    console.log(`scene-refs: ${result.scenes.length}`);
    console.log(`saved-source-text: ${result.saved_source_text}`);
    console.log(`path: ${result.path}`);
    return;
  }

  if (command === "script") {
    const chapterNo = parseChapterNo(args._[0] || 1);
    const project = await requireProject(args);
    const result = await exportChapterScreenplay(project, chapterNo);
    console.log(`script: ${result.chapter_no}`);
    console.log(`path: ${result.path}`);
    return;
  }

  if (command === "storyboard") {
    const chapterNo = parseChapterNo(args._[0] || 1);
    const project = await requireProject(args);
    const result = await generateVideoPromptsForChapter(project, chapterNo, {
      tool: args.tool || "jimeng",
    });
    console.log(`storyboard: ${result.chapter_no}`);
    console.log(`shots: ${result.storyboard.shots.length}`);
    console.log(`path: ${result.storyboard_path}`);
    return;
  }

  if (command === "video-prompt") {
    const chapterNo = parseChapterNo(args._[0] || 1);
    const project = await requireProject(args);
    const result = await generateVideoPromptsForChapter(project, chapterNo, {
      tool: args.tool || "jimeng",
    });
    console.log(`video-prompt: ${result.chapter_no}`);
    console.log(`tool: ${result.tool}`);
    console.log(`prompts: ${result.prompts.length}`);
    console.log(`path: ${result.prompt_path}`);
    return;
  }

  if (command === "full-video-pack") {
    const chapterNo = parseChapterNo(args._[0] || 1);
    const project = await requireProject(args);
    const result = await exportFullVideoPack(project, {
      from: args.from ? parsePositiveInteger(args.from, "from") : 1,
      to: args.to ? parsePositiveInteger(args.to, "to") : chapterNo,
      tool: args.tool || "jimeng",
      style: args.style || "realistic-3d",
    });
    console.log(`full-video-pack: ${result.status}`);
    console.log(`chapters: ${result.chapter_count}`);
    console.log(`shots: ${result.total_shots}`);
    console.log(`path: ${result.pack_path}`);
    return;
  }

  if (command === "premium-plan") {
    if (!args.root) throw new Error("premium-plan requires --root");
    const ideas = String(args.ideas || "")
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean);
    const plan = await createPremiumIncubationPlan({
      root: path.resolve(args.root),
      baseTitle: args["base-title"] || "premium-incubation",
      ideas,
      targetChapters: args["target-chapters"] ? parsePositiveInteger(args["target-chapters"], "target-chapters") : 30,
    });
    console.log(`premium-plan: ${plan.status}`);
    console.log(`projects: ${plan.projects.length}`);
    console.log(`portfolio: ${plan.portfolio.path}`);
    return;
  }

  if (command === "premium-run") {
    if (!args.root) throw new Error("premium-run requires --root");
    const report = await runPremiumIncubation({
      root: path.resolve(args.root),
      untilChapter: args.until ? parsePositiveInteger(args.until, "until") : 30,
      maxRewrites: args["max-rewrites"] !== undefined ? parseNonNegativeInteger(args["max-rewrites"], "max-rewrites") : 1,
      totalBudgetCny: Number(args["budget-cny"] || 0),
    });
    console.log(`premium-run: ${report.status}`);
    console.log("fallback: enabled");
    console.log(`projects: ${report.project_reports.length}`);
    console.log(`path: ${report.path}`);
    return;
  }

  if (command === "premium-latest") {
    if (!args.root) throw new Error("premium-latest requires --root");
    const report = await getLatestPremiumIncubationReport({ root: path.resolve(args.root) });
    console.log(`premium-latest: ${report.status}`);
    console.log(`projects: ${report.project_reports.length}`);
    console.log(`path: ${report.path}`);
    return;
  }

  if (command === "premium-repair-queue") {
    if (!args.root) throw new Error("premium-repair-queue requires --root");
    const report = await getLatestPremiumIncubationReport({ root: path.resolve(args.root) });
    const summary = repairQueueSummaryFromPremiumReport(report);
    console.log(`premium-repair-queue: ${summary.total_items}`);
    for (const item of summary.priority_order) {
      console.log(`${item.priority} ${item.title} chapter=${item.chapter_no} metric=${item.metric} issue=${item.issue}`);
    }
    return;
  }

  if (command === "premium-repair-sweep") {
    if (!args.root) throw new Error("premium-repair-sweep requires --root");
    const report = await runPremiumRepairSweep({
      root: path.resolve(args.root),
      limit: args.limit ? parsePositiveInteger(args.limit, "limit") : 10,
      maxRewrites: args["max-rewrites"] !== undefined ? parseNonNegativeInteger(args["max-rewrites"], "max-rewrites") : 1,
    });
    console.log(`premium-repair-sweep: ${report.status}`);
    console.log(`repaired: ${report.repaired_count}`);
    console.log(`remaining: ${report.remaining_count}`);
    console.log(`path: ${report.path}`);
    return;
  }

  if (command === "publish-adapters") {
    for (const adapter of listPlatformPublishAdapters()) {
      console.log(`${adapter.id}\t${adapter.mode}\t${adapter.label}`);
    }
    return;
  }

  if (command === "publish-profiles") {
    for (const profile of listPublishPlatformProfiles()) {
      console.log(`${profile.id}\t${profile.author_console_url}\tverified=${profile.verification?.current_dom_verified === true}`);
    }
    return;
  }

  if (command === "portfolio-ingest") {
    if (!args.root) throw new Error("portfolio-ingest requires --root");
    if (!args["project-path"]) throw new Error("portfolio-ingest requires --project-path");
    if (!args["metrics-json"]) throw new Error("portfolio-ingest requires --metrics-json");
    const metrics = JSON.parse(args["metrics-json"]);
    const result = await ingestPortfolioProjectObservation({
      root: path.resolve(args.root),
      projectPath: path.resolve(args["project-path"]),
      chapterNo: args.chapter ? parsePositiveInteger(args.chapter, "chapter") : 1,
      outcome: args.outcome || "observed",
      source: args.source || "manual_cli_portfolio_ingest",
      metrics,
    });
    console.log(`portfolio-ingest: ${result.status}`);
    console.log(`project: ${result.project_title}`);
    console.log(`observations: ${result.observations.length}`);
    console.log(`rise-score: ${result.riser?.rise_score || 0}`);
    return;
  }

  if (command === "run" && args.to) {
    throw new Error("run requires --until; --to is only for write-batch");
  }

  const chapterNo = parseChapterNo(args._[0] || 1);
  const project = await requireProject(args);

  if (command === "premium-gate") {
    const report = await writePremiumGateReport(project, {
      from: args.from ? parsePositiveInteger(args.from, "from") : 1,
      to: args.to ? parsePositiveInteger(args.to, "to") : 30,
      targetScore: args["target-score"] ? Number(args["target-score"]) : 95,
    });
    console.log(`premium-gate: ${report.status}`);
    console.log(`publish-package-allowed: ${report.publish_package_allowed}`);
    console.log(`score: ${report.overall_score}/${report.target_score}`);
    console.log(`blocking: ${report.blocking_chapters.length}`);
    console.log(`path: ${report.path}`);
    return;
  }

  if (command === "publish-package") {
    const result = await exportPublishPackage(project, {
      from: args.from ? parsePositiveInteger(args.from, "from") : 1,
      to: args.to ? parsePositiveInteger(args.to, "to") : 30,
      platform: args.platform || project.platform || "fanqie",
      targetScore: args["target-score"] ? Number(args["target-score"]) : 95,
      allowBlocked: Boolean(args["allow-blocked"]),
    });
    console.log(`publish-package: ${result.status}`);
    console.log(`platform: ${result.platform}`);
    console.log(`publish-package-allowed: ${Boolean(result.gate?.publish_package_allowed)}`);
    if (result.package?.dir) console.log(`path: ${result.package.dir}`);
    if (result.must_fix_before_publish?.length) console.log(`must-fix: ${result.must_fix_before_publish.length}`);
    return;
  }

  if (command === "publish-plan") {
    const plan = await createPlatformPublishPlan(project, {
      from: args.from ? parsePositiveInteger(args.from, "from") : 1,
      to: args.to ? parsePositiveInteger(args.to, "to") : 30,
      platform: args.platform || project.platform || "fanqie",
      targetScore: args["target-score"] ? Number(args["target-score"]) : 95,
      adapterName: args.adapter,
    });
    console.log(`publish-plan: ${plan.status}`);
    console.log(`platform: ${plan.platform}`);
    console.log(`requires-user-authorization: ${Boolean(plan.requires_user_authorization)}`);
    if (plan.package?.dir) console.log(`package: ${plan.package.dir}`);
    console.log(`steps: ${(plan.steps || []).length}`);
    return;
  }

  if (command === "publish-platform") {
    const result = await publishToPlatform(project, {
      from: args.from ? parsePositiveInteger(args.from, "from") : 1,
      to: args.to ? parsePositiveInteger(args.to, "to") : 30,
      platform: args.platform || project.platform || "fanqie",
      targetScore: args["target-score"] ? Number(args["target-score"]) : 95,
      confirmed: Boolean(args.confirm),
      adapterName: args.adapter,
    });
    console.log(`publish-platform: ${result.status}`);
    console.log(`platform: ${result.platform}`);
    console.log(`adapter: ${result.publish_attempt?.adapter_name || "none"}`);
    console.log(`submitted: ${Boolean(result.publish_attempt?.submitted)}`);
    if (result.publish_attempt?.external_work_id) console.log(`external-work-id: ${result.publish_attempt.external_work_id}`);
    return;
  }

  if (command === "publish-browser") {
    let browserDriver;
    if (args["launch-browser"]) {
      const created = await createCalibratedVisiblePublishBrowserDriver(project, {
        allowBrowserLaunch: Boolean(args.confirm),
        driverType: args["driver-type"] || "playwright",
        platform: args.platform || project.platform || "fanqie",
      });
      if (created.status !== "ready") {
        console.log(`publish-browser: ${created.status}`);
        console.log(`started: false`);
        console.log(`submitted: false`);
        if (created.next_step) console.log(`next-step: ${created.next_step}`);
        return;
      }
      browserDriver = created.driver;
    }
    const result = await runVisibleBrowserPublishAssistant(project, {
      from: args.from ? parsePositiveInteger(args.from, "from") : 1,
      to: args.to ? parsePositiveInteger(args.to, "to") : 30,
      platform: args.platform || project.platform || "fanqie",
      targetScore: args["target-score"] ? Number(args["target-score"]) : 95,
      confirmed: Boolean(args.confirm),
      browserDriver,
    });
    console.log(`publish-browser: ${result.status}`);
    console.log(`platform: ${result.platform}`);
    console.log(`started: ${Boolean(result.browser_attempt?.started)}`);
    console.log(`submitted: ${Boolean(result.browser_attempt?.submitted)}`);
    if (result.report_path) console.log(`path: ${result.report_path}`);
    return;
  }

  if (command === "publish-calibrate-selectors") {
    let pageScanner;
    if (args["launch-browser"]) {
      const created = await createCalibratedVisiblePublishBrowserDriver(project, {
        allowBrowserLaunch: Boolean(args.confirm),
        driverType: args["driver-type"] || "playwright",
        platform: args.platform || project.platform || "fanqie",
      });
      if (created.status !== "ready") {
        console.log(`publish-calibrate-selectors: ${created.status}`);
        console.log(`platform: ${args.platform || project.platform || "fanqie"}`);
        if (created.next_step) console.log(`next-step: ${created.next_step}`);
        return;
      }
      pageScanner = created.driver;
    }
    const result = await calibratePublishPlatformSelectors(project, {
      platform: args.platform || project.platform || "fanqie",
      confirmed: Boolean(args.confirm),
      pageScanner,
    });
    console.log(`publish-calibrate-selectors: ${result.status}`);
    console.log(`platform: ${result.platform}`);
    if (result.path) console.log(`path: ${result.path}`);
    if (result.next_step) console.log(`next-step: ${result.next_step}`);
    return;
  }

  if (command === "serve") {
    await writeWebStatus(project);
    const app = await serveLocal({
      host: args.host || "127.0.0.1",
      port: args.port === undefined ? 8787 : Number(args.port),
      project,
    });
    console.log(`server: ${app.url}`);
    console.log(`project: ${project.path}`);
    return;
  }

  if (command === "card") {
    const card = await generateChapterCard(project, chapterNo);
    console.log(`card: ${chapterNo} ${card.display_title}`);
    return;
  }

  if (command === "write") {
    const draft = await writeChapter(project, chapterNo, {
      routerOptions: routerOptionsFromArgs(args),
    });
    console.log(`draft: ${draft.path}`);
    return;
  }

  if (command === "review") {
    const review = await reviewChapter(project, chapterNo);
    console.log(`review: ${review.grade} ${review.next_action}`);
    return;
  }

  if (command === "real-single") {
    const maxRewrites = args["max-rewrites"]
      ? parsePositiveInteger(args["max-rewrites"], "max-rewrites")
      : 2;
    const maxCostCny = args["max-cost-cny"] !== undefined
      ? parseNonNegativeNumber(args["max-cost-cny"], "max-cost-cny")
      : undefined;
    if (args["dry-run-cost"]) {
      const estimate = await estimateSingleChapterCost(project, chapterNo, {
        routerOptions: routerOptionsFromArgs(args),
        maxRewrites,
      });
      console.log("dry-run: cost");
      printCostEstimate(estimate);
      return;
    }
    if (args.preflight) {
      const preflight = await createSingleChapterPreflight(project, chapterNo, {
        routerOptions: routerOptionsFromArgs(args),
        maxRewrites,
        confirmed: Boolean(args["confirm-cost"]),
        maxCostCny,
      });
      console.log(`preflight: ${preflight.path}`);
      console.log(`status: ${preflight.status}`);
      printCostEstimate(preflight.estimate);
      return;
    }
    if (maxCostCny !== undefined) {
      const preflight = await createSingleChapterPreflight(project, chapterNo, {
        routerOptions: routerOptionsFromArgs(args),
        maxRewrites,
        confirmed: Boolean(args["confirm-cost"]),
        maxCostCny,
      });
      if (preflight.status === "blocked") {
        throw new Error(
          [
            "cost limit exceeded.",
            `max-cost-cny: ${maxCostCny}`,
            `estimated-cost-cny: ${preflight.estimate.worst_case.estimated_cost_cny}`,
            `preflight: ${preflight.path}`,
          ].join("\n"),
        );
      }
    }
    await requireCostConfirmationForRealRun(project, chapterNo, args, maxRewrites);
    const result = await runSingleChapterQualityLoop(project, chapterNo, {
      routerOptions: routerOptionsFromArgs(args),
      maxRewrites,
    });
    console.log(`status: ${result.status}`);
    console.log(`chapter: ${result.chapter_no}`);
    console.log(`grade: ${result.final_grade}`);
    console.log(`version: ${result.final_version}`);
    console.log(`rewrites: ${result.rewrite_count}`);
    if (result.export_path) {
      console.log(`export: ${result.export_path}`);
    }
    if (result.state_candidates_path) {
      console.log(`state: ${result.state_candidates_path}`);
    }
    if (result.quality_report_path) {
      console.log(`report: ${result.quality_report_path}`);
    }
    if (result.stop) {
      console.log(`stop: ${result.stop.grade} ${result.stop.reason}`);
    }
    return;
  }

  if (command === "rewrite") {
    const draft = await rewriteChapter(project, chapterNo);
    console.log(`rewrite: ${draft.path}`);
    return;
  }

  if (command === "export") {
    const exported = await exportChapter(project, chapterNo);
    console.log(`export: ${exported.path}`);
    return;
  }

  if (command === "export-merged") {
    const from = parsePositiveInteger(args.from || 1, "from");
    const to = parsePositiveInteger(args.to || from, "to");
    const merged = await exportMerged(project, { from, to });
    console.log(`merged-export: ${merged.path}`);
    console.log(`chapters: ${merged.chapter_count}`);
    return;
  }

  if (command === "state") {
    const candidates = await extractStateCandidates(project, chapterNo);
    console.log(`state: ${candidates.path}`);
    return;
  }

  if (command === "batch-state") {
    const from = parsePositiveInteger(args.from || 1, "from");
    const to = parsePositiveInteger(args.to || 5, "to");
    const batchState = await aggregateBatchState(project, { from, to });
    console.log(`batch-state: ${batchState.path}`);
    return;
  }

  if (command === "context") {
    const context = await buildChapterContext(project, chapterNo);
    console.log(JSON.stringify(context, null, 2));
    return;
  }

  if (command === "checkpoint") {
    const from = parsePositiveInteger(args.from || 1, "from");
    const to = parsePositiveInteger(args.to || from + project.batch_size - 1, "to");
    const checkpoint = await readTaskCheckpoint(project, { from, to });
    console.log(JSON.stringify(checkpoint, null, 2));
    return;
  }

  if (command === "report") {
    const report = await readJson(runReportFile(project));
    console.log(`status: ${report.status}`);
    console.log(`next-action: ${report.next_action}`);
    console.log(`next-chapter: ${report.next_chapter}`);
    console.log(`completed: ${report.completed_chapters.join(",")}`);
    console.log(`repaired: ${report.repaired.length}`);
    if (report.stop) {
      console.log(`stop: ${report.stop.reason}`);
    }
    return;
  }

  if (command === "cost-report") {
    const summary = await summarizeProjectCost(project);
    console.log(`total-calls: ${summary.total_calls}`);
    console.log(`estimated-input-tokens: ${summary.estimated_input_tokens}`);
    console.log(`estimated-output-tokens: ${summary.estimated_output_tokens}`);
    console.log(`estimated-cost-cny: ${summary.estimated_cost_cny}`);
    for (const [taskType, count] of Object.entries(summary.by_task)) {
      console.log(`${taskType}: ${count}`);
    }
    return;
  }

  if (command === "compare-models") {
    const providers = String(args.providers || "mock").split(",").map((item) => item.trim()).filter(Boolean);
    const report = await compareModelsForChapter(project, chapterNo, { providers });
    console.log(`model-compare: ${report.path}`);
    console.log(`results: ${report.results.length}`);
    return;
  }

  if (command === "ai-taste") {
    const plan = await analyzeAiTaste(project, chapterNo, { text: args.text });
    console.log(`ai-rewrite-plan: ${plan.path}`);
    console.log(`issues: ${plan.issues.join(",")}`);
    return;
  }

  if (command === "memory-index") {
    const from = parsePositiveInteger(args.from || 1, "from");
    const to = parsePositiveInteger(args.to || from, "to");
    const index = await indexProjectMemory(project, { from, to });
    console.log(`memory-index: ${index.path}`);
    console.log(`items: ${index.items.length}`);
    return;
  }

  if (command === "memory-search") {
    const results = await searchProjectMemory(project, args.query || "");
    console.log(`memory-results: ${results.length}`);
    for (const item of results) {
      console.log(`${item.chapter_no} ${item.category} ${item.score}`);
    }
    return;
  }

  if (command === "domain-plan") {
    const plan = planDomainKnowledge(project.idea || "");
    console.log(`domain: ${plan.domain || ""}`);
    console.log(`domain-type: ${plan.domain_type}`);
    console.log(`risk-level: ${plan.risk_level}`);
    console.log(`network-status: ${plan.network_status}`);
    console.log(`requires-confirmation: ${plan.requires_user_confirmation_before_network}`);
    console.log(`dimensions: ${plan.knowledge_dimensions.join(",")}`);
    return;
  }

  if (command === "domain-import") {
    if (!args["entries-json"]) {
      throw new Error("domain-import requires --entries-json");
    }
    const entries = JSON.parse(args["entries-json"]);
    if (!Array.isArray(entries)) {
      throw new Error("domain-import --entries-json must be a JSON array");
    }
    const knowledge = await importDomainKnowledge(project, {
      source: args.source || "manual_cli_import",
      entries,
    });
    console.log("domain-import: imported");
    console.log(`entries: ${knowledge.entries.length}`);
    console.log(`saved-source-text: ${knowledge.saved_source_text}`);
    console.log(`path: ${knowledge.path}`);
    return;
  }

  if (command === "domain-knowledge") {
    const knowledge = await readJson(
      path.join(project.path, "tasks", "domain_knowledge.json"),
    ).catch(() => ({
      saved_source_text: false,
      entries: [],
    }));
    console.log(`entries: ${knowledge.entries.length}`);
    console.log(`saved-source-text: ${knowledge.saved_source_text}`);
    return;
  }

  if (command === "domain-sources") {
    const sources = await generateDomainSourceCandidates(project);
    console.log(`domain-sources: ${sources.candidates.length}`);
    console.log("candidate-only: true");
    console.log(`confirmation-required: ${sources.confirmation_required}`);
    console.log(`path: ${sources.path}`);
    return;
  }

  if (command === "domain-build-plan") {
    const plan = await createDomainKnowledgeBuildPlan(project);
    console.log(`domain-build-plan: ${plan.status}`);
    console.log(`domain: ${plan.domain || ""}`);
    console.log(`sources: ${plan.sources.length}`);
    console.log(`confirmation-required: ${plan.requires_user_confirmation_before_network}`);
    console.log(`saved-source-text: ${plan.saved_source_text}`);
    console.log(`path: ${plan.path}`);
    return;
  }

  if (command === "domain-build") {
    if (!args["confirm"]) {
      throw new Error("domain-build requires --confirm");
    }
    const sources = args["sources-json"] ? JSON.parse(args["sources-json"]) : undefined;
    if (sources !== undefined && !Array.isArray(sources)) {
      throw new Error("domain-build --sources-json must be a JSON array");
    }
    const result = await runDomainKnowledgeBuild(project, {
      confirmed: true,
      sources,
    });
    console.log(`domain-build: ${result.status}`);
    console.log(`sources: ${result.source_count}`);
    console.log(`entries: ${result.knowledge.entries.length}`);
    console.log(`saved-source-text: ${result.saved_source_text}`);
    return;
  }

  if (command === "domain-audit") {
    const audit = await readDomainKnowledgeSourceAudit(project);
    console.log(`records: ${(audit.records || []).length}`);
    console.log(`saved-source-text: ${audit.saved_source_text}`);
    return;
  }

  if (command === "domain-collect") {
    if (!args["confirm"]) {
      throw new Error("domain-collect requires --confirm");
    }
    if (!args["sources-json"]) {
      throw new Error("domain-collect requires --sources-json");
    }
    const sources = JSON.parse(args["sources-json"]);
    if (!Array.isArray(sources)) {
      throw new Error("domain-collect --sources-json must be a JSON array");
    }
    const knowledge = await collectDomainKnowledgeFromSources(project, {
      confirmed: true,
      sources,
    });
    console.log("domain-collect: collected");
    console.log(`sources: ${sources.length}`);
    console.log(`entries: ${knowledge.entries.length}`);
    console.log(`saved-source-text: ${knowledge.saved_source_text}`);
    return;
  }

  if (command === "domain-rebuild") {
    if (!args["confirm"]) {
      throw new Error("domain-rebuild requires --confirm");
    }
    const rebuilt = await rebuildDomainKnowledgeFromAudit(project, {
      confirmed: true,
    });
    console.log(`domain-rebuild: ${rebuilt.status}`);
    console.log(`sources: ${rebuilt.source_count}`);
    console.log(`entries: ${rebuilt.knowledge.entries.length}`);
    console.log(`saved-source-text: ${rebuilt.knowledge.saved_source_text}`);
    return;
  }

  if (command === "reference-structure") {
    const result = await analyzeReferenceStructure(project, {
      name: args.name || "reference",
      text: args.text || "",
    });
    console.log(`reference-structure: ${result.path}`);
    console.log(`beats: ${result.transferable_beats.join(",")}`);
    return;
  }

  if (command === "reference-read-plan") {
    const plan = await createReferenceReadPlan(project, {
      name: args.name || "reference",
      startUrl: args["start-url"],
      chapterLimit: args["chapter-limit"] ? parsePositiveInteger(args["chapter-limit"], "chapter-limit") : 30,
      platform: args.platform || "browser",
    });
    console.log(`reference-read-plan: ${plan.status}`);
    console.log(`reference: ${plan.reference_name}`);
    console.log(`chapters: ${plan.chapter_limit}`);
    console.log(`confirmation-required: ${plan.requires_user_confirmation_before_browser_read}`);
    console.log(`saved-source-text: ${plan.saved_source_text}`);
    console.log(`path: ${plan.path}`);
    return;
  }

  if (command === "reference-read-run") {
    if (!args.confirm) {
      throw new Error("reference-read-run requires --confirm");
    }
    const chapters = args["chapters-json"] ? JSON.parse(args["chapters-json"]) : [];
    if (!Array.isArray(chapters)) {
      throw new Error("reference-read-run --chapters-json must be a JSON array");
    }
    const profile = await runReferenceStructureRead(project, {
      name: args.name || "reference",
      confirmed: true,
      chapterLimit: args["chapter-limit"] ? parsePositiveInteger(args["chapter-limit"], "chapter-limit") : undefined,
      browserAdapter: {
        async readChapters() {
          return chapters;
        },
      },
    });
    console.log(`reference-read-run: ${profile.reference_name}`);
    console.log(`chapters: ${profile.chapter_count}`);
    console.log(`saved-source-text: ${profile.saved_source_text}`);
    console.log(`path: ${profile.path}`);
    return;
  }

  if (command === "reader-sim") {
    const result = await simulateReaders(project, chapterNo, { text: args.text });
    console.log(`reader-simulation: ${result.path}`);
    console.log(`readers: ${result.readers.length}`);
    return;
  }

  if (command === "web-status") {
    const status = await writeWebStatus(project);
    console.log(`web-status: ${status.path}`);
    console.log(`project: ${status.project_title}`);
    return;
  }

  if (command === "use-openai") {
    const config = await saveProjectConfig(project, {
      model: {
        provider: "openai",
        default_writer: args.model || "gpt-5.1",
        default_reviewer: args.model || "gpt-5.1",
        default_extractor: args.model || "gpt-5.1",
        allow_network: true,
      },
    });
    console.log(`provider: ${config.model.provider}`);
    console.log(`model: ${config.model.default_writer}`);
    console.log("api-key: env OPENAI_API_KEY");
    return;
  }

  if (command === "use-premium-router") {
    const routes = {
      generate_chapter_card: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        fallbacks: [{ provider: "mock", model: "mock" }],
      },
      write_chapter: {
        provider: "wenxin",
        model: "ernie-5.1",
        fallbacks: [
          { provider: "deepseek", model: "deepseek-v4-flash" },
          { provider: "openai", model: "gpt-5.1" },
          { provider: "kimi", model: "kimi-k2.6" },
          { provider: "mock", model: "mock" },
        ],
      },
      review_chapter: {
        provider: "qwen",
        model: "qwen3.6-plus",
        fallbacks: [
          { provider: "qwen", model: "qwen-plus" },
          { provider: "deepseek", model: "deepseek-v4-pro" },
          { provider: "mock", model: "mock" },
        ],
      },
      extract_state_candidates: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        fallbacks: [{ provider: "mock", model: "mock" }],
      },
      rewrite_chapter: {
        provider: "wenxin",
        model: "ernie-5.1",
        fallbacks: [
          { provider: "deepseek", model: "deepseek-v4-flash" },
          { provider: "openai", model: "gpt-5.1" },
          { provider: "kimi", model: "kimi-k2.6" },
          { provider: "mock", model: "mock" },
        ],
      },
      dialogue_tuner: {
        provider: "doubao",
        model: "doubao-seed-1-6",
        fallbacks: [{ provider: "mock", model: "mock" }],
      },
      draft_writer: {
        provider: "kimi",
        model: "kimi-k2.6",
        fallbacks: [
          { provider: "deepseek", model: "deepseek-v4-flash" },
          { provider: "mock", model: "mock" },
        ],
      },
    };
    const config = await saveProjectConfig(project, {
      model: {
        provider: "auto",
        quality_mode: "premium",
        default_writer: "ernie-5.1",
        default_reviewer: "qwen3.6-plus",
        default_extractor: "deepseek-v4-flash",
        allow_network: true,
        fallback_enabled: true,
        task_routes: routes,
      },
    });
    console.log(`provider: ${config.model.provider}`);
    console.log(`fallback: ${config.model.fallback_enabled ? "enabled" : "disabled"}`);
    for (const [taskType, route] of Object.entries(config.model.task_routes || {})) {
      console.log(`${taskType}: ${route.provider}/${route.model}`);
    }
    return;
  }

  if (command === "openai-smoke") {
    const result = await runOpenAiSmoke(project, {
      allowNetwork: Boolean(args["allow-network"]),
      model: args.model || "gpt-5.1",
    });
    console.log(`status: ${result.status}`);
    console.log(`provider: ${result.provider}`);
    console.log(`model: ${result.model}`);
    console.log(`path: ${result.path}`);
    return;
  }

  if (command === "write-batch") {
    const from = parsePositiveInteger(args.from || 1, "from");
    const to = parsePositiveInteger(args.to || 5, "to");
    const result = await runBatch(project, { from, to });
    printBatchResult(result);
    return;
  }

  if (command === "resume-batch") {
    const from = parsePositiveInteger(args.from || 1, "from");
    const to = parsePositiveInteger(args.to || from + project.batch_size - 1, "to");
    const result = await resumeBatch(project, { from, to });
    printBatchResult(result);
    console.log(`resume-from: ${result.resume_from}`);
    console.log(`status: ${result.status}`);
    return;
  }

  if (command === "continue-batch") {
    const result = await continueBatch(project);
    printBatchResult(result);
    if (result.status !== "stopped") {
      console.log(`next-chapter: ${result.next_chapter}`);
    }
    return;
  }

  if (command === "run") {
    const untilChapter = parsePositiveInteger(
      args.until || project.current_chapter + project.batch_size - 1,
      "until",
    );
    if (untilChapter < project.current_chapter) {
      throw new Error(`until must be >= current_chapter: ${untilChapter}`);
    }
    const result = await runProject(project, { untilChapter, resume: Boolean(args.resume) });
    for (const batch of result.batches) {
      const resumed = batch.resumed ? ` resumed-from=${batch.resume_from}` : "";
      console.log(`batch ${batch.from}-${batch.to}: ${batch.status}${resumed}`);
      if (batch.batch_state_path) {
        console.log(`batch-state: ${batch.batch_state_path}`);
      }
    }
    if (result.status === "stopped") {
      console.log(`stopped chapter ${result.stop.chapter_no}: ${result.stop.grade} ${result.stop.reason}`);
    } else {
      console.log(`next-chapter: ${result.next_chapter}`);
    }
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(formatCliError(error));
  exit(1);
});
