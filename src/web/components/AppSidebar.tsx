import { AltArrowLeft, FaceScanSquare, HomeAngle, Logout2, MenuDots, PlugCircle, Programming, Settings, User as UserIcon } from "@solar-icons/react";
import { Dropdown } from "antd";
import type { MenuProps } from "antd";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { clearAuthToken } from "src/common/api";
import type { User } from "src/common/types";
import { AppLogo } from "src/components/AppLogo";
import { UserAvatar } from "src/components/UserAvatar";
import { cn } from "src/lib/utils";
import { SETTINGS_TABS } from "src/modules/settings/common/constants";
import { useAppSelector } from "src/store/store";

function roleLabel(role: User["role"]) {
  return role === "admin" ? "Admin" : "Member";
}

const SIDEBAR_W = 220;

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const ICON = { width: 16, height: 16, weight: "BoldDuotone" as const };

const WORKSPACE_NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: <HomeAngle {...ICON} /> },
  { to: "/agents", label: "Agents", icon: <FaceScanSquare {...ICON} /> },
  { to: "/tools", label: "Tools", icon: <Programming {...ICON} /> },
  { to: "/mcp-servers", label: "MCP", icon: <PlugCircle {...ICON} /> },
];

function NavSectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-3 pb-2 pt-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</div>;
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

function SidebarProfileLink({ user, onLogout }: { user: User | null; onLogout: () => void }) {
  const navigate = useNavigate();
  if (!user) return null;

  const displayName = user.name || user.username;
  const role = roleLabel(user.role);

  const menuItems: MenuProps["items"] = [
    {
      key: "header",
      label: (
        <div className="px-2 pt-1 pb-1.5">
          <div className="truncate text-base font-medium text-foreground">{displayName}</div>
          <div className="truncate text-sm text-muted-foreground">@{user.username}</div>
          <div className="truncate text-sm text-muted-foreground">{role}</div>
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
    <div className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-sidebar-foreground">
      <UserAvatar avatar={user.avatar} name={displayName} size={32} className="shrink-0 self-center rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-0">
        <span className="w-full truncate text-base font-medium text-sidebar-foreground">{displayName}</span>
        <span className="block w-full min-w-0 truncate text-left text-xs text-muted-foreground">{role}</span>
      </div>
      <Dropdown
        trigger={["click"]}
        placement="topRight"
        menu={{ items: menuItems, className: "w-[220px] rounded-lg border-sidebar-border bg-popover p-1 shadow-panel" }}
      >
        <button
          type="button"
          aria-label="User menu"
          className="inline-flex size-8 shrink-0 items-center justify-center self-center rounded-md border-0 bg-transparent text-tertiary-foreground outline-none transition-colors hover:bg-muted hover:text-sidebar-foreground cursor-pointer data-[state=open]:bg-muted data-[state=open]:text-sidebar-foreground"
        >
          <MenuDots width={16} height={16} weight="BoldDuotone" />
        </button>
      </Dropdown>
    </div>
  );
}

function SidebarPane({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col shrink-0" style={{ width: SIDEBAR_W }}>
      {children}
    </div>
  );
}

export function AppSidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const currentUser = useAppSelector((s) => s.auth.user);
  const isAdmin = currentUser?.role === "admin";
  const inSettings = isAdmin && pathname.startsWith("/settings");

  const handleLogout = () => {
    clearAuthToken();
    navigate("/login", { replace: true });
  };

  return (
    <aside
      className="flex h-screen shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
      style={{ width: SIDEBAR_W }}
    >
      <div
        className="flex h-full transition-transform duration-200 ease-out"
        style={{
          width: SIDEBAR_W * 2,
          transform: inSettings ? `translateX(-${SIDEBAR_W}px)` : "translateX(0)",
        }}
      >
        <SidebarPane>
          <div className="flex h-14 w-full min-w-0 shrink-0 items-center gap-2.5 px-4">
            <AppLogo size={22} className="shrink-0 text-brand" />
            <span className="truncate text-base font-semibold tracking-tight text-sidebar-foreground">Raw Agents</span>
          </div>

          <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2.5 pb-4">
            <NavSectionLabel>Workspace</NavSectionLabel>
            <div className="flex flex-col gap-1">
              {WORKSPACE_NAV.map((item) => (
                <SidebarNavLink key={item.to} item={item} end={item.to === "/"} />
              ))}
            </div>

            {isAdmin && (
              <>
                <NavSectionLabel>Admin</NavSectionLabel>
                <div className="flex flex-col gap-1">
                  <NavLink
                    to="/settings/general"
                    title="Settings"
                    className={({ isActive }) =>
                      cn(
                        "group flex h-9 w-full min-w-0 items-center gap-2.5 rounded-md px-3 text-left text-base no-underline transition-colors duration-150 cursor-pointer",
                        isActive || inSettings
                          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                          : "font-normal text-sidebar-foreground hover:bg-muted",
                      )
                    }
                  >
                    {({ isActive }) => {
                      const active = isActive || inSettings;
                      return (
                        <>
                          <span
                            className={cn(
                              "flex size-4 shrink-0 items-center justify-center [&_svg]:size-4",
                              active ? "text-sidebar-accent-foreground" : "text-tertiary-foreground group-hover:text-sidebar-foreground",
                            )}
                          >
                            <Settings {...ICON} />
                          </span>
                          <span className="truncate">Settings</span>
                        </>
                      );
                    }}
                  </NavLink>
                </div>
              </>
            )}
          </nav>

          <div className="shrink-0 border-t border-sidebar-border px-2 py-2">
            <SidebarProfileLink user={currentUser} onLogout={handleLogout} />
          </div>
        </SidebarPane>

        <SidebarPane>
          <div className="flex h-14 w-full min-w-0 shrink-0 items-center px-3">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="flex shrink-0 items-center gap-1.5 rounded-md border-0 bg-transparent px-1.5 py-1 text-base text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-sidebar-foreground cursor-pointer"
              aria-label="Back to main menu"
            >
              <AltArrowLeft width={14} height={14} weight="BoldDuotone" />
              Back
            </button>
          </div>

          <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2.5 pb-4" aria-hidden={!inSettings}>
            <NavSectionLabel>Settings</NavSectionLabel>
            <div className="flex flex-col gap-1">
              {SETTINGS_TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <SidebarNavLink
                    key={tab.key}
                    item={{
                      to: `/settings/${tab.key}`,
                      label: tab.label,
                      icon: <Icon width={16} height={16} weight="BoldDuotone" />,
                    }}
                  />
                );
              })}
            </div>
          </nav>

          <div className="shrink-0 border-t border-sidebar-border px-2 py-2">
            <SidebarProfileLink user={currentUser} onLogout={handleLogout} />
          </div>
        </SidebarPane>
      </div>
    </aside>
  );
}
