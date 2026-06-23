import { useEffect, useState } from "react";

export const LivePaper = ({
  text,
  empty = "等待模型输出...",
  className = "",
}: {
  text?: string;
  empty?: string;
  className?: string;
}) => {
  const [typedText, setTypedText] = useState("");
  const source = text || "";

  useEffect(() => {
    if (!source) {
      setTypedText("");
      return;
    }
    if (!source.startsWith(typedText.slice(0, Math.min(typedText.length, 60)))) {
      setTypedText("");
      return;
    }
    if (typedText.length >= source.length) return;
    const timer = window.setTimeout(() => {
      setTypedText(source.slice(0, Math.min(source.length, typedText.length + 18)));
    }, 18);
    return () => window.clearTimeout(timer);
  }, [source, typedText]);

  return (
    <div className={["octo-live-paper", className].filter(Boolean).join(" ")}>
      <pre>
        {typedText || source.slice(0, 1) || empty}
        {source ? <b className="octo-type-cursor" /> : null}
      </pre>
    </div>
  );
};
