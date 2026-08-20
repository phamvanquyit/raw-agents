import { slugify } from "../../../common/utils/slug.js";

// ─── Code Annotation Parser ──────────────────────────────────────────────────
// Parses @name, @description, and @param annotations from Python tool code.
// Used server-side to auto-derive tool metadata whenever codeContent is updated.

// ─── Types ───────────────────────────────────────────────────────────────────

interface RawAnnotation {
  rawType: string;
  name: string;
  required: boolean;
  description: string;
}

export interface CodeMeta {
  name?: string;
  label?: string;
  description?: string;
}

// ─── Regex ───────────────────────────────────────────────────────────────────

// Matches: @param {type} name (required|optional) - description
const ANNOTATION_REGEX = /@param\s+\{([^}]+)\}\s+([\w.\[\]]+)(?:\s+\((required|optional)\))?(?:\s+-\s+(.+))?/g;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseEnumValues(rawType: string): string[] {
  const colonIdx = rawType.indexOf(":");
  if (colonIdx === -1) return [];
  return rawType
    .slice(colonIdx + 1)
    .split("|")
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseAnnotations(code: string): RawAnnotation[] {
  const annotations: RawAnnotation[] = [];

  // Extract only the leading comment/annotation block.
  // Stops at the first non-comment, non-blank line to handle cases
  // where @param annotations are immediately followed by code (no blank line).
  const headerLines: string[] = [];
  for (const line of code.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      headerLines.push(line);
    } else {
      break;
    }
  }
  const headerBlock = headerLines.join("\n");

  for (const match of headerBlock.matchAll(ANNOTATION_REGEX)) {
    annotations.push({
      rawType: match[1],
      name: match[2],
      required: match[3] !== "optional",
      description: match[4]?.trim() ?? "",
    });
  }
  return annotations;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Parse @name and @description from code comment annotations. */
export function parseMetaFromCode(code: string): CodeMeta {
  const meta: CodeMeta = {};
  const nameMatch = code.match(/^#\s*@name\s+(.+)$/m);
  if (nameMatch) meta.label = nameMatch[1].trim();
  const descMatch = code.match(/^#\s*@description\s+(.+)$/m);
  if (descMatch) meta.description = descMatch[1].trim();
  if (meta.label) {
    meta.name = slugify(meta.label, "_");
  }
  return meta;
}

/**
 * Build a rich JSON Schema from code @param annotations.
 * Supports primitives, typed arrays, enums, nested objects, and array-of-objects.
 */
export function buildJsonSchemaFromCode(code: string) {
  const annotations = parseAnnotations(code);
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  for (const a of annotations) {
    if (a.name.includes(".") || a.name.includes("[")) continue;
    const { rawType } = a;
    const desc = a.description || undefined;
    if (rawType.startsWith("enum:")) {
      const values = parseEnumValues(rawType);
      properties[a.name] = { type: "string", ...(values.length > 0 ? { enum: values } : {}), description: desc };
    } else if (rawType === "object[]") {
      properties[a.name] = { type: "array", items: { type: "object", properties: {} }, description: desc };
    } else if (rawType.endsWith("[]")) {
      properties[a.name] = { type: "array", items: { type: rawType.slice(0, -2) }, description: desc };
    } else if (rawType === "object") {
      properties[a.name] = { type: "object", properties: {}, description: desc };
    } else {
      properties[a.name] = { type: rawType, description: desc };
    }
    if (a.required) required.push(a.name);
  }

  // Second pass: nested props (dot-notation and array-item notation)
  for (const a of annotations) {
    if (!a.name.includes(".") && !a.name.includes("[")) continue;

    const arrayItemMatch = a.name.match(/^([\w]+)\[\]\.(.+)$/);
    if (arrayItemMatch) {
      const parent = arrayItemMatch[1];
      const child = arrayItemMatch[2];
      const parentProp = properties[parent];
      if (!parentProp || parentProp.type !== "array") continue;
      const items = parentProp.items as Record<string, unknown>;
      if (items.type !== "object") continue;
      const subProps = (items.properties ?? {}) as Record<string, unknown>;
      const desc = a.description || undefined;
      const { rawType } = a;
      if (rawType.startsWith("enum:")) {
        const values = parseEnumValues(rawType);
        subProps[child] = { type: "string", ...(values.length > 0 ? { enum: values } : {}), description: desc };
      } else {
        subProps[child] = rawType.endsWith("[]")
          ? { type: "array", items: { type: rawType.slice(0, -2) }, description: desc }
          : { type: rawType, description: desc };
      }
      items.properties = subProps;
      continue;
    }

    const dotIdx = a.name.indexOf(".");
    const parent = a.name.slice(0, dotIdx);
    const child = a.name.slice(dotIdx + 1);
    const parentProp = properties[parent];
    if (!parentProp || parentProp.type !== "object") continue;
    const subProps = (parentProp.properties ?? {}) as Record<string, unknown>;
    const desc = a.description || undefined;
    const { rawType } = a;
    if (rawType.startsWith("enum:")) {
      const values = parseEnumValues(rawType);
      subProps[child] = { type: "string", ...(values.length > 0 ? { enum: values } : {}), description: desc };
    } else {
      subProps[child] = rawType.endsWith("[]")
        ? { type: "array", items: { type: rawType.slice(0, -2) }, description: desc }
        : { type: rawType, description: desc };
    }
    parentProp.properties = subProps;
  }

  return { type: "object" as const, properties, required };
}
