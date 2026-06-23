import path from "node:path";
import { padChapter } from "./fsx.mjs";

const DIRS = {
  cards: "章卡",
  drafts: "正文",
  reviews: "审稿",
  state: "状态",
  exports: "导出",
  publish: "发布包",
  video: "视频素材包",
  tasks: "任务",
  reports: "reports",
  asciiTasks: "tasks",
};

export function slug(value, maxLength = 80) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, maxLength);
}

export function projectSlug(title) {
  return slug(title, 80);
}

export function safeFileName(value) {
  return slug(value, 100);
}

export function projectDir(root, title) {
  return path.join(root, projectSlug(title));
}

export function projectFile(project) {
  return path.join(project.path, "project.json");
}

export function projectConfigFile(project) {
  return path.join(project.path, "config.json");
}

export function chapterCardFile(project, chapterNo) {
  return path.join(project.path, DIRS.cards, `第${padChapter(chapterNo)}章.json`);
}

export function draftFile(project, chapterNo, version = "v1") {
  return path.join(project.path, DIRS.drafts, `第${padChapter(chapterNo)}章_${version}.txt`);
}

export function reviewFile(project, chapterNo) {
  return path.join(project.path, DIRS.reviews, `第${padChapter(chapterNo)}章_review.json`);
}

export function stateCandidatesFile(project, chapterNo) {
  return path.join(project.path, DIRS.state, `第${padChapter(chapterNo)}章_state_candidates.json`);
}

export function batchStateFile(project, from, to) {
  return path.join(project.path, DIRS.state, `第${padChapter(from)}-${padChapter(to)}章_batch_state.json`);
}

export function taskPackageFile(project, chapterNo) {
  return path.join(project.path, DIRS.tasks, `第${padChapter(chapterNo)}章_task_package.json`);
}

export function taskCheckpointFile(project, from, to) {
  return path.join(project.path, DIRS.tasks, `第${padChapter(from)}-${padChapter(to)}章_checkpoint.json`);
}

export function runReportFile(project) {
  return path.join(project.path, DIRS.tasks, "run_report.json");
}

export function modelCallsFile(project) {
  return path.join(project.path, DIRS.tasks, "model_calls.jsonl");
}

export function openAiSmokeFile(project) {
  return path.join(project.path, DIRS.tasks, "openai_smoke.json");
}

export function qualityReportFile(project, chapterNo) {
  return path.join(project.path, DIRS.reports, `chapter_${padChapter(chapterNo)}_quality_report.json`);
}

export function premiumReadinessReportFile(project, from, to) {
  return path.join(project.path, DIRS.reports, `premium_readiness_${padChapter(from)}-${padChapter(to)}.json`);
}

export function premiumGateReportFile(project, from, to) {
  return path.join(project.path, DIRS.reports, `premium_gate_${padChapter(from)}-${padChapter(to)}.json`);
}

export function globalReviewFile(project, from, to) {
  return path.join(project.path, DIRS.reports, `global_review_${padChapter(from)}-${padChapter(to)}.json`);
}

export function singleChapterPreflightFile(project, chapterNo) {
  return path.join(project.path, DIRS.reports, `chapter_${padChapter(chapterNo)}_preflight.json`);
}

export function mergedExportFile(project, from, to) {
  return path.join(project.path, DIRS.exports, `${safeFileName(project.title)}_${padChapter(from)}-${padChapter(to)}_merged.txt`);
}

export function modelCompareFile(project, chapterNo) {
  return path.join(project.path, DIRS.reports, `chapter_${padChapter(chapterNo)}_model_compare.json`);
}

export function aiRewritePlanFile(project, chapterNo) {
  return path.join(project.path, DIRS.reports, `chapter_${padChapter(chapterNo)}_ai_rewrite_plan.json`);
}

export function chapterQualityCheckpointFile(project, chapterNo) {
  return path.join(project.path, DIRS.asciiTasks, `chapter_${padChapter(chapterNo)}_quality_checkpoint.json`);
}

export function memoryIndexFile(project) {
  return path.join(project.path, DIRS.asciiTasks, "memory_index.json");
}

export function referenceStructureFile(project, name) {
  return path.join(project.path, DIRS.asciiTasks, `reference_${safeFileName(name)}_structure.json`);
}

export function referenceLibraryFile(project) {
  return path.join(project.path, DIRS.asciiTasks, "reference_library.json");
}

export function rhythmTransferPlanFile(project, name) {
  return path.join(project.path, DIRS.asciiTasks, `rhythm_transfer_${safeFileName(name)}.json`);
}

export function referenceReadPlanFile(project, name) {
  return path.join(project.path, DIRS.asciiTasks, `reference_read_${safeFileName(name || "reference")}_plan.json`);
}

export function referenceReadAuditFile(project, name) {
  return path.join(project.path, DIRS.asciiTasks, `reference_read_${safeFileName(name || "reference")}_audit.json`);
}

export function domainKnowledgePlanFile(project) {
  return path.join(project.path, DIRS.asciiTasks, "domain_knowledge_plan.json");
}

export function domainKnowledgeBaseFile(project) {
  return path.join(project.path, DIRS.asciiTasks, "domain_knowledge.json");
}

export function domainKnowledgeSourceCandidatesFile(project) {
  return path.join(project.path, DIRS.asciiTasks, "domain_knowledge_sources.json");
}

