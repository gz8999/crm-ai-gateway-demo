import assert from "node:assert/strict";
import test from "node:test";
import { mappingFromReconciliation, reconcileStatusSemantics } from "../scripts/dataverse/apply-phase1b-m1-status-reasons.mjs";

const definitions = [
  { semanticKey: "rfq_received", sourceValue: 100000001, labels: { "1033": "RFQ Received", "2052": "已收到询盘及报价请求（RFQ）" } },
  { semanticKey: "proposal_quoted", sourceValue: 100000002, labels: { "1033": "Proposal / Quoted", "2052": "提案 / 已报价" } },
];
const standard = [
  { value: 1, stateCode: 0, labels: { "1033": "In Progress", "2052": "正在进行" }, transitionData: null },
  { value: 2, stateCode: 0, labels: { "1033": "On Hold", "2052": "暂候" }, transitionData: null },
];
const status = (value, definition) => ({ value, stateCode: 0, labels: definition.labels, transitionData: null });

test("M1 reconciliation treats both missing semantic statuses as insert candidates", () => {
  const result = reconcileStatusSemantics(standard, null, definitions);
  assert.deepEqual(result.map((item) => item.state), ["missing", "missing"]);
  assert.deepEqual(result.map((item) => item.targetValue), [null, null]);
});

test("M1 reconciliation only inserts the semantic status that is still missing", () => {
  const result = reconcileStatusSemantics([...standard, status(388560000, definitions[0])], null, definitions);
  assert.deepEqual(result.map((item) => item.state), ["alreadyExistsAndValid", "missing"]);
  assert.equal(result[0].targetValue, 388560000);
});

test("M1 reconciliation rebuilds mapping from valid metadata without another insert", () => {
  const result = reconcileStatusSemantics([...standard, status(388560000, definitions[0]), status(388560001, definitions[1])], null, definitions);
  const mapping = mappingFromReconciliation(result);
  assert.equal(mapping.opportunity.statuscode.rfq_received.targetValue, 388560000);
  assert.equal(mapping.opportunity.statuscode.proposal_quoted.targetValue, 388560001);
});

test("M1 reconciliation rejects duplicate or inconsistent semantic metadata", () => {
  assert.throws(() => reconcileStatusSemantics([...standard, status(388560000, definitions[0]), status(388560001, definitions[0])], null, definitions), /multiple status values/);
  assert.throws(() => reconcileStatusSemantics([...standard, { ...status(388560000, definitions[0]), stateCode: 1 }], null, definitions), /statecode=0/);
});
