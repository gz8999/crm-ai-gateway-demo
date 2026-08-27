import fs from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import { resolveLiteralMarkerRecords } from "../scripts/dataverse/lib/literal-marker-resolver.mjs";

const marker = "[AI-DEMO-R2D3]";
const record = (name, id = "DEMO-ID") => ({ name, opportunityid: id });

test("literal marker resolver follows exact, case-sensitive startsWith semantics", () => {
  const cases = [
    ["[AI-DEMO-R2D3] DEMO-A-CNY", true],
    ["[AI-DEMO-R2D3]", true],
    ["AI-DEMO-R2D3 DEMO-A-CNY", false],
    ["A DEMO", false],
    ["D DEMO", false],
    ["[AI-DEMO-R2D4] DEMO", false],
    [" [AI-DEMO-R2D3] DEMO", false],
    ["［AI-DEMO-R2D3］ DEMO", false],
    ["[ai-demo-r2d3] DEMO", false],
    [null, false],
    [42, false],
  ];
  for (const [name, expected] of cases) {
    const result = resolveLiteralMarkerRecords([record(name)], marker);
    assert.equal(result.literalMatchCount === 1, expected, `unexpected result for ${String(name)}`);
  }
});

test("candidateCount 14 with no literal matches passes the empty marker gate", () => {
  const candidates = Array.from({ length: 14 }, (_, index) => record(index % 2 ? "A DEMO" : "2 Café Demo", `CANDIDATE-${index}`));
  const result = resolveLiteralMarkerRecords(candidates, marker);
  assert.deepEqual({ candidateCount: result.candidateCount, literalMatchCount: result.literalMatchCount, rejectedCandidateCount: result.rejectedCandidateCount }, { candidateCount: 14, literalMatchCount: 0, rejectedCandidateCount: 14 });
  assert.equal(result.literalMatchIds.length, 0);
});

test("only literal matches enter the allowlist", () => {
  const result = resolveLiteralMarkerRecords([record("A DEMO", "rejected"), record(`${marker} DEMO-A-CNY`, "accepted"), record("D DEMO", "rejected-2")], marker);
  assert.deepEqual(result.literalMatchIds, ["accepted"]);
  assert.deepEqual(result.rejectedCandidateIds, ["rejected", "rejected-2"]);
});

test("empty and non-string markers are rejected", () => {
  assert.throws(() => resolveLiteralMarkerRecords([], ""), /non-empty/);
  assert.throws(() => resolveLiteralMarkerRecords([], null), /non-empty/);
});

test("cleanup resolver does not trim, normalize, or reinterpret rejected names", () => {
  const result = resolveLiteralMarkerRecords([record(` ${marker} DEMO`), record(`［AI-DEMO-R2D3］ DEMO`), record(`${marker} DEMO`)], marker);
  assert.equal(result.literalMatchCount, 1);
  assert.equal(result.rejectedCandidateCount, 2);
});

test("Group 1 runner uses the shared literal resolver for gate and cleanup", async () => {
  const source = await fs.readFile(new URL("../scripts/dataverse/phase1c5r2d3b-group1-validation.mjs", import.meta.url), "utf8");
  assert.match(source, /resolveLiteralMarkerRecords/);
  assert.doesNotMatch(source, /isExactMarker/);
  assert.doesNotMatch(source, /filter\(\(row\) => String\(row\.name/);
});
