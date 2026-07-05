import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import RenderIf from "src/components/ui/RenderIf";
import { getAuthToken } from "./common/api";
import { useSocket } from "./common/hooks/useSocket";
import { AppLayout } from "./components/AppLayout";
import { ToastProvider } from "./components/ui/toast";

import { fetchSettings } from "./modules/settings/common/settingsSlice";
import { useAppDispatch } from "./store/store";
import "./index.css";

const ToolsPage = lazy(() => import("./modules/tools/ToolsPage"));
const SettingsPage = lazy(() => import("./modules/settings/SettingsPage"));
const AgentsPage = lazy(() => import("./modules/agents/AgentsPage"));
const PublicChatPage = lazy(() => import("./modules/chat/[id]/page"));
const LoginPage = lazy(() => import("./modules/auth/LoginPage"));
const SetupPage = lazy(() => import("./modules/auth/SetupPage"));
const EditToolPage = lazy(() => import("./modules/tools/[id]/EditToolPage"));
const AgentDetailPage = lazy(() => import("./modules/agents/[id]/page"));
const DashboardPage = lazy(() => import("./modules/dashboard/DashboardPage"));

// ── Public routes (no sidebar, no auth) ─────────────────────────────────────
const PUBLIC_ROUTE_PREFIXES = ["/chat", "/login", "/setup"];

// ── Auth guard ──────────────────────────────────────────────────────────────
function AuthGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const token = getAuthToken();
    if (!token && location.pathname !== "/login") {
      navigate("/login", { replace: true });
    }
  }, [navigate, location.pathname]);

  const token = getAuthToken();
  return <RenderIf condition={!!token}>{children}</RenderIf>;
}

// ── Main content ─────────────────────────────────────────────────────────────

function AppContent() {
  const dispatch = useAppDispatch();
  const location = useLocation();

  const isPublicRoute = PUBLIC_ROUTE_PREFIXES.some((prefix) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`));
  const isLoginRoute = location.pathname === "/login";
  const isSetupRoute = location.pathname === "/setup";
  const isAuthRoute = isLoginRoute || isSetupRoute;

  useEffect(() => {
    // Only fetch settings if authenticated
    if (!isAuthRoute && getAuthToken()) {
      dispatch(fetchSettings());
    }
  }, [dispatch, isAuthRoute]);

  useSocket();

  // Login/Setup routes → full-width, no auth
  if (isAuthRoute) {
    return (
      <Suspense fallback={null}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={<SetupPage />} />
        </Routes>
      </Suspense>
    );
  }

  // Public routes → full-width, no sidebar
  if (isPublicRoute) {
    return (
      <div className="fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 z-10 overflow-y-auto overflow-x-hidden">
          <Suspense fallback={null}>
            <Routes>
              <Route path="/chat/:id" element={<PublicChatPage />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    );
  }

  // Authenticated routes
  return (
    <AuthGuard>
      <Suspense fallback={null}>
        <Routes>
          {/* Full-page routes (no sidebar) */}
          <Route path="/tools/:id" element={<EditToolPage />} />
          <Route path="/agents/:id/*" element={<AgentDetailPage />} />

          {/* Sidebar pages — wrapped in AppLayout */}
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/tools" element={<ToolsPage />} />
            <Route path="/settings/*" element={<SettingsPage />} />
          </Route>
        </Routes>
      </Suspense>
    </AuthGuard>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────

function App() {
  return (
    <BrowserRouter>
      <AppContent />
      <ToastProvider />
    </BrowserRouter>
  );
}

export default App;