export function domainKnowledgeSourceAuditFile(project) {
  return path.join(project.path, DIRS.asciiTasks, "domain_knowledge_source_audit.json");
}

export function domainKnowledgeBuildPlanFile(project) {
  return path.join(project.path, DIRS.asciiTasks, "domain_knowledge_build_plan.json");
}

export function portfolioFile(rootOrProject) {
  const root = typeof rootOrProject === "string" ? rootOrProject : rootOrProject.path;
  return path.join(root, "portfolio.json");
}

export function portfolioRunReportFile(rootOrProject) {
  const root = typeof rootOrProject === "string" ? rootOrProject : rootOrProject.path;
  return path.join(root, "portfolio_run_report.json");
}

export function premiumIncubationReportFile(rootOrProject) {
  const root = typeof rootOrProject === "string" ? rootOrProject : rootOrProject.path;
  return path.join(root, "premium_incubation_report.json");
}

export function premiumRepairSweepReportFile(rootOrProject) {
  const root = typeof rootOrProject === "string" ? rootOrProject : rootOrProject.path;
  return path.join(root, "premium_repair_sweep_report.json");
}

export function dynamicTemplateLibraryFile(rootOrProject) {
  const root = typeof rootOrProject === "string" ? rootOrProject : rootOrProject.path;
  return path.join(root, "dynamic_template_library.json");
}

export function publicReferenceLibraryFile(rootOrProject) {
  const root = typeof rootOrProject === "string" ? rootOrProject : rootOrProject.path;
  return path.join(root, "public_reference_library.json");
}

export function publicReferenceReadPlanFile(rootOrProject) {
  const root = typeof rootOrProject === "string" ? rootOrProject : rootOrProject.path;
  return path.join(root, "public_reference_read_plan.json");
}

export function readerSimulationFile(project, chapterNo) {
  return path.join(project.path, DIRS.reports, `chapter_${padChapter(chapterNo)}_reader_simulation.json`);
}

export function webStatusFile(project) {
  return path.join(project.path, DIRS.asciiTasks, "web_status.json");
}

export function qualityMetricRegistryFile(project) {
  return path.join(project.path, DIRS.asciiTasks, "quality_metric_registry.json");
}

export function qualityMetricObservationsFile(project) {
  return path.join(project.path, DIRS.asciiTasks, "quality_metric_observations.jsonl");
}

export function serverTaskFile(project, taskId) {
  return path.join(project.path, DIRS.asciiTasks, `${safeFileName(taskId)}.json`);
}

export function exportFile(project, chapterNo) {
  return path.join(project.path, DIRS.exports, `${safeFileName(project.title)}_第${padChapter(chapterNo)}章.txt`);
}

export function publishPackageDir(project, platform = project.platform || "platform") {
  return path.join(project.path, DIRS.publish, safeFileName(platform || "platform"));
}

export function publishManifestFile(project, platform = project.platform || "platform") {
  return path.join(publishPackageDir(project, platform), "manifest.json");
}

export function publishMetadataFile(project, platform = project.platform || "platform") {
  return path.join(publishPackageDir(project, platform), "metadata.json");
}

export function publishChaptersFile(project, platform = project.platform || "platform", from = 1, to = from) {
  return path.join(publishPackageDir(project, platform), `chapters_${padChapter(from)}-${padChapter(to)}.txt`);
}

export function publishSubmissionFile(project, platform = project.platform || "platform") {
  return path.join(publishPackageDir(project, platform), "submission_payload.json");
}

export function publishBrowserHandoffFile(project, platform = project.platform || "platform") {
  return path.join(publishPackageDir(project, platform), "browser_handoff.json");
}

export function publishBrowserRunReportFile(project, platform = project.platform || "platform") {
  return path.join(publishPackageDir(project, platform), "browser_publish_report.json");
}

export function publishSelectorCalibrationFile(project, platform = project.platform || "platform") {
  return path.join(publishPackageDir(project, platform), "calibrated_selectors.json");
}

export function publishAttemptLogFile(project) {
  return path.join(project.path, DIRS.publish, "publish_attempts.jsonl");
}

export function videoPackDir(project) {
  return path.join(project.path, DIRS.video);
}

export function videoCharacterRefsFile(project) {
  return path.join(videoPackDir(project), "01_character_refs.json");
}

export function videoSceneRefsFile(project) {
  return path.join(videoPackDir(project), "02_scene_refs.json");
}

export function videoChapterScreenplayFile(project, chapterNo, format = "json") {
  const ext = format === "fountain" ? "fountain" : "json";
  return path.join(videoPackDir(project), "03_screenplays", `chapter_${padChapter(chapterNo)}_screenplay.${ext}`);
}

export function videoChapterStoryboardFile(project, chapterNo) {
  return path.join(videoPackDir(project), "04_storyboards", `chapter_${padChapter(chapterNo)}_storyboard.json`);
}

export function videoChapterPromptFile(project, chapterNo, tool = "jimeng") {
  return path.join(videoPackDir(project), "05_video_prompts", `chapter_${padChapter(chapterNo)}_${safeFileName(tool)}_prompts.txt`);
}

export function videoManifestFile(project) {
  return path.join(videoPackDir(project), "00_manifest.json");
}
