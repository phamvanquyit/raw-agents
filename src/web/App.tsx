import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import RenderIf from "src/components/RenderIf";
import { getAuthToken } from "./common/api";
import { fetchCurrentUser } from "./common/authSlice";
import { useSocket } from "./common/hooks/useSocket";
import { AppLayout } from "./components/AppLayout";

import { useAppDispatch, useAppSelector } from "./store/store";
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
const ProfilePage = lazy(() => import("./modules/profile/ProfilePage"));
const McpServersPage = lazy(() => import("./modules/mcp-servers/McpServersPage"));
const McpServersEditPage = lazy(() => import("./modules/mcp-servers/McpServersEditPage"));
const KvStorePage = lazy(() => import("./modules/kvstore/KvStorePage"));
const SecretsPage = lazy(() => import("./modules/secrets/SecretsPage"));
const DatatablesPage = lazy(() => import("./modules/datatables/DatatablesPage"));
const DatatableProjectPage = lazy(() => import("./modules/datatables/DatatableProjectPage"));

// ── Public routes (no sidebar, no auth) ─────────────────────────────────────
const PUBLIC_ROUTE_PREFIXES = ["/chat", "/login", "/setup"];

// ── Auth guard ──────────────────────────────────────────────────────────────
function AuthGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      navigate("/login", { replace: true });
    } else {
      dispatch(fetchCurrentUser());
    }
    // Only run once on mount — no need to re-fetch on every route change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const token = getAuthToken();
  return <RenderIf condition={!!token}>{children}</RenderIf>;
}

// ── Admin guard — redirects non-admin users to dashboard ────────────────────
function AdminGuard({ children }: { children: React.ReactNode }) {
  const user = useAppSelector((s) => s.auth.user);
  const loaded = useAppSelector((s) => s.auth.loaded);

  // Still loading user info — render nothing to avoid flash
  if (!loaded) return null;

  // Not admin → redirect to dashboard
  if (user?.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

// ── Main content ─────────────────────────────────────────────────────────────

function AppContent() {
  const location = useLocation();

  const isPublicRoute = PUBLIC_ROUTE_PREFIXES.some((prefix) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`));
  const isLoginRoute = location.pathname === "/login";
  const isSetupRoute = location.pathname === "/setup";
  const isAuthRoute = isLoginRoute || isSetupRoute;

  useSocket(!isAuthRoute && !isPublicRoute);

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
            <Route path="/mcp-servers" element={<McpServersPage />} />
            <Route path="/mcp-servers/edit" element={<McpServersEditPage />} />
            <Route path="/teams" element={<Navigate to="/agents" replace />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/providers" element={<Navigate to="/settings/providers" replace />} />
            <Route path="/kvstore" element={<KvStorePage />} />
            <Route path="/datatables" element={<DatatablesPage />} />
            <Route path="/datatables/:projectId" element={<DatatableProjectPage />} />
            <Route
              path="/secrets"
              element={
                <AdminGuard>
                  <SecretsPage />
                </AdminGuard>
              }
            />
            <Route
              path="/settings/*"
              element={
                <AdminGuard>
                  <SettingsPage />
                </AdminGuard>
              }
            />
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
    </BrowserRouter>
  );
}

export default App;
