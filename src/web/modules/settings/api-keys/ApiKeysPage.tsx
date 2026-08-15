import PenNewSquare from "@solar-icons/react/messages/PenNewSquare";
import LockPassword from "@solar-icons/react/security/LockPassword";
import AddCircle from "@solar-icons/react/ui/AddCircle";
import TrashBinMinimalistic from "@solar-icons/react/ui/TrashBinMinimalistic";
import { Button, Popconfirm, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "src/common/api";
import type { AgentListItem, ApiKey } from "src/common/types";
import RenderIf from "src/components/RenderIf";
import { ApiKeyFormDialog } from "./ApiKeyFormDialog";
import { CreatedKeyDialog } from "./CreatedKeyDialog";

function formatWhen(value: Date | string | null | undefined): string {
  if (!value) return "Never";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleString();
}

export function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editKey, setEditKey] = useState<ApiKey | null>(null);
  const [created, setCreated] = useState<ApiKey | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [keyResult, agentResult] = await Promise.all([
        apiClient.get<{ items: ApiKey[] }>("/api/api-keys"),
        apiClient.get<{ items: AgentListItem[] }>("/api/agents", { page: 1, limit: 200, sorts: "name" }),
      ]);
      setKeys(keyResult.items);
      setAgents(agentResult.items);
    } catch {
      message.error("Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const agentName = (id: string) => agents.find((a) => a.id === id)?.name ?? id.slice(0, 8);

  const handleCreated = (key: ApiKey) => {
    setKeys((prev) => [key, ...prev]);
    setShowCreate(false);
    setCreated(key);
  };

  const handleUpdated = (key: ApiKey) => {
    setKeys((prev) => prev.map((item) => (item.id === key.id ? { ...item, ...key, key: undefined } : item)));
    setEditKey(null);
    message.success("Updated");
  };

  const handleRevoke = async (id: string) => {
    try {
      const updated = await apiClient.post<ApiKey>(`/api/api-keys/${id}/revoke`);
      setKeys((prev) => prev.map((item) => (item.id === id ? updated : item)));
      message.success("Revoked");
    } catch {
      message.error("Failed to revoke");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/api/api-keys/${id}`);
      setKeys((prev) => prev.filter((item) => item.id !== id));
      message.success("Deleted");
    } catch {
      message.error("Failed to delete");
    }
  };

  const columns: ColumnsType<ApiKey> = [
    {
      title: "Name",
      key: "name",
      render: (_, row) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{row.name}</div>
          <div className="truncate font-mono text-[11px] text-tertiary-foreground">{row.keyPrefix}…</div>
        </div>
      ),
    },
    {
      title: "Agents",
      key: "agents",
      render: (_, row) =>
        row.agentIds.length === 0 ? (
          <span className="text-xs text-muted-foreground">None</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.agentIds.map((id) => (
              <Tag key={id} className="m-0">
                {agentName(id)}
              </Tag>
            ))}
          </div>
        ),
    },
    {
      title: "Last used",
      key: "lastUsed",
      width: 180,
      render: (_, row) => <span className="text-xs text-muted-foreground">{formatWhen(row.lastUsedAt)}</span>,
    },
    {
      title: "",
      key: "status",
      width: 88,
      render: (_, row) => (row.revokedAt ? <Tag color="red">Revoked</Tag> : null),
    },
    {
      title: "",
      key: "actions",
      width: 120,
      align: "right",
      render: (_, row) => (
        <div className="flex items-center justify-end gap-0.5">
          <Button
            type="text"
            size="small"
            icon={<PenNewSquare />}
            onClick={() => setEditKey(row)}
            aria-label={`Edit ${row.name}`}
            className="inline-flex items-center justify-center !size-7 !px-0"
          />
          <RenderIf condition={!row.revokedAt}>
            <Popconfirm title="Revoke this key?" okText="Revoke" okType="danger" onConfirm={() => void handleRevoke(row.id)}>
              <Button type="text" size="small" className="!px-1.5 text-xs text-muted-foreground">
                Revoke
              </Button>
            </Popconfirm>
          </RenderIf>
          <Popconfirm title="Delete this key?" okText="Delete" okType="danger" onConfirm={() => void handleDelete(row.id)}>
            <Button
              type="text"
              size="small"
              icon={<TrashBinMinimalistic />}
              aria-label={`Delete ${row.name}`}
              className="inline-flex items-center justify-center !size-7 !px-0"
            />
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-sm text-muted-foreground">
          {keys.length} key{keys.length !== 1 ? "s" : ""}
        </p>
        <Button type="primary" icon={<AddCircle width={14} height={14} />} onClick={() => setShowCreate(true)}>
          New API key
        </Button>
      </div>

      <Table<ApiKey>
        rowKey="id"
        columns={columns}
        dataSource={keys}
        loading={loading}
        pagination={false}
        locale={{
          emptyText: (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
                <LockPassword width={20} height={20} />
              </div>
              <div>
                <div className="text-base font-medium text-foreground">No API keys yet</div>
                <div className="mt-1 text-sm text-muted-foreground">Create a key to chat with agents over HTTP.</div>
              </div>
              <Button type="primary" size="small" icon={<AddCircle width={12} height={12} />} onClick={() => setShowCreate(true)}>
                New API key
              </Button>
            </div>
          ),
        }}
      />

      <RenderIf condition={showCreate}>
        <ApiKeyFormDialog agents={agents} onClose={() => setShowCreate(false)} onCreated={handleCreated} onUpdated={handleUpdated} />
      </RenderIf>
      <RenderIf condition={!!editKey}>
        <ApiKeyFormDialog edit={editKey} agents={agents} onClose={() => setEditKey(null)} onCreated={handleCreated} onUpdated={handleUpdated} />
      </RenderIf>
      <RenderIf condition={!!created?.key}>
        <CreatedKeyDialog apiKey={created?.key ?? ""} agentId={created?.agentIds[0]} onClose={() => setCreated(null)} />
      </RenderIf>
    </div>
  );
}
