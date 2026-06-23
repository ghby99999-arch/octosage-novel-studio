import type { ReactNode } from "react";

export type OctoFileTreeItem = {
  id: string;
  label: ReactNode;
  meta?: ReactNode;
  active?: boolean;
  status?: "pass" | "fail" | "running" | "pending";
  onSelect?: () => void;
  children?: OctoFileTreeItem[];
};

export const OctoFileTree = ({ items }: { items: OctoFileTreeItem[] }) => (
  <div className="octo-ui-file-tree">
    {items.map((item) => (
      <FileTreeItem key={item.id} item={item} depth={0} />
    ))}
  </div>
);

const FileTreeItem = ({ item, depth }: { item: OctoFileTreeItem; depth: number }) => (
  <div className="octo-ui-file-node-group">
    <button
      type="button"
      className={["octo-ui-file-node", item.active ? "active" : "", item.status || ""].filter(Boolean).join(" ")}
      disabled={!item.onSelect}
      onClick={item.onSelect}
      style={{ paddingLeft: 10 + depth * 14 }}
    >
      <i />
      <span>{item.label}</span>
      {item.meta ? <em>{item.meta}</em> : null}
    </button>
    {item.children?.length ? item.children.map((child) => (
      <FileTreeItem key={child.id} item={child} depth={depth + 1} />
    )) : null}
  </div>
);
