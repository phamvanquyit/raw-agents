import { Folder, MenuDots, PenNewSquare, TrashBinMinimalistic } from "@solar-icons/react";
import { Button, Dropdown } from "antd";
import type { MenuProps } from "antd";
import type { DatatableProject } from "src/common/types";

export type ProjectCardModel = DatatableProject & { tableCount: number };

export function ProjectCard({
  project,
  onOpen,
  onRename,
  onDelete,
}: {
  project: ProjectCardModel;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const menuItems: MenuProps["items"] = [
    { key: "rename", label: "Rename", icon: <PenNewSquare width={14} height={14} />, onClick: onRename },
    { type: "divider" },
    { key: "delete", label: "Delete", danger: true, icon: <TrashBinMinimalistic width={14} height={14} />, onClick: onDelete },
  ];

  return (
    <div className="group relative flex min-h-[168px] flex-col rounded-xl border border-border-subtle bg-card p-5 transition-colors hover:border-border hover:bg-card/90">
      <button
        type="button"
        className="absolute inset-0 cursor-pointer rounded-xl border-0 bg-transparent"
        onClick={onOpen}
        aria-label={`Open ${project.name}`}
      />
      <div className="relative z-10 flex items-start justify-between gap-3">
        <span className="flex size-12 items-center justify-center rounded-xl bg-secondary text-brand-soft">
          <Folder width={26} height={26} weight="BoldDuotone" />
        </span>
        <Dropdown menu={{ items: menuItems }} trigger={["click"]}>
          <Button
            type="text"
            size="small"
            className="opacity-0 group-hover:opacity-100 focus:opacity-100"
            icon={<MenuDots width={16} height={16} />}
            onClick={(e) => e.stopPropagation()}
          />
        </Dropdown>
      </div>
      <div className="relative z-10 mt-auto pt-8 pointer-events-none">
        <h2 className="m-0 truncate text-lg font-semibold leading-7 text-foreground">{project.name}</h2>
        <p className="mt-1 mb-0 text-sm text-muted-foreground">
          {project.tableCount} {project.tableCount === 1 ? "table" : "tables"}
        </p>
      </div>
    </div>
  );
}
