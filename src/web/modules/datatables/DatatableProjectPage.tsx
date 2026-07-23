import { AddCircle, Database } from "@solar-icons/react";
import { Button, Drawer, message } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { DatatableColumn, DatatableProject, DatatableTable } from "src/common/types";
import { datatablesApi } from "./common/datatablesApi";
import { SchemaPropertiesDialog } from "./components/SchemaPropertiesDialog";
import { TableDialog } from "./components/TableDialog";
import { type TableRowsCreateControls, TableRowsPanel } from "./components/TableRowsPanel";
import { type FlowNode, schemaNodeTypes } from "./components/schema-nodes";
import "@xyflow/react/dist/style.css";
import { Background, BackgroundVariant, ReactFlow, useNodesState } from "@xyflow/react";

const NODE_WIDTH = 260;
const GAP_X = 40;

/** Lay tables out left → right in a single row. */
function layoutTableNodes(
  tables: DatatableTable[],
  columnsMap: Record<string, DatatableColumn[]>,
  onSelect: (id: string) => void,
  onEditProperties: (id: string) => void,
): FlowNode[] {
  if (tables.length === 0) return [];

  return tables.map((table, index) => {
    const cols = columnsMap[table.id] ?? [];

    return {
      id: table.id,
      type: "table",
      position: { x: index * (NODE_WIDTH + GAP_X), y: 0 },
      data: {
        label: table.name,
        columns: cols,
        onClick: () => onSelect(table.id),
        onEditProperties: () => onEditProperties(table.id),
      },
      draggable: true,
      // Only the header icon / name starts a drag — body clicks open the drawer.
      dragHandle: ".table-drag-handle",
    };
  });
}

