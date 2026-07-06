// ─── App Sidebar ─────────────────────────────────────────────────────────────
// Dark neon sidebar — icon-only collapsed mode with expand toggle.
// Neon lime active indicator bar, glassmorphism hover, tooltips.

import {
  AltArrowLeft,
  AltArrowRight,
  FaceScanSquare,
  HomeAngle,
  Logout2,
  Programming,
  Settings,
  User as UserIcon,
  UsersGroupTwoRounded,
} from "@solar-icons/react";
import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { clearAuthToken } from "src/common/api";
import type { User } from "src/common/types";
import { AppLogo } from "src/components/AppLogo";
import { UserAvatar } from "src/components/UserAvatar";
import { Popover, PopoverContent, PopoverTrigger } from "src/components/ui/popover";
import { useAppSelector } from "src/store/store";

/* ── Types ───────────────────────────────────────────────────────────────── */

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: <HomeAngle weight="BoldDuotone" width={20} height={20} /> },
  { to: "/teams", label: "Teams", icon: <UsersGroupTwoRounded weight="BoldDuotone" width={20} height={20} /> },
  { to: "/settings", label: "Settings", icon: <Settings weight="BoldDuotone" width={20} height={20} /> },
  { to: "/agents", label: "Agents", icon: <FaceScanSquare weight="BoldDuotone" width={20} height={20} /> },
  { to: "/tools", label: "Tools", icon: <Programming weight="BoldDuotone" width={20} height={20} /> },
];

/* ── Sidebar Tooltip (inline — no lib needed) ────────────────────────────── */

function SidebarTooltip({ label, show, expanded }: { label: string; show: boolean; expanded: boolean }) {
  if (expanded || !show) return null;
  return (
    <div
      className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 z-50 pointer-events-none whitespace-nowrap"
      style={{ animation: "sidebar-tooltip-in 150ms ease-out" }}
    >
      <div className="px-2.5 py-1.5 rounded-md text-xs font-medium text-main bg-surface-raised border border-border backdrop-blur-sm shadow-whisper">
        {label}
      </div>
    </div>
  );
}

/* ── Nav Button ──────────────────────────────────────────────────────────── */

