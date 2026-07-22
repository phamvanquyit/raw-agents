import { ConfigProvider } from "antd";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { antdModalConfig, antdTheme } from "src/common/antdTheme";
import { initTheme } from "src/common/theme";
import "./index.css";
import { store } from "src/store/store";
import App from "./App";

initTheme();

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element not found");
}

createRoot(rootEl).render(
  <Provider store={store}>
    <ConfigProvider theme={antdTheme} modal={antdModalConfig}>
      <App />
    </ConfigProvider>
  </Provider>,
);
