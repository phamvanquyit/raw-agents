import { AddCircle, Document, Folder } from "@solar-icons/react";
import { Button, Modal, message } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DatatableProject } from "src/common/types";
import { PageShell } from "src/components/PageShell";
import RenderIf from "src/components/RenderIf";
import { datatablesApi } from "./common/datatablesApi";
import { ProjectCard, type ProjectCardModel } from "./components/ProjectCard";
import { ProjectDialog } from "./components/ProjectDialog";

export default function DatatablesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ProjectCardModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<DatatableProject | "create" | null>(null);
  const [deleting, setDeleting] = useState<DatatableProject | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await datatablesApi.listProjects());
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <PageShell className="box-border flex h-full min-h-0 flex-col overflow-hidden" contentClassName="flex min-h-0 flex-1 flex-col">
      <div className="mb-8 flex shrink-0 items-end justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-brand-soft">
            <Document width={22} height={22} weight="BoldDuotone" />
          </span>
          <div>
            <h1 className="m-0 text-2xl font-semibold leading-8 text-foreground">Datatables</h1>
            <p className="mt-1 text-sm text-muted-foreground">Structured tables for agent tools</p>
          </div>
        </div>
        <Button type="primary" icon={<AddCircle width={16} height={16} />} onClick={() => setDialog("create")}>
          New project
        </Button>
      </div>

      <RenderIf
        condition={items.length > 0 || loading}
        fallback={
          <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border px-5 py-16">
            <span className="mb-3 flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Folder width={24} height={24} weight="BoldDuotone" />
            </span>
            <p className="m-0 text-sm font-medium text-foreground">No projects yet</p>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">Create a project to hold your tables</p>
            <Button type="primary" icon={<AddCircle width={16} height={16} />} onClick={() => setDialog("create")}>
              New project
            </Button>
          </div>
        }
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={() => navigate(`/datatables/${project.id}`)}
                onRename={() => setDialog(project)}
                onDelete={() => setDeleting(project)}
              />
            ))}
            <button
              type="button"
              className="flex min-h-[168px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground"
              onClick={() => setDialog("create")}
            >
              <AddCircle width={22} height={22} />
              <span className="text-sm font-medium">New project</span>
            </button>
          </div>
        </div>
      </RenderIf>

      <RenderIf condition={dialog !== null}>
        <ProjectDialog edit={dialog === "create" ? null : dialog} onClose={() => setDialog(null)} onSaved={load} />
      </RenderIf>

      <Modal
        open={!!deleting}
        title={deleting ? `Delete ${deleting.name}?` : "Delete project?"}
        okText="Delete"
        okButtonProps={{ danger: true }}
        onCancel={() => setDeleting(null)}
        onOk={async () => {
          if (!deleting) return;
          await datatablesApi.deleteProject(deleting.id);
          message.success("Deleted");
          setDeleting(null);
          await load();
        }}
      >
        <p className="m-0 text-sm text-muted-foreground">All tables and rows in this project will be deleted.</p>
      </Modal>
    </PageShell>
  );
}
