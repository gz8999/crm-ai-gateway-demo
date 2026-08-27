import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createDynamicsClient } from "../../server/dynamicsClient.mjs";
import { assertDataverseScriptGate, getDataverseUrl, getRequiredEnvironmentId, runDataverseCli } from "./lib/environment-safety.mjs";

let EXPECTED_URL;
const SOLUTION = "CRMAIGatewayDemo";
const FRIENDLY_SOLUTION = "CRM AI Gateway Demo";
const PREFIX = "aigw";
let ORIGINAL_VIEW_ID;
const VIEW_NAME = "所有案件 - AI Demo Full Replica";
const DOCS = "docs/d365";

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const preflightArg = args.indexOf("--preflight");
const suppliedPreflight = preflightArg >= 0 ? args[preflightArg + 1] : "";

function xmlValid(xml) {
  const stack = [];
  for (const token of String(xml).replace(/<!--[\s\S]*?-->/g, "").match(/<[^>]+>/g) || []) {
    if (/^<\//.test(token)) { const name = token.slice(2, -1).trim(); if (stack.pop() !== name) return { ok: false, error: `Mismatched closing tag: ${name}` }; }
    else if (!/^<!/.test(token) && !/\/>$/.test(token)) stack.push((/^<\s*([^\s/>]+)/.exec(token) || [])[1]);
  }
  return stack.length ? { ok: false, error: `Unclosed tag: ${stack.at(-1)}` } : { ok: true };
}
function hash(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function stamp() { return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }
function parseCsv(text) {
  const rows = text.trimEnd().split("\n"); const headers = rows.shift().split(",");
  return rows.map((row) => {
    const values = []; let value = ""; let quoted = false;
    for (let i = 0; i < row.length; i += 1) { const ch = row[i]; if (ch === '"' && quoted && row[i + 1] === '"') { value += '"'; i += 1; } else if (ch === '"') quoted = !quoted; else if (ch === "," && !quoted) { values.push(value); value = ""; } else value += ch; }
    values.push(value); return Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ""]));
  });
}
function cloneLayoutXml(original, columns) {
  const grid = original.match(/<grid\b[^>]*>/i)?.[0]; const row = original.match(/<row\b[^>]*>/i)?.[0]; const cell = original.match(/<cell\b[^>]*\/>/i)?.[0];
  if (!grid || !row || !cell) throw new Error("Current View layoutxml does not expose a usable grid/row/cell template");
  return `${grid}${row}${columns.map((column) => cell.replace(/name=\"[^\"]*\"/i, `name=\"${column.targetLogicalName}\"`).replace(/width=\"[^\"]*\"/i, `width=\"${column.width}\"`)).join("")}</row></grid>`;
}
function cloneLayoutJson(original, columns) {
  const layout = JSON.parse(original); const template = layout.Rows?.[0]?.Cells?.find((cell) => !cell.RelatedEntityName) || layout.Rows?.[0]?.Cells?.[0];
  if (!template || !layout.Rows?.[0]) throw new Error("Current View layoutjson does not expose a usable cell template");
  layout.Rows[0].Cells = columns.map((column) => ({ ...template, Name: column.targetLogicalName, Width: Number(column.width), RelatedEntityName: "", LabelId: "", IsHidden: false, DisableSorting: false }));
  return JSON.stringify(layout);
}
export async function main() {
  EXPECTED_URL = getDataverseUrl();
  ORIGINAL_VIEW_ID = getRequiredEnvironmentId("D365_ORIGINAL_VIEW_ID");
  assertDataverseScriptGate({ mode: "write-capable" });
  const root = process.cwd(); const client = createDynamicsClient(); const get = async (p) => (await client.dataverseGet(p)).body;
  if (client.config.dataverseUrl !== EXPECTED_URL) throw new Error("Safety gate failed: unexpected Dataverse URL");
  if ((process.env.AI_PROVIDER || "demo") !== "demo") throw new Error("Safety gate failed: AI_PROVIDER must be demo");
  if ((process.env.ALLOW_EXTERNAL_AI || "false").toLowerCase() !== "false") throw new Error("Safety gate failed: ALLOW_EXTERNAL_AI must be false");
  const [solutionResponse, original, attributes] = await Promise.all([
    get(`/api/data/v9.2/solutions?$select=solutionid,friendlyname,uniquename,ismanaged,_publisherid_value&$filter=uniquename eq '${SOLUTION}'`),
    get(`/api/data/v9.2/savedqueries(${ORIGINAL_VIEW_ID})?$select=savedqueryid,name,returnedtypecode,statecode,statuscode,fetchxml,layoutxml,layoutjson`),
    get("/api/data/v9.2/EntityDefinitions(LogicalName='opportunity')/Attributes?$select=LogicalName,AttributeType")
  ]);
  const solution = solutionResponse.value?.[0]; if (!solution || solution.ismanaged || solution.friendlyname !== FRIENDLY_SOLUTION) throw new Error("Safety gate failed: unmanaged solution not confirmed");
  const publishers = await get(`/api/data/v9.2/publishers?$select=customizationprefix&$filter=publisherid eq ${solution._publisherid_value}`);
  if (publishers.value?.[0]?.customizationprefix !== PREFIX) throw new Error("Safety gate failed: publisher prefix is not aigw");
  const columns = parseCsv(await fs.readFile(path.join(root, DOCS, "phase1b-view-column-mapping.csv"), "utf8"));
  const fetchxml = await fs.readFile(path.join(root, DOCS, "phase1b-full-replica-fetchxml-draft.xml"), "utf8");
  const draftLayout = await fs.readFile(path.join(root, DOCS, "phase1b-full-replica-layoutxml-draft.xml"), "utf8");
  const manifest = JSON.parse(await fs.readFile(path.join(root, DOCS, "phase1b-write-manifest.json"), "utf8"));
  if (manifest.dryRun !== true || columns.length !== 36) throw new Error("Dry-run inputs are incomplete");
  const layoutxml = cloneLayoutXml(original.layoutxml, columns); const layoutjson = cloneLayoutJson(original.layoutjson, columns);
  const attrNames = new Set((attributes.value || []).map((attribute) => attribute.LogicalName));
  const fetchNames = [...fetchxml.matchAll(/<attribute name=\"([^\"]+)\"/g)].map((match) => match[1]); const layoutNames = [...layoutxml.matchAll(/<cell name=\"([^\"]+)\"/g)].map((match) => match[1]); const jsonNames = JSON.parse(layoutjson).Rows[0].Cells.map((cell) => cell.Name);
  const expected = columns.map((column) => column.targetLogicalName); const same = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
  const validation = { fetchXml: xmlValid(fetchxml), layoutXml: xmlValid(layoutxml), draftLayoutXml: xmlValid(draftLayout), columns: expected.length, fetch: fetchNames.length, layout: layoutNames.length, layoutJson: jsonNames.length, exactOrder: same(expected, fetchNames) && same(expected, layoutNames) && same(expected, jsonNames), missingMetadata: expected.filter((name) => !attrNames.has(name)), hasAiDemoFilter: fetchxml.includes('value="[[]AI-DEMO]%"'), hasModifiedOnDescending: fetchxml.includes('<order attribute="modifiedon" descending="true"'), noLinkEntity: !fetchxml.includes("<link-entity") };
  if (!validation.fetchXml.ok || !validation.layoutXml.ok || !validation.draftLayoutXml.ok || validation.columns !== 36 || validation.fetch !== 36 || validation.layout !== 36 || validation.layoutJson !== 36 || !validation.exactOrder || validation.missingMetadata.length || !validation.hasAiDemoFilter || !validation.hasModifiedOnDescending || !validation.noLinkEntity) throw new Error(`Preflight validation failed: ${JSON.stringify(validation)}`);
  const dir = suppliedPreflight ? path.dirname(path.resolve(suppliedPreflight)) : path.join(root, "backups", "dataverse", `phase1b_view_${stamp()}`); await fs.mkdir(dir, { recursive: true });
  const preflightPath = suppliedPreflight ? path.resolve(suppliedPreflight) : path.join(dir, "01_create_preflight.json");
  let preflight;
  if (confirm) {
    preflight = JSON.parse(await fs.readFile(preflightPath, "utf8"));
    if (preflight.originalViewHash !== hash(JSON.stringify({ fetchxml: original.fetchxml, layoutxml: original.layoutxml, layoutjson: original.layoutjson }))) throw new Error("Original View changed since preflight; no write performed");
  } else {
    const savedqueryid = randomUUID();
    const payload = { savedqueryid, name: VIEW_NAME, returnedtypecode: "opportunity", querytype: 0, isquickfindquery: false, fetchxml, layoutxml, layoutjson };
    preflight = { dryRun: true, createdAt: new Date().toISOString(), backupDir: path.relative(root, dir), newSavedQueryId: savedqueryid, endpoint: "/api/data/v9.2/savedqueries", requestHeaders: { "MSCRM.SolutionUniqueName": SOLUTION }, payload, addSolutionFallback: { endpoint: "/api/data/v9.2/AddSolutionComponent", payload: { ComponentId: savedqueryid, ComponentType: 26, SolutionUniqueName: SOLUTION, AddRequiredComponents: false, DoNotIncludeSubcomponents: true } }, publish: { executed: false, reason: "Phase 1B-1 explicitly forbids PublishXml" }, validation, originalViewHash: hash(JSON.stringify({ fetchxml: original.fetchxml, layoutxml: original.layoutxml, layoutjson: original.layoutjson })) };
    const allViews = await get("/api/data/v9.2/savedqueries?$select=savedqueryid,name,returnedtypecode,statecode,statuscode,fetchxml,layoutxml,layoutjson&$filter=returnedtypecode eq 'opportunity'");
    await fs.writeFile(path.join(dir, "00_opportunity_savedqueries_before.json"), JSON.stringify(allViews, null, 2)); await fs.writeFile(preflightPath, JSON.stringify(preflight, null, 2)); await fs.writeFile(path.join(dir, "02_fetchxml.xml"), fetchxml); await fs.writeFile(path.join(dir, "03_layoutxml.xml"), layoutxml); await fs.writeFile(path.join(dir, "04_layoutjson.json"), layoutjson);
    console.log(JSON.stringify(preflight, null, 2)); return;
  }
  const create = await client.dataversePost("/api/data/v9.2/savedqueries", preflight.payload, { headers: { "MSCRM.SolutionUniqueName": SOLUTION } });
  const savedqueryid = preflight.newSavedQueryId; const created = await get(`/api/data/v9.2/savedqueries(${savedqueryid})?$select=savedqueryid,name,returnedtypecode,statecode,statuscode,fetchxml,layoutxml,layoutjson`);
  if (created.savedqueryid !== savedqueryid || created.statecode !== 0 || created.statuscode !== 1) { await fs.writeFile(path.join(path.dirname(preflightPath), "05_create_stop.json"), JSON.stringify({ created, reason: "New View is not Active; no state PATCH, AddSolutionComponent, or PublishXml performed" }, null, 2)); throw new Error("New SavedQuery was not Active after create; no further action performed"); }
  const components = await get(`/api/data/v9.2/solutioncomponents?$select=objectid,componenttype&$filter=_solutionid_value eq ${solution.solutionid} and componenttype eq 26`); let inSolution = (components.value || []).some((component) => String(component.objectid).toLowerCase() === savedqueryid.toLowerCase()); let fallbackUsed = false;
  if (!inSolution) { await client.dataversePost("/api/data/v9.2/AddSolutionComponent", preflight.addSolutionFallback.payload); fallbackUsed = true; const after = await get(`/api/data/v9.2/solutioncomponents?$select=objectid,componenttype&$filter=_solutionid_value eq ${solution.solutionid} and componenttype eq 26`); inSolution = (after.value || []).some((component) => String(component.objectid).toLowerCase() === savedqueryid.toLowerCase()); }
  if (!inSolution) { await fs.writeFile(path.join(path.dirname(preflightPath), "06_solution_stop.json"), JSON.stringify({ savedqueryid, reason: "View was created but not associated with target solution; no PublishXml performed" }, null, 2)); throw new Error("New SavedQuery is not associated with target solution; no PublishXml performed"); }
  const [fetchResult, savedQueryResult, originalAfter] = await Promise.all([
    get(`/api/data/v9.2/opportunities?fetchXml=${encodeURIComponent(preflight.payload.fetchxml)}`),
    get(`/api/data/v9.2/opportunities?savedQuery=${savedqueryid}`),
    get(`/api/data/v9.2/savedqueries(${ORIGINAL_VIEW_ID})?$select=savedqueryid,fetchxml,layoutxml,layoutjson`)
  ]);
  const checkRows = (body) => { const rows = body.value || []; return { count: rows.length, allAiDemo: rows.every((row) => String(row.name || "").startsWith("[AI-DEMO]")), modifiedOnDescending: rows.every((row, index) => index === 0 || String(rows[index - 1].modifiedon || "") >= String(row.modifiedon || "")) }; };
  const output = { savedqueryid, active: created.statecode === 0 && created.statuscode === 1, inSolution, fallbackUsed, validation: preflight.validation, fetchXmlExecution: checkRows(fetchResult), savedQueryExecution: checkRows(savedQueryResult), originalUnchanged: preflight.originalViewHash === hash(JSON.stringify({ fetchxml: originalAfter.fetchxml, layoutxml: originalAfter.layoutxml, layoutjson: originalAfter.layoutjson })), publishExecuted: false, rollback: { newSavedQueryId: savedqueryid, deleteRequiresSeparateConfirmation: true, originalViewId: ORIGINAL_VIEW_ID } };
  await fs.writeFile(path.join(path.dirname(preflightPath), "07_execution_result.json"), JSON.stringify(output, null, 2)); console.log(JSON.stringify(output, null, 2));
}

runDataverseCli(import.meta.url, main);
