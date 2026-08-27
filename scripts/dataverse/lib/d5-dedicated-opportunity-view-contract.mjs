export const DEDICATED_OPPORTUNITY_VIEW = Object.freeze({
  name: "AI Gateway Demo 200 - Full Replica",
  entity: "opportunity",
  sourceViewId: "75fd4002-b7bc-4a4a-bb2d-87ac0b002cfe",
  appId: "916afe4b-607e-f111-ab0e-002248eb1915",
  solutionUniqueName: "CRMAIGatewayDemo",
  ownerDisplayName: "CRM AI Demo User",
  syntheticCustomerSuffix: "（演示）有限公司",
  expectedCurrentCount: 24,
  expectedCurrentStates: Object.freeze({ open: 16, won: 7, lost: 1 }),
});

export function normalizeId(value) {
  return String(value || "").replace(/[{}]/g, "").toLowerCase();
}

function escapeXmlAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function normalizeXml(value) {
  return String(value || "").replace(/>\s+</g, "><").trim();
}

function stripDedicatedDifferences(fetchXml) {
  return normalizeXml(fetchXml)
    .replace(/\s+savedqueryid="[^"]*"/i, "")
    .replace(/<filter\b[^>]*>[\s\S]*?<\/filter>/i, "<filter />");
}

export function buildDedicatedFetchXml({ sourceFetchXml, viewId, ownerId }) {
  const source = String(sourceFetchXml || "");
  const filters = [...source.matchAll(/<filter\b[^>]*>[\s\S]*?<\/filter>/gi)];
  if (!/<entity\s+name="opportunity"/i.test(source)) throw new Error("Source View is not an Opportunity view.");
  if (/<link-entity\b/i.test(source)) throw new Error("Source View contains an unexpected linked entity.");
  if (filters.length !== 1) throw new Error(`Source View must contain exactly one top-level filter; found ${filters.length}.`);
  if (!/attribute="name"[^>]+operator="like"[^>]+value="\[\[\]AI-DEMO\]%"/i.test(filters[0][0])) {
    throw new Error("Source View no longer has the frozen legacy [AI-DEMO] filter.");
  }

  const id = normalizeId(viewId);
  const owner = normalizeId(ownerId);
  if (!id || !owner) throw new Error("View and owner IDs are required.");
  const dedicatedFilter = [
    '<filter type="and">',
    `<condition attribute="ownerid" operator="eq" value="${escapeXmlAttribute(owner)}" uiname="${escapeXmlAttribute(DEDICATED_OPPORTUNITY_VIEW.ownerDisplayName)}" uitype="systemuser" />`,
    `<condition attribute="aigw_customernamecn" operator="like" value="%${escapeXmlAttribute(DEDICATED_OPPORTUNITY_VIEW.syntheticCustomerSuffix)}" />`,
    "</filter>",
  ].join("");

  const withId = /\bsavedqueryid="[^"]*"/i.test(source)
    ? source.replace(/\bsavedqueryid="[^"]*"/i, `savedqueryid="${id}"`)
    : source.replace(/<fetch\b/i, `<fetch savedqueryid="${id}"`);
  const output = withId.replace(filters[0][0], dedicatedFilter);
  if (stripDedicatedDifferences(source) !== stripDedicatedDifferences(output)) {
    throw new Error("Dedicated View construction changed more than the SavedQuery ID and filter.");
  }
  return output;
}

export function buildDedicatedViewPayload({ sourceView, viewId, ownerId }) {
  if (!sourceView?.layoutxml || !sourceView?.fetchxml) throw new Error("Source View definition is incomplete.");
  return {
    savedqueryid: normalizeId(viewId),
    name: DEDICATED_OPPORTUNITY_VIEW.name,
    description: "Dedicated synthetic CRM AI Gateway Demo 200 opportunities. Future imports must retain the approved owner and synthetic customer naming contract.",
    returnedtypecode: DEDICATED_OPPORTUNITY_VIEW.entity,
    querytype: 0,
    isquickfindquery: false,
    fetchxml: buildDedicatedFetchXml({ sourceFetchXml: sourceView.fetchxml, viewId, ownerId }),
    layoutxml: sourceView.layoutxml,
    ...(sourceView.layoutjson ? { layoutjson: sourceView.layoutjson } : {}),
  };
}

