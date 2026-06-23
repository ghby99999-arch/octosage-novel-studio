import { OctoButton as Button, OctoCommandInput, OctoPanel as Card } from "@/components/octo-ui";
import { Field } from "@/components/ui/Field";
import { StatusPill } from "@/components/ui/StatusPill";
import type { ReactNode } from "react";
import type { BookPlatform, NewBookRow } from "@/views/novel/types";

type WordPreset = {
  label: string;
  value: number;
};

export const WordTargetControl = ({
  value,
  presets,
  onChange,
}: {
  value: number;
  presets: WordPreset[];
  onChange: (value: number) => void;
}) => (
  <Field label="本书目标字数" hint="目标字数会影响全书卷纲、分卷承载和每 30 章滚动细纲。">
    <div className="octo-word-target-control">
      <input
        type="number"
        min={50000}
        step={50000}
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || 2000000)}
      />
      <div className="octo-word-presets">
        {presets.map((preset) => (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={value === preset.value ? "active" : ""}
            key={preset.value}
            onClick={() => onChange(preset.value)}
          >
            {preset.label}
          </Button>
        ))}
      </div>
    </div>
  </Field>
);

export const WorkspacePathPicker = ({
  label = "保存位置",
  hint,
  value,
  onChange,
  onBlur,
  onChoose,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  onChoose: () => void;
}) => (
  <Field as="div" label={label} hint={hint}>
    <div className="octo-path-picker">
      <div className="octo-path-card">
        <strong>当前工作区</strong>
        <OctoCommandInput
          value={value}
          inputLabel="保存位置"
          actionLabel="选择"
          onValueChange={onChange}
          onInputBlur={onBlur}
          onSubmit={(event) => {
            event.preventDefault();
            onChoose();
          }}
        />
      </div>
    </div>
  </Field>
);

export const IdeaActionRow = ({
  loading,
  onSuggest,
}: {
  loading: boolean;
  onSuggest: () => void;
}) => (
  <div className="octo-idea-action-row">
    <Button variant="secondary" onClick={onSuggest} disabled={loading}>
      {loading ? "正在生成创意..." : "AI 生成高质量创意"}
    </Button>
    <span>没有方向时先点这里。系统会按平台、题材和目标字数随机生成可开书方案。</span>
  </div>
);

export const CandidateButtonList = ({
  items,
  selected,
  empty,
  source,
  loading,
  actionLabel,
  actionDisabled,
  compact,
  onSelect,
  onAction,
}: {
  items: string[];
  selected?: string;
  empty: ReactNode;
  source?: ReactNode;
  loading?: boolean;
  actionLabel?: ReactNode;
  actionDisabled?: boolean;
  compact?: boolean;
  onSelect: (value: string) => void;
  onAction?: () => void;
}) => (
  <div className={compact ? "octo-candidate-box compact" : "octo-candidate-box"}>
    <div className="octo-candidate-list carded">
      {items.length ? items.map((item, index) => (
        <Button
          key={`${item.slice(0, 24)}-${index}`}
          className={selected === item ? "active" : ""}
          variant="secondary"
          onClick={() => onSelect(item)}
        >
          <b>{String(index + 1).padStart(2, "0")}</b>
          {item}
        </Button>
      )) : <em>{empty}</em>}
    </div>
    {(onAction || source) ? (
      <div className="octo-candidate-meta">
        {source ? <small>{loading ? "正在调用模型..." : source}</small> : <span />}
        {onAction ? (
          <Button variant="ghost" size="sm" onClick={onAction} disabled={Boolean(actionDisabled)}>
            {loading ? "生成中..." : actionLabel}
          </Button>
        ) : null}
      </div>
    ) : null}
  </div>
);

export const OpeningSummaryStrip = ({
  platform,
  genre,
  subgenre,
  targetWords,
  ruleLabel,
  rules,
  assets,
}: {
  platform: ReactNode;
  genre: string;
  subgenre: string;
  targetWords: number;
  ruleLabel: ReactNode;
  rules: readonly string[];
  assets: string[];
}) => (
  <div className="octo-opening-summary-strip">
    <div>
      <strong>{ruleLabel}</strong>
      <span>{rules.slice(0, 2).join(" · ")}</span>
    </div>
    <div className="octo-book-specs">
      <StatusPill>{platform}</StatusPill>
      <StatusPill>{genre}/{subgenre}</StatusPill>
      <StatusPill>{targetWords.toLocaleString("zh-CN")}字</StatusPill>
      <StatusPill>约 {Math.max(30, Math.ceil(targetWords / 2600)).toLocaleString("zh-CN")} 章</StatusPill>
    </div>
    <div className="octo-output-list compact">
      {assets.slice(0, 4).map((item) => <StatusPill tone="success" key={item}>{item}</StatusPill>)}
    </div>
  </div>
);

