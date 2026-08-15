/**
 * Python package source injected into each tool sandbox as `import rawagents`.
 * Talks to the localhost proxy started by python-runner.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const RAWAGENTS_INIT_PY = `from . import datatable, kv, secrets

__all__ = ["datatable", "kv", "secrets"]
`;

export const RAWAGENTS_CLIENT_PY = `import json, os, urllib.request

_URL = os.environ.get("RAWAGENTS_URL", "")
_TOKEN = os.environ.get("RAWAGENTS_TOKEN", "")

class RawagentsError(Exception):
    pass

def _call(ns, action, args=None):
    if not _URL or not _TOKEN:
        raise RawagentsError("rawagents runtime is not configured")
    payload = json.dumps({"ns": ns, "action": action, "args": args or {}}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        _URL.rstrip("/") + "/",
        data=payload,
        headers={"Content-Type": "application/json; charset=utf-8", "X-Rawagents-Token": _TOKEN},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        raise RawagentsError(str(e)) from e
    if not data.get("ok"):
        raise RawagentsError(data.get("error") or "rawagents call failed")
    return data.get("result")
`;

export const RAWAGENTS_KV_PY = `from ._client import _call

def get(key, default=None):
    result = _call("kv", "get", {"key": key})
    if result is None:
        return default
    return result

def set(key, value):
    return _call("kv", "set", {"key": key, "value": value})

def list():
    return _call("kv", "list")

def delete(key):
    return _call("kv", "delete", {"key": key})
`;

export const RAWAGENTS_SECRETS_PY = `from ._client import _call

def get(key, default=None):
    result = _call("secrets", "get", {"key": key})
    if result is None:
        return default
    return result

def list():
    return _call("secrets", "list")
`;

export const RAWAGENTS_DATATABLE_PY = `from ._client import _call

def list_projects():
    return _call("datatable", "list_projects")

def get_schema(project):
    """Full project schema: all tables + columns. project = id (preferred) or name."""
    return _call("datatable", "get_schema", {"project": project})

def query(project, table, where=None, order_by=None, limit=50, offset=0):
    return _call("datatable", "query", {
        "project": project,
        "table": table,
        "where": where,
        "order_by": order_by,
        "limit": limit,
        "offset": offset,
    })

def insert(project, table, rows):
    return _call("datatable", "insert", {"project": project, "table": table, "rows": rows})

def update(project, table, row_id, data):
    return _call("datatable", "update", {"project": project, "table": table, "row_id": row_id, "data": data})

def delete(project, table, row_ids):
    return _call("datatable", "delete", {"project": project, "table": table, "row_ids": row_ids})
`;

export function writeRawagentsPackage(sandboxDir: string) {
  const dir = join(sandboxDir, "rawagents");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "__init__.py"), RAWAGENTS_INIT_PY, "utf-8");
  writeFileSync(join(dir, "_client.py"), RAWAGENTS_CLIENT_PY, "utf-8");
  writeFileSync(join(dir, "kv.py"), RAWAGENTS_KV_PY, "utf-8");
  writeFileSync(join(dir, "secrets.py"), RAWAGENTS_SECRETS_PY, "utf-8");
  writeFileSync(join(dir, "datatable.py"), RAWAGENTS_DATATABLE_PY, "utf-8");
}
