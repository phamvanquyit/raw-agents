import { Button, Form, Input, message } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, clearAuthToken, getAuthToken, setAuthToken } from "src/common/api";
import type { User } from "src/common/types";
import { AppLogo } from "src/components/AppLogo";
import RenderIf from "src/components/RenderIf";

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const check = async () => {
      try {
        const status = await apiClient.get<{ needsSetup: boolean }>("/api/auth/setup-status");
        if (status.needsSetup) {
          navigate("/setup", { replace: true });
          return;
        }

        const token = getAuthToken();
        if (token) {
          try {
            await apiClient.get("/api/auth/me");
            navigate("/", { replace: true });
            return;
          } catch {
            clearAuthToken();
          }
        }
      } catch {
        /* show login form */
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
      const result = await apiClient.post<{ token: string; refreshToken: string; user: User }>("/api/auth/login", {
        username,
        password,
      });
      setAuthToken(result.token, result.refreshToken);
      message.success(`Welcome back, ${result.user.name || result.user.username}!`);
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
      <div className="relative w-full max-w-[400px] mx-4">
        <div className="rounded-md border border-border bg-card overflow-hidden">
          <div className="flex flex-col items-center pt-8 pb-4 px-6">
            <div className="mb-4">
              <AppLogo size={48} />
            </div>
            <h1 className="font-display text-xl font-medium text-foreground mb-1">Welcome Back</h1>
            <p className="text-sm text-muted-foreground">Sign in to continue to Raw Agents</p>
          </div>

          <form onSubmit={handleSubmit} className="px-6 pb-6 pt-2">
            <div className="flex flex-col gap-4">
              <Form.Item
                label={
                  <span className="text-muted-foreground">
                    Username or Email
                    <span className="text-destructive"> *</span>
                  </span>
                }
                layout="vertical"
                required
                className="!mb-0"
              >
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  autoComplete="username"
                  autoFocus
                  disabled={loading}
                />
              </Form.Item>

              <Form.Item
                label={
                  <span className="text-muted-foreground">
                    Password
                    <span className="text-destructive"> *</span>
                  </span>
                }
                layout="vertical"
                required
                className="!mb-0"
              >
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  disabled={loading}
                />
              </Form.Item>

              <RenderIf condition={!!error}>
                <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
                  <p className="text-xs text-destructive font-medium">{error}</p>
                </div>
              </RenderIf>

              <Button htmlType="submit" type="primary" size="large" block loading={loading} className="mt-1">
                Sign In
              </Button>
            </div>
          </form>
        </div>

        <div className="flex items-center justify-center mt-4 gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
          <span className="text-[10px] text-muted-foreground font-mono">Raw Agents</span>
        </div>
      </div>
    </div>
  );
}
