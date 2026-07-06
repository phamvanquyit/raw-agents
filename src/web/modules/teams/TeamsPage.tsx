// ─── Teams Page ──────────────────────────────────────────────────────────────
// Route: /teams — Full teams management page with table view (add, edit, delete).

import { AddCircle, PenNewSquare, UsersGroupTwoRounded } from "@solar-icons/react";
import { useEffect, useRef, useState } from "react";
import { DeleteConfirmButton } from "src/components/ui/alert-dialog";
import { Button } from "src/components/ui/button";
import { SimpleDialog } from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Field } from "src/components/ui/label";
import { Textarea } from "src/components/ui/textarea";
import { toast } from "src/components/ui/toast";
import { createTeam, deleteTeam, fetchTeams, updateTeam } from "src/modules/teams/common/teamsSlice";
import type { TeamWithMembers } from "src/modules/teams/common/teamsSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";

/* ── Team Dialog (shared for Create & Edit) ──────────────────────────────────── */

interface TeamDialogProps {
  open: boolean;
  onClose: () => void;
  /** If provided, we are editing; otherwise creating. */
  team?: TeamWithMembers | null;
}

function TeamDialog({ open, onClose, team }: TeamDialogProps) {
  const dispatch = useAppDispatch();
  const isEdit = !!team;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName(team?.name ?? "");
      setDescription(team?.description ?? "");
      setSaving(false);
      setTimeout(() => nameRef.current?.focus(), 150);
    }
  }, [open, team]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (isEdit && team) {
        await dispatch(updateTeam({ id: team.id, name: name.trim(), description: description.trim() || undefined })).unwrap();
        toast.success("Team updated");
      } else {
        await dispatch(createTeam({ name: name.trim(), description: description.trim() || undefined })).unwrap();
        toast.success("Team created");
      }
      onClose();
    } catch {
      toast.error(isEdit ? "Failed to update team" : "Failed to create team");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <SimpleDialog
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit Team" : "New Team"}
      icon={isEdit ? <PenNewSquare width={16} height={16} /> : <AddCircle width={16} height={16} />}
      width={420}
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={saving} onClick={handleSubmit} disabled={!name.trim()}>
            {saving ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save" : "Create Team"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pt-4">
        <Field label="Team Name" required>
          <Input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Backend Team, QA…"
            autoComplete="off"
          />
        </Field>
        <Field label="Description" optional>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description of this team" autoHeight rows={2} />
        </Field>
      </div>
    </SimpleDialog>
  );
}

/* ── Teams Page ──────────────────────────────────────────────────────────────── */

export default function TeamsPage() {
  const dispatch = useAppDispatch();
  const teams = useAppSelector((s) => s.teams.teams) as TeamWithMembers[];
  const loading = useAppSelector((s) => s.teams.loading);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamWithMembers | null>(null);

  useEffect(() => {
    dispatch(fetchTeams());
  }, [dispatch]);

  /* ── Handlers ─────────────────────────────────────────────────────────── */

  const handleOpenCreate = () => {
    setEditingTeam(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (team: TeamWithMembers) => {
    setEditingTeam(team);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingTeam(null);
  };

  const handleDelete = async (id: string) => {
    try {
      await dispatch(deleteTeam(id)).unwrap();
      toast.success("Team deleted");
    } catch {
      toast.error("Failed to delete team");
    }
  };

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div className="py-8 px-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 max-w-6xl mx-auto">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-primary/10 text-primary">
            <UsersGroupTwoRounded width={22} height={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-main m-0 leading-tight">Teams</h1>
            <p className="text-sm text-muted mt-1">
              Manage your agent teams
              <span className="inline-flex items-center ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary">{teams.length}</span>
            </p>
          </div>
        </div>
        <Button variant="primary" size="md" icon={<AddCircle width={16} height={16} />} onClick={handleOpenCreate}>
          New Team
        </Button>
      </div>

      <div className="max-w-6xl mx-auto">
        {/* Table */}
        <div className="rounded-xl border border-border/60 overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-4 px-4 py-2.5 bg-surface-raised/40 border-b border-border/40">
            <div className="w-8 shrink-0" />
            <span className="flex-1 text-[11px] font-semibold text-muted uppercase tracking-wider">Name</span>
            <span className="flex-1 text-[11px] font-semibold text-muted uppercase tracking-wider">Description</span>
            <span className="shrink-0 w-24 text-right text-[11px] font-semibold text-muted uppercase tracking-wider">Actions</span>
          </div>

          {/* Team rows */}
          {teams.map((team) => (
            <div
              key={team.id}
              className="group flex items-center gap-4 px-4 py-2.5 border-b border-border/30 hover:bg-surface-raised/30 transition-colors duration-150"
            >
              <div className="w-8 shrink-0 flex items-center justify-center">
                <UsersGroupTwoRounded width={16} height={16} className="text-muted" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-main truncate block">{team.name}</span>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm text-muted truncate block">{team.description || "—"}</span>
              </div>
              <div className="shrink-0 w-24 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(team)} className="!px-1.5">
                  <PenNewSquare width={15} height={15} />
                </Button>
                <DeleteConfirmButton
                  label="Delete team?"
                  description={`Delete "${team.name}"? Agents in this team will be unlinked.`}
                  onConfirm={() => handleDelete(team.id)}
                  size="sm"
                />
              </div>
            </div>
          ))}

          {/* Empty state */}
          {!loading && teams.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-5">
              <div className="w-14 h-14 rounded-2xl bg-surface-raised flex items-center justify-center mb-4">
                <UsersGroupTwoRounded width={24} height={24} className="text-muted" />
              </div>
              <p className="text-sm font-semibold text-main mb-1">No teams yet</p>
              <p className="text-xs text-muted">Create your first team to organize agents.</p>
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Dialog */}
      <TeamDialog open={dialogOpen} onClose={handleCloseDialog} team={editingTeam} />
    </div>
  );
}
