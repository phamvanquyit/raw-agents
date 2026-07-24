import { Chart, Key, type Settings, Tuning2, UsersGroupTwoRounded } from "@solar-icons/react";

export type SettingsTab = "general" | "providers" | "users" | "usage";

export const SETTINGS_TABS: {
  key: SettingsTab;
  label: string;
  icon: typeof Settings;
}[] = [
  { key: "general", label: "General", icon: Tuning2 },
  { key: "providers", label: "LLM Providers", icon: Key },
  { key: "usage", label: "Usage", icon: Chart },
  { key: "users", label: "Users", icon: UsersGroupTwoRounded },
];
