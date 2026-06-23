import { OctoButton as Button } from "@/components/octo-ui";
import { Field } from "@/components/ui/Field";
import { useGsapPulse, useGsapReveal } from "@/components/ui/useGsapMotion";

export type CoverResult = {
  cover_path?: string;
  cover_url?: string;
  prompt?: string;
  source?: string;
};

export const BookCoverDesigner = ({
  title,
  authorName,
  coverUrl,
  coverPrompt,
  generating,
  disabled,
  onAuthorChange,
  onGenerate,
}: {
  title: string;
  authorName: string;
  coverUrl?: string;
  coverPrompt?: string;
  generating?: boolean;
  disabled?: boolean;
  onAuthorChange: (value: string) => void;
  onGenerate: () => void;
}) => {
  const panelRef = useGsapReveal<HTMLDivElement>(0.04);
  const coverRef = useGsapPulse<HTMLDivElement>(coverUrl || generating);
  const cleanTitle = title.trim() || "等待书名";
  const cleanAuthor = authorName.trim() || "章鱼作者";

  return (
    <div ref={panelRef} className="octo-cover-designer">
      <div ref={coverRef} className={coverUrl ? "octo-cover-preview ready" : "octo-cover-preview"}>
        {coverUrl ? (
          <img src={coverUrl} alt={`《${cleanTitle}》封面`} />
        ) : (
          <div className="octo-cover-placeholder">
            <span>{cleanTitle.slice(0, 6)}</span>
            <em>{cleanAuthor}</em>
          </div>
        )}
        {generating ? <i className="octo-cover-shimmer" aria-hidden="true" /> : null}
      </div>
      <div className="octo-cover-controls">
        <Field label="作者名" hint="会直接写到封面和项目配置里。">
          <input
            value={authorName}
            onChange={(event) => onAuthorChange(event.target.value)}
            placeholder="不填默认：章鱼作者"
          />
        </Field>
        <Button variant="secondary" onClick={onGenerate} disabled={Boolean(disabled || generating)}>
          {generating ? "正在生成封面..." : coverUrl ? "重新生成封面" : "生成封面"}
        </Button>
        {coverPrompt ? <small>{coverPrompt.split(/\n/).slice(-1)[0]}</small> : null}
      </div>
    </div>
  );
};
