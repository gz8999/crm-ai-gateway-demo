const MARK_KEYS = new Set([
  "envLoadMs",
  "apiListenReadyMs",
  "viteListenReadyMs",
  "oauthStartMs",
  "oauthReadyMs",
  "firstD365ReadStartMs",
  "firstD365ReadReadyMs",
  "frozenRuntimeReadyMs",
  "firstPortfolioReadyMs",
  "firstRuntimeStatusReadyMs",
  "firstCrmStatusReadyMs",
  "pageDataReadyMs",
  "totalColdStartMs",
]);

export function createStartupDiagnostics({ processStartedAt = Date.now(), env = process.env, now = () => Date.now() } = {}) {
  const startedAt = Number.isFinite(Number(processStartedAt)) ? Number(processStartedAt) : now();
  const marks = Object.fromEntries([...MARK_KEYS].map((key) => [key, null]));
  let runtimeInitializationCount = 0;
  let d365GetCount = 0;
  let runtimeState = "starting";
  let apiListenBlocked = false;

  function elapsed() { return Math.max(0, now() - startedAt); }
  function mark(key) {
    if (!MARK_KEYS.has(key) || marks[key] !== null) return marks[key] ?? null;
    marks[key] = elapsed();
    return marks[key];
  }
  function setMark(key, value) {
    if (!MARK_KEYS.has(key) || marks[key] !== null || !Number.isFinite(Number(value))) return marks[key] ?? null;
    marks[key] = Math.max(0, Number(value));
    return marks[key];
  }
  function runtimeStarting() {
    runtimeState = "starting";
    runtimeInitializationCount += 1;
  }
  function runtimeReady() { runtimeState = "ready"; mark("frozenRuntimeReadyMs"); mark("totalColdStartMs"); }
  function runtimeFailed() { runtimeState = "failed"; mark("totalColdStartMs"); }
  function d365ReadStarted() { mark("firstD365ReadStartMs"); }
  function d365ReadReady() { mark("firstD365ReadReadyMs"); }
  function d365Get() { d365GetCount += 1; }
  function snapshot() {
    return {
      processStartMs: 0,
      ...marks,
      envBaseLoaded: env.GATEWAY_ENV_BASE_LOADED === "true",
      envExternalLocalLoaded: env.GATEWAY_ENV_EXTERNAL_LOCAL_LOADED === "true",
      d365CredentialsConfigured: env.GATEWAY_D365_CREDENTIALS_CONFIGURED === "true",
      runtimeInitializationCount,
      d365GetCount,
      runtimeState,
      apiListenBlocked,
    };
  }

  return {
    d365Get,
    d365ReadReady,
    d365ReadStarted,
    mark,
    runtimeFailed,
    runtimeReady,
    runtimeStarting,
    setApiListenBlocked: (value) => { apiListenBlocked = value === true; },
    setMark,
    snapshot,
  };
}
