/**
 * UsersSection — user management panel in Settings.
 */

import { PenNewSquare, Restart, TrashBinMinimalistic, UserPlus, UsersGroupTwoRounded } from "@solar-icons/react";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "src/common/api";
import type { User } from "src/common/types";
import RenderIf from "src/components/ui/RenderIf";
import { Avatar, AvatarFallback, AvatarImage } from "src/components/ui/avatar";
import { Button } from "src/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "src/components/ui/empty";
import { Skeleton } from "src/components/ui/skeleton";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { ResetPasswordDialog } from "./ResetPasswordDialog";
import { RoleBadge } from "./RoleBadge";
import { UserFormDialog } from "./UserFormDialog";

function userInitials(user: User) {
  const source = user.name?.trim() || user.username;
  return source.charAt(0).toUpperCase();
}

function UserRow({
  user,
  onEdit,
  onReset,
  onDelete,
}: {
  user: User;
  onEdit: () => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
      <Avatar size="default" className="size-9">
        {user.avatar ? <AvatarImage src={user.avatar} alt={user.name || user.username} /> : null}
        <AvatarFallback className="bg-accent text-sm font-medium text-accent-foreground">{userInitials(user)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{user.name || user.username}</span>
          <RoleBadge role={user.role} />
        </div>
        <span className="mt-0.5 block truncate text-xs text-tertiary-foreground">@{user.username}</span>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="icon-sm" icon={<PenNewSquare />} onClick={onEdit} aria-label={`Edit ${user.username}`} />
        <Button variant="ghost" size="icon-sm" icon={<Restart />} onClick={onReset} aria-label={`Reset password for ${user.username}`} />
        <Button
          variant="ghost"
          size="icon-sm"
          icon={<TrashBinMinimalistic />}
          onClick={onDelete}
          aria-label={`Delete ${user.username}`}
          className="text-destructive hover:text-destructive"
        />
      </div>
    </div>
  );
}

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient.get<{ items: User[]; total: number }>("/api/users", { page: 1, limit: 100, sorts: "-createdAt" });
      setUsers(result.items);
    } catch {
      // ignore — likely not admin
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const adminCount = users.filter((u) => u.role === "admin").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="tabular-nums">
            {users.length} user{users.length !== 1 ? "s" : ""}
          </span>
          <RenderIf condition={!loading && users.length > 0}>
            <>
              <span className="text-border">·</span>
              <span className="tabular-nums">{adminCount} admin</span>
            </>
          </RenderIf>
        </div>
        <Button id="settings-add-user" variant="primary" icon={<UserPlus width={14} height={14} />} onClick={() => setShowCreate(true)}>
          Add User
        </Button>
      </div>

      <RenderIf condition={loading}>
        <div className="overflow-hidden rounded-xl border border-border-subtle bg-card">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-7 w-16 rounded-md" />
            </div>
          ))}
        </div>
      </RenderIf>

      <RenderIf condition={!loading && users.length > 0}>
        {() => (
          <div className="overflow-hidden rounded-xl border border-border-subtle bg-card divide-y divide-border-subtle">
            {users.map((user) => (
              <UserRow key={user.id} user={user} onEdit={() => setEditUser(user)} onReset={() => setResetUser(user)} onDelete={() => setDeleteUser(user)} />
            ))}
          </div>
        )}
      </RenderIf>

      <RenderIf condition={!loading && users.length === 0}>
        <Empty className="rounded-xl border border-dashed border-border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersGroupTwoRounded />
            </EmptyMedia>
            <EmptyTitle>No users yet</EmptyTitle>
            <EmptyDescription>Invite teammates and assign roles to share this workspace.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="primary" size="sm" icon={<UserPlus width={12} height={12} />} onClick={() => setShowCreate(true)}>
              Add User
            </Button>
          </EmptyContent>
        </Empty>
      </RenderIf>

      <RenderIf condition={showCreate}>
        <UserFormDialog onClose={() => setShowCreate(false)} onSaved={fetchUsers} />
      </RenderIf>

      <RenderIf condition={!!editUser}>{() => <UserFormDialog user={editUser} onClose={() => setEditUser(null)} onSaved={fetchUsers} />}</RenderIf>

      <RenderIf condition={!!resetUser}>{() => <ResetPasswordDialog user={resetUser as User} onClose={() => setResetUser(null)} />}</RenderIf>

      <RenderIf condition={!!deleteUser}>
        {() => <DeleteConfirmDialog user={deleteUser as User} onClose={() => setDeleteUser(null)} onDeleted={fetchUsers} />}
      </RenderIf>
    </div>
  );
}
