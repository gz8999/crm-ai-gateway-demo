import test from "node:test";
import assert from "node:assert/strict";
import { compareLookup, compareRelationship, createAtomicRelationshipWithReadback } from "../scripts/dataverse/lib/phase1c2-reconciliation.mjs";

const lookup = {
  MetadataId: "lookup-id",
  LogicalName: "aigw_opportunityid",
  SchemaName: "aigw_OpportunityId",
  AttributeType: "Lookup",
  RequiredLevel: { Value: "ApplicationRequired" },
  IsManaged: false,
  Targets: ["opportunity"],
  DisplayName: { LocalizedLabels: [{ LanguageCode: 1033, Label: "Related Opportunity" }, { LanguageCode: 2052, Label: "相关商机" }] },
};
const relationship = {
  MetadataId: "relationship-id",
  SchemaName: "aigw_opportunity_actualmanagement",
  ReferencedEntity: "opportunity",
  ReferencingEntity: "aigw_actualmanagement",
  ReferencingAttribute: "aigw_opportunityid",
  IsManaged: false,
  CascadeConfiguration: { Assign: "NoCascade", Share: "NoCascade", Unshare: "NoCascade", Reparent: "NoCascade", Merge: "NoCascade", Delete: "Restrict", RollupView: "NoCascade" },
};

test("Phase 1C-2 validates the target lookup and relationship definitions", () => {
  assert.deepEqual(compareLookup(lookup), []);
  assert.deepEqual(compareRelationship(relationship), []);
});

test("Phase 1C-2 accepts both objects after a POST timeout without retry", async () => {
  let posts = 0;
  let reads = 0;
  const result = await createAtomicRelationshipWithReadback({
    postRelationship: async () => { posts += 1; throw new Error("timeout"); },
    readLookup: async () => (++reads >= 3 ? lookup : null),
    readRelationship: async () => (reads >= 3 ? relationship : null),
    pollAttempts: 3,
    pollIntervalMs: 0,
  });
  assert.equal(result.status, "created_after_post_error");
  assert.equal(posts, 1);
  assert.equal(result.postRetried, false);
});

test("Phase 1C-2 blocks a partial atomic result", async () => {
  await assert.rejects(
    createAtomicRelationshipWithReadback({
      postRelationship: async () => { throw new Error("timeout"); },
      readLookup: async () => lookup,
      readRelationship: async () => null,
      pollAttempts: 2,
      pollIntervalMs: 0,
    }),
    (error) => error.code === "partial_atomic_failure" && error.postRetried === false,
  );
});

test("Phase 1C-2 stops without retry when both metadata objects remain absent", async () => {
  let posts = 0;
  await assert.rejects(
    createAtomicRelationshipWithReadback({
      postRelationship: async () => { posts += 1; throw new Error("timeout"); },
      readLookup: async () => null,
      readRelationship: async () => null,
      pollAttempts: 2,
      pollIntervalMs: 0,
    }),
    (error) => error.code === "stopped_without_retry" && error.postRetried === false,
  );
  assert.equal(posts, 1);
});
