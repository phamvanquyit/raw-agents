import Clipboard from "@solar-icons/react/notes/Clipboard";
import { Alert, Button, Input, Modal, message } from "antd";
import { useMemo } from "react";

interface CreatedKeyDialogProps {
  apiKey: string;
  agentId?: string;
  onClose: () => void;
}

export function CreatedKeyDialog({ apiKey, agentId, onClose }: CreatedKeyDialogProps) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const curl = useMemo(() => {
    const body = JSON.stringify({ agentId: agentId ?? "<agent-id>", message: "Hi", stream: false });
    return `curl -X POST ${origin}/api/v1/chat \\\n  -H "Authorization: Bearer ${apiKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'`;
  }, [apiKey, agentId, origin]);

  const copy = async (text: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(ok);
    } catch {
      message.error("Copy failed");
    }
  };

  return (
    <Modal
      open
      title="API key created"
      onCancel={onClose}
      footer={
        <Button type="primary" onClick={onClose}>
          Done
        </Button>
      }
      destroyOnHidden
      width={560}
    >
      <div className="flex flex-col gap-4 pt-1">
        <Alert type="warning" showIcon title="Copy this key now. You will not be able to see it again." />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Secret key</span>
          <div className="flex items-center gap-2">
            <Input value={apiKey} readOnly className="font-mono text-[12px]" />
            <Button type="text" icon={<Clipboard width={14} height={14} />} onClick={() => void copy(apiKey, "Key copied")} aria-label="Copy key" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Try with curl (one-shot)</span>
          <div className="relative">
            <pre className="m-0 max-h-40 overflow-auto rounded-lg border border-border bg-muted/40 p-3 pr-10 text-[11px] leading-relaxed text-foreground whitespace-pre-wrap break-all">
              {curl}
            </pre>
            <Button
              type="text"
              size="small"
              className="!absolute right-1 top-1"
              icon={<Clipboard width={13} height={13} />}
              onClick={() => void copy(curl, "Curl copied")}
              aria-label="Copy curl"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
