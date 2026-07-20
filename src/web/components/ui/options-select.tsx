import { AltArrowDown } from "@solar-icons/react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Input } from "src/components/ui/input";
import { cn } from "src/lib/utils";

// ─── Select ───────────────────────────────────────────────────────────────────
// Options-array select (app convenience). Prefer stock Select for new UI.

export interface SelectOption<T extends string | number = string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

interface SelectProps<T extends string | number = string> {
  value?: T;
  onChange?: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  dropdownWidth?: number | string;
}

export function Select<T extends string | number = string>({
  value,
  onChange,
  options,
  placeholder = "Select...",
  disabled = false,
  className = "",
  searchable = false,
  searchPlaceholder = "Search...",
  dropdownWidth,
}: SelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const [flipUp, setFlipUp] = useState(false);

  const selectedOption = options.find((o) => o.value === value);

  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dropdownMaxHeight = 240;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const shouldFlipUp = spaceBelow < dropdownMaxHeight && spaceAbove > spaceBelow;
    setFlipUp(shouldFlipUp);
    setDropdownPos({ top: shouldFlipUp ? rect.top - 4 : rect.bottom + 4, left: rect.left, width: rect.width });
  }, []);

  const handleToggle = useCallback(() => {
    if (disabled) return;
    if (!isOpen) updatePosition();
    else setSearch("");
    setIsOpen((prev) => !prev);
  }, [disabled, isOpen, updatePosition]);

  const handleSelect = useCallback(
    (opt: SelectOption<T>) => {
      if (opt.disabled) return;
      onChange?.(opt.value);
      setIsOpen(false);
      setSearch("");
    },
    [onChange],
  );

  useEffect(() => {
    if (isOpen && searchable) setTimeout(() => searchRef.current?.focus(), 50);
  }, [isOpen, searchable]);

  const filteredOptions = searchable && search ? options.filter((opt) => String(opt.value).toLowerCase().includes(search.toLowerCase())) : options;

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current && !containerRef.current.contains(target) && dropdownRef.current && !dropdownRef.current.contains(target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleReposition = () => updatePosition();
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [isOpen, updatePosition]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className={cn(
          "w-full h-field-md px-3 rounded-md text-sm text-left",
          "bg-card border border-input",
          "flex items-center justify-between gap-2",
          "transition-colors duration-150 cursor-pointer outline-none focus-visible:outline-none focus-visible:ring-0",
          isOpen ? "border-border" : "hover:border-border",
          disabled && "bg-muted text-muted-foreground border-input cursor-not-allowed",
        )}
      >
        <span className={cn("truncate", selectedOption ? "text-foreground" : "text-muted-foreground")}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <AltArrowDown width={13} height={13} className={cn("shrink-0 text-muted-foreground transition-transform duration-150", isOpen && "rotate-180")} />
      </button>

      {createPortal(
        isOpen && (
          <div
            ref={dropdownRef}
            className="fixed z-[9999] rounded-md border border-border bg-popover text-popover-foreground shadow-md overflow-hidden animate-in fade-in-0 zoom-in-95"
            style={{
              ...(flipUp ? { bottom: window.innerHeight - dropdownPos.top } : { top: dropdownPos.top }),
              left: dropdownPos.left,
              width: dropdownWidth ?? dropdownPos.width,
            }}
          >
            {searchable && (
              <div className="p-2 border-b border-border">
                <Input ref={searchRef} type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={searchPlaceholder} />
              </div>
            )}
            <div className="max-h-52 overflow-y-auto py-1">
              {filteredOptions.map((opt) => (
                <button
                  key={String(opt.value)}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => handleSelect(opt)}
                  className={cn(
                    "w-full px-3 py-2 text-sm text-left truncate transition-colors duration-100 cursor-pointer",
                    opt.value === value ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    opt.disabled && "opacity-40 cursor-not-allowed",
                  )}
                  title={typeof opt.label === "string" ? opt.label : undefined}
                >
                  {opt.label}
                </button>
              ))}
              {filteredOptions.length === 0 && (
                <div className="px-3 py-3 text-xs text-muted-foreground text-center">{search ? "No results found" : "No options available"}</div>
              )}
            </div>
          </div>
        ),
        document.body,
      )}
    </div>
  );
}

export type { SelectProps };
