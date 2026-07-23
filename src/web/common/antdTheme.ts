import type { ModalProps } from "antd";
import { type ThemeConfig, theme } from "antd";

/** Dark-only Ant Design theme mapped to app palette. */
export const antdTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorBgBase: "#121212",
    colorBgContainer: "#191919",
    colorBgElevated: "#1e1e1e",
    colorBgLayout: "#121212",
    colorBgMask: "rgba(0, 0, 0, 0.68)",
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
    // Keep base surfaces flat; elevated overlays (dropdown/popover) need depth
    // so they separate from content underneath (e.g. datatable select cells).
    boxShadow: "none",
    boxShadowSecondary: "0 0 0 1px rgba(102, 102, 102, 0.32), 0 8px 24px rgba(0, 0, 0, 0.45)",
    boxShadowTertiary: "0 0 0 1px rgba(102, 102, 102, 0.24), 0 4px 12px rgba(0, 0, 0, 0.35)",
    dropShadowPopover: "0 0 0 1px rgba(102, 102, 102, 0.32), 0 8px 24px rgba(0, 0, 0, 0.45)",
  } as ThemeConfig["token"],
  components: {
    Button: {
      primaryShadow: "none",
      defaultShadow: "none",
      dangerShadow: "none",
    },
    Dropdown: {
      paddingBlock: 4,
    },
    Modal: {
      contentBg: "#191919",
      headerBg: "#161616",
      footerBg: "#161616",
      titleFontSize: 15,
      contentPadding: 0,
      headerPadding: "12px 16px",
      headerBorderBottom: "1px solid rgba(102, 102, 102, 0.2)",
      headerMarginBottom: 0,
      bodyPadding: "20px 16px",
      footerPadding: "12px 16px",
      footerBorderTop: "1px solid rgba(102, 102, 102, 0.2)",
      footerMarginTop: 0,
      footerBorderRadius: "0 0 12px 12px",
    } as NonNullable<ThemeConfig["components"]>["Modal"],
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

export const antdModalConfig: Pick<ModalProps, "mask" | "styles"> = {
  mask: { blur: true },
  styles: {
    container: {
      padding: 0,
      border: "1px solid rgba(102, 102, 102, 0.32)",
      boxShadow: "0 16px 48px rgba(0, 0, 0, 0.55)",
    },
    header: {
      padding: "12px 16px",
      margin: 0,
      minHeight: 44,
      display: "flex",
      alignItems: "center",
    },
    body: {
      padding: "20px 16px",
    },
    footer: {
      padding: "12px 16px",
      margin: 0,
      background: "#161616",
    },
    close: {
      top: 8,
      insetInlineEnd: 10,
    },
  },
};
