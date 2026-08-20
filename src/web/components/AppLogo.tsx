import { useId } from "react";

type AppLogoProps = {
  variant?: "icon" | "color" | "current";
  size?: number;
  className?: string;
};

export function AppLogo({ variant = "icon", size = 40, className }: AppLogoProps) {
  const uid = useId().replace(/:/g, "");
  const isMark = variant === "color" || variant === "current";
  const fill = variant === "current" ? "currentColor" : undefined;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      role="img"
      aria-labelledby={`app-logo-title-${uid}`}
      className={className}
    >
      <title id={`app-logo-title-${uid}`}>Raw Agents</title>
      {isMark ? (
        <>
          <rect x="4" y="4" width="11" height="11" rx="3" fill={fill ?? "#111111"} />
          <circle cx="22.75" cy="9.5" r="5.75" fill={fill ?? "#DD7627"} />
          <rect x="4" y="17" width="11" height="11" rx="3" fill={fill ?? "#111111"} />
        </>
      ) : (
        <>
          <rect width="32" height="32" rx="8" fill="#111111" />
          <rect x="6" y="6" width="9" height="9" rx="2.4" fill="#FFFFFF" />
          <circle cx="21.5" cy="10.5" r="4.7" fill="#DD7627" />
          <rect x="6" y="17" width="9" height="9" rx="2.4" fill="#FFFFFF" />
        </>
      )}
    </svg>
  );
}
