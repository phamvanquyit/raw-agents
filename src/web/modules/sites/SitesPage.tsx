import { AddCircle, Global } from "@solar-icons/react";
import { Alert, Button, Form, Input, Modal, Spin, message } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Site } from "src/common/types";
import { PageShell } from "src/components/PageShell";
import RenderIf from "src/components/RenderIf";
import { sitesApi } from "./common/sitesApi";
import { SiteCard } from "./components/SiteCard";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function CreateSiteDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (site: Site) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const handleSubmit = async () => {
    const n = name.trim();
    const s = slug.trim().toLowerCase();
    if (!n) {
      setError("Name is required");
      return;
    }
    if (!SLUG_RE.test(s)) {
      setError("Slug must be lowercase alphanumeric with hyphens");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const site = await sitesApi.create({ name: n, slug: s });
      message.success("Site created");
      onCreated(site);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title="New site" onCancel={onClose} onOk={handleSubmit} okText="Create" confirmLoading={saving} destroyOnHidden>
      <RenderIf condition={!!error}>
        <Alert type="error" description={error} showIcon className="mb-3" />
      </RenderIf>
      <Form layout="vertical">
        <Form.Item label="Name" required>
          <Input
            value={name}
            placeholder="News page"
            onChange={(e) => {
              const v = e.target.value;
              setName(v);
              if (
                !slug ||
                slug ===
                  name
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, "")
              ) {
                setSlug(
                  v
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, ""),
                );
              }
            }}
          />
        </Form.Item>
        <Form.Item label="Slug" required extra="Public URL: /public/sites/{slug}">
          <Input value={slug} placeholder="news" onChange={(e) => setSlug(e.target.value.toLowerCase())} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default function SitesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await sitesApi.list({ limit: 100, sorts: "-updatedAt" });
      setItems(res.items);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Failed to load sites");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const publicCount = items.filter((s) => s.isPublished && !s.hasPublicPassword).length;

  return (
    <PageShell>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">Sites</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Pages you build and publish
            <RenderIf condition={items.length > 0}>
              <span className="ml-2 inline-flex items-center rounded-full bg-brand/12 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-brand-soft">
                {publicCount}/{items.length} public
              </span>
            </RenderIf>
          </p>
        </div>
        <Button type="primary" icon={<AddCircle width={16} height={16} />} onClick={() => setDialogOpen(true)}>
          New site
        </Button>
      </div>

      <RenderIf
        condition={items.length > 0 || loading}
        fallback={
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-5 py-16">
            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand/12 text-brand-soft">
              <Global width={28} height={28} weight="BoldDuotone" />
            </div>
            <p className="mb-1 text-base font-semibold text-foreground">No sites yet</p>
            <p className="m-0 mb-5 max-w-sm text-center text-sm text-muted-foreground">Create a page, refine the draft, then publish when it looks right.</p>
            <Button type="primary" icon={<AddCircle width={16} height={16} />} onClick={() => setDialogOpen(true)}>
              New site
            </Button>
          </div>
        }
      >
        <Spin spinning={loading && items.length === 0}>
          <div className="flex flex-col gap-2">
            {items.map((site, index) => (
              <SiteCard key={site.id} site={site} index={index} onOpen={() => navigate(`/sites/${site.id}`)} />
            ))}
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              style={{ animationDelay: `${items.length * 40}ms` }}
              className="group flex w-full cursor-pointer items-center gap-4 rounded-xl border border-dashed border-border bg-transparent px-3 py-3 text-left text-muted-foreground transition-[border-color,background-color,color] duration-200 hover:border-brand/35 hover:bg-brand/[0.04] hover:text-brand-soft motion-safe:animate-[fadeIn_0.35s_ease-out_both]"
            >
              <span className="flex h-[72px] w-[116px] shrink-0 items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/30">
                <AddCircle width={20} height={20} />
              </span>
              <span className="text-sm font-medium">New site</span>
            </button>
          </div>
        </Spin>
      </RenderIf>

      <RenderIf condition={dialogOpen}>
        <CreateSiteDialog
          onClose={() => setDialogOpen(false)}
          onCreated={(site) => {
            void load();
            navigate(`/sites/${site.id}`);
          }}
        />
      </RenderIf>
    </PageShell>
  );
}
