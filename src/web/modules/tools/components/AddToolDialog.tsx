import { Button, Form, Input, Popover } from "antd";
import type { InputRef } from "antd";
import { useEffect, useRef, useState } from "react";
import { fetchToolFolders } from "src/modules/tools/common/toolFoldersSlice";
import { createTool, fetchTools } from "src/modules/tools/common/toolsSlice";
import { toSnakeCase } from "src/modules/tools/common/utils";
import { useAppDispatch } from "src/store/store";

interface AddToolPopoverProps {
  onCreated: (toolId: string) => void;
  children: React.ReactNode;
  defaultFolderId?: string | null;
}

export function AddToolPopover({ onCreated, children, defaultFolderId = null }: AddToolPopoverProps) {
  const dispatch = useAppDispatch();
  const inputRef = useRef<InputRef>(null);

  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setLabel("");
      setDescription("");
      setError("");
      setLoading(false);
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleSubmit = async () => {
    const trimmed = label.trim();
    if (!trimmed) {
      setError("Please enter a tool name.");
      return;
    }
    setLoading(true);
    try {
      const name = toSnakeCase(trimmed);
      const tool = await dispatch(
        createTool({
          name,
          label: trimmed,
          description: description.trim(),
          parameters: { type: "object", properties: {}, required: [] },
          codeContent: "",
          isActive: false,
          folderId: defaultFolderId,
        }),
      ).unwrap();
      await dispatch(fetchTools());
      await dispatch(fetchToolFolders());
      setOpen(false);
      onCreated(tool.id);
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="topLeft"
      arrow={false}
      styles={{ root: { width: 320 }, container: { width: 320, padding: 0 } }}
      content={
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex flex-col"
        >
          <div className="px-4 pt-4 pb-3">
            <h3 className="text-sm font-semibold text-foreground m-0">New Tool</h3>
          </div>
          <div className="flex flex-col gap-3.5 px-4 pb-4">
            <Form.Item
              label={
                <span className="text-muted-foreground">
                  Tool Name<span className="text-destructive"> *</span>
                </span>
              }
              className="!mb-0"
              layout="vertical"
            >
              <Input
                ref={inputRef}
                id="new-tool-label"
                placeholder="e.g. Get Current Time"
                value={label}
                onChange={(e) => {
                  setLabel(e.target.value);
                  setError("");
                }}
              />
            </Form.Item>
            <Form.Item label={<span className="text-muted-foreground">Description</span>} className="!mb-0" layout="vertical">
              <Input.TextArea
                id="new-tool-description"
                placeholder="What does this tool do?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="!min-h-0"
              />
            </Form.Item>
            {error && <div className="text-[11px] font-medium text-destructive">{error}</div>}
          </div>
          <div className="flex flex-row gap-2.5 justify-end px-4 py-3 border-t border-border/40">
            <Button type="default" size="small" htmlType="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="primary" size="small" htmlType="submit" loading={loading} disabled={!label.trim()}>
              {loading ? "Creating..." : "Create & Edit"}
            </Button>
          </div>
        </form>
      }
    >
      {children}
    </Popover>
  );
}
