import Logout2 from "@solar-icons/react/arrows-action/Logout2";
import AltArrowLeft from "@solar-icons/react/arrows/AltArrowLeft";
import Planet2 from "@solar-icons/react/astronomy/Planet2";
import FaceScanSquare from "@solar-icons/react/faces/FaceScanSquare";
import Programming from "@solar-icons/react/it/Programming";
import Global from "@solar-icons/react/map/Global";
import KeyMinimalistic from "@solar-icons/react/security/KeyMinimalistic";
import LockPassword from "@solar-icons/react/security/LockPassword";
import Settings from "@solar-icons/react/settings/Settings";
import AlarmPlay from "@solar-icons/react/time/AlarmPlay";
import Database from "@solar-icons/react/ui/Database";
import HomeAngle from "@solar-icons/react/ui/HomeAngle";
import MenuDots from "@solar-icons/react/ui/MenuDots";
import UserIcon from "@solar-icons/react/users/User";
import Stars from "@solar-icons/react/weather/Stars";
import { Dropdown } from "antd";
import type { MenuProps } from "antd";
import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { apiClient, clearAuthToken, getRefreshToken } from "src/common/api";
import type { User } from "src/common/types";
import { AppLogo } from "src/components/AppLogo";
import { UserAvatar } from "src/components/UserAvatar";
import { cn } from "src/lib/utils";
import { SETTINGS_TABS } from "src/modules/settings/common/constants";
import { useAppSelector } from "src/store/store";

const SIDEBAR_W = 220;

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const ICON = { width: 16, height: 16, weight: "BoldDuotone" as const };

const WORKSPACE_NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: <HomeAngle {...ICON} /> },
  { to: "/agents", label: "Agents", icon: <FaceScanSquare {...ICON} /> },
  { to: "/tools", label: "Tools", icon: <Programming {...ICON} /> },
  { to: "/skills", label: "Skills", icon: <Stars {...ICON} /> },
  { to: "/mcp-servers", label: "MCP", icon: <Planet2 {...ICON} /> },
];

const CAPABILITIES_NAV: NavItem[] = [
  { to: "/sites", label: "Sites", icon: <Global {...ICON} /> },
  { to: "/jobs", label: "Jobs", icon: <AlarmPlay {...ICON} />, adminOnly: true },
];

const RESOURCES_NAV: NavItem[] = [
  { to: "/datatables", label: "Datatables", icon: <Database {...ICON} /> },
  { to: "/kvstore", label: "KV Store", icon: <KeyMinimalistic {...ICON} /> },
  { to: "/secrets", label: "Secrets", icon: <LockPassword {...ICON} />, adminOnly: true },
];

function NavSectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-3 pb-1.5 pt-4 text-[10px] font-medium tracking-wider text-muted-foreground/80 uppercase">{children}</div>;
}

