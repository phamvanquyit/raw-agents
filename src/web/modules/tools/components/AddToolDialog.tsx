import { useEffect, useRef, useState } from "react";
import { Button } from "src/components/ui/button";
import { Field } from "src/components/ui/form-field";
import { Input } from "src/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "src/components/ui/popover";
import { Textarea } from "src/components/ui/textarea";
import { fetchToolFolders } from "src/modules/tools/common/toolFoldersSlice";
import { createTool, fetchTools } from "src/modules/tools/common/toolsSlice";
import { toSnakeCase } from "src/modules/tools/common/utils";
import { useAppDispatch } from "src/store/store";

interface AddToolPopoverProps {
  onCreated: (toolId: string) => void;
  children: React.ReactNode;
  /** Folder for the new tool; null = ungrouped */
  defaultFolderId?: string | null;
}

export function AddToolPopover({ onCreated, children, defaultFolderId = null }: AddToolPopoverProps) {
  const dispatch = useAppDispatch();
  const inputRef = useRef<HTMLInputElement>(null);

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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" side="top" sideOffset={8} className="w-[320px] p-0">
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
            <Field label="Tool Name" required>
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
            </Field>
            <Field label="Description">
              <Textarea
                id="new-tool-description"
                placeholder="What does this tool do?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="min-h-0!"
              />
            </Field>
            {error && <div className="text-[11px] font-medium text-destructive">{error}</div>}
          </div>
          <div className="flex flex-row gap-2.5 justify-end px-4 py-3 border-t border-border/40">
            <Button variant="secondary" size="sm" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" loading={loading} disabled={!label.trim()}>
              {loading ? "Creating..." : "Create & Edit"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
