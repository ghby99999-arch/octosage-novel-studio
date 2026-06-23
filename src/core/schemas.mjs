const CHAPTER_CARD_REQUIRED = [
  "chapter_no",
  "display_title",
  "opening_hook",
  "main_event",
  "protagonist_action",
  "conflict",
  "cool_point_type",
  "visible_result",
  "tail_hook",
  "characters_in_scene",
  "character_anchors",
  "facts_required",
  "forbidden_items",
];

const REVIEW_GRADES = new Set(["A", "B", "C", "D", "E"]);

const PROJECT_REQUIRED = [
  "title",
  "platform",
  "channel",
  "genre",
  "target_words",
  "batch_size",
  "current_chapter",
  "canon_version",
  "status",
  "path",
];

function missingFields(value, requiredFields) {
  return requiredFields.filter((field) => {
    const fieldValue = value?.[field];
    if (Array.isArray(fieldValue)) return fieldValue.length === 0;
    return fieldValue === undefined || fieldValue === null || fieldValue === "";
  });
}

function characterName(character) {
  if (typeof character === "string") return character;
  return character?.name || "";
}

function characterRole(character) {
  if (typeof character === "string") return "scene participant";
  return character?.role || "scene participant";
}

function characterAnchorText(character) {
  if (typeof character === "string") return "";
  return character?.anchor || "";
}