export default function DatatableProjectPage() {
  const { projectId = "" } = useParams();
  const [project, setProject] = useState<DatatableProject | null>(null);
  const [tables, setTables] = useState<DatatableTable[]>([]);
  const [columnsMap, setColumnsMap] = useState<Record<string, DatatableColumn[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [editPropertiesTableId, setEditPropertiesTableId] = useState<string | null>(null);
  const [tableDialog, setTableDialog] = useState<DatatableTable | "create" | null>(null);
  const [createControls, setCreateControls] = useState<TableRowsCreateControls | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);

  const handleSelectTable = useCallback((id: string) => {
    setSelectedTableId(id);
    setCreateControls(null);
  }, []);

  const handleCreateControlsChange = useCallback((controls: TableRowsCreateControls | null) => {
    setCreateControls(controls);
  }, []);

  const handleEditProperties = useCallback((id: string) => {
    setEditPropertiesTableId(id);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const schema = await datatablesApi.getProjectSchema(projectId);
      setProject(schema.project);
      setTables(schema.tables.map(({ columns: _columns, ...table }) => table));
      setColumnsMap(Object.fromEntries(schema.tables.map((t) => [t.id, t.columns])));
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (loading) return;
    setNodes(layoutTableNodes(tables, columnsMap, handleSelectTable, handleEditProperties));
  }, [loading, tables, columnsMap, setNodes, handleSelectTable, handleEditProperties]);

  const selectedTable = useMemo(() => tables.find((t) => t.id === selectedTableId) ?? null, [tables, selectedTableId]);
  const editPropertiesTable = useMemo(
    () => tables.find((t) => t.id === editPropertiesTableId) ?? null,
    [tables, editPropertiesTableId],
  );
  const editPropertiesColumns = editPropertiesTableId ? (columnsMap[editPropertiesTableId] ?? []) : [];

  const handleDrawerClose = useCallback(() => {
    setSelectedTableId(null);
    setCreateControls(null);
  }, []);

  const handleTableCreated = useCallback((table: DatatableTable) => {
    setTables((prev) => [...prev, table]);
    setColumnsMap((prev) => ({ ...prev, [table.id]: [] }));
  }, []);

  const handleTableUpdated = useCallback((table: DatatableTable) => {
    setTables((prev) => prev.map((t) => (t.id === table.id ? table : t)));
  }, []);

  const handleTableDeleted = useCallback(
    (tableId: string) => {
      setTables((prev) => prev.filter((t) => t.id !== tableId));
      setColumnsMap((prev) => {
        const next = { ...prev };
        delete next[tableId];
        return next;
      });
      if (selectedTableId === tableId) {
        setSelectedTableId(null);
        setCreateControls(null);
      }
    },
    [selectedTableId],
  );

  const handleTableSchemaSaved = useCallback((table: DatatableTable, columns: DatatableColumn[]) => {
    setTables((prev) => prev.map((t) => (t.id === table.id ? { ...t, ...table } : t)));
    setColumnsMap((prev) => ({ ...prev, [table.id]: columns }));
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading schema...</div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border-subtle px-4 py-3">
        <Database width={20} height={20} weight="BoldDuotone" className="shrink-0 text-brand-soft" />
        <h1 className="m-0 truncate text-lg font-semibold text-foreground">{project?.name ?? "…"}</h1>
        <span className="text-sm text-muted-foreground">
          {tables.length} {tables.length === 1 ? "table" : "tables"}
        </span>
        <div className="ml-auto">
          <Button type="primary" icon={<AddCircle width={16} height={16} />} onClick={() => setTableDialog("create")}>
            New table
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-background">
        {tables.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6">
            <span className="mb-3 flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Database width={24} height={24} weight="BoldDuotone" />
            </span>
            <p className="m-0 text-sm font-medium text-foreground">No tables yet</p>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">Create a table to get started</p>
            <Button type="primary" icon={<AddCircle width={16} height={16} />} onClick={() => setTableDialog("create")}>
              New table
            </Button>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            onNodesChange={onNodesChange}
            nodeTypes={schemaNodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            minZoom={0.6}
            maxZoom={1.5}
            nodesConnectable={false}
            edgesFocusable={false}
            elementsSelectable
            proOptions={{ hideAttribution: true }}
            className="!bg-transparent"
          >
            <Background variant={BackgroundVariant.Dots} gap={30} size={1.8} color="color-mix(in oklab, var(--color-foreground) 18%, transparent)" />
          </ReactFlow>
        )}
      </div>

      <Drawer
        open={!!selectedTableId}
        onClose={handleDrawerClose}
        title={selectedTable?.name ?? ""}
        size={window.innerWidth * 0.85}
        extra={
          <Button
            type="text"
            size="small"
            disabled={!createControls?.enabled}
            icon={<AddCircle width={14} height={14} />}
            onClick={() => createControls?.openCreate()}
            className="text-muted-foreground"
          >
            Add new row
          </Button>
        }
        styles={{
          section: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" },
          body: { padding: 0, flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" },
        }}
        destroyOnHidden
      >
        {selectedTableId ? (
          <TableRowsPanel
            tableId={selectedTableId}
            columns={columnsMap[selectedTableId] ?? []}
            onCreateControlsChange={handleCreateControlsChange}
          />
        ) : null}
      </Drawer>

      {tableDialog ? (
        <TableDialog
          projectId={projectId}
          edit={tableDialog === "create" ? null : tableDialog}
          onClose={() => setTableDialog(null)}
          onSaved={(table) => {
            if (tableDialog === "create") handleTableCreated(table);
            else handleTableUpdated(table);
          }}
        />
      ) : null}

      {editPropertiesTableId ? (
        <SchemaPropertiesDialog
          tableId={editPropertiesTableId}
          tableName={editPropertiesTable?.name ?? ""}
          columns={editPropertiesColumns}
          onClose={() => setEditPropertiesTableId(null)}
          onSaved={(table, columns) => {
            setEditPropertiesTableId(null);
            handleTableSchemaSaved(table, columns);
          }}
          onDeleted={() => {
            const id = editPropertiesTableId;
            setEditPropertiesTableId(null);
            handleTableDeleted(id);
          }}
        />
      ) : null}
    </div>
  );
}
