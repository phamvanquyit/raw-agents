/**
 * UsersSection — user management panel in Settings.
 *
 * Table-based layout for listing users with create/edit/delete/reset-password.
 * Data fetched locally per coding rules.
 */

import { PenNewSquare, Restart, TrashBinMinimalistic, UserPlus } from "@solar-icons/react";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "src/common/api";
import type { User } from "src/common/types";
import RenderIf from "src/components/ui/RenderIf";
import { Button } from "src/components/ui/button";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { ResetPasswordDialog } from "./ResetPasswordDialog";
import { RoleBadge } from "./RoleBadge";
import { UserFormDialog } from "./UserFormDialog";

// ─── Main Section ────────────────────────────────────────────────────────────

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
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

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-main">User Management</h3>
          <p className="text-[11px] text-muted mt-0.5">
            {users.length} user{users.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button id="settings-add-user" variant="primary" size="sm" icon={<UserPlus width={11} height={11} />} onClick={() => setShowCreate(true)}>
          Add User
        </Button>
      </div>

      {/* Loading */}
      <RenderIf condition={loading}>
        <div className="flex items-center justify-center h-32 gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      </RenderIf>

      {/* Table */}
      <RenderIf condition={!loading && users.length > 0}>
        {() => (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-raised/50">
                  <th className="text-[11px] font-medium text-muted uppercase tracking-wider px-4 py-2.5">User</th>

                  <th className="text-[11px] font-medium text-muted uppercase tracking-wider px-4 py-2.5">Role</th>
                  <th className="text-[11px] font-medium text-muted uppercase tracking-wider px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user) => (
                  <tr key={user.id} className="group hover:bg-white/[0.02] transition-colors">
                    {/* User */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold text-primary uppercase">{user.name?.charAt(0) || user.username.charAt(0)}</span>
                        </div>
                        <div className="min-w-0">
                          <span className="text-[13px] font-medium text-main block truncate">{user.name || user.username}</span>
                          <span className="text-[11px] text-muted block truncate">@{user.username}</span>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3">
                      <RoleBadge role={user.role} />
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<PenNewSquare width={13} height={13} />}
                          onClick={() => setEditUser(user)}
                          className="!px-1.5"
                        />
                        <Button variant="ghost" size="sm" icon={<Restart width={13} height={13} />} onClick={() => setResetUser(user)} className="!px-1.5" />
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<TrashBinMinimalistic width={13} height={13} />}
                          onClick={() => setDeleteUser(user)}
                          className="!px-1.5 text-danger hover:text-danger"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </RenderIf>

      {/* Empty state */}
      <RenderIf condition={!loading && users.length === 0}>
        <div className="flex flex-col items-center justify-center py-12 gap-2 rounded-lg border border-border">
          <p className="text-sm text-muted">No users found</p>
        </div>
      </RenderIf>

      {/* Dialogs */}
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
