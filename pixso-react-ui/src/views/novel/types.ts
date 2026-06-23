import type { JsonRecord } from "@/views/PixsoAppShell";

export type ProjectCard = {
  title?: string;
  path?: string;
  author_name?: string;
  cover_path?: string;
  cover_url?: string;
  cover_prompt?: string;
  current_chapter?: number;
  completed_chapters?: number;
  latest_completed_chapter?: number | null;
  latest_grade?: string | null;
  status?: string;
  updated_at?: string;
};

export type ProjectsPayload = {
  root?: string;
  projects?: ProjectCard[];
  empty_message?: string;
};

export type PublishGate = {
  status?: string;
  failure_type?: string;
  reviewer_status?: string;
  reviewer_message?: string;
  publish_ready?: boolean;
  label?: string;
  blockers?: string[];
  values?: JsonRecord;
  thresholds?: JsonRecord;
};

export type RewriteDelta = {
  before?: JsonRecord & {
    grade?: string | null;
    score?: number;
    publish_ready?: boolean;
    blocker_count?: number;
    blockers?: string[];
    word_count?: number;
  };
  after?: JsonRecord & {
    grade?: string | null;
    score?: number;
    publish_ready?: boolean;
    blocker_count?: number;
    blockers?: string[];
    word_count?: number;
  };
  score_delta?: number;
  word_count_delta?: number;
  blockers_removed?: number;
  blockers_added?: number;
  removed_blockers?: string[];
  added_blockers?: string[];
  word_count_collapsed?: boolean;
};

export type ChapterListItem = {
  chapter_no: number;
  title?: string;
  status?: string;
  is_mock?: boolean;
  word_count?: number;
  grade?: string | null;
  publish_gate?: PublishGate | null;
  publish_ready?: boolean;
  publish_status?: string;
  has_review?: boolean;
  is_next?: boolean;
};

export type ChapterContent = {
  status?: string;
  chapter_no?: number;
  title?: string;
  text?: string;
  word_count?: number;
  grade?: string | null;
  publish_gate?: PublishGate | null;
  publish_ready?: boolean;
  publish_status?: string;
  path?: string;
  stop?: JsonRecord | null;
  message?: string;
};

export type ChapterReview = {
  status?: string;
  grade?: string | null;
  scores?: Array<{ key?: string; label?: string; value?: number }>;
  issues?: string[];
  keep?: string[];
  remove?: string[];
  rewrite_direction?: string;
  next_action?: string;
  reviewer_status?: string;
  reviewer_message?: string;
  risky_segments?: Array<{ preview?: string; reasons?: string[]; risk_points?: number }>;
  publish_gate?: PublishGate | null;
  publish_ready?: boolean;
  publish_status?: string;
  message?: string;
};

export type EditorReport = {
  status?: string;
  final_grade?: string | null;
  publish_gate?: PublishGate | null;
  quality_metrics?: JsonRecord | null;
  publish_ready?: boolean;
  publish_status?: string;
  final_version?: string;
  rewrite_count?: number;
  rewrite_delta?: RewriteDelta | null;
  rewrite_deltas?: RewriteDelta[];
  repair_queue?: Array<{
    id?: string;
    issue?: string;
    key?: string;
    blocker_key?: string;
    priority?: number;
    label?: string;
    stage_label?: string;
    repair_type?: string;
    ui_color?: string;
    requires_rereview?: boolean;
    status?: string;
    missing_fields?: string[];
    missing_labels?: string[];
  }>;
  repair_rounds_this_run?: number;
  max_repair_rounds?: number;
  pipeline?: Array<{ key?: string; label?: string; status?: string; detail?: string }>;
  model_calls?: Array<{ task_type?: string; label?: string; provider?: string; model?: string; display_model?: string; cost_cny?: number; elapsed_ms?: number }>;
  auto_rules?: Array<{ key?: string; label?: string; ok?: boolean }>;
  memory_sync?: {
    status?: string;
    count?: number;
    characters?: JsonRecord[];
    foreshadowing_added?: JsonRecord[];
    foreshadowing_resolved?: JsonRecord[];
    timeline?: JsonRecord[];
    risks?: JsonRecord[];
    path?: string;
  };
  stop?: (JsonRecord & { reason?: string; blockers?: string[] }) | null;
  failure_summary?: {
    title?: string;
    reasons?: string[];
    metrics?: string[];
    rewrite_count?: number;
    repair_rounds_this_run?: number;
    max_repair_rounds?: number;
    next_action?: string;
  } | null;
  message?: string;
};

export type ProjectMemory = {
  status?: string;
  completed_chapters?: number;
  summary?: {
    characters?: number;
    foreshadowing_open?: number;
    timeline?: number;
    risks?: number;
    source_files?: number;
  };
  characters?: JsonRecord[];
  business_state?: JsonRecord[];
  foreshadowing_added?: JsonRecord[];
  foreshadowing_resolved?: JsonRecord[];
  timeline?: JsonRecord[];
  risks?: JsonRecord[];
  source_files?: string[];
};

