import test from "node:test";
import assert from "node:assert/strict";
import {
  compareEntityMetadata,
  createAttributeWithReadback,
  reconcileAttributes,
} from "../scripts/dataverse/lib/phase1c1-reconciliation.mjs";

const labels = (english, chinese) => ({
  LocalizedLabels: [
    { LanguageCode: 1033, Label: english },
    { LanguageCode: 2052, Label: chinese },
  ],
});

const moneyRequest = (logicalName = "aigw_annualactualrevenue") => ({
  method: "POST",
  endpoint: "/api/data/v9.2/EntityDefinitions(LogicalName='aigw_actualmanagement')/Attributes",
  logicalName,
  payload: {
    "@odata.type": "Microsoft.Dynamics.CRM.MoneyAttributeMetadata",
    SchemaName: logicalName === "aigw_annualactualrevenue" ? "aigw_AnnualActualRevenue" : "aigw_AprilActualRevenue",
    DisplayName: labels(logicalName === "aigw_annualactualrevenue" ? "Annual Actual Revenue" : "April Actual Revenue", logicalName === "aigw_annualactualrevenue" ? "年度实绩收入" : "4月实绩收入"),
    RequiredLevel: { Value: "None" },
    Precision: 2,
    PrecisionSource: 2,
    MinValue: logicalName === "aigw_annualactualrevenue" ? 0 : -100000000000000,
    MaxValue: logicalName === "aigw_annualactualrevenue" ? 100000000000 : 100000000000000,
  },
});

const metadataFor = (request, overrides = {}) => ({
  MetadataId: `metadata-${request.logicalName}`,
  LogicalName: request.logicalName,
  SchemaName: request.payload.SchemaName,
  AttributeType: "Money",
  RequiredLevel: { Value: "None" },
  DisplayName: request.payload.DisplayName,
  Precision: request.payload.Precision,
  PrecisionSource: request.payload.PrecisionSource,
  MinValue: request.payload.MinValue,
  MaxValue: request.payload.MaxValue,
  IsBaseCurrency: false,
  ...overrides,
});

test("Phase 1C-1R detects an absent table", () => {
  assert.deepEqual(compareEntityMetadata(null, { logicalName: "aigw_actualmanagement" }), ["entity_missing"]);
});

test("Phase 1C-1R classifies a table with only its primary name as all planned fields missing", () => {
  const requests = [moneyRequest(), moneyRequest("aigw_aprilactualrevenue")];
  const result = reconcileAttributes(requests, new Map());
  assert.equal(result.alreadyExistsAndValid.length, 0);
  assert.equal(result.missing.length, 2);
  assert.equal(result.blocked, false);
});

test("Phase 1C-1R supports partially existing fields", () => {
  const requests = [moneyRequest(), moneyRequest("aigw_aprilactualrevenue")];
  const result = reconcileAttributes(requests, new Map([[requests[0].logicalName, metadataFor(requests[0])]]));
  assert.deepEqual(result.alreadyExistsAndValid.map((item) => item.request.logicalName), ["aigw_annualactualrevenue"]);
  assert.deepEqual(result.missing.map((item) => item.logicalName), ["aigw_aprilactualrevenue"]);
});

test("Phase 1C-1R treats fully existing valid fields as no-op", () => {
  const requests = [moneyRequest(), moneyRequest("aigw_aprilactualrevenue")];
  const map = new Map(requests.map((request) => [request.logicalName, metadataFor(request)]));
  const first = reconcileAttributes(requests, map);
  const repeated = reconcileAttributes(requests, map);
  assert.equal(first.missing.length, 0);
  assert.equal(repeated.missing.length, 0);
  assert.equal(repeated.alreadyExistsAndValid.length, 2);
});

test("Phase 1C-1R blocks an existing field definition mismatch", () => {
  const request = moneyRequest();
  const result = reconcileAttributes([request], new Map([[request.logicalName, metadataFor(request, { Precision: 4 })]]));
  assert.equal(result.blocked, true);
  assert.deepEqual(result.existsButMismatch[0].mismatches, ["precision"]);
});

test("Phase 1C-1R accepts a server-created field after a POST timeout without retrying", async () => {
  const request = moneyRequest();
  let postCalls = 0;
  let readCalls = 0;
  const result = await createAttributeWithReadback({
    request,
    postAttribute: async () => {
      postCalls += 1;
      throw new Error("request timed out");
    },
    readAttribute: async () => {
      readCalls += 1;
      return readCalls >= 2 ? metadataFor(request) : null;
    },
    pollAttempts: 3,
    pollIntervalMs: 0,
  });
  assert.equal(result.status, "created_after_post_error");
  assert.equal(result.postRetried, false);
  assert.equal(postCalls, 1);
});

test("Phase 1C-1R stops when POST times out and metadata remains absent", async () => {
  const request = moneyRequest();
  let postCalls = 0;
  await assert.rejects(
    createAttributeWithReadback({
      request,
      postAttribute: async () => {
        postCalls += 1;
        throw new Error("request timed out");
      },
      readAttribute: async () => null,
      pollAttempts: 2,
      pollIntervalMs: 0,
    }),
    (error) => error.code === "post_failed_metadata_absent" && error.postRetried === false,
  );
  assert.equal(postCalls, 1);
});

test("Phase 1C-1R propagates metadata read errors instead of treating them as absence", async () => {
  const request = moneyRequest();
  await assert.rejects(
    createAttributeWithReadback({
      request,
      postAttribute: async () => ({ status: 204 }),
      readAttribute: async () => { throw new Error("metadata permission denied"); },
      pollAttempts: 2,
      pollIntervalMs: 0,
    }),
    /metadata permission denied/,
  );
});
