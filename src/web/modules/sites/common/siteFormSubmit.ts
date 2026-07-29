/** postMessage type: iframe → parent when a POST site form is submitted */
export const RA_SITE_FORM_SUBMIT = "ra-site-form-submit";

/** parent → iframe: disable forms while action runs */
export const RA_SITE_FORM_BUSY = "ra-site-form-busy";

export type RaSiteFormSubmitMessage = {
  type: typeof RA_SITE_FORM_SUBMIT;
  entries: [string, string][];
  path?: string;
};

export type SiteActionResult = {
  ok?: boolean;
  message?: string;
  /** Default true — soft re-SSR after action. Set false for toast-only (e.g. validation). */
  reload?: boolean;
};

export function isRaSiteFormSubmitMessage(data: unknown): data is RaSiteFormSubmitMessage {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (d.type !== RA_SITE_FORM_SUBMIT || !Array.isArray(d.entries)) return false;
  for (const entry of d.entries) {
    if (!Array.isArray(entry) || entry.length !== 2) return false;
    if (typeof entry[0] !== "string" || typeof entry[1] !== "string") return false;
  }
  if (d.path !== undefined && typeof d.path !== "string") return false;
  return true;
}

export function formDataFromEntries(entries: [string, string][]): FormData {
  const fd = new FormData();
  for (const [key, value] of entries) {
    fd.append(key, value);
  }
  return fd;
}

export function shouldReloadAfterAction(result: SiteActionResult | undefined): boolean {
  return result?.reload !== false;
}

export function isAllowedSiteFormMessageOrigin(origin: string): boolean {
  // srcDoc iframes report opaque origin "null"; trust event.source === iframe.contentWindow instead.
  return origin === window.location.origin || origin === "null";
}

export function postSiteFormBusy(iframe: HTMLIFrameElement | null | undefined, busy: boolean) {
  // "*" required: srcDoc contentWindow often has opaque origin and rejects parent origin as target.
  iframe?.contentWindow?.postMessage({ type: RA_SITE_FORM_BUSY, busy }, "*");
}