function normalizeCharactersInScene(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value
      .split(/[、,，;；\n]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (value && typeof value === "object") {
    return Object.values(value)
      .map((item) => (typeof item === "string" ? item.trim() : item))
      .filter(Boolean);
  }
  return [];
}

function fallbackCharacterAnchor(character, index) {
  const name = characterName(character) || `character-${index + 1}`;
  const role = characterRole(character);
  const existingAnchor = characterAnchorText(character);
  const surface = existingAnchor ? role : "scene participant";
  const core = existingAnchor || "acts under pressure instead of staying as a label";
  return {
    name,
    surface,
    core,
    anchor: `${surface} but ${core}`,
    signature_action: `${name} shows the anchor through a visible action.`,
    signature_line: `${name} speaks in a way only this role would say.`,
    first_appearance_chapter: null,
  };
}

function normalizeCharacterAnchor(anchor, fallbackCharacter, index) {
  const fallback = fallbackCharacterAnchor(fallbackCharacter, index);
  if (!anchor || typeof anchor !== "object") return fallback;
  const name = anchor.name || fallback.name;
  const surface = anchor.surface || anchor.role || fallback.surface;
  let core = anchor.core || anchor.inner || anchor.contradiction || anchor.anchor || fallback.core;
  if (surface && core && surface === core) {
    core = fallback.core;
  }
  return {
    name,
    surface,
    core,
    anchor: anchor.anchor && anchor.anchor !== surface
      ? anchor.anchor
      : `${surface} but ${core}`,
    signature_action: anchor.signature_action || `${name} shows the anchor through a visible action.`,
    signature_line: anchor.signature_line || `${name} speaks in a way only this role would say.`,
    first_appearance_chapter: anchor.first_appearance_chapter ?? null,
  };
}

export function completeChapterCardCharacterAnchors(value) {
  if (!value || typeof value !== "object") return value;
  const characters = normalizeCharactersInScene(value.characters_in_scene);
  const anchors = Array.isArray(value.character_anchors) ? value.character_anchors : [];
  const source = anchors.length ? anchors : characters;
  return {
    ...value,
    characters_in_scene: characters,
    character_anchors: source.map((anchor, index) =>
      normalizeCharacterAnchor(anchor, characters[index] || anchor, index),
    ),
  };
}

export function validateChapterCard(value) {
  const errors = [];
  if (!value || typeof value !== "object") {
    return { ok: false, errors: ["chapter_card must be an object"] };
  }
  const missing = missingFields(value, CHAPTER_CARD_REQUIRED);
  errors.push(...missing.map((field) => `missing required field: ${field}`));
  if (value.chapter_no !== undefined && !Number.isInteger(value.chapter_no)) {
    errors.push("chapter_no must be an integer");
  }
  if (Array.isArray(value.character_anchors)) {
    for (const anchor of value.character_anchors) {
      if (!anchor || typeof anchor !== "object") {
        errors.push("character_anchors must contain objects");
        continue;
      }
      for (const field of ["name", "surface", "core", "anchor", "signature_action", "signature_line"]) {
        if (!anchor[field]) errors.push(`character_anchors missing required field: ${field}`);
      }
      if (anchor.surface && anchor.core && anchor.surface === anchor.core) {
        errors.push("character_anchors must include a surface/core contradiction");
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export function assertChapterCard(value) {
  const normalized = completeChapterCardCharacterAnchors(value);
  const result = validateChapterCard(normalized);
  if (!result.ok) {
    throw new Error(`Invalid chapter card:\n${result.errors.join("\n")}`);
  }
  return normalized;
}

export function validateReview(value) {
  const errors = [];
  if (!value || typeof value !== "object") {
    return { ok: false, errors: ["review must be an object"] };
  }
  if (!REVIEW_GRADES.has(value.grade)) {
    errors.push("grade must be one of A/B/C/D/E");
  }
  if (!value.next_action) {
    errors.push("missing required field: next_action");
  }
  return { ok: errors.length === 0, errors };
}

export function assertReview(value) {
  const result = validateReview(value);
  if (!result.ok) {
    throw new Error(`Invalid review:\n${result.errors.join("\n")}`);
  }
  return value;
}

export function validateProject(value) {
  const errors = [];
  if (!value || typeof value !== "object") {
    return { ok: false, errors: ["project must be an object"] };
  }
  const missing = missingFields(value, PROJECT_REQUIRED);
  errors.push(...missing.map((field) => `missing required field: ${field}`));
  for (const field of ["target_words", "batch_size", "current_chapter"]) {
    if (value[field] !== undefined && !Number.isInteger(value[field])) {
      errors.push(`${field} must be an integer`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function assertProject(value) {
  const result = validateProject(value);
  if (!result.ok) {
    throw new Error(`Invalid project:\n${result.errors.join("\n")}`);
  }
  return value;
}

export function validateDraft(value) {
  const errors = [];
  if (!value || typeof value !== "object") {
    return { ok: false, errors: ["draft must be an object"] };
  }
  for (const field of ["chapter_no", "version", "text", "path"]) {
    if (value[field] === undefined || value[field] === null || value[field] === "") {
      errors.push(`missing required field: ${field}`);
    }
  }
  if (value.chapter_no !== undefined && !Number.isInteger(value.chapter_no)) {
    errors.push("chapter_no must be an integer");
  }
  if (value.version !== undefined && !/^v\d+$/.test(value.version)) {
    errors.push("version must look like v1");
  }
  return { ok: errors.length === 0, errors };
}

export function validateStateCandidates(value) {
  const errors = [];
  if (!value || typeof value !== "object") {
    return { ok: false, errors: ["state candidates must be an object"] };
  }
  if (!value.meta || !Number.isInteger(value.meta.source_chapter)) {
    errors.push("meta.source_chapter must be an integer");
  }
  for (const field of [
    "characters",
    "relationships",
    "business_state",
    "money_orders",
    "foreshadowing_added",
    "foreshadowing_resolved",
    "timeline",
    "risks",
    "character_voice_samples",
  ]) {
    if (!Array.isArray(value[field])) {
      errors.push(`${field} must be an array`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function withDefaultArrayFields(value, fields) {
  if (!value || typeof value !== "object") return value;
  const next = { ...value };
  for (const field of fields) {
    if (next[field] === undefined) next[field] = [];
  }
  return next;
}

export function assertStateCandidates(value) {
  const normalized = withDefaultArrayFields(value, ["character_voice_samples"]);
  const result = validateStateCandidates(normalized);
  if (!result.ok) {
    throw new Error(`Invalid state candidates:\n${result.errors.join("\n")}`);
  }
  return normalized;
}

export function validateBatchState(value) {
  const errors = [];
  if (!value || typeof value !== "object") {
    return { ok: false, errors: ["batch state must be an object"] };
  }
  if (!value.meta || !Number.isInteger(value.meta.from) || !Number.isInteger(value.meta.to)) {
    errors.push("meta.from and meta.to must be integers");
  }
  if (!Array.isArray(value.meta?.source_files)) {
    errors.push("meta.source_files must be an array");
  }
  for (const field of [
    "characters",
    "relationships",
    "business_state",
    "money_orders",
    "foreshadowing_added",
    "foreshadowing_resolved",
    "timeline",
    "risks",
    "character_voice_samples",
    "low_confidence_candidates",
  ]) {
    if (!Array.isArray(value[field])) {
      errors.push(`${field} must be an array`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function assertBatchState(value) {
  const normalized = withDefaultArrayFields(value, ["character_voice_samples"]);
  const result = validateBatchState(normalized);
  if (!result.ok) {
    throw new Error(`Invalid batch state:\n${result.errors.join("\n")}`);
  }
  return normalized;
}

export function validateWritingTaskPackage(value) {
  const errors = [];
  if (!value || typeof value !== "object") {
    return { ok: false, errors: ["writing task package must be an object"] };
  }
  if (!Number.isInteger(value.chapter_no)) {
    errors.push("chapter_no must be an integer");
  }
  if (!value.chapter_card || typeof value.chapter_card !== "object") {
    errors.push("chapter_card must be an object");
  }
  if (!value.context || typeof value.context !== "object") {
    errors.push("context must be an object");
  }
  if (!Array.isArray(value.hard_rules)) {
    errors.push("hard_rules must be an array");
  }
  if (!value.output || typeof value.output !== "object") {
    errors.push("output must be an object");
  }
  return { ok: errors.length === 0, errors };
}

export function assertWritingTaskPackage(value) {
  const result = validateWritingTaskPackage(value);
  if (!result.ok) {
    throw new Error(`Invalid writing task package:\n${result.errors.join("\n")}`);
  }
  return value;
}

export function validateTaskCheckpoint(value) {
  const errors = [];
  if (!value || typeof value !== "object") {
    return { ok: false, errors: ["task checkpoint must be an object"] };
  }
  if (!value.task_id) {
    errors.push("missing required field: task_id");
  }
  if (!["running", "completed", "stopped", "failed"].includes(value.status)) {
    errors.push("status must be running/completed/stopped/failed");
  }
  if (!Number.isInteger(value.from) || !Number.isInteger(value.to)) {
    errors.push("from and to must be integers");
  }
  if (!Number.isInteger(value.current_chapter)) {
    errors.push("current_chapter must be an integer");
  }
  if (!value.last_step) {
    errors.push("missing required field: last_step");
  }
  if (!Array.isArray(value.completed_chapters)) {
    errors.push("completed_chapters must be an array");
  }
  return { ok: errors.length === 0, errors };
}

export function assertTaskCheckpoint(value) {
  const result = validateTaskCheckpoint(value);
  if (!result.ok) {
    throw new Error(`Invalid task checkpoint:\n${result.errors.join("\n")}`);
  }
  return value;
}

export function validateRunReport(value) {
  const errors = [];
  if (!value || typeof value !== "object") {
    return { ok: false, errors: ["run report must be an object"] };
  }
  if (!["completed", "stopped", "already_reached"].includes(value.status)) {
    errors.push("status must be completed/stopped/already_reached");
  }
  if (!value.project_title) {
    errors.push("missing required field: project_title");
  }
  if (!Number.isInteger(value.until_chapter)) {
    errors.push("until_chapter must be an integer");
  }
  if (!Number.isInteger(value.next_chapter)) {
    errors.push("next_chapter must be an integer");
  }
  if (!Array.isArray(value.batches)) {
    errors.push("batches must be an array");
  }
  if (!Array.isArray(value.completed_chapters)) {
    errors.push("completed_chapters must be an array");
  }
  if (!Array.isArray(value.repaired)) {
    errors.push("repaired must be an array");
  }
  if (!value.next_action) {
    errors.push("missing required field: next_action");
  }
  return { ok: errors.length === 0, errors };
}

export function assertRunReport(value) {
  const result = validateRunReport(value);
  if (!result.ok) {
    throw new Error(`Invalid run report:\n${result.errors.join("\n")}`);
  }
  return value;
}

export function validateProjectConfig(value) {
  const errors = [];
  if (!value || typeof value !== "object") {
    return { ok: false, errors: ["project config must be an object"] };
  }
  if (!value.model || typeof value.model !== "object") {
    errors.push("model must be an object");
  }
  if (!value.model?.provider) {
    errors.push("missing required field: model.provider");
  }
  if (!value.model?.quality_mode) {
    errors.push("missing required field: model.quality_mode");
  }
  if (!value.model?.default_writer) {
    errors.push("missing required field: model.default_writer");
  }
  if (
    value.model?.allow_network !== undefined &&
    typeof value.model.allow_network !== "boolean"
  ) {
    errors.push("model.allow_network must be a boolean");
  }
  if (!value.budget || typeof value.budget !== "object") {
    errors.push("budget must be an object");
  }
  if (!Number.isFinite(value.budget?.monthly_limit_cny)) {
    errors.push("budget.monthly_limit_cny must be a number");
  }
  if (!value.privacy || typeof value.privacy !== "object") {
    errors.push("privacy must be an object");
  }
  if (typeof value.privacy?.store_api_keys !== "boolean") {
    errors.push("privacy.store_api_keys must be a boolean");
  }
  return { ok: errors.length === 0, errors };
}

export function assertProjectConfig(value) {
  const result = validateProjectConfig(value);
  if (!result.ok) {
    throw new Error(`Invalid project config:\n${result.errors.join("\n")}`);
  }
  return value;
}
