import { createApp } from "./app.mjs";

const port = Number(process.env.PORT || 8790);
const host = process.env.HOST || "127.0.0.1";
const app = createApp();

app.listen(port, host, () => {
  app.locals.startupDiagnostics?.mark("apiListenReadyMs");
  console.log(`CRM AI Gateway demo: http://${host}:${port}`);
  void app.locals.initializeFrozenRuntime?.().catch(() => undefined);
});
