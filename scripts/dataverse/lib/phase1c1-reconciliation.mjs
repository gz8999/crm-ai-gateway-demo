const typeName = (odataType = "") => String(odataType).split(".").at(-1)?.replace("AttributeMetadata", "") || "";
const normalizedLabels = (displayName) => Object.fromEntries((displayName?.LocalizedLabels || []).map((item) => [String(item.LanguageCode), item.Label]));
const requiredValue = (metadata) => metadata?.RequiredLevel?.Value || metadata?.requiredLevel || "";

export function compareEntityMetadata(entity, expected = {}) {
  if (!entity) return ["entity_missing"];
  const mismatches = [];
  if (expected.metadataId && String(entity.MetadataId).toLowerCase() !== String(expected.metadataId).toLowerCase()) mismatches.push("metadata_id");
  if (entity.LogicalName !== expected.logicalName) mismatches.push("logical_name");
  if (entity.SchemaName !== expected.schemaName) mismatches.push("schema_name");
  if (entity.OwnershipType !== expected.ownershipType) mismatches.push("ownership_type");
  if (entity.IsManaged !== false) mismatches.push("managed_state");
  if (entity.PrimaryNameAttribute !== expected.primaryNameAttribute) mismatches.push("primary_name_attribute");
  return mismatches;
}

export function comparePrimaryAttribute(metadata, expected = {}) {
  if (!metadata) return ["primary_attribute_missing"];
  const labels = normalizedLabels(metadata.DisplayName);
  const mismatches = [];
  if (metadata.LogicalName !== expected.logicalName) mismatches.push("logical_name");
  if (metadata.SchemaName !== expected.schemaName) mismatches.push("schema_name");
  if (metadata.AttributeType !== "String") mismatches.push("attribute_type");
  if (requiredValue(metadata) !== expected.requiredLevel) mismatches.push("required_level");
  if (metadata.MaxLength !== expected.maxLength) mismatches.push("max_length");
  if (labels["1033"] !== expected.labels?.["1033"]) mismatches.push("label_1033");
  if (labels["2052"] !== expected.labels?.["2052"]) mismatches.push("label_2052");
  return mismatches;
}

export function compareAttributeMetadata(metadata, request) {
  if (!metadata) return ["attribute_missing"];
  const expected = request.payload || {};
  const labels = normalizedLabels(metadata.DisplayName);
  const expectedLabels = normalizedLabels(expected.DisplayName);
  const expectedType = typeName(expected["@odata.type"]);
  const mismatches = [];
  if (metadata.LogicalName !== request.logicalName) mismatches.push("logical_name");
  if (metadata.SchemaName !== expected.SchemaName) mismatches.push("schema_name");
  if (metadata.AttributeType !== expectedType) mismatches.push("attribute_type");
  if (requiredValue(metadata) !== requiredValue(expected)) mismatches.push("required_level");
  if (labels["1033"] !== expectedLabels["1033"]) mismatches.push("label_1033");
  if (labels["2052"] !== expectedLabels["2052"]) mismatches.push("label_2052");
  if (expectedType === "Money") {
    if (metadata.Precision !== expected.Precision) mismatches.push("precision");
    if (metadata.PrecisionSource !== expected.PrecisionSource) mismatches.push("precision_source");
    if (metadata.MinValue !== expected.MinValue) mismatches.push("min_value");
    if (metadata.MaxValue !== expected.MaxValue) mismatches.push("max_value");
    if (metadata.IsBaseCurrency !== false) mismatches.push("is_base_currency");
  }
  if (expectedType === "DateTime" && metadata.Format !== expected.Format) mismatches.push("format");
  return mismatches;
}

export function reconcileAttributes(plannedRequests, metadataByLogicalName) {
  const alreadyExistsAndValid = [];
  const missing = [];
  const existsButMismatch = [];
  for (const request of plannedRequests) {
    const metadata = metadataByLogicalName.get(request.logicalName);
    if (!metadata) {
      missing.push(request);
      continue;
    }
    const mismatches = compareAttributeMetadata(metadata, request);
    if (mismatches.length) existsButMismatch.push({ request, metadata, mismatches });
    else alreadyExistsAndValid.push({ request, metadata });
  }
  return { alreadyExistsAndValid, missing, existsButMismatch, blocked: existsButMismatch.length > 0 };
}

export async function createAttributeWithReadback({ request, postAttribute, readAttribute, sleep = () => Promise.resolve(), pollAttempts = 8, pollIntervalMs = 1500 }) {
  let postResponse = null;
  let postError = null;
  try {
    postResponse = await postAttribute(request);
  } catch (error) {
    postError = error;
  }
  for (let attempt = 1; attempt <= pollAttempts; attempt += 1) {
    const metadata = await readAttribute(request.logicalName);
    if (metadata) {
      const mismatches = compareAttributeMetadata(metadata, request);
      if (mismatches.length) {
        const error = new Error(`Created attribute definition mismatch: ${request.logicalName}: ${mismatches.join(",")}`);
        error.code = "definition_mismatch";
        throw error;
      }
      return { status: postError ? "created_after_post_error" : "created", metadata, postResponse, postError: postError?.message || null, pollAttemptsUsed: attempt, postRetried: false };
    }
    if (attempt < pollAttempts) await sleep(pollIntervalMs);
  }
  const error = new Error(postError ? `POST failed and metadata remained absent: ${request.logicalName}: ${postError.message}` : `POST returned but metadata remained absent: ${request.logicalName}`);
  error.code = postError ? "post_failed_metadata_absent" : "metadata_not_visible";
  error.postError = postError?.message || null;
  error.postRetried = false;
  throw error;
}
