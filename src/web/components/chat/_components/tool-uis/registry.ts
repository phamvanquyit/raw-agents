import type { ComponentType } from "react";
import { isCallAgentToolName } from "../../common/utils";
import { BrowserToolUI } from "./BrowserToolUI";
import { CallAgentToolUI } from "./CallAgentToolUI";
import { GetCurrentTimeToolUI } from "./GetCurrentTimeToolUI";
import { ManageMemoryToolUI } from "./ManageMemoryToolUI";
import type { ToolUIProps } from "./types";

type ToolUIEntry = {
  match: (toolName: string) => boolean;
  component: ComponentType<ToolUIProps>;
};

const TOOL_UIS: ToolUIEntry[] = [
  { match: isCallAgentToolName, component: CallAgentToolUI },
  { match: (n) => n === "browser", component: BrowserToolUI },
  { match: (n) => n === "get_current_time", component: GetCurrentTimeToolUI },
  { match: (n) => n === "manage_memory", component: ManageMemoryToolUI },
];

export function resolveToolUI(toolName: string | null | undefined): ComponentType<ToolUIProps> | null {
  if (!toolName) return null;
  for (const entry of TOOL_UIS) {
    if (entry.match(toolName)) return entry.component;
  }
  return null;
}
