const ROLE_STYLES: Record<string, string> = {
  admin: "bg-[#e8a849]/15 text-[#b07c2e] border-[#e8a849]/25",
  member: "bg-border text-muted border-border-hover",
};

export function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={[
        "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wide border",
        ROLE_STYLES[role] ?? ROLE_STYLES.member,
      ].join(" ")}
    >
      {role}
    </span>
  );
}
