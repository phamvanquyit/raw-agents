import { AltArrowDown } from "@solar-icons/react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "src/lib/utils";

// ─── RemoteSelect ─────────────────────────────────────────────────────────────
// Async select with search + remote data fetching for dark neon theme.

export interface RemoteSelectOption<T extends string | number = string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

interface RemoteSelectProps<T extends string | number = string> {
  value?: T;
  onChange?: (value: T) => void;
  fetchOptions: (search: string) => Promise<RemoteSelectOption<T>[]>;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  selectedLabel?: ReactNode;
  dropdownWidth?: number | string;
}

export function RemoteSelect<T extends string | number = string>({
  value,
  onChange,
  fetchOptions,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  disabled = false,
  className = "",
  selectedLabel,
  dropdownWidth,
}: RemoteSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<RemoteSelectOption<T>[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fetchId = useRef(0);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const [flipUp, setFlipUp] = useState(false);

  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dropdownMaxHeight = 230;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const shouldFlipUp = spaceBelow < dropdownMaxHeight && spaceAbove > spaceBelow;
    setFlipUp(shouldFlipUp);
    setDropdownPos({ top: shouldFlipUp ? rect.top - 4 : rect.bottom + 4, left: rect.left, width: rect.width });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const id = ++fetchId.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const result = await fetchOptions(search);
        if (id === fetchId.current) setOptions(result);
      } finally {
        if (id === fetchId.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [isOpen, search, fetchOptions]);

  useEffect(() => {
    if (isOpen) setTimeout(() => searchRef.current?.focus(), 50);
    else setSearch("");
  }, [isOpen]);

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

  const handleToggle = useCallback(() => {
    if (disabled) return;
    if (!isOpen) updatePosition();
    setIsOpen((prev) => !prev);
  }, [disabled, isOpen, updatePosition]);

  const handleSelect = useCallback(
    (opt: RemoteSelectOption<T>) => {
      if (opt.disabled) return;
      onChange?.(opt.value);
      setIsOpen(false);
    },
    [onChange],
  );

  const displayLabel = selectedLabel ?? options.find((o) => o.value === value)?.label;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className={cn(
          "w-full h-field-md px-3 rounded-md text-sm text-left",
          "bg-card border border-border",
          "flex items-center justify-between gap-2",
          "transition-all duration-150 cursor-pointer outline-none",
          isOpen ? "border-primary" : "hover:border-border",
          disabled && "bg-muted text-muted-foreground border-border cursor-not-allowed",
        )}
      >
        <span className={displayLabel ? "text-foreground truncate" : "text-muted-foreground truncate"}>{displayLabel ?? placeholder}</span>
        <AltArrowDown width={13} height={13} className={cn("shrink-0 text-muted-foreground transition-transform duration-150", isOpen && "rotate-180")} />
      </button>

      {createPortal(
        isOpen && (
          <div
            ref={dropdownRef}
            className="fixed z-[9999] rounded-md border border-border bg-card shadow-drop overflow-hidden animate-in fade-in-0 zoom-in-95"
            style={{
              ...(flipUp ? { bottom: window.innerHeight - dropdownPos.top } : { top: dropdownPos.top }),
              left: dropdownPos.left,
              width: dropdownWidth ?? dropdownPos.width,
            }}
          >
            <div className="p-2 border-b border-border">
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full h-field-sm px-2.5 rounded-md text-xs text-foreground bg-background border border-border placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-all duration-150"
              />
            </div>
            <div className="max-h-44 overflow-y-auto py-1">
              {loading ? (
                <div className="flex items-center justify-center py-4 gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              ) : options.length === 0 ? (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">{search ? "No results found" : "No options available"}</div>
              ) : (
                options.map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => handleSelect(opt)}
                    className={cn(
                      "w-full px-3 py-2 text-sm text-left truncate transition-colors duration-100 cursor-pointer",
                      opt.value === value ? "bg-accent text-primary font-medium" : "text-muted-foreground hover:bg-muted",
                      opt.disabled && "opacity-40 cursor-not-allowed",
                    )}
                    title={typeof opt.label === "string" ? opt.label : undefined}
                  >
                    {opt.label}
                  </button>
                ))
              )}
            </div>
          </div>
        ),
        document.body,
      )}
    </div>
  );
}

export type { RemoteSelectProps };
