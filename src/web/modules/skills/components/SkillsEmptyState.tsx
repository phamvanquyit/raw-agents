import { AddCircle, BookBookmark } from "@solar-icons/react";
import { Button } from "antd";
import { NewSkillDialog } from "./NewSkillDialog";

export function SkillsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-5 py-16">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-edge-skill/12 text-edge-skill">
        <BookBookmark width={28} height={28} weight="BoldDuotone" />
      </div>
      <p className="mb-1 text-base font-semibold text-foreground">No skills yet</p>
      <p className="m-0 mb-5 max-w-sm text-center text-sm text-muted-foreground">
        Create a shared instruction pack agents can load when the task matches.
      </p>
      <NewSkillDialog>
        <Button type="primary" icon={<AddCircle width={16} height={16} weight="BoldDuotone" />}>
          New skill
        </Button>
      </NewSkillDialog>
    </div>
  );
}
