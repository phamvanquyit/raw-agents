// ─── Settings Page ───────────────────────────────────────────────────────────
// Route: /settings/* — Layout with horizontal tab bar + routed pages.
// Inspired by Linear/Vercel settings — clean, centered, premium feel.

import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import type { LlmProvider } from "src/common/types";
import { fetchLlmProviders } from "src/modules/llm-providers/common/llmProvidersSlice";
import { useAppDispatch, useAppSelector } from "src/store/store";

import { SETTINGS_TABS, type SettingsTab } from "./common/constants";
import { GeneralPage } from "./general/GeneralPage";
import { ProvidersPage } from "./providers/ProvidersPage";
import { UsersPage } from "./users/UsersPage";

/* ── Resolve active tab from URL ─────────────────────────────────────────────── */

const TAB_COMPONENTS: Record<SettingsTab, React.ComponentType> = {
  general: GeneralPage,
  providers: ProvidersPage,
  users: UsersPage,
};

function useActiveTab(): SettingsTab {
  const { pathname } = useLocation();
  // pathname = /settings/general | /settings/providers | /settings/users
  const segment = pathname.split("/").filter(Boolean)[1] as SettingsTab | undefined;
  if (segment && segment in TAB_COMPONENTS) return segment;
  return "general";
}

/* ── Horizontal Tab Bar ──────────────────────────────────────────────────────── */

function SettingsTabBar({ providerCount }: { providerCount: number }) {
  const tabRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const activeTab = useActiveTab();

  // Update underline indicator position when active tab changes
  const updateIndicator = () => {
    const activeEl = tabRefs.current[activeTab];
    if (activeEl) {
      setIndicator({ left: activeEl.offsetLeft, width: activeEl.offsetWidth });
    }
  };

  // Re-measure on mount, tab change, and when providerCount changes
  useEffect(() => {
    const timer = setTimeout(updateIndicator, 50);
    return () => clearTimeout(timer);
  }, [activeTab, providerCount]);

  return (
    <div className="relative border-b border-border">
      <div className="flex items-center gap-1">
        {SETTINGS_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.key === activeTab;
          return (
            <NavLink
              key={tab.key}
              to={`/settings/${tab.key}`}
              ref={(el) => {
                tabRefs.current[tab.key] = el;
              }}
              className={[
                "settings-tab relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium cursor-pointer transition-colors duration-150 no-underline",
                isActive ? "settings-tab-active text-primary" : "text-muted hover:text-soft",
              ].join(" ")}
            >
              <Icon width={14} height={14} />
              <span>{tab.label}</span>
              {tab.key === "providers" && providerCount > 0 && (
                <span className="text-[9px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 bg-primary/15 text-primary">
                  {providerCount}
                </span>
              )}
            </NavLink>
          );
        })}
      </div>

      {/* Animated underline indicator */}
      <span
        className="absolute bottom-0 h-[2px] bg-primary rounded-full transition-all duration-250 ease-out"
        style={{ left: indicator.left, width: indicator.width }}
      />
    </div>
  );
}

/* ── Settings Page ────────────────────────────────────────────────────────────── */

export default function SettingsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const providers = useAppSelector((s) => s.llmProviders.items) as LlmProvider[];
  const activeTab = useActiveTab();

  useEffect(() => {
    dispatch(fetchLlmProviders());
  }, [dispatch]);

  // Redirect /settings → /settings/general
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname === "/settings" || pathname === "/settings/") {
      navigate("/settings/general", { replace: true });
    }
  }, [pathname, navigate]);

  // Render the active tab component
  const ActiveComponent = TAB_COMPONENTS[activeTab];

  return (
    <div className="h-full overflow-y-auto game-scrollbar">
      <div className="max-w-[720px] mx-auto py-8 px-6">
        {/* ── Page Header ──────────────────────────────────────────── */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-main m-0 leading-tight">Settings</h1>
          <p className="text-sm text-muted mt-1.5">Manage your application configuration</p>
        </div>

        {/* ── Tab Bar ──────────────────────────────────────────────── */}
        <SettingsTabBar providerCount={providers.length} />

        {/* ── Tab Content ────────────────────────────────────────────── */}
        <div className="pt-6 pb-8">
          <ActiveComponent />
        </div>

        {/* ── Footer — Version ────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-1.5 pt-4 border-t border-border">
          <div className="w-1.5 h-1.5 rounded-full bg-primary opacity-40" />
          <span className="text-[11px] text-muted font-mono">v{__APP_VERSION__}</span>
        </div>
      </div>
    </div>
  );
}