function SketchDivider({ className }: { className?: string }) {
  return (
    <svg className={cn("mx-3 h-2.5 w-auto shrink-0 text-sidebar-border", className)} viewBox="0 0 196 10" fill="none" aria-hidden>
      <path
        d="M1.5 5.2c18.2-2.1 36.4 2.4 54.5.1 12.8-1.6 25.1-3.8 38-.9 14.2 3.2 28.6 1.1 42.4-1.4 13.1-2.4 26.8 1.8 39.9.6 6.8-.6 13.2-2.1 19.7-1.1"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
      <path
        d="M3 6.4c16.8-.9 33.9 1.6 50.6.2 14.1-1.2 27.8-2.9 42-.4 11.9 2.1 24.1.8 35.8-.7 12.4-1.6 25.2 1.4 37.4.3 8.9-.8 17.4-2.4 26.2-1.2"
        stroke="currentColor"
        strokeWidth="0.7"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
}

function SidebarNavLink({ item, end }: { item: NavItem; end?: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={end}
      title={item.label}
      className={({ isActive }) =>
        cn(
          "group flex h-9 w-full min-w-0 items-center gap-2.5 rounded-md px-3 text-left text-base no-underline transition-colors duration-150 cursor-pointer",
          isActive ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "font-normal text-sidebar-foreground hover:bg-muted",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              "flex size-4 shrink-0 items-center justify-center [&_svg]:size-4",
              isActive ? "text-sidebar-accent-foreground" : "text-tertiary-foreground group-hover:text-sidebar-foreground",
            )}
          >
            {item.icon}
          </span>
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

function SidebarNavButton({
  label,
  icon,
  active,
  trailing,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  trailing?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex h-9 w-full min-w-0 items-center gap-2.5 rounded-md border-0 bg-transparent px-3 text-left text-base transition-colors duration-150 cursor-pointer",
        active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "font-normal text-sidebar-foreground hover:bg-muted",
      )}
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center [&_svg]:size-4",
          active ? "text-sidebar-accent-foreground" : "text-tertiary-foreground group-hover:text-sidebar-foreground",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </button>
  );
}

function SidebarProfileLink({ user, onLogout }: { user: User | null; onLogout: () => void }) {
  const navigate = useNavigate();
  if (!user) return null;

  const displayName = user.name || user.username;

  const menuItems: MenuProps["items"] = [
    {
      key: "header",
      label: (
        <div className="flex items-center gap-2.5 px-1 py-1">
          <UserAvatar avatar={user.avatar} name={displayName} size={36} className="shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium leading-tight text-foreground">{displayName}</div>
            <div className="mt-0.5 truncate text-xs leading-tight text-muted-foreground">@{user.username}</div>
          </div>
        </div>
      ),
      disabled: true,
      style: { cursor: "default", opacity: 1 },
    },
    { type: "divider" },
    {
      key: "profile",
      label: (
        <div className="flex min-h-8 items-center gap-2 rounded-md px-2 py-0 text-base text-foreground">
          <UserIcon width={16} height={16} weight="BoldDuotone" />
          Profile Settings
        </div>
      ),
      onClick: () => navigate("/profile"),
    },
    { type: "divider" },
    {
      key: "logout",
      label: (
        <div className="flex min-h-8 items-center gap-2 rounded-md px-2 py-0 text-base text-foreground">
          <Logout2 width={16} height={16} weight="BoldDuotone" />
          Log Out
        </div>
      ),
      onClick: onLogout,
    },
  ];

  return (
    <Dropdown
      trigger={["click"]}
      placement="topLeft"
      menu={{ items: menuItems, className: "w-[204px] rounded-lg border-sidebar-border bg-popover p-1 shadow-none" }}
    >
      <button
        type="button"
        aria-label="User menu"
        className="flex w-full min-w-0 items-center gap-2 rounded-md border-0 bg-transparent px-2 py-2 text-left text-sidebar-foreground outline-none transition-colors hover:bg-muted cursor-pointer"
      >
        <UserAvatar avatar={user.avatar} name={displayName} size={32} className="shrink-0 self-center rounded-full" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium leading-tight text-sidebar-foreground">{displayName}</span>
          <span className="mt-0.5 block truncate text-xs leading-tight text-muted-foreground tabular-nums">v{__APP_VERSION__}</span>
        </span>
        <span className="inline-flex size-8 shrink-0 items-center justify-center self-center rounded-md text-tertiary-foreground">
          <MenuDots width={16} height={16} weight="Bold" />
        </span>
      </button>
    </Dropdown>
  );
}

export function AppSidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const currentUser = useAppSelector((s) => s.auth.user);
  const isAdmin = currentUser?.role === "admin";
  const isSettingsRoute = pathname.startsWith("/settings");
  const [panel, setPanel] = useState<"main" | "settings">(isSettingsRoute ? "settings" : "main");

  useEffect(() => {
    if (isSettingsRoute) setPanel("settings");
  }, [isSettingsRoute]);

  const handleLogout = () => {
    const refreshToken = getRefreshToken();
    void apiClient.post("/api/auth/logout", { refreshToken }).catch(() => {});
    clearAuthToken();
    navigate("/login", { replace: true });
  };

  const openSettings = () => {
    setPanel("settings");
    if (!isSettingsRoute) navigate("/settings/general");
  };

  const backToMain = () => {
    setPanel("main");
    navigate("/");
  };

  return (
    <aside
      className="flex h-screen shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
      style={{ width: SIDEBAR_W }}
    >
      <div className="flex h-12 w-full min-w-0 shrink-0 items-center gap-2.5 px-4">
        <AppLogo size={22} className="shrink-0 text-brand" />
        <span className="truncate text-base font-semibold tracking-tight text-sidebar-foreground">Raw Agents</span>
      </div>
      <SketchDivider className="mb-2" />

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className={cn(
            "flex h-full w-[200%] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            panel === "settings" ? "-translate-x-1/2" : "translate-x-0",
          )}
        >
          <nav className="flex h-full w-1/2 flex-col gap-1 overflow-y-auto px-2.5 pb-4">
            <div className="flex flex-col gap-1">
              {WORKSPACE_NAV.map((item) => (
                <SidebarNavLink key={item.to} item={item} end={item.to === "/"} />
              ))}
            </div>

            <NavSectionLabel>Capabilities</NavSectionLabel>
            <div className="flex flex-col gap-1">
              {CAPABILITIES_NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => (
                <SidebarNavLink key={item.to} item={item} />
              ))}
            </div>

            <NavSectionLabel>Resources</NavSectionLabel>
            <div className="flex flex-col gap-1">
              {RESOURCES_NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => (
                <SidebarNavLink key={item.to} item={item} />
              ))}
            </div>

            {isAdmin && (
              <div className="mt-auto pt-2">
                <SidebarNavButton label="Settings" icon={<Settings {...ICON} />} active={isSettingsRoute} onClick={openSettings} />
              </div>
            )}
          </nav>

          <nav className="flex h-full w-1/2 flex-col gap-1 overflow-y-auto px-2.5 pb-4">
            <SidebarNavButton label="Settings" icon={<AltArrowLeft {...ICON} />} onClick={backToMain} />
            <div className="flex flex-col gap-1">
              {SETTINGS_TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <SidebarNavLink
                    key={tab.key}
                    item={{
                      to: `/settings/${tab.key}`,
                      label: tab.label,
                      icon: <Icon {...ICON} />,
                    }}
                  />
                );
              })}
            </div>
          </nav>
        </div>
      </div>

      <div className="shrink-0 border-t border-sidebar-border px-2 py-2">
        <SidebarProfileLink user={currentUser} onLogout={handleLogout} />
      </div>
    </aside>
  );
}
