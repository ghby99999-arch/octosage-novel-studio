import { Button } from "@/components/ui/Button";
import type { ReactNode } from "react";

export type AssetLinkItem = {
  key?: string;
  label?: ReactNode;
  path?: string;
};

export const AssetLinkList = ({ assets, empty }: { assets: AssetLinkItem[]; empty?: ReactNode }) => {
  if (!assets.length) return empty ? <div className="octo-asset-link-list empty">{empty}</div> : null;

  return (
    <div className="octo-asset-link-list">
      {assets.map((asset) => (
        <Button
          key={asset.path || String(asset.label) || asset.key}
          size="sm"
          variant="secondary"
          data-octo-open-path={asset.path}
          data-octo-action={asset.path ? "openPathFromDataset" : undefined}
          disabled={!asset.path}
        >
          {asset.label || "规划资产"}
        </Button>
      ))}
    </div>
  );
};