export const GenrePlatformFields = ({
  platform,
  genre,
  subgenre,
  platformOptions,
  genreOptions,
  tagOptions,
  onPlatformChange,
  onGenreChange,
  onSubgenreChange,
}: {
  platform: BookPlatform;
  genre: string;
  subgenre: string;
  platformOptions: readonly { value: BookPlatform; label: string }[];
  genreOptions: string[];
  tagOptions: string[];
  onPlatformChange: (value: BookPlatform) => void;
  onGenreChange: (value: string) => void;
  onSubgenreChange: (value: string) => void;
}) => (
  <div className="octo-opening-core-grid">
    <Field label="意向平台">
      <select value={platform} onChange={(event) => onPlatformChange(event.target.value as BookPlatform)}>
        {platformOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
      </select>
    </Field>
    <Field label="类型">
      <select value={genre} onChange={(event) => onGenreChange(event.target.value)}>
        {genreOptions.map((item) => <option value={item} key={item}>{item}</option>)}
      </select>
    </Field>
    <Field label="标签">
      <select value={subgenre} onChange={(event) => onSubgenreChange(event.target.value)}>
        {tagOptions.map((item) => <option value={item} key={item}>{item}</option>)}
      </select>
    </Field>
  </div>
);

export const CharacterFields = ({
  protagonistName,
  supportingCharacters,
  onProtagonistChange,
  onSupportingChange,
}: {
  protagonistName: string;
  supportingCharacters: string;
  onProtagonistChange: (value: string) => void;
  onSupportingChange: (value: string) => void;
}) => (
  <div className="octo-advanced-grid">
    <Field label="主角名" hint="不填写则由系统自动生成。">
      <input value={protagonistName} onChange={(event) => onProtagonistChange(event.target.value)} placeholder="例如：陈知远" />
    </Field>
    <Field label="配角名" hint="顿号或逗号分隔，可留空。">
      <input value={supportingCharacters} onChange={(event) => onSupportingChange(event.target.value)} placeholder="例如：苏晴、周立、秦老板" />
    </Field>
  </div>
);

export const GoldenFingerField = ({
  value,
  onChange,
  suggestions = [],
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions?: string[];
}) => (
  <Field
    as="div"
    label="金手指/核心优势"
    hint="会写入项目圣经、人物逻辑、细纲、章卡和正文约束。留空时系统按创意和题材自动生成。"
  >
    <div className="octo-golden-finger-widget">
      <div className="octo-golden-input">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="例如：未来节点记忆 + 账册推演；也可以留空自动生成"
        />
        {value ? (
          <Button variant="ghost" size="sm" onClick={() => onChange("")}>留空自动生成</Button>
        ) : (
          <span>未填写时，章鱼会生成一个有限制、有代价、能通过行动展示的核心优势。</span>
        )}
      </div>
      {suggestions.length ? (
        <div className="octo-golden-suggestions">
          {suggestions.map((item) => (
            <Button type="button" size="sm" variant="ghost" key={item} className={value === item ? "active" : ""} onClick={() => onChange(item)}>
              {item}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="octo-golden-flow">
        <span>项目设定</span>
        <span>人物能力</span>
        <span>章节细纲</span>
        <span>正文门禁</span>
      </div>
    </div>
  </Field>
);

export const MultiBookCard = ({
  index,
  row,
  platformLabel,
  platformOptions,
  genreOptions,
  tagOptions,
  ruleLabel,
  ruleSummary,
  goldenSuggestions,
  onChange,
  onGenerateTitle,
}: {
  index: number;
  row: NewBookRow;
  platformLabel: string;
  platformOptions: readonly { value: BookPlatform; label: string }[];
  genreOptions: string[];
  tagOptions: string[];
  ruleLabel: string;
  ruleSummary: string;
  goldenSuggestions?: string[];
  onChange: (patch: Partial<NewBookRow>) => void;
  onGenerateTitle: () => void;
}) => (
  <Card
    className="octo-multi-card"
    title={`作品 ${index + 1}`}
    description={`${platformLabel} · ${row.genre}/${row.subgenre} · ${(row.targetWords || 2000000).toLocaleString("zh-CN")}字`}
    actions={(
      <Button size="sm" onClick={onGenerateTitle} disabled={row.suggesting || !row.idea.trim()}>
        {row.suggesting ? "生成中" : "生成书名"}
      </Button>
    )}
  >
    <Field label="书名">
      <input value={row.title} onChange={(event) => onChange({ title: event.target.value })} placeholder={`第 ${index + 1} 本书名`} />
    </Field>
    <Field label="创意">
      <textarea value={row.idea} onChange={(event) => onChange({ idea: event.target.value })} placeholder="这本书的一句话方向" />
    </Field>
    <GoldenFingerField
      value={row.goldenFinger || ""}
      onChange={(value) => onChange({ goldenFinger: value })}
      suggestions={goldenSuggestions}
    />
    <div className="octo-compact-grid three">
      <Field label="平台">
        <select value={row.platform} onChange={(event) => onChange({ platform: event.target.value as BookPlatform })}>
          {platformOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
        </select>
      </Field>
      <Field label="类型">
        <select value={row.genre} onChange={(event) => onChange({ genre: event.target.value })}>
          {genreOptions.map((item) => <option value={item} key={item}>{item}</option>)}
        </select>
      </Field>
      <Field label="标签">
        <select value={row.subgenre} onChange={(event) => onChange({ subgenre: event.target.value })}>
          {tagOptions.map((item) => <option value={item} key={item}>{item}</option>)}
        </select>
      </Field>
    </div>
    <div className="octo-row-rule-note">
      <b>{ruleLabel}</b>
      <span>{ruleSummary}</span>
    </div>
    <div className="octo-compact-grid three">
      <Field label="字数">
        <input
          type="number"
          min={50000}
          step={50000}
          value={row.targetWords || 2000000}
          onChange={(event) => onChange({ targetWords: Number(event.target.value) || 2000000 })}
        />
      </Field>
      <Field label="主角">
        <input value={row.protagonistName || ""} onChange={(event) => onChange({ protagonistName: event.target.value })} placeholder="可空" />
      </Field>
      <Field label="配角">
        <input value={row.supportingCharacters || ""} onChange={(event) => onChange({ supportingCharacters: event.target.value })} placeholder="可空" />
      </Field>
    </div>
    {row.candidates?.length ? (
      <CandidateButtonList
        compact
        items={row.candidates}
        selected={row.title}
        empty="输入创意后生成候选。"
        source={row.source || "本地规则"}
        onSelect={(candidate) => onChange({ title: candidate })}
      />
    ) : row.source ? <em className="octo-multi-candidates">{row.source}</em> : null}
  </Card>
);
