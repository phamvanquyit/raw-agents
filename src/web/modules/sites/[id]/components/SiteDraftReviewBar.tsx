import AltArrowRight from "@solar-icons/react/arrows/AltArrowRight";
import Restart from "@solar-icons/react/arrows/Restart";
import CheckCircle from "@solar-icons/react/ui/CheckCircle";
import { Button, Popconfirm } from "antd";
import type { SiteSourceFile } from "src/common/types";

interface SiteDraftReviewBarProps {
  changedFiles: SiteSourceFile[];
  currentFile?: SiteSourceFile;
  onReviewNext?: () => void;
  onApprove: () => void;
  onDiscard: () => void;
  approving?: boolean;
  discarding?: boolean;
}

export function SiteDraftReviewBar({
  changedFiles,
  currentFile,
  onReviewNext,
  onApprove,
  onDiscard,
  approving = false,
  discarding = false,
}: SiteDraftReviewBarProps) {
  if (changedFiles.length === 0) return null;

  const currentIndex = currentFile ? changedFiles.indexOf(currentFile) : -1;
  const onChangedFile = currentIndex >= 0;
  const fileAware = Boolean(currentFile);
  const showDecide = !fileAware || onChangedFile;
  const showNext = fileAware && Boolean(onReviewNext) && (!onChangedFile || changedFiles.length > 1);
  const perFile = fileAware && onChangedFile;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-lg">
      {fileAware ? (
        <span className="mr-1 max-w-40 truncate font-mono text-[11px] font-medium text-muted-foreground">
          {onChangedFile ? `${currentFile} · ${currentIndex + 1}/${changedFiles.length}` : `${changedFiles.length} files to review`}
        </span>
      ) : null}
      {showNext ? (
        <Button size="small" icon={<AltArrowRight width={14} height={14} />} onClick={onReviewNext}>
          {onChangedFile ? "Next file" : "Review next file"}
        </Button>
      ) : null}
      {showDecide ? (
        <>
          <Popconfirm
            title={perFile ? `Discard ${currentFile}?` : "Discard draft?"}
            description={
              perFile
                ? "Reset this file to the production version. Other draft files are kept."
                : "Reset draft to production. Unpublished changes will be lost."
            }
            okText="Discard"
            okType="danger"
            cancelText="Cancel"
            onConfirm={onDiscard}
            styles={{ root: { width: 280 } }}
          >
            <Button size="small" color="default" variant="filled" icon={<Restart width={14} height={14} />} loading={discarding}>
              Discard
            </Button>
          </Popconfirm>
          <Popconfirm
            title={perFile ? `Approve ${currentFile}?` : "Approve draft?"}
            description={
              perFile
                ? "Publish this file to production. Other draft files stay unpublished."
                : "Publish draft to production. This replaces the current live site."
            }
            okText="Approve"
            okButtonProps={{ color: "green", variant: "solid" }}
            cancelText="Cancel"
            onConfirm={onApprove}
            styles={{ root: { width: 280 } }}
          >
            <Button size="small" color="green" variant="solid" icon={<CheckCircle width={14} height={14} />} loading={approving}>
              Approve
            </Button>
          </Popconfirm>
        </>
      ) : null}
    </div>
  );
}
