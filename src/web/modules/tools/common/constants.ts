// ─── Param type ───────────────────────────────────────────────────────────────

export interface Param {
  id: string;
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  required: boolean;
}

// ─── Default code template ────────────────────────────────────────────────────

export const DEFAULT_CODE = `# @name Search Products
# @description Search for products from the API based on query, tags and filters
# @param {string} query (required) - Search query text
# @param {number} limit (optional) - Max results to return
# @param {string[]} tags (optional) - List of tags to filter
# @param {object} filters (optional) - Additional filter options
# @param {string} filters.category (optional) - Category name
# @param {object[]} items (optional) - Array of item objects
# @param {string} items[].name (optional) - Item name
# @param {number} items[].price (optional) - Item price
import urllib.request
import json

query = input.get("query", "")
limit = input.get("limit", 5)
tags = input.get("tags", [])
filters = input.get("filters", {})
items = input.get("items", [])

params = urllib.parse.urlencode({"q": query, "limit": limit})
url = f"https://api.example.com/search?{params}"
with urllib.request.urlopen(url) as r:
    data = json.loads(r.read())

return {"results": data.get("items", [])[:limit]}
`;
