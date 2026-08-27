const labels = (displayName) => Object.fromEntries((displayName?.LocalizedLabels || []).map((item) => [String(item.LanguageCode), item.Label]));

export function compareLookup(metadata) {
  if (!metadata) return ["lookup_missing"];
  const mismatches = [];
  const displayLabels = labels(metadata.DisplayName);
  if (metadata.LogicalName !== "aigw_opportunityid") mismatches.push("logical_name");
  if (metadata.SchemaName !== "aigw_OpportunityId") mismatches.push("schema_name");
  if (metadata.AttributeType !== "Lookup") mismatches.push("attribute_type");
  if (metadata.RequiredLevel?.Value !== "ApplicationRequired") mismatches.push("required_level");
  if (metadata.IsManaged !== false) mismatches.push("managed_state");
  if (!metadata.Targets?.includes("opportunity")) mismatches.push("target");
  if (displayLabels["1033"] !== "Related Opportunity") mismatches.push("label_1033");
  if (displayLabels["2052"] !== "相关商机") mismatches.push("label_2052");
  return mismatches;
}

export function compareRelationship(metadata) {
  if (!metadata) return ["relationship_missing"];
  const mismatches = [];
  if (metadata.SchemaName !== "aigw_opportunity_actualmanagement") mismatches.push("schema_name");
  if (metadata.ReferencedEntity !== "opportunity") mismatches.push("referenced_entity");
  if (metadata.ReferencingEntity !== "aigw_actualmanagement") mismatches.push("referencing_entity");
  if (metadata.ReferencingAttribute !== "aigw_opportunityid") mismatches.push("referencing_attribute");
  if (metadata.IsManaged !== false) mismatches.push("managed_state");
  const expectedCascade = {
    Assign: "NoCascade",
    Share: "NoCascade",
    Unshare: "NoCascade",
    Reparent: "NoCascade",
    Merge: "NoCascade",
    Delete: "Restrict",
    RollupView: "NoCascade",
  };
  for (const [key, expected] of Object.entries(expectedCascade)) {
    if (metadata.CascadeConfiguration?.[key] !== expected) mismatches.push(`cascade_${key.toLowerCase()}`);
  }
  return mismatches;
}

export async function createAtomicRelationshipWithReadback({ postRelationship, readLookup, readRelationship, sleep = () => Promise.resolve(), pollAttempts = 8, pollIntervalMs = 1500 }) {
  let postError = null;
  let postResponse = null;
  try {
    postResponse = await postRelationship();
  } catch (error) {
    postError = error;
  }
  for (let attempt = 1; attempt <= pollAttempts; attempt += 1) {
    const [lookup, relationship] = await Promise.all([readLookup(), readRelationship()]);
    if (lookup && relationship) {
      const lookupMismatches = compareLookup(lookup);
      const relationshipMismatches = compareRelationship(relationship);
      if (lookupMismatches.length || relationshipMismatches.length) {
        const error = new Error(`Created metadata mismatch: ${JSON.stringify({ lookupMismatches, relationshipMismatches })}`);
        error.code = "definition_mismatch";
        throw error;
      }
      return {
        status: postError ? "created_after_post_error" : "created",
        lookup,
        relationship,
        postError: postError?.message || null,
        postResponse,
        pollAttemptsUsed: attempt,
        postRetried: false,
      };
    }
    if (lookup || relationship) {
      const error = new Error(`Partial atomic failure: lookup=${Boolean(lookup)}, relationship=${Boolean(relationship)}`);
      error.code = "partial_atomic_failure";
      error.lookup = lookup;
      error.relationship = relationship;
      error.postRetried = false;
      throw error;
    }
    if (attempt < pollAttempts) await sleep(pollIntervalMs);
  }
  const error = new Error(postError ? `Relationship POST failed and both metadata objects remain absent: ${postError.message}` : "Relationship POST returned but both metadata objects remain absent");
  error.code = "stopped_without_retry";
  error.postError = postError?.message || null;
  error.postRetried = false;
  throw error;
}
