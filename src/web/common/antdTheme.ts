import { type ThemeConfig, theme } from "antd";

/** Dark-only Ant Design theme mapped to app palette. */
export const antdTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorBgBase: "#121212",
    colorBgContainer: "#191919",
    colorBgElevated: "#1e1e1e",
    colorBgLayout: "#121212",
    colorText: "#d4d4d4",
    colorTextSecondary: "#8a8a8a",
    colorTextTertiary: "#9a9a9a",
    colorTextQuaternary: "#6e6e6e",
    colorPrimary: "#dd7627",
    colorPrimaryHover: "#ffa333",
    colorError: "#ef4444",
    colorSuccess: "#0ac864",
    colorWarning: "#f1b467",
    colorInfo: "#599ce7",
    colorBorder: "rgba(102, 102, 102, 0.2)",
    colorBorderSecondary: "rgba(102, 102, 102, 0.12)",
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 14,
    controlHeight: 32,
    controlHeightSM: 28,
    controlHeightLG: 36,
  },
  components: {
    Button: {
      primaryShadow: "none",
      defaultShadow: "none",
      dangerShadow: "none",
    },
    Modal: {
      contentBg: "#191919",
      headerBg: "#191919",
      footerBg: "#191919",
    },
    Input: {
      // Hover: slightly lighter border (not primary). Focus: primary border, no ring.
      hoverBorderColor: "rgba(255, 255, 255, 0.28)",
      activeBorderColor: "#dd7627",
      activeShadow: "none",
      errorActiveShadow: "none",
      warningActiveShadow: "none",
    },
    Select: {
      hoverBorderColor: "rgba(255, 255, 255, 0.28)",
      activeBorderColor: "#dd7627",
      activeOutlineColor: "transparent",
      optionSelectedBg: "color-mix(in oklab, #dd7627 14%, transparent)",
    },
    DatePicker: {
      hoverBorderColor: "rgba(255, 255, 255, 0.28)",
      activeBorderColor: "#dd7627",
      activeShadow: "none",
    },
    Cascader: {
      optionSelectedBg: "color-mix(in oklab, #dd7627 14%, transparent)",
    },
  },
};