export function compareDedicatedView(view, expected) {
  const differences = [];
  if (view?.name !== expected.name) differences.push("name");
  if (String(view?.returnedtypecode) !== String(expected.returnedtypecode)) differences.push("returnedtypecode");
  if (Number(view?.querytype) !== Number(expected.querytype)) differences.push("querytype");
  if (Boolean(view?.isquickfindquery) !== Boolean(expected.isquickfindquery)) differences.push("isquickfindquery");
  if (normalizeXml(view?.fetchxml) !== normalizeXml(expected.fetchxml)) differences.push("fetchxml");
  if (normalizeXml(view?.layoutxml) !== normalizeXml(expected.layoutxml)) differences.push("layoutxml");
  if (String(view?.layoutjson || "") !== String(expected.layoutjson || "")) differences.push("layoutjson");
  if (view?.statecode !== undefined && Number(view.statecode) !== 0) differences.push("statecode");
  if (view?.statuscode !== undefined && Number(view.statuscode) !== 1) differences.push("statuscode");
  return differences;
}

export function summarizeOpportunityStates(rows) {
  const result = { open: 0, won: 0, lost: 0, other: 0 };
  for (const row of rows || []) {
    if (Number(row.statecode) === 0) result.open += 1;
    else if (Number(row.statecode) === 1) result.won += 1;
    else if (Number(row.statecode) === 2) result.lost += 1;
    else result.other += 1;
  }
  return result;
}

export function stableOpportunityBusinessProjection(rows) {
  return (rows || [])
    .map((row) => ({
      opportunityid: normalizeId(row.opportunityid),
      name: row.name ?? null,
      statecode: row.statecode ?? null,
      statuscode: row.statuscode ?? null,
      actualclosedate: row.actualclosedate ?? null,
      ownerid: normalizeId(row._ownerid_value),
      customerNameCn: row.aigw_customernamecn ?? null,
    }))
    .sort((a, b) => a.opportunityid.localeCompare(b.opportunityid));
}

export function addRequestStats(previous = {}, current = {}) {
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  return Object.fromEntries([...keys].map((key) => [key, Number(previous[key] || 0) + Number(current[key] || 0)]));
}

export function appDescriptorHasView(descriptor, viewId) {
  const parsed = typeof descriptor === "string" ? JSON.parse(descriptor) : descriptor;
  return (parsed?.appInfo?.Components || []).filter((component) => Number(component.Type) === 26 && normalizeId(component.Id) === normalizeId(viewId)).length;
}

export function normalizeAppDescriptor(descriptor, ignoredViewId = "") {
  const parsed = JSON.parse(typeof descriptor === "string" ? descriptor : JSON.stringify(descriptor));
  if (parsed?.appInfo) {
    delete parsed.appInfo.PublishedOn;
    delete parsed.appInfo.VersionNumber;
    parsed.appInfo.Components = (parsed.appInfo.Components || [])
      .filter((component) => normalizeId(component.Id) !== normalizeId(ignoredViewId))
      .sort((a, b) => `${a.Type}:${normalizeId(a.Id)}`.localeCompare(`${b.Type}:${normalizeId(b.Id)}`));
  }
  return parsed;
}

export function dedicatedViewRequestStatsAreSafe(stats) {
  return Number(stats?.POST || 0) <= 3
    && Number(stats?.PATCH || 0) === 0
    && Number(stats?.DELETE || 0) === 0
    && Number(stats?.Publish || 0) <= 1
    && Number(stats?.OpportunityWrites || 0) === 0
    && Number(stats?.BusinessWrites || 0) === 0
    && Number(stats?.ProductionRequests || 0) === 0
    && Number(stats?.ExternalLLMCalls || 0) === 0;
}
