import type React from "react";
import { useEffect, useState } from "react";
import { SOLAR_ICON_CATEGORY } from "./solarIconCategories";

type IconComponent = React.ComponentType<{
  size?: number;
  weight?: string;
  className?: string;
}>;

type IconModule = { default: IconComponent };

const cache = new Map<string, IconComponent | null>();
const inflight = new Map<string, Promise<IconComponent | null>>();

function loadSolarIcon(name: string): Promise<IconComponent | null> {
  if (cache.has(name)) return Promise.resolve(cache.get(name) ?? null);

  const pending = inflight.get(name);
  if (pending) return pending;

  const category = SOLAR_ICON_CATEGORY[name];
  if (!category) {
    cache.set(name, null);
    return Promise.resolve(null);
  }

  const promise = import(`@solar-icons/react/${category}/${name}`)
    .then((mod: IconModule) => {
      const Icon = mod.default ?? null;
      cache.set(name, Icon);
      return Icon;
    })
    .catch(() => {
      cache.set(name, null);
      return null;
    })
    .finally(() => {
      inflight.delete(name);
    });

  inflight.set(name, promise);
  return promise;
}

export function useSolarIcon(name?: string | null): IconComponent | null {
  const [Icon, setIcon] = useState<IconComponent | null>(() => (name ? (cache.get(name) ?? null) : null));

  useEffect(() => {
    if (!name) {
      setIcon(null);
      return;
    }
    if (cache.has(name)) {
      setIcon(() => cache.get(name) ?? null);
      return;
    }
    let cancelled = false;
    void loadSolarIcon(name).then((resolved) => {
      if (!cancelled) setIcon(() => resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [name]);

  return Icon;
}

interface SolarIconProps {
  name?: string | null;
  size?: number;
  weight?: "Bold" | "BoldDuotone" | "Linear" | "Outline";
  className?: string;
  fallback?: React.ReactNode;
}

export function SolarIcon({ name, size = 20, weight = "Outline", className, fallback = null }: SolarIconProps) {
  const Icon = useSolarIcon(name);

  if (!Icon) return <>{fallback}</>;
  return <Icon size={size} weight={weight} className={className} />;
}
