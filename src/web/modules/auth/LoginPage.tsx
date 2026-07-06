import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, clearAuthToken, getAuthToken, setAuthToken } from "src/common/api";
import type { User } from "src/common/types";
import { AppLogo } from "src/components/AppLogo";
import RenderIf from "src/components/ui/RenderIf";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Field } from "src/components/ui/label";
import { toast } from "src/components/ui/toast";

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  // Check if initial setup is needed, or if already logged in
  useEffect(() => {
    const check = async () => {
      try {
        // Check setup status first
        const status = await apiClient.get<{ needsSetup: boolean }>("/api/auth/setup-status");
        if (status.needsSetup) {
          navigate("/setup", { replace: true });
          return;
        }

        // If user already has a valid token, redirect to dashboard
        const token = getAuthToken();
        if (token) {
          try {
            await apiClient.get("/api/auth/me");
            navigate("/", { replace: true });
            return;
          } catch {
            // Token invalid — clear it and show login form
            clearAuthToken();
          }
        }
      } catch {
        // If API fails, show login form anyway
      } finally {
        setChecking(false);
      }
    };
    check();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username || !password) {
      setError("Please enter both username and password");
      return;
    }

    setLoading(true);
    try {
      const result = await apiClient.post<{ token: string; user: User }>("/api/auth/login", { username, password });
      setAuthToken(result.token);
      toast.success(`Welcome back, ${result.user.name || result.user.username}!`);
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  if (checking) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      {/* Decorative subtle pattern */}
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: "radial-gradient(circle at 25px 25px, #87867f 1px, transparent 0)",
            backgroundSize: "50px 50px",
          }}
        />
      </div>

      <div className="relative w-full max-w-[400px] mx-4">
        {/* Card */}
        <div className="rounded-xl border border-border bg-surface shadow-panel overflow-hidden">
          {/* Top highlight */}
          <div className="h-px bg-linear-to-r from-transparent via-primary/30 to-transparent" />

          {/* Header */}
          <div className="flex flex-col items-center pt-8 pb-4 px-6">
            <div className="mb-4">
              <AppLogo size={48} />
            </div>
            <h1 className="font-display text-xl font-medium text-main mb-1">Welcome Back</h1>
            <p className="text-sm text-muted">Sign in to continue to Raw Agents</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-6 pb-6 pt-2">
            <div className="flex flex-col gap-4">
              <Field label="Username or Email" required>
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  autoComplete="username"
                  autoFocus
                  disabled={loading}
                />
              </Field>

              <Field label="Password" required>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  disabled={loading}
                />
              </Field>

              {/* Error message */}
              <RenderIf condition={!!error}>
                <div className="px-3 py-2 rounded-lg bg-danger/10 border border-danger/20">
                  <p className="text-xs text-danger font-medium">{error}</p>
                </div>
              </RenderIf>

              <Button type="submit" variant="primary" size="lg" block loading={loading} className="mt-1">
                Sign In
              </Button>
            </div>
          </form>

          {/* Bottom accent */}
          <div className="h-1 bg-linear-to-r from-primary/20 via-primary/40 to-primary/20" />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center mt-4 gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
          <span className="text-[10px] text-muted font-mono">Raw Agents</span>
        </div>
      </div>
    </div>
  );
}