function SidebarNavLink({
  item,
  expanded,
  end,
}: {
  item: NavItem;
  expanded: boolean;
  end?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <NavLink
      to={item.to}
      end={end}
      className={({ isActive }) =>
        [
          "group relative flex items-center no-underline rounded-lg transition-all duration-200 ease-out cursor-pointer border border-transparent",
          expanded ? "gap-2.5 px-3 py-2" : "justify-center w-10 h-10",
          isActive
            ? "bg-primary/8 border-primary/15 text-primary"
            : "text-muted hover:text-main hover:bg-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.06)] hover:scale-[1.04]",
        ].join(" ")
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {({ isActive }) => (
        <>
          {/* Neon active bar */}
          {isActive && (
            <span
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-primary"
              style={{
                height: "18px",
                animation: "sidebar-neon-pulse 3s ease-in-out infinite",
              }}
            />
          )}
          <span
            className={[
              "flex items-center justify-center shrink-0 transition-colors duration-150",
              isActive ? "text-primary" : "text-muted group-hover:text-main",
            ].join(" ")}
          >
            {item.icon}
          </span>
          {expanded && <span className="text-sm font-medium truncate">{item.label}</span>}
          <SidebarTooltip label={item.label} show={hovered} expanded={expanded} />
        </>
      )}
    </NavLink>
  );
}

function SidebarProfileLink({
  expanded,
  user,
  onLogout,
}: {
  expanded: boolean;
  user: User | null;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={[
            "group relative flex items-center no-underline rounded-lg transition-all duration-200 ease-out cursor-pointer border border-transparent outline-none bg-transparent",
            expanded ? "gap-2.5 px-2 py-1.5 w-full" : "justify-center w-10 h-10",
            open
              ? "bg-primary/8 border-primary/15 text-primary"
              : "text-muted hover:text-main hover:bg-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.06)]",
          ].join(" ")}
        >
          <UserAvatar avatar={user.avatar} name={user.name || user.username} size={expanded ? 28 : 32} className="shrink-0 border border-border" />
          {expanded && (
            <div className="flex flex-col min-w-0 text-left">
              <span className="text-sm font-medium truncate leading-tight text-main">{user.name || user.username}</span>
              <span className="text-[10px] text-muted truncate leading-tight">Account Settings</span>
            </div>
          )}
          <SidebarTooltip label="Account" show={!open} expanded={expanded} />
        </button>
      </PopoverTrigger>
      <PopoverContent side={expanded ? "top" : "right"} align={expanded ? "start" : "end"} className="w-52 p-1.5 ml-2">
        <div className="px-2.5 py-2 mb-1 border-b border-border/40">
          <p className="text-xs font-bold text-main truncate leading-tight">{user.name || user.username}</p>
          <p className="text-[10px] text-muted truncate leading-tight mt-0.5">@{user.username}</p>
        </div>

        <div className="flex flex-col gap-0.5">
          <NavLink
            to="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-muted hover:text-main hover:bg-white/5 transition-colors"
          >
            <UserIcon size={16} />
            Profile Settings
          </NavLink>

          <div className="h-px bg-border/40 my-1" />

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-danger hover:bg-danger/10 transition-colors w-full text-left"
          >
            <Logout2 size={16} />
            Logout
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  AppSidebar                                                              */
/* ══════════════════════════════════════════════════════════════════════════ */

export function AppSidebar() {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const currentUser = useAppSelector((s) => s.auth.user);
  const isAdmin = currentUser?.role === "admin";

  const handleLogout = () => {
    clearAuthToken();
    navigate("/login", { replace: true });
  };

  return (
    <aside
      className={[
        "h-screen flex flex-col border-r border-border overflow-hidden transition-all duration-300 ease-out",
        expanded ? "w-[200px] min-w-[200px]" : "w-16 min-w-16",
      ].join(" ")}
      style={{
        background: "linear-gradient(180deg, #0a0b0e 0%, #0e0f12 100%)",
      }}
    >
      {/* ── Logo area ──────────────────────────────────────────────── */}
      <div className={["flex items-center pt-4 pb-3 shrink-0", expanded ? "gap-2.5 px-4" : "justify-center px-0"].join(" ")}>
        <AppLogo size={24} />
        {expanded && <span className="font-display text-sm font-bold text-main tracking-wide truncate">Raw Agents</span>}
      </div>

      {/* ── Navigation ─────────────────────────────────────────────── */}
      <nav className={["flex flex-col gap-1 mt-1", expanded ? "px-3" : "items-center px-0"].join(" ")}>
        {NAV_ITEMS.slice(0, 3).map((item) => {
          if (item.to === "/settings" && !isAdmin) return null;
          return <SidebarNavLink key={item.to} item={item} expanded={expanded} end={item.to === "/"} />;
        })}

        <div className="h-3" />

        {NAV_ITEMS.slice(3).map((item) => (
          <SidebarNavLink key={item.to} item={item} expanded={expanded} end={item.to === "/"} />
        ))}
      </nav>

      {/* ── Spacer ─────────────────────────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Gradient divider ───────────────────────────────────────── */}
      <div className="mx-3 h-px bg-gradient-to-r from-transparent via-border to-transparent opacity-60" />

      {/* ── Bottom actions ─────────────────────────────────────────── */}
      <div className={["flex flex-col gap-1 py-3", expanded ? "px-3" : "items-center px-0"].join(" ")}>
        <SidebarProfileLink expanded={expanded} user={currentUser} onLogout={handleLogout} />

        {/* ── Expand / Collapse toggle ────────────────────────────── */}
        <button
          type="button"
          className={[
            "group relative flex items-center rounded-lg transition-all duration-200 ease-out cursor-pointer border border-transparent bg-transparent mt-1",
            expanded ? "gap-2.5 px-3 py-2" : "justify-center w-10 h-10",
            "text-muted hover:text-main hover:bg-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.06)]",
          ].join(" ")}
          onClick={() => setExpanded((prev) => !prev)}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          <span className="flex items-center justify-center shrink-0 transition-transform duration-300">
            {expanded ? <AltArrowLeft width={18} height={18} /> : <AltArrowRight width={18} height={18} />}
          </span>
          {expanded && <span className="text-sm font-medium truncate text-muted">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
