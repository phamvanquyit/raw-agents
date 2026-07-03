// ─── Deletable Edge ──────────────────────────────────────────────────────────
// Custom edge that shows a delete (✕) button at the midpoint when selected.
// Clicking the edge selects it (handled by React Flow); clicking ✕ deletes it.

import { BaseEdge, type Edge, type EdgeProps, getBezierPath } from "@xyflow/react";

export type DeletableEdgeData = {
  onDelete: () => void;
};

export type DeletableEdgeType = Edge<DeletableEdgeData>;

export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  selected,
  data,
}: EdgeProps<DeletableEdgeType>) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  return (
    <>
      {/* Invisible wider path for easier click target */}
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={20} className="react-flow__edge-interaction" />

      {/* Visible edge path — highlight when selected */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          ...(selected ? { stroke: "#ff4d6d", strokeWidth: 3, opacity: 1 } : {}),
        }}
        markerEnd={markerEnd}
      />

      {/* Delete button — shown on the horizontal segment near the source handle */}
      {selected && (
        <foreignObject width={32} height={32} x={sourceX - 36} y={sourceY - 16} className="overflow-visible" requiredExtensions="http://www.w3.org/1999/xhtml">
          <div className="w-full h-full flex items-center justify-center">
            <button
              type="button"
              className="w-5 h-5 rounded-full bg-danger text-white text-[10px] font-bold cursor-pointer flex items-center justify-center transition-all duration-150 shadow-[0_2px_8px_rgba(0,0,0,0.4)] leading-none p-0 font-[inherit] border-none hover:w-6 hover:h-6 hover:shadow-[0_0_12px_rgba(255,77,109,0.5)]"
              onClick={(e) => {
                e.stopPropagation();
                data?.onDelete?.();
              }}
              title="Remove connection"
            >
              ✕
            </button>
          </div>
        </foreignObject>
      )}
    </>
  );
}
