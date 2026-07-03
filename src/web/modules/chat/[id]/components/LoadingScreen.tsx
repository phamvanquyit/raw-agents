import { AppLogo } from "../../../../components/AppLogo";
import { GridBackground } from "./GridBackground";

export function LoadingScreen() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background relative overflow-hidden">
      <GridBackground />
      <div className="relative flex flex-col items-center gap-4">
        <div className="animate-pulse">
          <AppLogo size={48} />
        </div>
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-1 h-1 rounded-full bg-primary/60 inline-block animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
