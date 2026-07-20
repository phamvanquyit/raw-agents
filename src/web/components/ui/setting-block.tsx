import type React from "react";

// ─── SettingBlock ─────────────────────────────────────────────────────────────
// Two-column layout for settings pages, dark neon theme.

interface SettingBlockProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

export function SettingBlock({ title, description, children }: SettingBlockProps) {
  return (
    <div className="grid grid-cols-1 gap-x-12 gap-y-4 py-8 sm:grid-cols-8">
      <div className="col-span-3 flex flex-col gap-1">
        <div className="flex flex-wrap gap-2">
          <h1 className="text-[15px] font-medium text-foreground">{title}</h1>
        </div>
        <h2 className="text-sm text-muted-foreground">{description}</h2>
      </div>
      <div className="col-span-5">{children}</div>
    </div>
  );
}

export type { SettingBlockProps };
