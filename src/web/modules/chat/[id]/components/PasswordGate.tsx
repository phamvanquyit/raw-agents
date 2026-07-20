import { Lock } from "@solar-icons/react";
import { useEffect, useRef } from "react";
import { AppLogo } from "../../../../components/AppLogo";
import { Button } from "../../../../components/ui/button";
import { GridBackground } from "./GridBackground";

interface PasswordGateProps {
  agentName: string;
  enteredPassword: string;
  onPasswordChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  authError: string;
  verifying: boolean;
}

export function PasswordGate({ agentName, enteredPassword, onPasswordChange, onSubmit, authError, verifying }: PasswordGateProps) {
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    passwordRef.current?.focus();
  }, []);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background relative overflow-hidden p-6">
      <GridBackground />

      <div className="relative rounded-md border border-border bg-muted p-8 max-w-sm w-full shadow-card">
        <div className="flex flex-col items-center mb-7">
          <div className="mb-5">
            <AppLogo size={44} />
          </div>
          <h2 className="font-display text-[18px] text-foreground font-semibold">{agentName}</h2>
          <p className="text-muted-foreground mt-1.5 text-[13px]">Enter password to continue</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="relative">
            <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="password"
              placeholder="Password"
              value={enteredPassword}
              onChange={(e) => onPasswordChange(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-background border border-border/80 rounded-md outline-none focus:border-primary/50 focus:ring-1 focus:ring-ring/20 text-foreground placeholder:text-muted-foreground text-[14px] transition-all"
              ref={passwordRef}
            />
          </div>
          {authError && <span className="text-[12px] font-medium text-destructive pl-1">{authError}</span>}
          <Button type="submit" variant="primary" size="md" block disabled={!enteredPassword} loading={verifying}>
            Unlock
          </Button>
        </form>
      </div>
    </div>
  );
}
