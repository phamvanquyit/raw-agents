/**
 * SetupPage — initial admin setup page.
 *
 * Shown when the app is freshly installed and no admin exists.
 * Creates the first admin account + sets system timezone.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, setAuthToken } from "src/common/api";
import type { User } from "src/common/types";
import { AppLogo } from "src/components/AppLogo";
import RenderIf from "src/components/ui/RenderIf";
import { Button } from "src/components/ui/button";
import { Field } from "src/components/ui/form-field";
import { Input } from "src/components/ui/input";
import { Select, type SelectOption } from "src/components/ui/options-select";
import { toast } from "src/components/ui/toast";

interface TimezoneItem {
  tz: string;
  offset: string;
}

export default function SetupPage() {
  const navigate = useNavigate();

  // Form state
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [timezone, setTimezone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Timezone options
  const [timezoneOptions, setTimezoneOptions] = useState<SelectOption[]>([]);
  const [checking, setChecking] = useState(true);

  // Check if setup is needed; redirect if already done
  useEffect(() => {
    apiClient
      .get<{ needsSetup: boolean }>("/api/auth/setup-status")
      .then((res) => {
        if (!res.needsSetup) {
          navigate("/login", { replace: true });
        }
      })
      .catch(() => {
        // If API fails, still show setup page
      })
      .finally(() => setChecking(false));
  }, [navigate]);

  // Fetch timezone list
  useEffect(() => {
    apiClient
      .get<TimezoneItem[]>("/api/settings/timezones")
      .then((items) => {
        const options = items.map((item) => ({
          value: item.tz,
          label: `${item.tz} (${item.offset})`,
        }));
        setTimezoneOptions(options);

        // Auto-detect timezone
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (detected && items.some((i) => i.tz === detected)) {
          setTimezone(detected);
        }
      })
      .catch(() => {
        // Silently fail — user can still type timezone
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate
    if (!username || !name || !password) {
      setError("Please fill in all fields");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!timezone) {
      setError("Please select a timezone");
      return;
    }

    setLoading(true);
    try {
      const result = await apiClient.post<{ token: string; user: User }>("/api/auth/setup", {
        username,
        name,
        password,
        timezone,
      });
      setAuthToken(result.token);
      toast.success(`Welcome, ${result.user.name}! Setup complete.`);
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(err.message || "Setup failed");
    } finally {
      setLoading(false);
    }
  };

  // Don't render until we've checked setup status
  if (checking) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background overflow-y-auto py-8">
      <div className="relative w-full max-w-[440px] mx-4">
        <div className="rounded-md border border-border bg-card overflow-hidden">
          <div className="flex flex-col items-center pt-8 pb-4 px-6">
            <div className="mb-4">
              <AppLogo size={48} />
            </div>
            <h1 className="font-display text-xl font-medium text-foreground mb-1">Initial Setup</h1>
            <p className="text-sm text-muted-foreground text-center">Create your admin account and configure the system</p>
          </div>

          <form onSubmit={handleSubmit} className="px-6 pb-6 pt-2">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-medium text-muted-foreground tracking-wide uppercase">Admin Account</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <Field label="Name" required>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your display name"
                  autoComplete="name"
                  autoFocus
                  disabled={loading}
                />
              </Field>

              <Field label="Username" required>
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Choose a username"
                  autoComplete="username"
                  disabled={loading}
                />
              </Field>

              <Field label="Password" required>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  disabled={loading}
                />
              </Field>

              <Field label="Confirm Password" required>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  disabled={loading}
                />
              </Field>

              <div className="flex items-center gap-2 mt-2 mb-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-medium text-muted-foreground tracking-wide uppercase">System Settings</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <Field label="Timezone" required>
                <Select
                  value={timezone}
                  onChange={(val) => setTimezone(val)}
                  options={timezoneOptions}
                  placeholder="Select timezone..."
                  searchable
                  searchPlaceholder="Search timezones..."
                  disabled={loading}
                />
              </Field>

              <RenderIf condition={!!error}>
                <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
                  <p className="text-xs text-destructive font-medium">{error}</p>
                </div>
              </RenderIf>

              <Button type="submit" variant="primary" size="lg" block loading={loading} className="mt-1">
                Complete Setup
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
