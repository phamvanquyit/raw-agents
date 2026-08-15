import CpuBolt from "@solar-icons/react/devices/CpuBolt";
import Key from "@solar-icons/react/security/Key";
import LockPassword from "@solar-icons/react/security/LockPassword";
import type Settings from "@solar-icons/react/settings/Settings";
import Tuning2 from "@solar-icons/react/settings/Tuning2";
import UsersGroupTwoRounded from "@solar-icons/react/users/UsersGroupTwoRounded";

export type SettingsTab = "general" | "default-models" | "providers" | "api-keys" | "users";

export const SETTINGS_TABS: {
  key: SettingsTab;
  label: string;
  icon: typeof Settings;
}[] = [
  { key: "general", label: "General", icon: Tuning2 },
  { key: "default-models", label: "Default models", icon: CpuBolt },
  { key: "providers", label: "LLM Providers", icon: Key },
  { key: "api-keys", label: "API Keys", icon: LockPassword },
  { key: "users", label: "Users", icon: UsersGroupTwoRounded },
];