export type TextArtifact = {
  status?: string;
  text?: string;
  message?: string;
  path?: string;
};

export type SelectedArtifact = {
  key?: string;
  label?: string;
  path?: string;
};

export type ProjectTreeItem = {
  key?: string;
  label?: string;
  status?: string;
  path?: string;
  count?: number;
  description?: string;
  children?: ProjectTreeItem[];
};

export type ProjectTreePayload = {
  status?: string;
  path?: string;
  branches?: ProjectTreeItem[];
  actions?: ProjectTreeItem[];
  tree?: JsonRecord | null;
};

export type TaskProgressDetail = {
  label?: string;
  status?: string;
  type?: string;
  task?: JsonRecord;
  progress?: {
    step?: string;
    chapter_no?: number;
    from?: number;
    to?: number;
    total_chapters?: number;
    completed_chapters?: number;
    text_delta?: string;
    text_preview?: string;
    draft_preview?: string;
    before_rewrite_preview?: string;
    after_rewrite_preview?: string;
    preview_text?: string;
    message?: string;
    model_event?: string;
    model_task_type?: string;
    model_stage?: string;
    model_provider?: string;
    model_name?: string;
    model_timeout_ms?: number;
    model_error?: string;
    fallback_next?: JsonRecord | null;
    card_title?: string;
    card_goal?: string;
    version?: string;
    grade?: string | null;
    word_count?: number;
    rewrite_count?: number;
    repair_rounds_this_run?: number;
    max_repair_rounds?: number;
    memory_count?: number;
    export_path?: string;
    state_candidates_path?: string;
    reason?: string;
    issues?: string[];
    repair_label?: string;
    repair_taxonomy?: {
      key?: string;
      label?: string;
      stage_label?: string;
      repair_type?: string;
      ui_color?: string;
      requires_rereview?: boolean;
    };
    repair_issues?: string[];
    repair_queue?: Array<{
      id?: string;
      issue?: string;
      key?: string;
      blocker_key?: string;
      priority?: number;
      label?: string;
      stage_label?: string;
      repair_type?: string;
      ui_color?: string;
      status?: string;
      missing_fields?: string[];
      missing_labels?: string[];
    }>;
    repair_missing_fields?: string[];
    repair_missing_labels?: string[];
    blockers?: string[];
    publish_status?: string;
    quality_events?: Array<{ key?: string; label?: string; status?: string; detail?: string }>;
    rewrite_delta?: RewriteDelta | null;
    global_review?: JsonRecord | null;
    global_reviews?: JsonRecord[];
    chapter_results?: Array<{
      chapter_no?: number;
      grade?: string | null;
      version?: string;
      word_count?: number;
      rewrite_count?: number;
      export_path?: string;
      status?: string;
    }>;
    latest_chapter?: {
      chapter_no?: number;
      grade?: string | null;
      version?: string;
      word_count?: number;
      rewrite_count?: number;
      export_path?: string;
      status?: string;
    } | null;
  };
};

export type GlobalReviewIssue = {
  chapter_no?: number | null;
  type?: string;
  severity?: string;
  issue?: string;
  fix?: string;
  status?: string;
};

export type GlobalReviewSummary = {
  status?: string;
  from?: number | null;
  to?: number | null;
  range?: { from?: number; to?: number };
  summary?: string;
  issue_count?: number;
  remaining_issue_count?: number;
  repair_status?: string;
  cross_chapter_issues?: GlobalReviewIssue[];
  final_cross_chapter_issues?: GlobalReviewIssue[];
  repair_queue?: Array<GlobalReviewIssue & { status?: string }>;
  repair_runs?: Array<JsonRecord>;
  rereview?: GlobalReviewSummary | null;
  path?: string;
};

export type GlobalReviewsPayload = {
  status?: string;
  latest?: GlobalReviewSummary | null;
  reviews?: GlobalReviewSummary[];
};

export type ExportState = {
  open: boolean;
  from: number;
  to: number;
  format: "merged" | "single" | "docx";
  path?: string;
  destination?: string;
};

export type BookPlatform = "fanqie" | "qidian" | "17k";
export type WorkbenchLeftTab = "chapters" | "tree" | "card" | "memory";
export type WorkbenchArtifactView = "manuscript" | "planning" | "card" | "quality" | "memory" | "publish";

export type NewBookRow = {
  title: string;
  idea: string;
  platform: BookPlatform;
  genre: string;
  subgenre: string;
  targetWords?: number;
  authorName?: string;
  coverPath?: string;
  coverUrl?: string;
  coverPrompt?: string;
  goldenFinger?: string;
  protagonistName?: string;
  supportingCharacters?: string;
  candidates?: string[];
  source?: string;
  suggesting?: boolean;
};
