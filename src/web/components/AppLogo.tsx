import { useId } from "react";

type AppLogoProps = {
  fill?: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
};

const MAIN_PATH = "M176 176H610C661 176 699 196 729 238L806 349L654 575L824 832H663L518 579L666 354L614 282C605 270 593 264 574 264H258L176 176Z";
const ACCENT_PATH = "M224 370H536L452 500H344V553L562 832H416L224 574V370Z";

export function AppLogo({ size = 40, className }: AppLogoProps) {
  const uid = useId().replace(/:/g, "");
  const bevel = `logo-bevel-${uid}`;
  const shadow = `logo-shadow-${uid}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1024 1024"
      width={size}
      height={size}
      role="img"
      aria-labelledby={`app-logo-title-${uid}`}
      className={className}
    >
      <title id={`app-logo-title-${uid}`}>Raw Agents</title>
      <defs>
        <filter id={bevel} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.6" result="height" />
          <feSpecularLighting in="height" surfaceScale="3.8" specularConstant="0.65" specularExponent="32" lightingColor="#ffffff" result="spec">
            <feDistantLight azimuth="315" elevation="55" />
          </feSpecularLighting>
          <feComposite in="spec" in2="SourceAlpha" operator="in" result="specClip" />
          <feComposite in="SourceGraphic" in2="specClip" operator="arithmetic" k1="0" k2="1" k3="0.4" k4="0" result="lit" />
          <feComposite in="lit" in2="SourceAlpha" operator="in" />
        </filter>
        <filter id={shadow} x="-18%" y="-12%" width="140%" height="140%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="14" dy="20" stdDeviation="16" floodColor="#000000" floodOpacity="0.18" />
        </filter>
      </defs>
      <g filter={`url(#${shadow})`}>
        <g filter={`url(#${bevel})`}>
          <path fill="#DD7627" d={MAIN_PATH} />
          <path fill="#FFA333" d={ACCENT_PATH} />
        </g>
      </g>
    </svg>
  );
}
