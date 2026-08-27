import { ConfidentialClientApplication } from "@azure/msal-node";
import { buildDataverseSelect } from "./fieldMapping/safeTransforms.mjs";

export const opportunitySelect = [
  buildDataverseSelect(),
  "opportunityid",
  "createdon",
  "modifiedon",
  "statecode",
  "statuscode",
].filter(Boolean).join(",");
export const aiDemoNameFilterValue = "[[]AI-DEMO]%";

export function buildAiDemoOpportunityFetchXml(select = opportunitySelect) {
  const attributes = [...new Set(String(select || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean))]
    .map((name) => `<attribute name="${toFetchXmlAttributeName(name)}" />`)
    .join("");
  return `<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false"><entity name="opportunity">${attributes}<filter type="and"><condition attribute="name" operator="like" value="${aiDemoNameFilterValue}" /></filter><order attribute="modifiedon" descending="true" /></entity></fetch>`;
}

export function getDynamicsConfig(env = process.env) {
  const dataSource = env.DATA_SOURCE || "mock";
  return {
    dataSource,
    tenantId: env.TENANT_ID || "",
    clientId: env.CLIENT_ID || "",
    clientSecret: env.CLIENT_SECRET || "",
    dataverseUrl: normalizeDataverseUrl(env.DATAVERSE_URL || ""),
    isConfigured: Boolean(env.TENANT_ID && env.CLIENT_ID && env.CLIENT_SECRET && env.DATAVERSE_URL),
  };
}

export function createDynamicsClient({ env = process.env, fetchImpl = fetch, startupDiagnostics = null } = {}) {
  const config = getDynamicsConfig(env);
  let cca;

  function ensureConfigured() {
    if (!config.isConfigured) {
      throw new Error("Dynamics connection is not configured. Check TENANT_ID, CLIENT_ID, CLIENT_SECRET, and DATAVERSE_URL.");
    }
  }

  function getConfidentialClient() {
    ensureConfigured();
    if (!cca) {
      cca = new ConfidentialClientApplication({
        auth: {
          authority: `https://login.microsoftonline.com/${config.tenantId}`,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
        },
      });
    }
    return cca;
  }

  async function getAccessToken() {
    startupDiagnostics?.mark("oauthStartMs");
    const result = await awaitWithTimeout(
      getConfidentialClient().acquireTokenByClientCredential({ scopes: [`${config.dataverseUrl}/.default`] }),
      resolveOAuthTimeout(env),
      "Dataverse OAuth token acquisition timed out.",
    );
    if (!result?.accessToken) throw new Error("Unable to acquire Dataverse access token.");
    startupDiagnostics?.mark("oauthReadyMs");
    return result.accessToken;
  }

  async function dataverseGet(path) {
    return dataverseRequest("GET", path);
  }

  async function dataversePost(path, body, { headers } = {}) {
    return dataverseRequest("POST", path, body, { prefer: "return=representation", headers });
  }

  async function dataversePatch(path, body) {
    return dataverseRequest("PATCH", path, body);
  }

  async function dataverseDelete(path) {
    return dataverseRequest("DELETE", path);
  }

  async function dataverseRequest(method, path, body, { prefer, headers: extraHeaders } = {}) {
    ensureConfigured();
    const token = await getAccessToken();
    if (method === "GET") startupDiagnostics?.d365ReadStarted();
    const url = new URL(path, `${config.dataverseUrl}/`);
    const controller = new AbortController();
    const timeoutMs = Number(env.DATAVERSE_TIMEOUT_MS || 30000);
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
          "content-type": "application/json",
          "odata-version": "4.0",
          "odata-maxversion": "4.0",
          prefer: prefer || 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
          ...extraHeaders,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
    const text = await response.text();
    const responseBody = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const message = responseBody?.error?.message || responseBody?.error || `Dataverse request failed: ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.body = responseBody;
      error.rawBody = text;
      error.headers = response.headers;
      throw error;
    }
    if (method === "GET") startupDiagnostics?.d365ReadReady();
    return {
      body: responseBody,
      headers: response.headers,
      rawBody: text,
      status: response.status,
    };
  }

  async function listDynamicsOpportunities() {
    return (await listDynamicsOpportunityScope()).rows;
  }

  async function listDynamicsOpportunityScope() {
    const fetchXml = buildAiDemoOpportunityFetchXml();
    const { body: data } = await dataverseGet(`/api/data/v9.2/opportunities?fetchXml=${encodeURIComponent(fetchXml)}`);
    const rows = Array.isArray(data.value) ? data.value : [];
    const excludedNonDemoCount = await countScopedOpportunities(`<condition attribute="name" operator="not-like" value="${aiDemoNameFilterValue}" />`);
    return {
      rows,
      dataverseMatchedCount: rows.length,
      syncedDemoCount: rows.length,
      excludedNonDemoCount,
      totalDataverseOpportunities: rows.length + excludedNonDemoCount,
    };
  }

  async function countScopedOpportunities(conditionXml) {
    const fetchXml = `<fetch aggregate="true"><entity name="opportunity"><attribute name="opportunityid" alias="record_count" aggregate="count" /><filter>${conditionXml}</filter></entity></fetch>`;
    const { body } = await dataverseGet(`/api/data/v9.2/opportunities?fetchXml=${encodeURIComponent(fetchXml)}`);
    return Number(body.value?.[0]?.record_count || body.value?.[0]?.["record_count@OData.Community.Display.V1.FormattedValue"] || 0);
  }

  async function testConnection() {
    const { body: data } = await dataverseGet("/api/data/v9.2/WhoAmI()");
    return { ok: true, organizationId: data.OrganizationId, userId: data.UserId, businessUnitId: data.BusinessUnitId };
  }

  return {
    config,
    dataverseDelete,
    dataverseGet,
    dataversePatch,
    dataversePost,
    dataverseRequest,
    getAccessToken,
    listDynamicsOpportunities,
    listDynamicsOpportunityScope,
    testConnection,
  };
}

export function awaitWithTimeout(promise, timeoutMs, message = "Operation timed out.") {
  let timeoutId;
  const timeout = new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function resolveOAuthTimeout(env) {
  const value = Number(env.DATAVERSE_OAUTH_TIMEOUT_MS || 15000);
  return Number.isFinite(value) && value >= 1000 ? value : 15000;
}

function normalizeDataverseUrl(value) {
  return value.replace(/\/+$/, "");
}

function toFetchXmlAttributeName(name) {
  const lookup = /^_(.+)_value$/.exec(name);
  return lookup ? lookup[1] : name;
}
