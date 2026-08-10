import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BadRequestException } from "../../common/exceptions/http.exception.js";
import { getSiteRoot, treeContentHash } from "./sites-fs.js";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const MAX_THUMBNAIL_BYTES = 3 * 1024 * 1024;

function thumbnailPath(siteId: string) {
  return join(getSiteRoot(siteId), "thumbnail.png");
}

function thumbnailMetaPath(siteId: string) {
  return join(getSiteRoot(siteId), "thumbnail.hash");
}

/** Read thumbnail from the site directory, or null if missing. */
export function readSiteThumbnailPng(siteId: string): Buffer | null {
  const path = thumbnailPath(siteId);
  if (!existsSync(path)) return null;
  try {
    const buf = readFileSync(path);
    if (buf.length < 8) return null;
    return buf;
  } catch {
    return null;
  }
}

/** Persist a client-captured PNG under `{dataDir}/sites/{id}/thumbnail.png`. */
export function writeSiteThumbnailPng(siteId: string, png: Buffer): void {
  if (!Buffer.isBuffer(png) || png.length < 8) {
    throw new BadRequestException("Invalid thumbnail image");
  }
  if (png.length > MAX_THUMBNAIL_BYTES) {
    throw new BadRequestException("Thumbnail too large");
  }
  if (!png.subarray(0, 4).equals(PNG_MAGIC)) {
    throw new BadRequestException("Thumbnail must be a PNG");
  }

  const root = getSiteRoot(siteId);
  mkdirSync(root, { recursive: true });
  writeFileSync(thumbnailPath(siteId), png);
  writeFileSync(thumbnailMetaPath(siteId), treeContentHash(siteId, "draft"), "utf8");
}

export function hasSiteThumbnail(siteId: string): boolean {
  return readSiteThumbnailPng(siteId) !== null;
}
