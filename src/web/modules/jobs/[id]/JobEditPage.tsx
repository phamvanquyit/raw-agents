import { AltArrowLeft, CheckCircle, ClockCircle, CloseCircle, Diskette, History, Play, Settings, StopCircle, TrashBinMinimalistic } from "@solar-icons/react";
import { Button, Drawer, Form, Input, InputNumber, Popconfirm, Tag, message } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiClient } from "src/common/api";
import { wsClient } from "src/common/api/wsClient";
import { SettingKey } from "src/common/enum";
import type { ToolActionEvent } from "src/common/hooks/useAssistantStreaming";
import type { Job, JobRun } from "src/common/types";
import { type EditorInstance, MonacoDiffEditor, MonacoEditor } from "src/components/MonacoEditor";
import { getSettingValues } from "src/modules/settings/common/settingsApi";
import { CodingAgentPanel } from "src/modules/tools/[id]/components/CodingAgentPanel";
import { jobsApi } from "../common/jobsApi";
import { type JobSchedule, buildJobCrons, formatJobSchedulesLabel, jobIsScheduled, parseJobSchedules, validateJobSchedules } from "../common/schedule";
import { JobRunsPanel } from "../components/JobRunsPanel";
import { JobSchedulesEditor } from "../components/JobSchedulesEditor";

const JOB_SUGGESTIONS = ["Call an agent and log the reply", "Read secrets and query a datatable", "Wrap work in rawagents.step for clearer timelines"];

