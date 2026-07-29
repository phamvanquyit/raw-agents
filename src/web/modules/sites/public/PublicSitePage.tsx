import { Lock } from "@solar-icons/react";
import { Button, message } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import type { SiteActionResult } from "../common/siteFormSubmit";
import { useSiteFormSubmit } from "../common/useSiteFormSubmit";

type PublicSitePayload = {
  html?: string;
  message?: string;
  locked?: boolean;
  requiresPassword?: boolean;
  site?: { id: string; name: string; slug: string };
};

function tokenKey(slug: string) {
  return `site_public_auth_${slug}`;
}

export default function PublicSitePage() {
  const { slug } = useParams<{ slug: string }>();
  const [html, setHtml] = useState<string | null>(null);
  const [siteName, setSiteName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [enteredPassword, setEnteredPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [frameEpoch, setFrameEpoch] = useState(0);

  const fetchSite = useCallback(
    async (token?: string | null) => {
      if (!slug) return;
      const headers: Record<string, string> = {};
      if (token) headers["X-Site-Access-Token"] = token;
      const res = await fetch(`/api/public/sites/${encodeURIComponent(slug)}`, {
        headers,
        cache: "no-store",
      });
      const data = (await res.json()) as PublicSitePayload;
      if (!res.ok) {
        setError(data.message ?? "Site not found");
        setHtml(null);
        return;
      }
      setSiteName(data.site?.name ?? slug);
      setRequiresPassword(!!data.requiresPassword);
      if (data.locked) {
        setIsAuthenticated(false);
        setHtml(null);
        return;
      }
      setIsAuthenticated(true);
      setHtml(data.html ?? "");
      setError(null);
    },
    [slug],
  );

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const saved = localStorage.getItem(tokenKey(slug));
        if (saved) {
          const tokenRes = await fetch(`/api/public/sites/${encodeURIComponent(slug)}/verify-token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: saved }),
          });
          const tokenData = (await tokenRes.json()) as { valid?: boolean };
          if (tokenData.valid) {
            if (!cancelled) setAccessToken(saved);
            await fetchSite(saved);
            return;
          }
          localStorage.removeItem(tokenKey(slug));
        }
        await fetchSite(null);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, fetchSite]);

  useEffect(() => {
    if (requiresPassword && !isAuthenticated) {
      passwordRef.current?.focus();
    }
  }, [requiresPassword, isAuthenticated]);

  useEffect(() => {
    if (siteName) document.title = siteName;
  }, [siteName]);

  const onAction = useCallback(
    async (formData: FormData) => {
      if (!slug) throw new Error("Missing site");
      const headers: Record<string, string> = {};
      if (accessToken) headers["X-Site-Access-Token"] = accessToken;
      const res = await fetch(`/api/public/sites/${encodeURIComponent(slug)}/action`, {
        method: "POST",
        headers,
        body: formData,
      });
      const data = (await res.json()) as { result?: SiteActionResult; message?: string };
      if (!res.ok) throw new Error(data.message ?? "Action failed");
      return { result: data.result };
    },
    [slug, accessToken],
  );

  const onSoftReload = useCallback(async () => {
    await fetchSite(accessToken);
    setFrameEpoch((n) => n + 1);
  }, [fetchSite, accessToken]);

  const onResult = useCallback((result: SiteActionResult) => {
    if (!result.message) return;
    if (result.ok === false) message.error(result.message);
    else message.success(result.message);
  }, []);

  const { submitting } = useSiteFormSubmit({
    iframeRef,
    enabled: !!slug && html != null && isAuthenticated,
    onAction,
    onSoftReload,
    onResult,
    onError: (msg) => message.error(msg),
  });

  const verifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug || !enteredPassword) return;
    setVerifying(true);
    setAuthError("");
    try {
      const res = await fetch(`/api/public/sites/${encodeURIComponent(slug)}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: enteredPassword }),
      });
      const data = (await res.json()) as { valid?: boolean; token?: string; message?: string };
      if (!res.ok || !data.valid) {
        setAuthError(data.message ?? "Incorrect password");
        return;
      }
      if (data.token) {
        localStorage.setItem(tokenKey(slug), data.token);
        setAccessToken(data.token);
        await fetchSite(data.token);
      } else {
        setAccessToken(null);
        await fetchSite(null);
      }
    } catch {
      setAuthError("Unable to verify password");
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center p-6 font-sans text-sm text-neutral-500">Loading…</div>;
  }

  if (error) {
    return <div className="flex min-h-screen items-center justify-center p-6 font-sans text-sm text-red-600">{error}</div>;
  }

  if (requiresPassword && !isAuthenticated) {
    return (
      <div className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-background p-6">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-48"
          style={{
            background: "radial-gradient(ellipse 80% 100% at 50% 0%, color-mix(in oklab, var(--muted) 55%, transparent), transparent)",
          }}
        />
        <div className="relative w-full max-w-sm rounded-xl border border-border bg-card p-8">
          <div className="mb-7 flex flex-col items-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full border border-border bg-muted">
              <Lock width={20} height={20} className="text-muted-foreground" />
            </div>
            <h2 className="m-0 text-[18px] font-semibold text-foreground">{siteName || "Protected site"}</h2>
            <p className="mb-0 mt-1.5 text-[13px] text-muted-foreground">Enter password to continue</p>
          </div>
          <form onSubmit={(e) => void verifyPassword(e)} className="flex flex-col gap-3">
            <div className="relative">
              <Lock size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={passwordRef}
                type="password"
                placeholder="Password"
                value={enteredPassword}
                onChange={(e) => setEnteredPassword(e.target.value)}
                className="w-full rounded-lg border border-border bg-background py-2.5 pr-4 pl-9 font-[inherit] text-[14px] text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-ring/50 focus:ring-1 focus:ring-ring/20"
              />
            </div>
            {authError ? <span className="pl-1 text-[12px] font-medium text-destructive">{authError}</span> : null}
            <Button type="primary" htmlType="submit" block disabled={!enteredPassword} loading={verifying}>
              Unlock
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (html == null) {
    return <div className="flex min-h-screen items-center justify-center p-6 font-sans text-sm text-neutral-500">Loading…</div>;
  }

  return (
    <div className="relative h-screen w-full">
      <iframe key={frameEpoch} ref={iframeRef} title={siteName || slug || "site"} className="h-screen w-full border-0 bg-white" srcDoc={html} />
      {submitting ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/40 text-sm text-muted-foreground backdrop-blur-[1px]">
          Submitting…
        </div>
      ) : null}
    </div>
  );
}
