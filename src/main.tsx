import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";
import DesignPreview from "./designs/DesignPreview";

const root = createRoot(document.getElementById("root")!);
const isDesignPreview = window.location.pathname === "/design-preview";
const isInternalRoute = window.location.pathname.startsWith("/internal/");

if (import.meta.env.DEV && window.location.pathname === "/internal/ai-lab") {
  import("./internal/InternalAiLab").then(({ default: InternalAiLab }) => {
    root.render(<React.StrictMode><InternalAiLab /></React.StrictMode>);
  });
} else {
  root.render(
    <React.StrictMode>
      {isInternalRoute ? <InternalRouteUnavailable /> : isDesignPreview ? <DesignPreview /> : <App />}
    </React.StrictMode>,
  );
}

function InternalRouteUnavailable() {
  return <main className="internal-route-unavailable"><section><h1>内部工具不可用</h1><p>该入口仅在受控开发环境开放。</p><a href="/">返回正式产品</a></section></main>;
}
