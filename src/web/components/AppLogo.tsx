type AppLogoProps = {
  fill?: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
};

/**
 * Raw Agents mark — robot agent head.
 * Uses currentColor by default so it follows theme foreground/primary.
 */
export function AppLogo({ fill = "currentColor", size = 40, strokeWidth = 1.5, className }: AppLogoProps) {
  const sw = Math.max(1.2, Math.min(strokeWidth * (size < 28 ? 1.1 : 1), size / 12));

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      className={className}
      style={fill === "currentColor" ? undefined : { color: fill }}
      color={fill === "currentColor" ? undefined : fill}
    >
      <title>Raw Agents</title>

      <path d="M12 2.6v2.4" stroke={fill} strokeWidth={sw} strokeLinecap="round" />
      <circle cx="12" cy="2.3" r="1.15" fill={fill} />

      <rect x="4" y="6" width="16" height="14.2" rx="4.5" stroke={fill} strokeWidth={sw} />

      <rect x="1.7" y="10.9" width="2.15" height="4" rx="1.05" fill={fill} opacity={0.65} />
      <rect x="20.15" y="10.9" width="2.15" height="4" rx="1.05" fill={fill} opacity={0.65} />

      <circle cx="9" cy="12.1" r="1.55" fill={fill} />
      <circle cx="15" cy="12.1" r="1.55" fill={fill} />

      <path d="M9 16c.85 1.1 1.95 1.6 3 1.6s2.15-.5 3-1.6" stroke={fill} strokeWidth={sw} strokeLinecap="round" />
    </svg>
  );
}