export default function JobEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSchedules, setSavingSchedules] = useState(false);
  const [running, setRunning] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [schedulesOpen, setSchedulesOpen] = useState(false);
  const [runsOpen, setRunsOpen] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [schedules, setSchedules] = useState<JobSchedule[]>([]);
  const [timeoutMs, setTimeoutMs] = useState(300_000);

  const [localCode, setLocalCode] = useState("");
  const [savedCode, setSavedCode] = useState("");
  const [codeDraft, setCodeDraft] = useState<string | null>(null);
  const codeRef = useRef(localCode);
  codeRef.current = localCode;
  const editorRef = useRef<EditorInstance | null>(null);
  const loadedIdRef = useRef<string | null>(null);

  const [runs, setRuns] = useState<JobRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const [providerId, setProviderId] = useState<string | undefined>();
  const [model, setModel] = useState("");

  const isDirty = localCode !== savedCode;
  const schedulesDirty = buildJobCrons(schedules) !== (job?.cron ?? "");
  const isOn = jobIsScheduled(job?.cron);
  const scheduleLabel = formatJobSchedulesLabel(job?.cron);

  const loadRuns = useCallback(async (jobId: string) => {
    const res = await jobsApi.listRuns(jobId, { limit: 40 });
    setRuns(res.items);
    const live = res.items.find((r) => r.status === "running");
    setActiveRunId(live?.id ?? null);
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    loadedIdRef.current = null;
    void (async () => {
      try {
        const data = await jobsApi.get(id);
        setJob(data);
        setName(data.name);
        setDescription(data.description ?? "");
        setSchedules(parseJobSchedules(data.cron));
        setTimeoutMs(data.timeoutMs);
        if (loadedIdRef.current !== data.id) {
          setLocalCode(data.code);
          setSavedCode(data.code);
          loadedIdRef.current = data.id;
          if (data.draftCode && data.draftCode !== data.code) {
            setCodeDraft(data.draftCode);
          } else {
            setCodeDraft(null);
          }
        }
        await loadRuns(id);
      } catch {
        setJob(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, loadRuns]);

  useEffect(() => {
    void getSettingValues([SettingKey.JobAssistantProvider, SettingKey.JobAssistantModel]).then((vals) => {
      if (vals[SettingKey.JobAssistantProvider]) setProviderId(vals[SettingKey.JobAssistantProvider]);
      if (vals[SettingKey.JobAssistantModel]) setModel(vals[SettingKey.JobAssistantModel]);
    });
  }, []);

  useEffect(() => {
    if (!id) return;
    const unsubJob = wsClient.on<Partial<Job> & { id: string }>("jobs:updated", (payload) => {
      if (payload.id !== id) return;
      if ("code" in payload && payload.code != null) {
        setSavedCode(payload.code);
        setLocalCode(payload.code);
        setCodeDraft((prev) => (prev !== null && prev === payload.code ? null : prev));
      }
      if ("draftCode" in payload && payload.draftCode != null) {
        const draft = payload.draftCode;
        const code = payload.code ?? codeRef.current;
        setCodeDraft(draft !== code ? draft : null);
      }
      if ("name" in payload && payload.name) setName(payload.name);
      if ("cron" in payload && typeof payload.cron === "string") {
        setSchedules((prev) => (buildJobCrons(prev) === payload.cron ? parseJobSchedules(payload.cron) : prev));
      }
      if ("timeoutMs" in payload && typeof payload.timeoutMs === "number") setTimeoutMs(payload.timeoutMs);
      setJob((prev) => (prev ? { ...prev, ...payload } : prev));
    });

    const unsubRun = wsClient.on<JobRun>("job_runs:created", (payload) => {
      if (payload.jobId !== id) return;
      setRuns((prev) => [payload, ...prev.filter((r) => r.id !== payload.id)]);
      if (payload.status === "running") {
        setActiveRunId(payload.id);
        setRunsOpen(true);
      }
    });

    const unsubRunUpd = wsClient.on<JobRun>("job_runs:updated", (payload) => {
      if (payload.jobId !== id) return;
      setRuns((prev) => prev.map((r) => (r.id === payload.id ? payload : r)));
      if (payload.status !== "running" && activeRunId === payload.id) {
        setActiveRunId(null);
      }
    });

    const unsubLog = wsClient.on<{ id: string; jobId: string; entries: JobRun["logs"]; logs: JobRun["logs"] }>("job_runs:log", (payload) => {
      if (payload.jobId !== id) return;
      setRuns((prev) => prev.map((r) => (r.id === payload.id ? { ...r, logs: payload.logs } : r)));
    });

    return () => {
      unsubJob();
      unsubRun();
      unsubRunUpd();
      unsubLog();
    };
  }, [id, activeRunId]);

  const handleSaveCode = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await jobsApi.update(id, { code: localCode });
      setJob(updated);
      setSavedCode(updated.code);
      setLocalCode(updated.code);
      setCodeDraft(null);
      message.success("Saved");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await jobsApi.update(id, {
        name: name.trim(),
        description: description.trim() || null,
        timeoutMs,
      });
      setJob(updated);
      setName(updated.name);
      setDescription(updated.description ?? "");
      setTimeoutMs(updated.timeoutMs);
      message.success("Saved");
      setSettingsOpen(false);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSchedules = async () => {
    if (!id) return;
    const scheduleError = validateJobSchedules(schedules);
    if (scheduleError) {
      message.error(scheduleError);
      return;
    }
    setSavingSchedules(true);
    try {
      const updated = await jobsApi.update(id, { cron: buildJobCrons(schedules) });
      setJob(updated);
      setSchedules(parseJobSchedules(updated.cron));
      message.success(jobIsScheduled(updated.cron) ? "Schedules saved" : "Schedules cleared — job is off");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingSchedules(false);
    }
  };

  const handleRun = async () => {
    if (!id) return;
    if (isDirty) {
      message.warning("Save before running scheduled job code");
      return;
    }
    setRunning(true);
    try {
      const run = await jobsApi.run(id);
      setActiveRunId(run.id);
      setRunsOpen(true);
      setRuns((prev) => [run, ...prev.filter((r) => r.id !== run.id)]);
      message.success("Run started");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const handleCancelRun = async (runId?: string | null) => {
    if (!id) return;
    const targetId = runId ?? activeRunId;
    if (!targetId) return;
    try {
      const run = await jobsApi.cancelRun(id, targetId);
      setRuns((prev) => prev.map((r) => (r.id === run.id ? run : r)));
      message.success("Cancel requested");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    try {
      await jobsApi.remove(id);
      message.success("Deleted");
      navigate("/jobs");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleToolAction = (event: ToolActionEvent) => {
    if (event.toolName === "generate_code" && event.type === "tool-call") {
      const { code } = event.input as { code?: string };
      if (typeof code === "string" && code !== codeRef.current) {
        setCodeDraft(code);
      }
    }
    if (event.toolName === "run_current_job") {
      setRunsOpen(true);
    }
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">Loading…</div>;
  }

  if (!job) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background">
        <p className="text-sm text-foreground">Job not found</p>
        <Button onClick={() => navigate("/jobs")}>Back to Jobs</Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border-subtle bg-card px-4">
        <button
          type="button"
          onClick={() => navigate("/jobs")}
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none"
          title="Back"
          aria-label="Back to Jobs"
        >
          <AltArrowLeft width={16} height={16} />
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand/12">
            <ClockCircle size={15} className="text-brand-soft" weight="BoldDuotone" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="m-0 truncate text-[13px] font-semibold leading-none text-foreground">{name || job.name}</h1>
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none ${
                  isOn ? "bg-success/15 text-success" : "bg-muted text-tertiary-foreground"
                }`}
              >
                <span className={`size-1.5 rounded-full ${isOn ? "bg-success" : "bg-quaternary-foreground"}`} />
                {isOn ? "On" : "Off"}
              </span>
            </div>
            <p className="m-0 mt-1 truncate text-[11px] leading-none text-tertiary-foreground">{scheduleLabel}</p>
          </div>
          {isDirty && !saving ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-brand-soft">
              <span className="size-1.5 animate-pulse rounded-full bg-brand-soft" />
              Unsaved
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            size="small"
            icon={<ClockCircle width={14} height={14} weight="BoldDuotone" />}
            onClick={() => {
              setSchedules(parseJobSchedules(job.cron));
              setSchedulesOpen(true);
            }}
          >
            Schedules
          </Button>
          <Button size="small" icon={<Settings width={14} height={14} weight="BoldDuotone" />} onClick={() => setSettingsOpen(true)}>
            Settings
          </Button>
          {activeRunId ? (
            <Button size="small" danger icon={<StopCircle width={14} height={14} weight="BoldDuotone" />} onClick={() => void handleCancelRun()}>
              Stop
            </Button>
          ) : null}
          <Button size="small" icon={<History width={14} height={14} weight="BoldDuotone" />} onClick={() => setRunsOpen(true)}>
            Runs
          </Button>
          {activeRunId ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2 py-0.5 text-[11px] font-medium text-brand-soft">
              <span className="size-1.5 animate-pulse rounded-full bg-brand-soft" />
              Live
            </span>
          ) : null}
          <Button
            type="primary"
            size="small"
            icon={!saving ? <Diskette width={14} height={14} weight="BoldDuotone" /> : undefined}
            loading={saving}
            disabled={!isDirty && !saving}
            onClick={() => void handleSaveCode()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          {codeDraft !== null && codeDraft !== localCode ? (
            <>
              <MonacoDiffEditor
                language="typescript"
                original={localCode}
                modified={codeDraft}
                options={{ fontSize: 13, renderSideBySide: false, renderIndicators: false }}
                onMount={(editor) => {
                  editor.getOriginalEditor().updateOptions({ lineNumbers: "off" });
                }}
              />
              <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-lg">
                <span className="mr-1 text-xs font-medium tracking-wide text-brand-soft">AI draft</span>
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckCircle size={14} />}
                  onClick={() => {
                    const draft = codeDraft;
                    setLocalCode(draft);
                    setSavedCode(draft);
                    setCodeDraft(null);
                    if (id) void jobsApi.update(id, { code: draft });
                  }}
                >
                  Accept
                </Button>
                <Button
                  size="small"
                  danger
                  icon={<CloseCircle size={14} />}
                  onClick={() => {
                    setCodeDraft(null);
                    if (id) void jobsApi.update(id, { code: localCode });
                  }}
                >
                  Reject
                </Button>
              </div>
            </>
          ) : (
            <MonacoEditor
              language="typescript"
              value={localCode}
              onChange={(v) => setLocalCode(v ?? "")}
              onMount={(editor) => {
                editorRef.current = editor;
              }}
              onSave={() => void handleSaveCode()}
              options={{ fontSize: 13, tabSize: 2 }}
              height="100%"
            />
          )}
        </div>

        <CodingAgentPanel
          providerId={providerId}
          model={model}
          streamUrl={`/api/jobs/${id}/coding/stream`}
          onToolAction={handleToolAction}
          onChangeAiProvider={(pid) => {
            setProviderId(pid);
            setModel("");
            void apiClient.patch("/api/settings", {
              [SettingKey.JobAssistantProvider]: pid,
            });
          }}
          onChangeModel={(m) => {
            setModel(m);
            void apiClient.patch("/api/settings", {
              [SettingKey.JobAssistantModel]: m,
            });
          }}
          subtitle="Edit, test, and fix this job"
          suggestions={JOB_SUGGESTIONS}
        />
      </div>

      <Drawer
        title={
          <div className="flex items-center gap-2">
            <span>Schedules</span>
            {schedulesDirty ? (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2 py-0.5 text-[11px] font-medium text-brand-soft">
                <span className="size-1.5 animate-pulse rounded-full bg-brand-soft" />
                Unsaved
              </span>
            ) : null}
          </div>
        }
        open={schedulesOpen}
        onClose={() => {
          setSchedules(parseJobSchedules(job.cron));
          setSchedulesOpen(false);
        }}
        size={480}
      >
        <p className="mb-4 mt-0 text-sm text-muted-foreground">
          {jobIsScheduled(buildJobCrons(schedules)) ? "Job runs on these schedules." : "Add a schedule to turn this job on. Clear all to turn it off."}
        </p>
        <JobSchedulesEditor value={schedules} onChange={setSchedules} />
        <Button
          type="primary"
          size="small"
          block
          className="mt-4"
          loading={savingSchedules}
          disabled={!schedulesDirty && !savingSchedules}
          onClick={() => void handleSaveSchedules()}
        >
          Save schedules
        </Button>
      </Drawer>

      <Drawer title="Job settings" open={settingsOpen} onClose={() => setSettingsOpen(false)} size={480}>
        <Form layout="vertical">
          <Form.Item label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Form.Item>
          <Form.Item label="Description">
            <Input.TextArea value={description} rows={3} onChange={(e) => setDescription(e.target.value)} />
          </Form.Item>
          <Form.Item label="Timeout (ms)">
            <InputNumber min={1000} step={1000} value={timeoutMs} onChange={(v) => setTimeoutMs(Number(v) || 300_000)} className="w-full" />
          </Form.Item>
        </Form>

        <Button type="primary" block className="mt-2" loading={saving} onClick={() => void handleSaveSettings()}>
          Save settings
        </Button>

        <div className="mt-8 border-t border-border-subtle pt-4">
          <p className="m-0 text-[11px] font-medium text-muted-foreground">Danger zone</p>
          <p className="mb-3 mt-1 text-xs text-tertiary-foreground">Permanently remove this job and its run history.</p>
          <Popconfirm title="Delete this job?" description="This cannot be undone." okText="Delete" okType="danger" onConfirm={() => void handleDelete()}>
            <Button size="small" danger icon={<TrashBinMinimalistic width={14} height={14} />}>
              Delete job
            </Button>
          </Popconfirm>
        </div>
      </Drawer>

      <Drawer
        title={
          <div className="flex items-center gap-2">
            <span>Runs</span>
            {activeRunId ? (
              <Tag color="processing" className="m-0 text-[10px]">
                live
              </Tag>
            ) : null}
            <span className="text-xs font-normal text-muted-foreground">{runs.length} total</span>
          </div>
        }
        extra={
          <div className="flex items-center gap-2">
            {activeRunId ? (
              <Button size="small" danger icon={<StopCircle width={14} height={14} weight="BoldDuotone" />} onClick={() => void handleCancelRun()}>
                Stop
              </Button>
            ) : null}
            <Button type="primary" size="small" icon={<Play width={14} height={14} weight="BoldDuotone" />} loading={running} onClick={() => void handleRun()}>
              Run
            </Button>
          </div>
        }
        open={runsOpen}
        onClose={() => setRunsOpen(false)}
        placement="bottom"
        size="100%"
        styles={{ body: { padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" } }}
        destroyOnHidden={false}
      >
        <JobRunsPanel runs={runs} activeRunId={activeRunId} onCancelRun={(runId) => void handleCancelRun(runId)} />
      </Drawer>
    </div>
  );
}
