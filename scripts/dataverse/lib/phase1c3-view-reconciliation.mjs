const EXPECTED_COLUMNS = [
  "aigw_name",
  "aigw_opportunityid",
  "aigw_expectedorderdate",
  "aigw_annualactualrevenue",
  "aigw_annualactualrevenue_base",
  "modifiedon",
];
const EXPECTED_WIDTHS = [240, 240, 130, 150, 170, 140];

const attr = (source, name) => source.match(new RegExp(`${name}=["']([^"']+)["']`, "i"))?.[1] || "";

export function parseFetchXml(xml) {
  const entityTag = xml.match(/<entity\b[^>]*>/i)?.[0] || "";
  const attributes = [...xml.matchAll(/<attribute\b[^>]*\bname=["']([^"']+)["'][^>]*\/?\s*>/gi)].map((match) => match[1]);
  const orderTag = xml.match(/<order\b[^>]*>/i)?.[0] || "";
  return {
    entity: attr(entityTag, "name"),
    attributes,
    hasFilter: /<filter\b/i.test(xml),
    hasLinkEntity: /<link-entity\b/i.test(xml),
    order: { attribute: attr(orderTag, "attribute"), descending: attr(orderTag, "descending") },
  };
}

export function parseLayoutXml(xml) {
  const gridTag = xml.match(/<grid\b[^>]*>/i)?.[0] || "";
  const rowTag = xml.match(/<row\b[^>]*>/i)?.[0] || "";
  const cells = [...xml.matchAll(/<cell\b([^>]*)\/?\s*>/gi)].map((match) => ({ name: attr(match[1], "name"), width: Number(attr(match[1], "width")) }));
  return {
    objectTypeCode: Number(attr(gridTag, "object")),
    jump: attr(gridTag, "jump"),
    select: attr(gridTag, "select"),
    icon: attr(gridTag, "icon"),
    preview: attr(gridTag, "preview"),
    rowId: attr(rowTag, "id"),
    cells,
  };
}

export function compareViewDefinition(view, objectTypeCode) {
  if (!view) return ["view_missing"];
  const fetch = parseFetchXml(view.fetchxml || "");
  const layout = parseLayoutXml(view.layoutxml || "");
  const mismatches = [];
  if (view.name !== "实绩管理 - AI Demo") mismatches.push("name");
  if (view.returnedtypecode !== "aigw_actualmanagement") mismatches.push("returned_type");
  if (view.querytype !== 0) mismatches.push("query_type");
  if (view.isquickfindquery !== false) mismatches.push("quick_find");
  if (fetch.entity !== "aigw_actualmanagement") mismatches.push("fetch_entity");
  if (JSON.stringify(fetch.attributes) !== JSON.stringify(EXPECTED_COLUMNS)) mismatches.push("fetch_columns");
  if (fetch.hasFilter) mismatches.push("fetch_filter");
  if (fetch.hasLinkEntity) mismatches.push("fetch_link_entity");
  if (fetch.order.attribute !== "modifiedon" || fetch.order.descending !== "true") mismatches.push("fetch_order");
  if (layout.objectTypeCode !== Number(objectTypeCode)) mismatches.push("layout_object_type_code");
  if (layout.jump !== "aigw_name") mismatches.push("layout_jump");
  if (layout.rowId !== "aigw_actualmanagementid") mismatches.push("layout_row_id");
  if (JSON.stringify(layout.cells.map((cell) => cell.name)) !== JSON.stringify(EXPECTED_COLUMNS)) mismatches.push("layout_columns");
  if (JSON.stringify(layout.cells.map((cell) => cell.width)) !== JSON.stringify(EXPECTED_WIDTHS)) mismatches.push("layout_widths");
  return mismatches;
}

export async function createViewWithReadback({ postView, readViews, objectTypeCode, sleep = () => Promise.resolve(), pollAttempts = 8, pollIntervalMs = 1500 }) {
  let postResponse = null;
  let postError = null;
  try {
    postResponse = await postView();
  } catch (error) {
    postError = error;
  }
  for (let attempt = 1; attempt <= pollAttempts; attempt += 1) {
    const matches = await readViews();
    if (matches.length > 1) {
      const error = new Error("Multiple SavedQuery records have the target name");
      error.code = "duplicate_view_name";
      throw error;
    }
    if (matches.length === 1) {
      const mismatches = compareViewDefinition(matches[0], objectTypeCode);
      if (mismatches.length) {
        const error = new Error(`SavedQuery definition mismatch: ${mismatches.join(",")}`);
        error.code = "definition_mismatch";
        error.mismatches = mismatches;
        throw error;
      }
      return { status: postError ? "created_after_post_error" : "created", view: matches[0], postResponse, postError: postError?.message || null, pollAttemptsUsed: attempt, postRetried: false };
    }
    if (attempt < pollAttempts) await sleep(pollIntervalMs);
  }
  const error = new Error(postError ? `SavedQuery POST failed and target view remains absent: ${postError.message}` : "SavedQuery POST returned but target view remains absent");
  error.code = "stopped_without_retry";
  error.postRetried = false;
  throw error;
}

export const phase1c3ExpectedColumns = EXPECTED_COLUMNS;
export const phase1c3ExpectedWidths = EXPECTED_WIDTHS;
