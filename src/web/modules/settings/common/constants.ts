import { Key, type Settings, Tuning2, UsersGroupTwoRounded } from "@solar-icons/react";

export type SettingsTab = "general" | "providers" | "users";

export const SETTINGS_TABS: {
  key: SettingsTab;
  label: string;
  icon: typeof Settings;
}[] = [
  { key: "general", label: "General", icon: Tuning2 },
  { key: "providers", label: "LLM Providers", icon: Key },
  { key: "users", label: "Users", icon: UsersGroupTwoRounded },
];
