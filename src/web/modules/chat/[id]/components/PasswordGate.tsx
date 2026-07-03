import { Lock, Restart } from "@solar-icons/react";
import { useEffect, useRef } from "react";
import { AppLogo } from "../../../../components/AppLogo";
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
      <div className="absolute w-[320px] h-[320px] rounded-full bg-primary/[0.04] blur-[100px]" />

      <div className="relative rounded-2xl border border-border bg-surface-raised p-8 max-w-sm w-full shadow-[0_0_40px_rgba(168,255,83,0.06),0_8px_32px_rgba(0,0,0,0.4)]">
        <div className="flex flex-col items-center mb-7">
          <div className="mb-5">
            <AppLogo size={44} />
          </div>
          <h2 className="font-display text-[18px] text-main font-semibold">{agentName}</h2>
          <p className="text-muted mt-1.5 text-[13px]">Enter password to continue</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="relative">
            <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              type="password"
              placeholder="Password"
              value={enteredPassword}
              onChange={(e) => onPasswordChange(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-background border border-border/80 rounded-xl outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 text-main placeholder:text-muted text-[14px] transition-all"
              ref={passwordRef}
            />
          </div>
          {authError && <span className="text-[12px] font-medium text-danger pl-1">{authError}</span>}
          <button
            type="submit"
            disabled={verifying || !enteredPassword}
            className="w-full py-2.5 rounded-xl bg-primary text-secondary text-[14px] font-semibold hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {verifying ? <Restart className="animate-spin" size={15} /> : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
