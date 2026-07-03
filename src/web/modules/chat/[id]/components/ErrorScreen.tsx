import { GridBackground } from "./GridBackground";

interface ErrorScreenProps {
  error: string;
}

export function ErrorScreen({ error }: ErrorScreenProps) {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background relative overflow-hidden p-6">
      <GridBackground />
      <div className="relative rounded-2xl border border-border bg-surface-raised p-10 text-center max-w-md w-full shadow-[0_0_40px_rgba(168,255,83,0.06),0_8px_32px_rgba(0,0,0,0.4)]">
        <div className="w-12 h-12 rounded-full border border-danger/30 bg-danger/8 flex items-center justify-center mx-auto mb-5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <title>Error</title>
            <path
              d="M12 9v4m0 4h.01M12 3l9.66 16.59A1 1 0 0120.66 21H3.34a1 1 0 01-.86-1.41L12 3z"
              stroke="var(--color-danger, #FF4D6D)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="font-display text-[18px] text-main font-semibold mb-2">Unavailable</h2>
        <p className="text-soft text-[14px] leading-relaxed">{error}</p>
      </div>
    </div>
  );
}
