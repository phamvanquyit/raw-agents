import { apiClient } from "src/common/api";
import type { Site, SiteFilesResponse } from "src/common/types";

export const sitesApi = {
  list: (params?: Record<string, string | number>) =>
    apiClient.get<{ items: Site[]; total: number }>("/api/sites", params as Record<string, string | number | boolean | undefined>),

  get: (id: string) => apiClient.get<Site>(`/api/sites/${id}`),

  create: (body: { name: string; slug: string }) => apiClient.post<Site>("/api/sites", body),

  update: (id: string, body: Partial<{ name: string; slug: string; isPublished: boolean; publicPassword: string | null }>) =>
    apiClient.put<Site>(`/api/sites/${id}`, body),

  remove: (id: string) => apiClient.delete<{ ok: boolean }>(`/api/sites/${id}`),

  getFiles: (id: string, tree: "draft" | "prod" = "draft") => apiClient.get<SiteFilesResponse>(`/api/sites/${id}/files`, { tree }),

  putFile: (id: string, file: string, content: string, tree: "draft" | "prod" = "draft") =>
    apiClient.put<{ ok: boolean; draftDirty: boolean; site: Site }>(`/api/sites/${id}/files/${encodeURIComponent(file)}`, { content, tree }),

  install: (id: string, tree: "draft" | "prod" = "draft") => apiClient.post<Site>(`/api/sites/${id}/install`, { tree }),

  preview: (id: string, opts?: { tree?: "draft" | "prod" }) =>
    apiClient.post<{ html: string; data: unknown }>(`/api/sites/${id}/preview`, { tree: opts?.tree ?? "draft" }),

  action: (id: string, formData: FormData) => apiClient.postFormData<{ result: unknown }>(`/api/sites/${id}/action`, formData),

  getThumbnail: (id: string, opts?: { tree?: "draft" | "prod" }) => apiClient.getBlob(`/api/sites/${id}/thumbnail`, { tree: opts?.tree ?? "draft" }),

  resolveSelection: (id: string, body: { sourceAnchor?: string; tagName?: string; className?: string; text?: string; outerHtml?: string }) =>
    apiClient.post<{
      sourceAnchor?: string;
      file: string;
      line?: number;
      excerpt: string;
      matchMethod: "anchor" | "fuzzy" | "none";
    }>(`/api/sites/${id}/resolve-selection`, body),

  approve: (id: string) => apiClient.post<Site>(`/api/sites/${id}/approve`, {}),

  discard: (id: string) => apiClient.post<Site>(`/api/sites/${id}/discard`, {}),
};
