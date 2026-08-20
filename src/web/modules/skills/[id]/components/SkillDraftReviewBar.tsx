import AltArrowRight from "@solar-icons/react/arrows/AltArrowRight";
import Restart from "@solar-icons/react/arrows/Restart";
import CheckCircle from "@solar-icons/react/ui/CheckCircle";
import { Popconfirm } from "antd";
import { RawButton } from "src/components/RawButton";

interface SkillDraftReviewBarProps {
  changedFiles: string[];
  currentFile?: string;
  onReviewNext?: () => void;
  onApprove: () => void;
  onDiscard: () => void;
  approving?: boolean;
  discarding?: boolean;
}

export function SkillDraftReviewBar({
  changedFiles,
  currentFile,
  onReviewNext,
  onApprove,
  onDiscard,
  approving = false,
  discarding = false,
}: SkillDraftReviewBarProps) {
  if (changedFiles.length === 0) return null;

  const currentIndex = currentFile ? changedFiles.indexOf(currentFile) : -1;
  const onChangedFile = currentIndex >= 0;
  const fileAware = Boolean(currentFile);
  const showDecide = !fileAware || onChangedFile;
  const showNext = fileAware && Boolean(onReviewNext) && (!onChangedFile || changedFiles.length > 1);
  const perFile = fileAware && onChangedFile;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-lg">
      {showNext ? (
        <RawButton size="xs" icon={<AltArrowRight width={12} height={12} />} onClick={onReviewNext}>
          {onChangedFile ? "Next file" : "Review next file"}
        </RawButton>
      ) : null}
      {showDecide ? (
        <>
          <Popconfirm
            title={perFile ? `Discard ${currentFile}?` : "Discard draft?"}
            description={
              perFile
                ? "Reset this file to the published version. Other draft files are kept."
                : "Reset drafts to the published versions. Unpublished changes will be lost."
            }
            okText="Discard"
            okType="danger"
            cancelText="Cancel"
            onConfirm={onDiscard}
            styles={{ root: { width: 280 } }}
          >
            <RawButton size="xs" color="default" variant="filled" icon={<Restart width={12} height={12} />} loading={discarding}>
              Discard
            </RawButton>
          </Popconfirm>
          <RawButton size="xs" color="green" variant="solid" icon={<CheckCircle width={12} height={12} />} loading={approving} onClick={onApprove}>
            Approve
          </RawButton>
        </>
      ) : null}
    </div>
  );
}
