import { Badge } from "src/components/ui/badge";
import { cn } from "src/lib/utils";

const ROLE_STYLES: Record<string, string> = {
  admin: "border-transparent bg-accent text-accent-foreground",
  member: "border-border bg-secondary text-muted-foreground",
};

export function RoleBadge({ role }: { role: string }) {
  return (
    <Badge variant="outline" className={cn("rounded-md capitalize", ROLE_STYLES[role] ?? ROLE_STYLES.member)}>
      {role}
    </Badge>
  );
}
