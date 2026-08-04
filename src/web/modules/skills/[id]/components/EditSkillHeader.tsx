import { AltArrowLeft, Diskette, MenuDots, TrashBinTrash } from "@solar-icons/react";
import { Button, Dropdown } from "antd";
import type { MenuProps } from "antd";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

interface EditSkillHeaderProps {
  title: string;
  isDirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDelete: () => void;
}

export function EditSkillHeader({ title, isDirty, saving, onSave, onDelete }: EditSkillHeaderProps) {
  const navigate = useNavigate();

  const menuItems: MenuProps["items"] = [
    {
      key: "delete",
      label: "Delete skill",
      danger: true,
      icon: <TrashBinTrash width={14} height={14} />,
      onClick: onDelete,
    },
  ];

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
      <button
        type="button"
        onClick={() => navigate("/skills")}
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent bg-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
        title="Back to Skills"
      >
        <AltArrowLeft width={16} height={16} />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <h1 className="m-0 truncate text-base leading-5 font-semibold text-foreground">{title}</h1>
        <AnimatePresence>
          {isDirty && !saving && (
            <motion.span
              initial={{ opacity: 0, x: 4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 4 }}
              className="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-md bg-accent px-2 text-xs font-medium text-brand-soft"
            >
              <span className="size-1.5 animate-pulse rounded-full bg-brand-soft" />
              Unsaved
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="primary"
          size="small"
          loading={saving}
          disabled={!isDirty || saving}
          icon={!saving ? <Diskette width={14} height={14} /> : undefined}
          onClick={onSave}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
        <Dropdown menu={{ items: menuItems }} trigger={["click"]} placement="bottomRight">
          <Button type="text" size="small" icon={<MenuDots width={16} height={16} weight="Bold" />} aria-label="Skill menu" />
        </Dropdown>
      </div>
    </header>
  );
}
