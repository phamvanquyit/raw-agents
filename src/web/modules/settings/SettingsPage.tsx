import { useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { PageShell } from "src/components/PageShell";
import { fetchLlmProviders } from "src/modules/llm-providers/common/llmProvidersSlice";
import { useAppDispatch } from "src/store/store";

import UsagePage from "src/modules/usage/UsagePage";
import type { SettingsTab } from "./common/constants";
import { GeneralPage } from "./general/GeneralPage";
import { ProvidersPage } from "./providers/ProvidersPage";
import { UsersPage } from "./users/UsersPage";

const TAB_COMPONENTS: Record<SettingsTab, React.ComponentType> = {
  general: GeneralPage,
  providers: ProvidersPage,
  usage: UsagePage,
  users: UsersPage,
};

const TAB_META: Record<SettingsTab, { title: string; description: string }> = {
  general: { title: "General", description: "Workspace defaults and preferences" },
  providers: { title: "LLM Providers", description: "Configure API keys and models for agents" },
  usage: { title: "Usage", description: "Token usage per agent run — provider totals with estimate fallback" },
  users: { title: "Users", description: "Manage accounts and roles" },
};

function useActiveTab(): SettingsTab | null {
  const { pathname } = useLocation();
  const segment = pathname.split("/").filter(Boolean)[1];
  if (segment === "general" || segment === "providers" || segment === "usage" || segment === "users") return segment;
  return null;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { pathname } = useLocation();
  const activeTab = useActiveTab();

  useEffect(() => {
    if (pathname === "/settings" || pathname === "/settings/") {
      navigate("/settings/general", { replace: true });
    }
  }, [pathname, navigate]);

  useEffect(() => {
    if (activeTab === "providers") {
      void dispatch(fetchLlmProviders());
    }
  }, [activeTab, dispatch]);

  if (!activeTab) {
    return <Navigate to="/settings/general" replace />;
  }

  const ActiveComponent = TAB_COMPONENTS[activeTab];
  const meta = TAB_META[activeTab];

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="m-0 text-xl font-semibold leading-tight text-foreground">{meta.title}</h1>
        <p className="m-0 mt-1.5 text-sm text-muted-foreground">{meta.description}</p>
      </div>
      <ActiveComponent />
    </PageShell>
  );
}
