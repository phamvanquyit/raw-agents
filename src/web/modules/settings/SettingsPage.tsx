// ─── Settings Page ───────────────────────────────────────────────────────────
// Route: /settings/* — Two-column layout: left nav + right content.

import { useEffect } from "react";
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
  const segment = pathname.split("/").filter(Boolean)[1] as SettingsTab | undefined;
  if (segment && segment in TAB_COMPONENTS) return segment;
  return "general";
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

  const ActiveComponent = TAB_COMPONENTS[activeTab];

  return (
    <div className="h-full overflow-y-auto game-scrollbar">
      <div className="max-w-6xl mx-auto py-8 px-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-main m-0 leading-tight">Settings</h1>
          <p className="text-sm text-muted mt-1.5">Manage your application configuration</p>
        </div>

        {/* Two-column layout */}
        <div className="flex items-start gap-10">
          {/* Left nav */}
          <nav className="w-[180px] shrink-0 sticky top-8 flex flex-col gap-px">
            {SETTINGS_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = tab.key === activeTab;
              return (
                <NavLink
                  key={tab.key}
                  to={`/settings/${tab.key}`}
                  className={[
                    "flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium no-underline transition-colors duration-100",
                    isActive ? "text-main bg-white/[0.04]" : "text-muted hover:text-soft",
                  ].join(" ")}
                >
                  <Icon width={14} height={14} className={isActive ? "text-primary" : ""} />
                  <span>{tab.label}</span>
                  {tab.key === "providers" && providers.length > 0 && <span className="ml-auto text-[10px] tabular-nums text-muted">{providers.length}</span>}
                </NavLink>
              );
            })}
          </nav>

          {/* Right content */}
          <div className="flex-1 min-w-0">
            <ActiveComponent />
          </div>
        </div>
      </div>
    </div>
  );
}
