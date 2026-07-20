import { MapPoint } from "@solar-icons/react";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "src/common/api";
import { SettingKey } from "src/common/enum";
import { Select, type SelectOption } from "src/components/ui/options-select";
import { toast } from "src/components/ui/toast";
import { getSettingValues, saveSettingValues } from "src/modules/settings/common/settingsApi";

// ─── Timezone Section ─────────────────────────────────────────────────────────
// Reusable timezone configuration used in the General settings tab.
// Uses Game-styled custom components only.

export function TimezoneSection() {
  // ── Local state ──────────────────────────────────────────────────────────────
  const [currentTz, setCurrentTz] = useState("UTC");
  const [tzList, setTzList] = useState<{ tz: string; offset: string }[]>([]);
  const [loadingTz, setLoadingTz] = useState(true);

  // ── Load timezone list & current setting ─────────────────────────────────────
  useEffect(() => {
    getSettingValues([SettingKey.Timezone]).then((s) => {
      if (s[SettingKey.Timezone]) setCurrentTz(s[SettingKey.Timezone]);
    });
    apiClient
      .get<{ tz: string; offset: string }[]>("/api/settings/timezones")
      .then(setTzList)
      .catch(() => setTzList([]))
      .finally(() => setLoadingTz(false));
  }, []);

  // ── Computed ─────────────────────────────────────────────────────────────────
  const tzOptions: SelectOption[] = tzList.map(({ tz, offset }) => ({
    value: tz,
    label: `${tz} (${offset})`,
  }));

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleTzChange = useCallback(async (value: string) => {
    try {
      setCurrentTz(value);
      await saveSettingValues({ [SettingKey.Timezone]: value });
      toast.success("Timezone saved");
    } catch {
      toast.error("Failed to save timezone");
    }
  }, []);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <MapPoint width={13} height={13} className="text-primary" />
        <span className="text-xs font-bold text-muted-foreground">Timezone</span>
      </div>

      <Select
        value={currentTz}
        onChange={handleTzChange}
        options={tzOptions}
        placeholder={loadingTz ? "Loading timezones…" : "Search timezone…"}
        disabled={loadingTz}
        searchable
        searchPlaceholder="Search timezone…"
      />
      <p className="text-xs text-muted-foreground mt-2 ml-3">Used for scheduled tasks &amp; time display in agent system prompts.</p>
    </div>
  );
}
