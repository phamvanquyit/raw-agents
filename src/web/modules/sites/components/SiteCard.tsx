import { Global } from "@solar-icons/react";
import { useEffect, useState } from "react";
import { cn } from "src/common/lib/cn";
import type { Site } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import { sitesApi } from "../common/sitesApi";

function statusOf(site: Site): { label: string; className: string } {
  if (!site.isPublished) return { label: "Private", className: "text-muted-foreground" };
  if (site.hasPublicPassword) return { label: "Protected", className: "text-warn" };
  return { label: "Public", className: "text-success" };
}

export function SiteCard({ site, onOpen }: { site: Site; onOpen: () => void }) {
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);
  const [thumbLoading, setThumbLoading] = useState(true);
  const [thumbFailed, setThumbFailed] = useState(false);
  const status = statusOf(site);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setThumbLoading(true);
    setThumbFailed(false);
    setThumbSrc(null);

    void sitesApi
      .getThumbnail(site.id, { tree: "draft" })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setThumbSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setThumbFailed(true);
      })
      .finally(() => {
        if (!cancelled) setThumbLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [site.id, site.draftUpdatedAt, site.updatedAt]);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${site.name}`}
      className={cn(
        "group flex w-full cursor-pointer items-center gap-4 rounded-xl border border-border-subtle bg-card px-3 py-3 text-left",
        "transition-[border-color,background-color] duration-200",
        "hover:border-brand/30 hover:bg-secondary",
      )}
    >
      <div className="relative h-[72px] w-[116px] shrink-0 overflow-hidden rounded-lg border border-border-subtle bg-muted">
        <RenderIf
          condition={!!thumbSrc && !thumbFailed}
          fallback={
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
              <Global width={18} height={18} weight="BoldDuotone" />
              <span className="text-[10px]">{thumbLoading ? "…" : "—"}</span>
            </div>
          }
        >
          <img
            src={thumbSrc ?? undefined}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-300 ease-out group-hover:scale-[1.04]"
          />
        </RenderIf>
      </div>

      <div className="min-w-0 flex-1">
        <h2 className="m-0 truncate text-base font-semibold leading-6 text-foreground">{site.name}</h2>
        <p className="mt-0.5 mb-0 truncate font-mono text-[12px] text-tertiary-foreground">/public/sites/{site.slug}</p>
      </div>

      <span className={cn("shrink-0 pr-1 text-[11px] font-medium", status.className)}>{status.label}</span>
    </button>
  );
}
