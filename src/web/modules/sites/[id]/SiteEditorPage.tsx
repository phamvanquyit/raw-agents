import {
  AltArrowLeft,
  CheckCircle,
  Global,
  Link as LinkIcon,
  Lock,
  MenuDots,
  PenNewSquare,
  Refresh,
  Restart,
  TransferHorizontal,
  TrashBinMinimalistic,
} from "@solar-icons/react";
import { Alert, Button, Dropdown, Form, Input, Modal, Popconfirm, Popover, Switch, Tag, message } from "antd";
import type { MenuProps } from "antd";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiClient } from "src/common/api";
import { SettingKey } from "src/common/enum";
import type { ToolActionEvent } from "src/common/hooks/useAssistantStreaming";
import type { Site } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import { getSettingValues } from "src/modules/settings/common/settingsApi";
import { capturePreviewIframe } from "../common/capturePreviewIframe";
import { sitesApi } from "../common/sitesApi";
import { SiteAgentPanel } from "../components/SiteAgentPanel";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function SiteSettingsModal({
  site,
  onClose,
  onSaved,
}: {
  site: Site;
  onClose: () => void;
  onSaved: (site: Site) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(site.name);
  const [slug, setSlug] = useState(site.slug);

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
      const updated = await sitesApi.update(site.id, { name: n, slug: s });
      message.success("Site updated");
      onSaved(updated);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title="Site settings" onCancel={onClose} onOk={() => void handleSubmit()} okText="Save" confirmLoading={saving} destroyOnHidden>
      <RenderIf condition={!!error}>
        <Alert type="error" description={error} showIcon className="mb-3" />
      </RenderIf>
      <Form layout="vertical">
        <Form.Item label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Form.Item>
        <Form.Item label="Slug" required extra="Public URL: /public/sites/{slug}">
          <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function BrowserChrome({
  url,
  trailing,
  children,
  className,
}: {
  url: string;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden bg-card ${className ?? "rounded-xl border border-border"}`}>
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <div className="flex shrink-0 items-center gap-1.5 pl-0.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full border border-border bg-background/90 px-3 py-1">
          <Lock width={11} height={11} className="shrink-0 text-muted-foreground" />
          <span className="truncate font-mono text-[12px] leading-none text-tertiary-foreground">{url}</span>
        </div>
        {trailing}
      </div>
      {children}
    </div>
  );
}

export default function SiteEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thumbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [providerId, setProviderId] = useState<string | undefined>();
  const [model, setModel] = useState("");
  const [panelResizing, setPanelResizing] = useState(false);
  const [localPassword, setLocalPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [draftCompareHtml, setDraftCompareHtml] = useState<string | null>(null);
  const [prodCompareHtml, setProdCompareHtml] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentGenerating, setAgentGenerating] = useState(false);
  const [previewEpoch, setPreviewEpoch] = useState(0);
  const [previewAuthReady, setPreviewAuthReady] = useState(false);

  const reload = useCallback(async () => {
    if (!id) return;
    const s = await sitesApi.get(id);
    setSite(s);
    setLocalPassword("");
    setPasswordTouched(false);
  }, [id]);

  const mintPreviewSession = useCallback(async () => {
    if (!id) return;
    await apiClient.post(`/api/sites/${id}/live/session`, {});
  }, [id]);

  const runPreview = useCallback(() => {
    setPreviewLoading(true);
    void mintPreviewSession()
      .catch(() => undefined)
      .finally(() => setPreviewEpoch((n) => n + 1));
  }, [mintPreviewSession]);

  const schedulePreviewReload = useCallback(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      previewTimerRef.current = null;
      runPreview();
    }, 700);
  }, [runPreview]);

  const captureAndUploadThumbnail = useCallback(async () => {
    if (!id) return;
    const iframe = previewIframeRef.current;
    if (!iframe) return;
    try {
      const blob = await capturePreviewIframe(iframe);
      if (!blob) return;
      await sitesApi.uploadThumbnail(id, blob);
    } catch {
      /* ignore capture failures — list falls back to icon */
    }
  }, [id]);

  const onPreviewLoad = useCallback(() => {
    setPreviewLoading(false);
    if (thumbTimerRef.current) clearTimeout(thumbTimerRef.current);
    thumbTimerRef.current = setTimeout(() => {
      thumbTimerRef.current = null;
      void captureAndUploadThumbnail();
    }, 400);
  }, [captureAndUploadThumbnail]);

  useEffect(() => {
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      if (thumbTimerRef.current) clearTimeout(thumbTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setPreviewAuthReady(false);
    void mintPreviewSession()
      .then(() => {
        if (!cancelled) setPreviewAuthReady(true);
      })
      .catch(() => {
        if (!cancelled) setPreviewAuthReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, mintPreviewSession]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    void reload()
      .then(() => {
        if (cancelled) return;
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        message.error(err instanceof Error ? err.message : "Failed to load site");
        navigate("/sites");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, navigate, reload]);

  useEffect(() => {
    void getSettingValues([SettingKey.SiteAssistantProvider, SettingKey.SiteAssistantModel]).then((s) => {
      setProviderId(s[SettingKey.SiteAssistantProvider] || undefined);
      setModel(s[SettingKey.SiteAssistantModel] ?? "");
    });
  }, []);

  const handleApprove = async () => {
    if (!id) return;
    setApproving(true);
    try {
      const s = await sitesApi.approve(id);
      setSite(s);
      message.success("Draft approved → production");
      runPreview();
      setCompareOpen(false);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setApproving(false);
    }
  };

  const handleDiscard = async () => {
    if (!id) return;
    setDiscarding(true);
    try {
      const s = await sitesApi.discard(id);
      setSite(s);
      message.success("Draft discarded");
      runPreview();
      setCompareOpen(false);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Discard failed");
    } finally {
      setDiscarding(false);
    }
  };

  const openCompare = async () => {
    if (!id) return;
    setCompareOpen(true);
    setCompareLoading(true);
    setDraftCompareHtml(null);
    setProdCompareHtml(null);
    try {
      const [draftRes, prodRes] = await Promise.all([sitesApi.preview(id, { tree: "draft" }), sitesApi.preview(id, { tree: "prod" })]);
      setDraftCompareHtml(draftRes.html || "");
      setProdCompareHtml(prodRes.html || "");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Compare failed");
      setCompareOpen(false);
    } finally {
      setCompareLoading(false);
    }
  };

  const onToolAction = (event: ToolActionEvent) => {
    if (event.type !== "tool-result") return;
    if (event.toolName === "edit_ui" || event.toolName === "edit_styles" || event.toolName === "edit_backend" || event.toolName === "edit_deps") {
      void reload();
      schedulePreviewReload();
    }
  };

  if (loading || !site) {
    return <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  const publicPath = `/public/sites/${site.slug}`;
  const publicLink = `${window.location.origin}${publicPath}`;
  const previewSrc = previewAuthReady ? `/api/sites/${id}/live?t=${previewEpoch}` : undefined;
  const passwordDirty = passwordTouched;
  const hasPassword = !!site.hasPublicPassword;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicLink);
      message.success("Public link copied");
    } catch {
      message.error("Copy failed");
    }
  };

  const handleSavePassword = async () => {
    setSavingPassword(true);
    try {
      const updated = await sitesApi.update(site.id, { publicPassword: localPassword || null });
      setSite(updated);
      setLocalPassword("");
      setPasswordTouched(false);
      message.success(localPassword ? "Password saved" : "Password removed");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Failed to save password");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDelete = () => {
    Modal.confirm({
      title: `Delete "${site.name}"?`,
      content: "This cannot be undone. Draft and production files will be removed.",
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        await sitesApi.remove(site.id);
        message.success("Site deleted");
        navigate("/sites");
      },
    });
  };

  const menuItems: MenuProps["items"] = [
    {
      key: "edit",
      label: "Edit name",
      icon: <PenNewSquare width={14} height={14} />,
      onClick: () => setSettingsOpen(true),
    },
    { type: "divider" },
    {
      key: "delete",
      label: "Delete",
      danger: true,
      icon: <TrashBinMinimalistic width={14} height={14} />,
      onClick: handleDelete,
    },
  ];

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
        <Link to="/sites" className="text-muted-foreground hover:text-foreground">
          <AltArrowLeft width={18} height={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-semibold">{site.name}</h1>
            <RenderIf condition={!!site.draftDirty}>
              <Tag color="orange" className="m-0">
                Draft changes
              </Tag>
            </RenderIf>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Popover
            trigger="click"
            placement="bottomRight"
            content={
              <div className="flex w-80 flex-col gap-3 p-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="m-0 text-sm font-medium text-foreground">Public access</p>
                    <p className="m-0 text-[11px] text-muted-foreground">
                      {site.isPublished ? "Anyone with the link can view this site." : "Site is hidden from the public URL."}
                    </p>
                  </div>
                  <Switch
                    size="small"
                    checked={site.isPublished}
                    onChange={async (checked) => {
                      const updated = await sitesApi.update(site.id, { isPublished: checked });
                      setSite(updated);
                    }}
                  />
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-2.5 py-1.5">
                  <LinkIcon width={13} height={13} className="shrink-0 text-primary" />
                  <a
                    href={publicLink}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium text-primary no-underline"
                  >
                    {publicLink}
                  </a>
                  <Button size="small" onClick={() => void handleCopyLink()} className="shrink-0">
                    Copy
                  </Button>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-muted-foreground">Access password</span>
                  <Input.Password
                    visibilityToggle={{ visible: showPassword, onVisibleChange: setShowPassword }}
                    placeholder={hasPassword ? "Password is set — type to change" : "Leave blank for open access"}
                    value={localPassword}
                    onChange={(e) => {
                      setLocalPassword(e.target.value);
                      setPasswordTouched(true);
                    }}
                  />
                  <p className="m-0 text-[10px] text-muted-foreground">
                    {hasPassword ? "Clear the field and save to remove password protection." : "Visitors must enter this password to view the public site."}
                  </p>
                </div>
                <div className="flex justify-end">
                  <Button size="small" type="primary" disabled={!passwordDirty} loading={savingPassword} onClick={() => void handleSavePassword()}>
                    Save
                  </Button>
                </div>
              </div>
            }
          >
            <Button
              icon={
                site.isPublished ? (
                  hasPassword ? (
                    <Lock width={14} height={14} className="text-success" />
                  ) : (
                    <Global width={14} height={14} className="text-success" />
                  )
                ) : (
                  <Global width={14} height={14} className="text-muted-foreground" />
                )
              }
            >
              <span className={site.isPublished ? "text-success" : "text-muted-foreground"}>{site.isPublished ? "Published" : "Unpublished"}</span>
            </Button>
          </Popover>
          <Dropdown menu={{ items: menuItems }} trigger={["click"]} placement="bottomRight">
            <Button type="text" icon={<MenuDots width={16} height={16} weight="Bold" />} aria-label="Site menu" />
          </Dropdown>
        </div>
      </header>

      <RenderIf condition={settingsOpen}>
        <SiteSettingsModal site={site} onClose={() => setSettingsOpen(false)} onSaved={setSite} />
      </RenderIf>

      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <BrowserChrome
            url={publicLink}
            className="rounded-none border-r border-border"
            trailing={
              <Button
                size="small"
                type="text"
                loading={previewLoading}
                icon={<Refresh width={14} height={14} />}
                onClick={runPreview}
                aria-label="Refresh preview"
              />
            }
          >
            <div className="relative flex min-h-0 flex-1 flex-col">
              <iframe
                ref={previewIframeRef}
                key={previewEpoch}
                title="preview"
                className="min-h-0 flex-1 w-full bg-white"
                style={{ pointerEvents: panelResizing ? "none" : undefined }}
                src={previewSrc}
                onLoad={onPreviewLoad}
              />
              <RenderIf condition={previewLoading}>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/50 text-sm text-muted-foreground backdrop-blur-[1px]">
                  Loading preview…
                </div>
              </RenderIf>
            </div>
          </BrowserChrome>

          <RenderIf condition={!!site.draftDirty && !agentGenerating}>
            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
              <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-border bg-card/95 p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-md">
                <Button size="small" icon={<TransferHorizontal width={14} height={14} />} onClick={() => void openCompare()}>
                  Compare
                </Button>
                <Popconfirm
                  title="Discard draft?"
                  description="Reset draft to production. Unpublished changes will be lost."
                  okText="Discard"
                  okType="danger"
                  cancelText="Cancel"
                  onConfirm={() => void handleDiscard()}
                  styles={{ root: { width: 280 } }}
                >
                  <Button size="small" color="default" variant="filled" icon={<Restart width={14} height={14} />} loading={discarding}>
                    Discard
                  </Button>
                </Popconfirm>
                <Popconfirm
                  title="Approve draft?"
                  description="Publish draft to production. This replaces the current live site."
                  okText="Approve"
                  okButtonProps={{ color: "green", variant: "solid" }}
                  cancelText="Cancel"
                  onConfirm={() => void handleApprove()}
                  styles={{ root: { width: 280 } }}
                >
                  <Button size="small" color="green" variant="solid" icon={<CheckCircle width={14} height={14} />} loading={approving}>
                    Approve
                  </Button>
                </Popconfirm>
              </div>
            </div>
          </RenderIf>
        </div>

        <SiteAgentPanel
          providerId={providerId}
          model={model}
          streamUrl={`/api/sites/${site.id}/agent/stream`}
          onToolAction={onToolAction}
          onModelChange={(pid, m) => {
            setProviderId(pid);
            setModel(m);
            void apiClient.patch("/api/settings", {
              [SettingKey.SiteAssistantProvider]: pid,
              [SettingKey.SiteAssistantModel]: m,
            });
          }}
          onResizeDraggingChange={setPanelResizing}
          onGeneratingChange={setAgentGenerating}
        />
      </div>

      <Modal
        open={compareOpen}
        onCancel={() => setCompareOpen(false)}
        title="Compare versions"
        width="100%"
        style={{ top: 0, margin: 0, paddingBottom: 0, maxWidth: "100vw" }}
        styles={{
          container: {
            height: "100vh",
            borderRadius: 0,
            display: "flex",
            flexDirection: "column",
          },
          body: {
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            paddingTop: 12,
          },
        }}
        footer={
          <div className="flex items-center justify-end">
            <Button size="small" onClick={() => setCompareOpen(false)}>
              Close
            </Button>
          </div>
        }
      >
        {compareLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading both versions…</div>
        ) : (
          <div className="grid h-full grid-cols-2 gap-3">
            <div className="flex min-h-0 flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Production</span>
              <BrowserChrome url={`${publicPath} · prod`} className="min-h-0">
                <iframe title="prod-compare" className="min-h-0 flex-1 w-full bg-white" srcDoc={prodCompareHtml ?? ""} />
              </BrowserChrome>
            </div>
            <div className="flex min-h-0 flex-col gap-1.5">
              <span className="text-xs font-medium text-brand-soft">Draft</span>
              <BrowserChrome url={`${publicPath} · draft`} className="min-h-0">
                <iframe title="draft-compare" className="min-h-0 flex-1 w-full bg-white" srcDoc={draftCompareHtml ?? ""} />
              </BrowserChrome>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
