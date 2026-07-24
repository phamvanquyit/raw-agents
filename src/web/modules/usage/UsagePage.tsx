import { Refresh } from "@solar-icons/react";
import { Button, Empty, Select, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppTimezone } from "src/common/hooks/useAppTimezone";
import { formatDateTimeInTz } from "src/common/utils/date";
import DatePicker from "src/components/DatePicker";
import { fetchAgents } from "src/modules/agents/common/agentsSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { type TokenUsageRow, type UsageSummary, formatTokenCount, usageApi } from "./common/usageApi";

const { RangePicker } = DatePicker;

/** `provider/model` → `model` for display. */
function shortModelName(model: string | null | undefined): string {
  if (!model) return "—";
  const i = model.lastIndexOf("/");
  return i >= 0 ? model.slice(i + 1) : model;
}

/** Wall-clock picker dates for [1st of this month, today] in app timezone. */
function monthToNowPickerRange(timeZone: string, now = new Date()): [Date, Date] {
  const zoned = toZonedTime(now, timeZone);
  const start = new Date(zoned.getFullYear(), zoned.getMonth(), 1);
  const end = new Date(zoned.getFullYear(), zoned.getMonth(), zoned.getDate());
  return [start, end];
}

function pickerDayStartUnix(pickerDate: Date, timeZone: string): number {
  const wall = new Date(pickerDate.getFullYear(), pickerDate.getMonth(), pickerDate.getDate(), 0, 0, 0, 0);
  return Math.floor(fromZonedTime(wall, timeZone).getTime() / 1000);
}

function pickerDayEndUnix(pickerDate: Date, timeZone: string): number {
  const wall = new Date(pickerDate.getFullYear(), pickerDate.getMonth(), pickerDate.getDate(), 23, 59, 59, 999);
  return Math.floor(fromZonedTime(wall, timeZone).getTime() / 1000);
}

function isSamePickerDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Convert picker range → unix seconds, using app timezone. End=today → now. */
function rangeToUnix(range: [Date, Date], timeZone: string): { from: number; to: number } {
  const from = pickerDayStartUnix(range[0], timeZone);
  const zonedNow = toZonedTime(new Date(), timeZone);
  const today = new Date(zonedNow.getFullYear(), zonedNow.getMonth(), zonedNow.getDate());
  const to = isSamePickerDay(range[1], today) ? Math.floor(Date.now() / 1000) : pickerDayEndUnix(range[1], timeZone);
  return { from, to };
}

function formatProviderOrEstimate(provider: number | null | undefined, estimate: number | null | undefined): string {
  if (provider != null) return formatTokenCount(provider);
  if (estimate != null && estimate > 0) return `~${formatTokenCount(estimate)}`;
  return "—";
}

function SummaryStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-muted/30 px-3 py-2.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export default function UsagePage() {
  const dispatch = useAppDispatch();
  const timeZone = useAppTimezone();
  const agents = useAppSelector((s) => s.agents.items);

  const [items, setItems] = useState<TokenUsageRow[]>([]);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [agentId, setAgentId] = useState<string | undefined>();
  const [model, setModel] = useState<string | undefined>();
  const [range, setRange] = useState<[Date, Date] | null>(null);
  const rangeTouchedRef = useRef(false);

  useEffect(() => {
    void dispatch(fetchAgents());
    void usageApi
      .models()
      .then((res) => setModels(res.items))
      .catch(() => setModels([]));
  }, [dispatch]);

  // Default: this month → today, in Settings timezone (re-sync if tz loads after mount)
  useEffect(() => {
    if (rangeTouchedRef.current) return;
    setRange(monthToNowPickerRange(timeZone));
  }, [timeZone]);

  const dateParams = useMemo(() => (range ? rangeToUnix(range, timeZone) : {}), [range, timeZone]);

  const listParams = useMemo(
    () => ({
      agentId,
      model,
      ...dateParams,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    [agentId, model, dateParams, page],
  );

  const summaryParams = useMemo(
    () => ({
      agentId,
      model,
      ...dateParams,
    }),
    [agentId, model, dateParams],
  );

  const load = useCallback(async () => {
    if (!range && !rangeTouchedRef.current) return;
    setLoading(true);
    try {
      const [list, sum] = await Promise.all([usageApi.list(listParams), usageApi.summary(summaryParams)]);
      setItems(list.items);
      setTotal(list.total);
      setSummary(sum);
    } catch {
      setItems([]);
      setTotal(0);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [listParams, summaryParams, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const agentOptions = useMemo(() => agents.map((a) => ({ value: a.id, label: a.name || a.id })), [agents]);

  const modelOptions = useMemo(() => models.map((m) => ({ value: m, label: shortModelName(m) })), [models]);

  const columns: ColumnsType<TokenUsageRow> = [
    {
      title: "Agent",
      dataIndex: "agentName",
      ellipsis: true,
      render: (v: string | null | undefined, row) => v || row.agentId || "—",
    },
    {
      title: "Model",
      dataIndex: "model",
      ellipsis: true,
      render: (v: string | null) => shortModelName(v),
    },
    {
      title: "Input",
      dataIndex: "inputTokens",
      width: 100,
      align: "right",
      render: (v: number | null) => <span className="tabular-nums">{v != null ? formatTokenCount(v) : "—"}</span>,
    },
    {
      title: "Output",
      dataIndex: "outputTokens",
      width: 100,
      align: "right",
      render: (v: number | null) => <span className="tabular-nums">{v != null ? formatTokenCount(v) : "—"}</span>,
    },
    {
      title: "Total",
      dataIndex: "totalTokens",
      width: 110,
      align: "right",
      render: (v: number | null, row) => <span className="tabular-nums">{formatProviderOrEstimate(v, row.estimatedTotal)}</span>,
    },
    {
      title: "Time",
      dataIndex: "createdAt",
      width: 160,
      render: (v: string | Date) => formatDateTimeInTz(v, timeZone) || "—",
    },
  ];

  const summaryTotal =
    summary == null
      ? "—"
      : summary.totalTokens > 0
        ? formatTokenCount(summary.totalTokens)
        : summary.estimatedTotal > 0
          ? `~${formatTokenCount(summary.estimatedTotal)}`
          : "0";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select
          allowClear
          showSearch={{ optionFilterProp: "label" }}
          placeholder="All agents"
          className="w-48"
          size="small"
          value={agentId}
          options={agentOptions}
          onChange={(v) => {
            setAgentId(v);
            setPage(1);
          }}
        />
        <Select
          allowClear
          showSearch={{ optionFilterProp: "label" }}
          placeholder="All models"
          className="w-56"
          size="small"
          value={model}
          options={modelOptions}
          onChange={(v) => {
            setModel(v);
            setPage(1);
          }}
        />
        <RangePicker
          allowClear
          size="small"
          className="w-[240px]"
          value={range}
          onChange={(dates) => {
            rangeTouchedRef.current = true;
            if (dates?.[0] && dates?.[1]) setRange([dates[0], dates[1]]);
            else setRange(null);
            setPage(1);
          }}
        />
        <Button size="small" icon={<Refresh width={14} height={14} />} onClick={() => void load()} loading={loading}>
          Refresh
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <SummaryStat label="Runs" value={summary ? formatTokenCount(summary.runs) : "—"} />
        <SummaryStat
          label="Input"
          value={summary ? formatTokenCount(summary.inputTokens) : "—"}
          hint={summary && summary.inputTokens === 0 && summary.estimatedTotal > 0 ? "Provider usage unavailable" : undefined}
        />
        <SummaryStat label="Output" value={summary ? formatTokenCount(summary.outputTokens) : "—"} />
        <SummaryStat
          label="Total"
          value={summaryTotal}
          hint={summary && summary.totalTokens === 0 && summary.estimatedTotal > 0 ? "Showing estimate (~)" : undefined}
        />
      </div>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={items}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No usage logged yet" /> }}
        pagination={{
          current: page,
          pageSize,
          total,
          onChange: setPage,
          showSizeChanger: false,
          size: "small",
        }}
        size="small"
      />
    </div>
  );
}
