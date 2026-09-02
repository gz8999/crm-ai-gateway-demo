import { readFile, writeFile } from "node:fs/promises";
import { mapDynamicsOpportunities } from "./dynamicsMapper.mjs";

export function createJsonStore({ opportunitiesPath, auditPath, transformOpportunities = (items) => items, initialOpportunities = null }) {
  let memoryAudit = null;
  let usingMemoryAudit = false;

  async function readJson(path, fallback) {
    try {
      return JSON.parse(await readFile(path, "utf8"));
    } catch {
      return fallback;
    }
  }

  async function writeJson(path, value) {
    try {
      await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
    } catch (error) {
      // Read-only filesystems (serverless) fall back to an in-memory ledger.
      if (["EACCES", "EROFS", "ENOENT"].includes(error?.code)) {
        usingMemoryAudit = true;
        return;
      }
      throw error;
    }
  }

  return {
    async listOpportunities() {
      const templates = initialOpportunities ?? (await readJson(opportunitiesPath, []));
      return transformOpportunities(templates);
    },
    async getOpportunity(id) {
      const opportunities = await this.listOpportunities();
      return opportunities.find((item) => item.id === id) || null;
    },
    async getAuditLog() {
      if (usingMemoryAudit) return memoryAudit ?? [];
      return readJson(auditPath, []);
    },
    async appendAudit(entry) {
      const current = usingMemoryAudit ? (memoryAudit ?? []) : await this.getAuditLog();
      const next = [{ id: `AUD-${String(current.length + 1).padStart(4, "0")}`, ...entry }, ...current].slice(0, 100);
      if (usingMemoryAudit) {
        memoryAudit = next;
        return next[0];
      }
      await writeJson(auditPath, next);
      if (usingMemoryAudit) memoryAudit = next;
      return next[0];
    },
    async resetAuditLog() {
      if (usingMemoryAudit) {
        memoryAudit = [];
        return;
      }
      await writeJson(auditPath, []);
    },
  };
}

export function createOpportunityStore({
  dataSource = "mock",
  dynamicsClient,
  mockStore,
  now = () => new Date(),
} = {}) {
  const source = ["mock", "dynamics", "hybrid"].includes(dataSource) ? dataSource : "mock";
  let dynamicsOpportunities = null;
  let lastRefreshTime = "";
  let lastSyncStatus = "idle";
  let lastError = "";
  let lastSyncScope = emptySyncScope();

  async function syncDynamics() {
    if (!dynamicsClient) {
      throw new Error("Dynamics client is not available.");
    }
    lastSyncStatus = "syncing";
    lastError = "";
    try {
      const previousLocalCount = dynamicsOpportunities?.length || 0;
      const scope = typeof dynamicsClient.listDynamicsOpportunityScope === "function"
        ? await dynamicsClient.listDynamicsOpportunityScope()
        : { rows: await dynamicsClient.listDynamicsOpportunities() };
      const mapped = mapDynamicsOpportunities(scope.rows || [], now());
      const demoMapped = mapped.filter((item) => item.is_ai_demo);
      dynamicsOpportunities = demoMapped.length > 0 ? demoMapped : mapped;
      lastRefreshTime = new Date().toISOString();
      lastSyncStatus = "success";
      lastSyncScope = {
        dataverseMatchedCount: Number(scope.dataverseMatchedCount ?? dynamicsOpportunities.length),
        syncedDemoCount: dynamicsOpportunities.length,
        excludedNonDemoCount: Number(scope.excludedNonDemoCount ?? Math.max(0, mapped.length - dynamicsOpportunities.length)),
        localTotalAfterSync: dynamicsOpportunities.length,
        previousLocalCount,
        totalDataverseOpportunities: Number(scope.totalDataverseOpportunities ?? dynamicsOpportunities.length),
        scope: "[AI-DEMO] only",
      };
      return dynamicsOpportunities;
    } catch (error) {
      lastSyncStatus = "error";
      lastError = error instanceof Error ? error.message : "Dynamics sync failed";
      throw error;
    }
  }

  async function listDynamicsSafe() {
    if (source === "mock") return [];
    if (!dynamicsOpportunities) {
      try {
        await syncDynamics();
      } catch {
        return [];
      }
    }
    return dynamicsOpportunities || [];
  }

  async function listOpportunities() {
    const mock = source === "dynamics" ? [] : await mockStore.listOpportunities();
    const dynamics = await listDynamicsSafe();
    if (source === "dynamics") return dynamics;
    if (source === "hybrid") return mergeOpportunities(dynamics, mock);
    return mock;
  }

  return {
    async listOpportunities() {
      return listOpportunities();
    },
    async getOpportunity(id) {
      const opportunities = await listOpportunities();
      return opportunities.find((item) => item.id === id) || null;
    },
    async syncDynamics() {
      const dynamics = await syncDynamics();
      return {
        count: dynamics.length,
        ...lastSyncScope,
        lastRefreshTime,
        lastSyncStatus,
      };
    },
    async testDynamicsConnection() {
      if (!dynamicsClient) throw new Error("Dynamics client is not available.");
      const result = await dynamicsClient.testConnection();
      lastSyncStatus = "connection-ok";
      lastError = "";
      return result;
    },
    getDynamicsStatus() {
      const config = dynamicsClient?.config || {};
      return {
        dataSource: source,
        isConfigured: Boolean(config.isConfigured),
        canRefresh: source !== "mock" && Boolean(config.isConfigured),
        lastRefreshTime,
        lastSyncStatus,
        recordCount: dynamicsOpportunities?.length || 0,
        ...lastSyncScope,
        lastError,
        dataverseUrl: config.dataverseUrl || "",
      };
    },
    async getAuditLog() {
      return mockStore.getAuditLog();
    },
    async appendAudit(entry) {
      return mockStore.appendAudit(entry);
    },
    async resetAuditLog() {
      return mockStore.resetAuditLog();
    },
  };
}

function mergeOpportunities(primary, secondary) {
  const map = new Map();
  [...secondary, ...primary].forEach((item) => map.set(item.id, item));
  return [...map.values()];
}

function emptySyncScope() {
  return {
    dataverseMatchedCount: 0,
    syncedDemoCount: 0,
    excludedNonDemoCount: 0,
    localTotalAfterSync: 0,
    previousLocalCount: 0,
    totalDataverseOpportunities: 0,
    scope: "[AI-DEMO] only",
  };
}
