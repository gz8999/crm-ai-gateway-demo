import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  D6_FULL_IMPORT,
  D6_R1_OPPORTUNITY_RECOVERY,
  D6_R2_COVERAGE_ACTUAL,
  D6_R3_TIMELINE_SIGNAL,
  D6_R4A_FULL_WIN_CANARY,
  D6_R4B_FULL_LOSE_CANARY,
  D6_R4C_FULL_STATE_ACTIONS,
  actualDesiredParentDistribution,
  annotationProjectionMode,
  assertAnnotationPayloadFields,
  assertFrozenOpportunityState,
  assertTimelineParentCheckpoint,
  buildMaximumBatches,
  buildProjectedAnnotationBody,
  buildStableBatches,
  classifyRemainingTimeline,
  containsGuid,
  fullWinCanaryRequestStatsAreSafe,
  fullLoseCanaryRequestStatsAreSafe,
  fullStateActionsRequestStatsAreSafe,
  expectedActualCountFromFrozenProjection,
  assertActualCountMatchesFrozenProjection,
  exactComplement,
  requestStatsAreSafe,
  groupSignalsBySourceActivity,
  selectCoverageCanaries,
  selectFullWinCanary,
  selectFullLoseCanary,
  selectStableCanaries,
  selectOpportunityRecoveryRows,
  selectRemainingStateActions,
  validateComplementCounts,
} from "../scripts/dataverse/lib/d6-full-import-contract.mjs";

const rows = (prefix, count, extra = {}) => Array.from({ length: count }, (_, index) => ({ _record_token: `${prefix}-${String(index + 1).padStart(3, "0")}`, ...extra }));

test("D6 frozen complement and final counts remain exact", () => {
  assert.equal(Object.values(D6_FULL_IMPORT.remainingCounts).reduce((sum, value) => sum + value, 0), 3473);
  assert.equal(Object.values(D6_FULL_IMPORT.formalCounts).reduce((sum, value) => sum + value, 0), 3900);
  for (const entity of D6_FULL_IMPORT.entities) {
    assert.equal(D6_FULL_IMPORT.formalCounts[entity] - D6_FULL_IMPORT.pilotCounts[entity], D6_FULL_IMPORT.remainingCounts[entity]);
  }
  assert.deepEqual(D6_FULL_IMPORT.finalState, { Won: 91, Active: 100, Lost: 9 });
  assert.equal(D6_FULL_IMPORT.targetBpfFinal, 200);
  assert.equal(D6_FULL_IMPORT.opportunityCloseFinal, 100);
});

test("exact token difference excludes every Pilot row and rejects duplicates", () => {
  const formal = rows("T", 5);
  const pilot = [formal[1], formal[3]];
  assert.deepEqual(exactComplement(formal, pilot, "Test").map((row) => row._record_token), ["T-001", "T-003", "T-005"]);
  assert.throws(() => exactComplement([...formal, formal[0]], pilot, "Test"), /duplicate token/);
  assert.throws(() => exactComplement(formal, [{ _record_token: "OUTSIDE" }], "Test"), /absent from Formal Projection/);
});

test("deterministic batches match every approved D6 batch", () => {
  for (const [entity, sizes] of Object.entries(D6_FULL_IMPORT.batchSizes)) {
    if (["WinOpportunity", "LoseOpportunity"].includes(entity)) continue;
    const values = rows(entity, D6_FULL_IMPORT.remainingCounts[entity]).reverse();
    const batches = buildStableBatches(values, sizes, entity[0]);
    assert.deepEqual(batches.map((batch) => batch.size), [...sizes]);
    assert.equal(batches.flatMap((batch) => batch.rows).length, values.length);
    assert.deepEqual(batches.flatMap((batch) => batch.rows).map((row) => row._record_token), [...values].sort((a, b) => a._record_token.localeCompare(b._record_token)).map((row) => row._record_token));
  }
});

test("remaining state action selection is frozen at 84 Won, 8 Lost and 84 Active", () => {
  const pilot = rows("PILOT", 24, { _desired_state: "开放" });
  const formal = [
    ...pilot,
    ...rows("WON", 84, { _desired_state: "赢单" }),
    ...rows("LOST", 8, { _desired_state: "丢单" }),
    ...rows("ACTIVE", 84, { _desired_state: "开放" }),
  ];
  const selected = selectRemainingStateActions(formal, pilot);
  assert.equal(selected.won.length, 84);
  assert.equal(selected.lost.length, 8);
  assert.equal(selected.active.length, 84);
});

test("D6-R4A chooses only the stable minimum of 84 still-Active full Win candidates", () => {
  const candidates = rows("DEMO-OPP", 84).reverse().map((row) => ({ opportunityToken: row._record_token }));
  const current = Object.fromEntries(candidates.map((candidate) => [candidate.opportunityToken, {
    statecode: 0,
    statuscode: 1,
    actualclosedate: null,
    opportunityCloseCount: 0,
  }]));
  assert.equal(D6_R4A_FULL_WIN_CANARY.authorization, "Phase 1C-5R2G-D6-R4A");
  assert.equal(selectFullWinCanary(candidates, current).opportunityToken, "DEMO-OPP-001");
  assert.throws(() => selectFullWinCanary(candidates.slice(1), current), /Candidate Count/);
  current["DEMO-OPP-001"].opportunityCloseCount = 1;
  assert.throws(() => selectFullWinCanary(candidates, current), /Live Remaining Win Candidate Count/);
});

test("D6-R4A permits one official Win and rejects every unrelated write", () => {
  const safe = {
    WinOpportunityAttempts: 1,
    LoseOpportunity: 0,
    PATCH: 0,
    DELETE: 0,
    Publish: 0,
    BPFWrites: 0,
    OtherBusinessPOST: 0,
    ProductionRequests: 0,
    ExternalLLMCalls: 0,
  };
  assert.equal(fullWinCanaryRequestStatsAreSafe(safe), true);
  for (const key of Object.keys(safe)) {
    const value = key === "WinOpportunityAttempts" ? 2 : 1;
    assert.equal(fullWinCanaryRequestStatsAreSafe({ ...safe, [key]: value }), false, key);
  }
});

test("D6-R4B uses the frozen Actual expected count instead of requiring every Lost row to have an Actual", () => {
  const actualRows = [{ _record_token: "ACT-001", aigw_opportunityid_token: "DEMO-OPP-EXPECTED" }];
  assert.equal(expectedActualCountFromFrozenProjection("DEMO-OPP-NONE", actualRows), 0);
  assert.equal(expectedActualCountFromFrozenProjection("DEMO-OPP-EXPECTED", actualRows), 1);
  assert.equal(assertActualCountMatchesFrozenProjection(0, 0, "DEMO-OPP-012"), true);
  assert.equal(assertActualCountMatchesFrozenProjection(1, 1, "DEMO-OPP-EXPECTED"), true);
  assert.throws(() => assertActualCountMatchesFrozenProjection(0, 1, "DEMO-OPP-EXPECTED"), /Actual Count mismatch/);
  assert.throws(() => assertActualCountMatchesFrozenProjection(1, 0, "DEMO-OPP-NONE"), /Actual Count mismatch/);
});

test("D6-R4B selects the stable minimum Lost candidate only when its Actual count matches the frozen expectation", () => {
  const candidates = rows("DEMO-OPP", 8).reverse().map((row) => ({ opportunityToken: row._record_token, expectedActualCount: 0 }));
  const current = Object.fromEntries(candidates.map((candidate) => [candidate.opportunityToken, {
    statecode: 0,
    statuscode: 1,
    actualclosedate: null,
    opportunityCloseCount: 0,
    actualCount: 0,
  }]));
  assert.equal(D6_R4B_FULL_LOSE_CANARY.authorization, "Phase 1C-5R2G-D6-R4B-R1");
  assert.equal(selectFullLoseCanary(candidates, current).opportunityToken, "DEMO-OPP-001");
  current["DEMO-OPP-001"].actualCount = 1;
  assert.throws(() => selectFullLoseCanary(candidates, current), /Live Remaining Lose Candidate Count/);
  current["DEMO-OPP-001"].actualCount = 0;
  current["DEMO-OPP-001"].opportunityCloseCount = 1;
  assert.throws(() => selectFullLoseCanary(candidates, current), /Live Remaining Lose Candidate Count/);
});

test("D6-R4B permits one official Lose without creating Actual or unrelated writes", () => {
  const safe = {
    LoseOpportunityAttempts: 1,
    LoseOpportunitySuccess: 1,
    WinOpportunityAttempts: 0,
    ActualPOST: 0,
    TimelinePOST: 0,
    SignalPOST: 0,
    OtherBusinessPOST: 0,
    PATCH: 0,
    DELETE: 0,
    Publish: 0,
    BPFWrites: 0,
    ProductionRequests: 0,
    ExternalLLMCalls: 0,
  };
  assert.equal(fullLoseCanaryRequestStatsAreSafe(safe), true);
  for (const key of Object.keys(safe)) {
    const value = key === "LoseOpportunityAttempts" || key === "LoseOpportunitySuccess" ? 2 : 1;
    assert.equal(fullLoseCanaryRequestStatsAreSafe({ ...safe, [key]: value }), false, key);
  }
});

test("D6-R4C freezes 83/7 remaining actions and a maximum batch size of 10", () => {
  assert.equal(D6_R4C_FULL_STATE_ACTIONS.authorization, "Phase 1C-5R2G-D6-R4C");
  assert.equal(D6_R4C_FULL_STATE_ACTIONS.maxBatchSize, 10);
  assert.deepEqual(D6_R4C_FULL_STATE_ACTIONS.finalState, { Won: 91, Active: 100, Lost: 9 });
  const wins = buildMaximumBatches(rows("DEMO-OPP", 83), 10, "R4C-W");
  const losses = buildMaximumBatches(rows("DEMO-OPP-LOST", 7), 10, "R4C-L");
  assert.deepEqual(wins.map((batch) => batch.size), [10, 10, 10, 10, 10, 10, 10, 10, 3]);
  assert.deepEqual(losses.map((batch) => batch.size), [7]);
  assert.ok([...wins, ...losses].every((batch) => batch.size <= D6_R4C_FULL_STATE_ACTIONS.maxBatchSize));
});

test("D6-R4C permits only the approved 83 Win and 7 Lose actions", () => {
  const safe = {
    WinOpportunityAttempts: 83,
    WinOpportunitySuccess: 83,
    LoseOpportunityAttempts: 7,
    LoseOpportunitySuccess: 7,
    ActualPOST: 0,
    TimelinePOST: 0,
    SignalPOST: 0,
    OtherBusinessPOST: 0,
    PATCH: 0,
    DELETE: 0,
    Publish: 0,
    BPFWrites: 0,
    ProductionRequests: 0,
    ExternalLLMCalls: 0,
  };
  assert.equal(fullStateActionsRequestStatsAreSafe(safe), true);
  assert.equal(fullStateActionsRequestStatsAreSafe({ ...safe, WinOpportunityAttempts: 84 }), false);
  assert.equal(fullStateActionsRequestStatsAreSafe({ ...safe, LoseOpportunityAttempts: 8 }), false);
  assert.equal(fullStateActionsRequestStatsAreSafe({ ...safe, ActualPOST: 1 }), false);
  assert.equal(fullStateActionsRequestStatsAreSafe({ ...safe, PATCH: 1 }), false);
  assert.equal(fullStateActionsRequestStatsAreSafe({ ...safe, BPFWrites: 1 }), false);
});

test("D6-R4C is an explicit full state-action branch with no direct close-field PATCH", () => {
  const source = fs.readFileSync(new URL("../scripts/dataverse/phase1c5r2g-d6-full-import.mjs", import.meta.url), "utf8");
  assert.match(source, /D6_R4C_FULL_STATE_ACTIONS\.flag/);
  assert.match(source, /verifyD6R4CStateActionBaseline/);
  assert.match(source, /runD6R4CActionBatches/);
  assert.match(source, /verifyD6R4CFinal/);
  assert.match(source, /D6-R4C-Full-State-Actions/);
  assert.match(source, /fullStateActionsRequestStatsAreSafe/);
});

test("all complement entities have exactly one expected count", () => {
  const complement = Object.fromEntries(D6_FULL_IMPORT.entities.map((entity) => [entity, rows(entity, D6_FULL_IMPORT.remainingCounts[entity])]));
  assert.equal(validateComplementCounts(complement), true);
  complement.Account.pop();
  assert.throws(() => validateComplementCounts(complement), /Account complement/);
});

test("request boundary rejects every forbidden D6 write category", () => {
  const safe = { PATCH: 0, DELETE: 0, Publish: 0, BPFWrites: 0, TeamRoleMembershipChanges: 0, ProductionRequests: 0, ExternalLLMCalls: 0 };
  assert.equal(requestStatsAreSafe(safe), true);
  for (const key of Object.keys(safe)) assert.equal(requestStatsAreSafe({ ...safe, [key]: 1 }), false, key);
});

test("public evidence GUID detector and private artifact ignore rule remain active", () => {
  assert.equal(containsGuid({ token: "DEMO-OPP-001" }), false);
  assert.equal(containsGuid({ id: "7325b274-6b7c-f111-ab0e-70a8a50388b9" }), true);
  const gitignore = fs.readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
  assert.match(gitignore, /local-artifacts/);
});

test("Gateway source is not an authorized D6 delivery path", () => {
  const allowed = ["scripts/dataverse/", "scripts/d365/", "tests/", "docs/d365/", "artifacts/d365/"];
  assert.equal(allowed.some((prefix) => "src/App.tsx".startsWith(prefix)), false);
  assert.equal(allowed.some((prefix) => "server/index.mjs".startsWith(prefix)), false);
});

test("D6 resolves all Formal Location and POL/POD references before Opportunity writes", () => {
  const source = fs.readFileSync(new URL("../scripts/dataverse/phase1c5r2g-d6-full-import.mjs", import.meta.url), "utf8");
  assert.match(source, /requiredLocationNames/);
  assert.match(source, /requiredPolpodKeys/);
  assert.match(source, /Location reference cardinality is not one/);
  assert.match(source, /POL\/POD reference cardinality is not one/);
  assert.doesNotMatch(source, /const locationRefs = refMap\(preflight\.references\.locations/);
  assert.doesNotMatch(source, /const polpodRefs = refMap\(preflight\.references\.polpods/);
});

test("D6-R1 resumes at DEMO-OPP-005 with exactly 172 pending Opportunities", () => {
  const opportunities = rows("DEMO-OPP", 176);
  const privateRecords = Object.fromEntries(opportunities.slice(0, 4).map((row, index) => [`Opportunity:${row._record_token}`, {
    entity: "Opportunity",
    stableToken: row._record_token,
    exactRecordId: `exact-${index + 1}`,
  }]));
  const selected = selectOpportunityRecoveryRows(opportunities, privateRecords);
  assert.equal(D6_R1_OPPORTUNITY_RECOVERY.authorization, "Phase 1C-5R2G-D6-R1");
  assert.deepEqual(selected.alreadyImported.map((row) => row._record_token), ["DEMO-OPP-001", "DEMO-OPP-002", "DEMO-OPP-003", "DEMO-OPP-004"]);
  assert.equal(selected.pending.length, 172);
  assert.equal(selected.pending[0]._record_token, "DEMO-OPP-005");
  assert.throws(() => selectOpportunityRecoveryRows(opportunities, {}), /existing complement Opportunity count/);
});

test("D6-R1 is an explicit Opportunity-only branch and leaves downstream authorization false", () => {
  const source = fs.readFileSync(new URL("../scripts/dataverse/phase1c5r2g-d6-full-import.mjs", import.meta.url), "utf8");
  assert.match(source, /D6_R1_OPPORTUNITY_RECOVERY\.flag/);
  assert.match(source, /runOpportunityRecoveryBatches/);
  assert.match(source, /D6-R1-Opportunity-Only/);
  assert.match(source, /coverageAuthorized: !flags\.resumeOpportunityOnly/);
  assert.match(source, /stateActionsAuthorized: !flags\.resumeOpportunityOnly/);
  assert.match(source, /opportunityRecoveryCompleted/);
});

test("D6-R2 freezes the 767-record baseline and 225/118 complement", () => {
  assert.equal(D6_R2_COVERAGE_ACTUAL.baselineExplicitRecords, 767);
  assert.deepEqual(D6_R2_COVERAGE_ACTUAL.baselineEntityCounts, { Account: 60, Contact: 120, Opportunity: 200, ServiceCoverage: 15, ActualManagement: 12, Timeline: 206, InteractionSignal: 154 });
  assert.equal(D6_R2_COVERAGE_ACTUAL.remainingCoverageCount, 225);
  assert.equal(D6_R2_COVERAGE_ACTUAL.remainingActualCount, 118);
  assert.equal(D6_R2_COVERAGE_ACTUAL.finalExplicitRecords, 1110);
  assert.deepEqual(D6_R2_COVERAGE_ACTUAL.expectedState, { Won: 7, Active: 192, Lost: 1 });
});

test("D6-R2 Coverage Canaries are deterministic and cover both key paths", () => {
  const values = [
    { _record_token: "COV-003", aigw_startdate: null },
    { _record_token: "COV-001", aigw_startdate: "2026-04-01" },
    { _record_token: "COV-002", aigw_startdate: null },
  ];
  const selected = selectCoverageCanaries(values);
  assert.equal(selected.compositeKey._record_token, "COV-001");
  assert.equal(selected.nullStartDate._record_token, "COV-002");
  assert.throws(() => selectCoverageCanaries(values.filter((row) => row.aigw_startdate)), /null-start-date/);
  assert.throws(() => selectCoverageCanaries(values.filter((row) => !row.aigw_startdate)), /composite-key/);
});

test("D6-R2 Actual desired parent distribution is 84/34/0", () => {
  const opportunities = [
    ...rows("W", 84, { _desired_state: "赢单" }),
    ...rows("A", 34, { _desired_state: "开放" }),
  ];
  const actuals = opportunities.map((row, index) => ({ _record_token: `ACT-${index + 1}`, aigw_opportunityid_token: row._record_token }));
  assert.deepEqual(actualDesiredParentDistribution(actuals, opportunities), { Won: 84, Active: 34, Lost: 0 });
});

test("D6-R2 is an explicit Coverage/Actual-only branch", () => {
  const source = fs.readFileSync(new URL("../scripts/dataverse/phase1c5r2g-d6-full-import.mjs", import.meta.url), "utf8");
  assert.match(source, /D6_R2_COVERAGE_ACTUAL\.flag/);
  assert.match(source, /runD6R2CoverageActual/);
  assert.match(source, /V-CANARY-A/);
  assert.match(source, /V-CANARY-B/);
  assert.match(source, /M-CANARY/);
  assert.match(source, /timelineAuthorized: flags\.resumeTimelineSignalOnly/);
  assert.match(source, /stateActionsAuthorized: !flags\.resumeOpportunityOnly && !flags\.resumeCoverageActualOnly && !flags\.resumeTimelineSignalOnly/);
  assert.match(source, /parentUnexpectedBusinessChangeCount/);
  assert.doesNotMatch(source, /dataversePatch/);
});

test("D6-R3B freezes the 2472-record recovery baseline and only authorizes Timeline/Signal", () => {
  const source = fs.readFileSync(new URL("../scripts/dataverse/phase1c5r2g-d6-full-import.mjs", import.meta.url), "utf8");
  assert.equal(D6_R3_TIMELINE_SIGNAL.authorization, "Phase 1C-5R2G-D6-R3B");
  assert.equal(D6_R3_TIMELINE_SIGNAL.baselineExplicitRecords, 2472);
  assert.equal(D6_R3_TIMELINE_SIGNAL.baselineEntityCounts.Timeline, 1568);
  assert.equal(D6_R3_TIMELINE_SIGNAL.remainingTimelineCount, 232);
  assert.equal(D6_R3_TIMELINE_SIGNAL.remainingSignalCount, 1196);
  assert.equal(D6_R3_TIMELINE_SIGNAL.finalExplicitRecords, 3900);
  assert.deepEqual(D6_R3_TIMELINE_SIGNAL.expectedState, { Won: 7, Active: 192, Lost: 1 });
  assert.match(source, /D6_R3_TIMELINE_SIGNAL\.flag/);
  assert.match(source, /runD6R3TimelineSignal/);
  assert.match(source, /verifyD6R3Completion/);
  assert.match(source, /stateActionsAuthorized: !flags\.resumeOpportunityOnly && !flags\.resumeCoverageActualOnly && !flags\.resumeTimelineSignalOnly/);
  assert.doesNotMatch(source, /dataversePatch/);
});

test("D6-R3A state-aware checkpoint accepts frozen Active, Won and Lost states", () => {
  assert.equal(assertFrozenOpportunityState({ statecode: 0, statuscode: 1, actualclosedate: null }, { statecode: 0, statuscode: 1, actualclosedate: null }, "Active"), true);
  assert.equal(assertFrozenOpportunityState({ statecode: 1, statuscode: 3, actualclosedate: "2026-05-01T00:00:00Z" }, { statecode: 1, statuscode: 3, actualclosedate: "2026-05-01" }, "Won"), true);
  assert.equal(assertFrozenOpportunityState({ statecode: 2, statuscode: 4, actualclosedate: "2026-05-18T00:00:00Z" }, { statecode: 2, statuscode: 4, actualclosedate: "2026-05-18" }, "Lost"), true);
  assert.throws(() => assertFrozenOpportunityState({ statecode: 1, statuscode: 3, actualclosedate: null }, { statecode: 1, statuscode: 3, actualclosedate: "2026-05-01" }, "Won"), /actualclosedate/);
  assert.throws(() => assertFrozenOpportunityState({ statecode: 2, statuscode: 4, actualclosedate: "2026-05-19" }, { statecode: 2, statuscode: 4, actualclosedate: "2026-05-18" }, "Lost"), /actualclosedate/);
  assert.throws(() => assertFrozenOpportunityState({ statecode: 0, statuscode: 1, actualclosedate: "2026-05-01" }, { statecode: 0, statuscode: 1, actualclosedate: null }, "Active"), /must be empty/);
});

test("D6-R3B Annotation projection uses the frozen reference date", () => {
  assert.equal(annotationProjectionMode("2026-07-17", "2026-07-18"), "HistoricalOverride");
  assert.equal(annotationProjectionMode("2026-07-18", "2026-07-18"), "SameDayBodyDate");
  assert.equal(annotationProjectionMode("2026-07-19", "2026-07-18"), "FutureBodyPlannedDate");
  assert.equal(annotationProjectionMode("2026-07-18", "2026-07-18", "2026-07-19"), "SameDayBodyDate");
});

test("D6-R3B body-date payloads contain one marker and no system dates", () => {
  const original = "冻结原始正文";
  const sameDay = buildProjectedAnnotationBody(original, "2026-07-18", "SameDayBodyDate");
  const future = buildProjectedAnnotationBody(original, "2026-07-19", "FutureBodyPlannedDate");
  assert.equal((sameDay.match(/【业务节点日期】/g) || []).length, 1);
  assert.equal((future.match(/【计划节点日期】/g) || []).length, 1);
  assert.match(sameDay, /【记录内容】\n冻结原始正文/);
  assert.match(future, /【记录内容】\n冻结原始正文/);
  assert.equal(buildProjectedAnnotationBody(sameDay, "2026-07-18", "SameDayBodyDate"), sameDay);
  assert.equal(assertAnnotationPayloadFields({ subject: "S", notetext: sameDay, "objectid_opportunity@odata.bind": "/opportunities(x)" }, "SameDayBodyDate"), true);
  assert.equal(assertAnnotationPayloadFields({ subject: "S", notetext: future, "objectid_opportunity@odata.bind": "/opportunities(x)" }, "FutureBodyPlannedDate"), true);
  for (const field of ["createdon", "modifiedon", "overriddencreatedon", "scheduledstart", "scheduledend", "actualstart", "actualend"]) {
    assert.throws(() => assertAnnotationPayloadFields({ subject: "S", notetext: sameDay, "objectid_opportunity@odata.bind": "/opportunities(x)", [field]: "2026-07-18" }, "SameDayBodyDate"), /system date field/);
  }
  assert.equal(assertAnnotationPayloadFields({ subject: "S", notetext: original, overriddencreatedon: "2026-07-17T09:00:00Z", "objectid_opportunity@odata.bind": "/opportunities(x)" }, "HistoricalOverride"), true);
  assert.throws(() => assertAnnotationPayloadFields({ subject: "S", notetext: original, overriddencreatedon: "2026-07-17T09:00:00Z", createdon: "2026-07-17", "objectid_opportunity@odata.bind": "/opportunities(x)" }, "HistoricalOverride"), /unapproved field/);
});

test("D6-R3B freezes TL-0653 as the sole same-day remaining Annotation", () => {
  assert.equal(D6_R3_TIMELINE_SIGNAL.phase, "Phase 1C-5R2G-D6-R3B");
  assert.equal(D6_R3_TIMELINE_SIGNAL.annotationProjectionReferenceDate, "2026-07-18");
  assert.equal(D6_R3_TIMELINE_SIGNAL.sameDayCanaryToken, "TL-0653");
  assert.deepEqual(D6_R3_TIMELINE_SIGNAL.remainingTimelineCategories, {
    phonecall: 0,
    appointment: 0,
    task: 0,
    historicalAnnotation: 224,
    sameDayAnnotation: 1,
    futureAnnotation: 7,
  });
  assert.equal(D6_R3_TIMELINE_SIGNAL.baselineExplicitRecords, 2472);
  assert.equal(D6_R3_TIMELINE_SIGNAL.remainingTimelineCount, 232);
});

test("D6-R3A batch checkpoint compares only affected parent frozen fields", () => {
  const before = { statecode: 1, statuscode: 3, actualclosedate: "2026-05-01", protectedBusinessHash: "hash", ownerId: "owner", department: 6, accountId: "account", contactId: "contact", bpfInstanceId: "bpf", bpfStageId: "stage", bpfTraversedPath: "stage" };
  assert.equal(assertTimelineParentCheckpoint(before, { ...before }, "Parent"), true);
  assert.throws(() => assertTimelineParentCheckpoint(before, { ...before, statecode: 0 }, "Parent"), /statecode changed/);
  assert.throws(() => assertTimelineParentCheckpoint(before, { ...before, actualclosedate: "2026-05-02" }, "Parent"), /actualclosedate changed/);
  assert.throws(() => assertTimelineParentCheckpoint(before, { ...before, protectedBusinessHash: "changed" }, "Parent"), /protectedBusinessHash changed/);
});

test("D6-R3B preserves TL-0001 evidence and excludes every manifested Timeline from remaining POSTs", () => {
  const source = fs.readFileSync(new URL("../scripts/dataverse/phase1c5r2g-d6-full-import.mjs", import.meta.url), "utf8");
  assert.match(source, /verifyTl0001Reuse/);
  assert.match(source, /row\._record_token\}`\]/);
  assert.match(source, /postAttempt: 0/);
  assert.match(source, /remaining Timeline does not match the Exact Manifest/);
});

test("D6-R3B Timeline classification, Canaries and batches are stable", () => {
  const timeline = [
    { _record_token: "TL-004", activity_entity: "annotation", scheduledend_or_actualend: "2026-07-19" },
    { _record_token: "TL-001", activity_entity: "phonecall", scheduledend_or_actualend: "2026-07-01" },
    { _record_token: "TL-002", activity_entity: "appointment", scheduledend_or_actualend: "2026-07-02" },
    { _record_token: "TL-003", activity_entity: "task", scheduledend_or_actualend: "2026-07-03" },
    { _record_token: "TL-005", activity_entity: "annotation", scheduledend_or_actualend: "2026-07-18" },
  ];
  const buckets = classifyRemainingTimeline(timeline, "2026-07-18");
  assert.deepEqual(Object.fromEntries(Object.entries(buckets).map(([key, rowsForType]) => [key, rowsForType.length])), { phonecall: 1, appointment: 1, task: 1, historicalAnnotation: 0, sameDayAnnotation: 1, futureAnnotation: 1 });
  assert.deepEqual(Object.fromEntries(Object.entries(selectStableCanaries(buckets)).map(([key, row]) => [key, row?._record_token || null])), { phonecall: "TL-001", appointment: "TL-002", task: "TL-003", historicalAnnotation: null, sameDayAnnotation: "TL-005", futureAnnotation: "TL-004" });
  assert.deepEqual(buildMaximumBatches(rows("TL", 201).reverse(), 100, "T-").map((batch) => batch.size), [100, 100, 1]);
});

test("D6-R3 Signal Canaries group by Timeline source type and reject unknown sources", () => {
  const sources = new Map([["TL-1", { activity_entity: "phonecall" }], ["TL-2", { activity_entity: "annotation" }]]);
  const grouped = groupSignalsBySourceActivity([{ _record_token: "SIG-2", aigw_sourceactivitytoken: "TL-2" }, { _record_token: "SIG-1", aigw_sourceactivitytoken: "TL-1" }], sources);
  assert.equal(grouped.phonecall[0]._record_token, "SIG-1");
  assert.equal(grouped.annotation[0]._record_token, "SIG-2");
  assert.throws(() => groupSignalsBySourceActivity([{ _record_token: "SIG-X", aigw_sourceactivitytoken: "MISSING" }], sources), /source Timeline activity/);
});

test("D6-R3 safe-stop evidence records the one successful Canary without exposing IDs", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r3-validation-manifest.json", import.meta.url), "utf8"));
  const timeline = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r3-timeline-ledger-public.json", import.meta.url), "utf8"));
  const signal = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r3-signal-ledger-public.json", import.meta.url), "utf8"));
  assert.equal(manifest.status, "FAILED_SAFE_STOP");
  assert.deepEqual(manifest.timeline.canaries, { phonecall: "TL-0001", appointment: "TL-0002", task: "TL-0003", pastOrCurrentAnnotation: "TL-0004", futureAnnotation: "TL-0146" });
  assert.equal(manifest.timeline.created, 1);
  assert.equal(manifest.signal.attempted, 0);
  assert.equal(manifest.requestDelta.TimelinePOST, 1);
  assert.equal(manifest.requestDelta.SignalPOST, 0);
  assert.equal(timeline.records.length, 1);
  assert.equal(signal.records.length, 0);
  for (const name of ["d365-ai-demo-200-d6-r3-validation-manifest.json", "d365-ai-demo-200-d6-r3-timeline-ledger-public.json", "d365-ai-demo-200-d6-r3-signal-ledger-public.json", "d365-ai-demo-200-d6-r3-activity-type-readback.json", "d365-ai-demo-200-d6-r3-bpf-integrity-summary.json", "d365-ai-demo-200-d6-r3-base-full-import-readback.json"]) {
    assert.equal(containsGuid(fs.readFileSync(new URL(`../docs/d365/${name}`, import.meta.url), "utf8")), false, name);
  }
});

test("D6-R3A failure evidence preserves partial progress and every safety boundary", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r3a-validation-manifest.json", import.meta.url), "utf8"));
  const timeline = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r3a-timeline-ledger-public.json", import.meta.url), "utf8"));
  const signal = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r3a-signal-ledger-public.json", import.meta.url), "utf8"));

  assert.equal(manifest.status, "FAILED_SAFE_STOP");
  assert.equal(manifest.blocker.token, "TL-0653");
  assert.equal(manifest.blocker.category, "SAME_DAY_ANNOTATION_SYSTEM_DATE");
  assert.deepEqual(manifest.current.entityCounts, {
    Account: 60,
    Contact: 120,
    Opportunity: 200,
    ServiceCoverage: 240,
    ActualManagement: 130,
    Timeline: 1568,
    InteractionSignal: 154,
  });
  assert.equal(manifest.current.explicitRecords, 2472);
  assert.equal(manifest.timeline.remaining, 232);
  assert.equal(manifest.signal.remaining, 1196);
  assert.equal(manifest.gates.StateAwareCheckpointReady, true);
  assert.equal(manifest.gates.D6R3FailureEvidencePreserved, true);
  assert.equal(manifest.gates.TL0001Reused, true);
  assert.equal(manifest.gates.TimelineCanaryReady, false);
  assert.equal(manifest.gates.D6R3ATimelineSignalImportCompleted, false);
  assert.deepEqual(manifest.opportunity.state, { Won: 7, Active: 192, Lost: 1 });
  assert.equal(manifest.bpf.targetInstanceCount, 200);
  assert.equal(manifest.bpf.duplicateCount, 0);

  for (const key of ["signalPost", "patch", "delete", "publish", "winOpportunity", "loseOpportunity", "bpfWrites", "productionRequests", "externalLlmCalls"]) {
    assert.equal(manifest.requests[key], 0, key);
  }
  assert.equal(timeline.currentTimelineCount, 1568);
  assert.equal(timeline.pendingCount, 232);
  assert.equal(timeline.failedToken, "TL-0653");
  assert.equal(timeline.tl0001ResumeStatus, "ReusedNoPost");
  assert.equal(timeline.canaries.futureAnnotation, "NotRun");
  assert.equal(timeline.records.some((row) => row.stableToken === "TL-0001" && row.exactReadback), true);
  assert.equal(signal.currentSignalCount, 154);
  assert.equal(signal.attempted, 0);
});

test("D6-R3A public evidence contains no exact Dataverse GUID", () => {
  const names = [
    "d365-ai-demo-200-d6-r3a-checkpoint-repair-report.md",
    "d365-ai-demo-200-d6-r3a-validation-manifest.json",
    "d365-ai-demo-200-d6-r3a-timeline-ledger-public.json",
    "d365-ai-demo-200-d6-r3a-signal-ledger-public.json",
    "d365-ai-demo-200-d6-r3a-checkpoint-rules.json",
    "d365-ai-demo-200-d6-r3a-activity-readback.json",
    "d365-ai-demo-200-d6-r3a-bpf-integrity-summary.json",
    "d365-ai-demo-200-d6-r3a-base-full-import-readback.json",
    "d365-ai-demo-200-d6-r4-state-action-decision-pack-zh.md",
  ];
  for (const name of names) {
    const value = fs.readFileSync(new URL(`../docs/d365/${name}`, import.meta.url), "utf8");
    assert.equal(containsGuid(value), false, name);
  }
});

test("D6-R3B evidence completes Timeline and Signal with the frozen same-day projection", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r3b-validation-manifest.json", import.meta.url), "utf8"));
  const timeline = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r3b-timeline-ledger-public.json", import.meta.url), "utf8"));
  const signal = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r3b-signal-ledger-public.json", import.meta.url), "utf8"));
  const annotation = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r3b-annotation-readback.json", import.meta.url), "utf8"));
  assert.equal(manifest.status, "COMPLETED");
  assert.deepEqual(manifest.imported, { Timeline: 232, InteractionSignal: 1196 });
  assert.equal(manifest.final.explicitRecords, 3900);
  assert.deepEqual(manifest.final.opportunityState, { Won: 7, Active: 192, Lost: 1 });
  assert.equal(manifest.final.bpf.targetInstanceCount, 200);
  assert.equal(manifest.gates.FullImportCompleted, false);
  assert.equal(manifest.gates.CleanupAuthorized, false);
  assert.equal(timeline.finalCount, 1800);
  assert.deepEqual(timeline.categories, { phonecall: 0, appointment: 0, task: 0, historicalAnnotation: 224, sameDayAnnotation: 1, futureAnnotation: 7 });
  assert.equal(signal.finalCount, 1350);
  assert.equal(signal.missingSourceCount, 0);
  assert.equal(annotation.token, "TL-0653");
  assert.equal(annotation.projectionMode, "SameDayBodyDate");
  assert.equal(annotation.bodyMarkerCount, 1);
  assert.equal(annotation.overriddenCreatedOnSent, false);
});

test("D6-R3B public evidence contains no exact Dataverse GUID", () => {
  for (const name of [
    "d365-ai-demo-200-d6-r3b-validation-manifest.json",
    "d365-ai-demo-200-d6-r3b-timeline-ledger-public.json",
    "d365-ai-demo-200-d6-r3b-signal-ledger-public.json",
    "d365-ai-demo-200-d6-r3b-annotation-projection-rules.json",
    "d365-ai-demo-200-d6-r3b-annotation-readback.json",
    "d365-ai-demo-200-d6-r3b-bpf-integrity-summary.json",
    "d365-ai-demo-200-d6-r3b-base-full-import-readback.json",
    "d365-ai-demo-200-d6-r3b-same-day-annotation-repair.md",
    "d365-ai-demo-200-d6-r4-state-action-decision-pack-zh.md",
  ]) assert.equal(containsGuid(fs.readFileSync(new URL(`../docs/d365/${name}`, import.meta.url), "utf8")), false, name);
});

test("D6 rejects empty or malformed Dataverse bind references", () => {
  const source = fs.readFileSync(new URL("../scripts/dataverse/phase1c5r2g-d6-full-import.mjs", import.meta.url), "utf8");
  assert.match(source, /Invalid \$\{navigation\} bind reference/);
  assert.match(source, /requiredReferenceId\(locationRefs/);
  assert.match(source, /requiredReferenceId\(polpodRefs/);
  assert.doesNotMatch(source, /normalizeId\(locationRefs\.get\([^)]*\)\?\.aigw_locationid\)/);
});

test("D6 reference recovery verifier is GET-only and test-host restricted", () => {
  const source = fs.readFileSync(new URL("../scripts/dataverse/phase1c5r2g-d6-reference-recovery-readback.mjs", import.meta.url), "utf8");
  assert.match(source, /WhoAmI/);
  assert.match(source, /D6_FULL_IMPORT\.expectedHost/);
  assert.match(source, /D6_FULL_IMPORT\.productionHost/);
  assert.match(source, /suzhouResolvedExactlyOnce/);
  assert.doesNotMatch(source, /dataversePost|dataversePatch|dataverseDelete|PublishXml/);
});

test("D6 partial readback validates only exact created records and leaves failed token absent", () => {
  const source = fs.readFileSync(new URL("../scripts/dataverse/phase1c5r2g-d6-partial-readback.mjs", import.meta.url), "utf8");
  assert.match(source, /record\.d6Result === "Created"/);
  assert.match(source, /DEMO-OPP-005/);
  assert.match(source, /failedTokenResidualCount/);
  assert.match(source, /RetrieveProcessInstances/);
  assert.doesNotMatch(source, /dataversePost|dataversePatch|dataverseDelete|PublishXml/);
});

test("D6 failure evidence preserves the safe-stop gate and partial exact counts", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-validation-manifest.json", import.meta.url), "utf8"));
  const report = fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-full-import-report.md", import.meta.url), "utf8");
  assert.equal(manifest.status, "FAILED_SAFE_STOP");
  assert.equal(manifest.p0Count, 0);
  assert.equal(manifest.p1Count, 1);
  assert.equal(manifest.blocker.token, "DEMO-OPP-005");
  assert.equal(manifest.blocker.failedRecordResidualCount, 0);
  assert.match(report, /Explicit records: \*\*595\*\*/);
  assert.match(report, /\*\*60 \/ 120 \/ 28 \/ 15 \/ 12 \/ 206 \/ 154\*\*/);
  assert.match(report, /\*\*7 \/ 20 \/ 1\*\*/);
  assert.match(report, /\*\*28 \/ 28 \/ 0 \/ 0\*\*/);
});

test("D6-R1 evidence completes only the Opportunity recovery gate", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r1-validation-manifest.json", import.meta.url), "utf8"));
  const bpf = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r1-bpf-readback-summary.json", import.meta.url), "utf8"));
  assert.equal(manifest.status, "OPPORTUNITY_RECOVERY_COMPLETED");
  assert.equal(manifest.execution.opportunityCreated, 172);
  assert.equal(manifest.execution.opportunityFailed, 0);
  assert.equal(manifest.finalReadback.entityCounts.Opportunity, 200);
  assert.deepEqual(manifest.finalReadback.opportunityState, { Won: 7, Active: 192, Lost: 1 });
  assert.equal(manifest.gates.D6R1OpportunityRecoveryCompleted, true);
  assert.equal(manifest.gates.BaseFullDataImportCompleted, false);
  assert.equal(manifest.gates.FullImportCompleted, false);
  assert.equal(manifest.gates.CleanupAuthorized, false);
  assert.equal(bpf.after.targetInstanceCount, 200);
  assert.equal(bpf.after.initialStageCount, 200);
  assert.equal(bpf.after.duplicateCount, 0);
  assert.equal(bpf.manualBpfWrites, 0);
});

test("D6 public evidence contains no exact Dataverse GUID", () => {
  const names = [
    "d365-ai-demo-200-d6-complement-manifest.json",
    "d365-ai-demo-200-d6-full-import-report.md",
    "d365-ai-demo-200-d6-validation-manifest.json",
    "d365-ai-demo-200-d6-batch-ledger-public.json",
    "d365-ai-demo-200-d6-bpf-readback-summary.json",
    "d365-ai-demo-200-d6-state-action-summary.json",
    "d365-ai-demo-200-d6-final-readback.json",
    "d365-ai-demo-200-d6-full-cleanup-manifest.json",
    "d365-ai-demo-200-d6-failure-recovery-plan-zh.md",
    "d365-ai-demo-200-d6-final-acceptance-plan-zh.md",
    "d365-ai-demo-200-d6-r1-opportunity-recovery-report.md",
    "d365-ai-demo-200-d6-r1-validation-manifest.json",
    "d365-ai-demo-200-d6-r1-bpf-readback-summary.json",
    "d365-ai-demo-200-d6-r2-coverage-actual-import-report.md",
    "d365-ai-demo-200-d6-r2-validation-manifest.json",
    "d365-ai-demo-200-d6-r2-coverage-ledger-public.json",
    "d365-ai-demo-200-d6-r2-actual-ledger-public.json",
    "d365-ai-demo-200-d6-r2-plugin-sync-readback.json",
    "d365-ai-demo-200-d6-r2-bpf-integrity-summary.json",
    "d365-ai-demo-200-d6-r2-base-full-readback.json",
    "d365-ai-demo-200-d6-r3-timeline-signal-decision-pack-zh.md",
  ];
  for (const name of names) assert.equal(containsGuid(fs.readFileSync(new URL(`../docs/d365/${name}`, import.meta.url), "utf8")), false, name);
});

test("D6-R2 public evidence proves Coverage and Actual completion only", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r2-validation-manifest.json", import.meta.url), "utf8"));
  const readback = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r2-base-full-readback.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.complement, {
    ServiceCoverage: 225,
    ActualManagement: 118,
    overlap: 0,
    duplicateToken: 0,
    missingParentToken: 0,
    desiredActualParents: { Won: 84, Active: 34, Lost: 0 },
  });
  assert.deepEqual(manifest.execution.coverage, { attempt: 225, created: 225, reused: 0, failed: 0 });
  assert.deepEqual(manifest.execution.actual, { attempt: 118, created: 118, reused: 0, failed: 0 });
  assert.deepEqual(readback.entityCounts, { Account: 60, Contact: 120, Opportunity: 200, ServiceCoverage: 240, ActualManagement: 130, Timeline: 206, InteractionSignal: 154 });
  assert.equal(readback.explicitRecordCount, 1110);
  assert.equal(readback.baseFullDataImportCompleted, false);
  assert.equal(readback.fullImportCompleted, false);
  assert.equal(readback.stateActionsDeferred, true);
});

test("D6-R2 Coverage ledger proves both canaries and four rows per Account", () => {
  const ledger = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r2-coverage-ledger-public.json", import.meta.url), "utf8"));
  assert.deepEqual(ledger.canaries, { compositeKey: "COV-002", nullStartDate: "COV-004" });
  assert.equal(ledger.records.length, 225);
  assert.equal(new Set(ledger.records.map((row) => row.stableToken)).size, 225);
  assert.equal(ledger.records.every((row) => row.result === "Created" && row.exactReadback), true);
  assert.equal(ledger.finalCount, 240);
  assert.equal(ledger.coveragePerAccount, 4);
});

test("D6-R2 Actual ledger proves one-per-parent, annual sums, sync and protected hashes", () => {
  const ledger = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r2-actual-ledger-public.json", import.meta.url), "utf8"));
  assert.equal(ledger.canary, "ACT-001");
  assert.equal(ledger.records.length, 118);
  assert.equal(new Set(ledger.records.map((row) => row.stableToken)).size, 118);
  assert.equal(new Set(ledger.records.map((row) => row.opportunityToken)).size, 118);
  assert.equal(ledger.records.every((row) => row.annualActualRevenueMatchesMonthlySum && row.parentSyncMatches && row.parentProtectedBusinessHashUnchanged), true);
  assert.equal(ledger.records.every((row) => row.stateStatusUnchanged && row.actualCloseDateUnchanged && row.bpfInstanceUnchanged && row.bpfStagePathUnchanged), true);
  assert.equal(ledger.records.every((row) => JSON.stringify(row.approvedDeltaFields) === JSON.stringify(["aigw_yearrevenueactual", "modifiedon", "versionnumber"])), true);
  assert.equal(ledger.finalCount, 130);
  assert.equal(ledger.oneActualPerOpportunity, true);
});

test("D6-R2 request delta contains only approved POST categories", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r2-validation-manifest.json", import.meta.url), "utf8"));
  const requests = manifest.requestDelta;
  assert.equal(requests.CoveragePOST, 225);
  assert.equal(requests.ActualPOST, 118);
  for (const key of ["AccountPOST", "ContactPOST", "OpportunityPOST", "TimelinePOST", "SignalPOST", "BpfInstancePOST", "BpfInstancePATCH", "BpfInstanceDELETE", "PATCH", "DELETE", "Publish", "BPFWrites", "TeamRoleMembershipChanges", "ProductionRequests", "ExternalLLMCalls"]) assert.equal(requests[key], 0, key);
  assert.equal(requests.WinOpportunityAttempts, 0);
  assert.equal(requests.LoseOpportunityAttempts, 0);
});

test("D6 executor preserves Future Annotation and official state-action boundaries", () => {
  const source = fs.readFileSync(new URL("../scripts/dataverse/phase1c5r2g-d6-full-import.mjs", import.meta.url), "utf8");
  assert.match(source, /【计划节点日期】/);
  assert.match(source, /assertAnnotationPayloadFields\(payload, projectionMode\)/);
  assert.match(source, /d6R3Final\.timeline\?\.count === D6_R3_TIMELINE_SIGNAL\.finalTimelineCount/);
  assert.match(source, /d6R3Baseline\.alreadyCompleted/);
  assert.match(source, /timelinePostAttempts: 0, signalPostAttempts: 0/);
  assert.match(source, /const publicD6R3Final/);
  assert.match(source, /WinOpportunity/);
  assert.match(source, /LoseOpportunity/);
  assert.doesNotMatch(source, /dataversePatch/);
});

test("D6 cleanup remains unauthorized and excludes every reference master", () => {
  const cleanup = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-full-cleanup-manifest.json", import.meta.url), "utf8"));
  assert.equal(cleanup.cleanupAuthorized, false);
  assert.equal(cleanup.cleanupExecuted, false);
  assert.deepEqual(cleanup.reverseOrder, ["InteractionSignal", "Timeline", "ActualManagement", "ServiceCoverage", "Opportunity", "Contact", "Account"]);
  for (const name of ["Currency", "Location", "POL/POD", "Demo Teams", "Canonical Role", "BPF Definition"]) assert.ok(cleanup.neverCleanup.includes(name));
});

test("D6-R4A completes exactly one official Full Win canary and preserves the full dataset", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r4a-validation-manifest.json", import.meta.url), "utf8"));
  const ledger = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r4a-state-action-ledger-public.json", import.meta.url), "utf8"));
  const close = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r4a-opportunity-close-readback.json", import.meta.url), "utf8"));
  const bpf = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r4a-bpf-before-after.json", import.meta.url), "utf8"));
  const integrity = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r4a-business-integrity-summary.json", import.meta.url), "utf8"));
  assert.equal(manifest.status, "FULL_WIN_CANARY_COMPLETED");
  assert.equal(manifest.fullWinCanary.opportunityToken, "DEMO-OPP-001");
  assert.deepEqual(manifest.opportunityState, { Won: 8, Active: 191, Lost: 1 });
  assert.deepEqual(manifest.opportunityClose, { win: 8, lose: 1, total: 9, duplicate: 0, attachments: 0 });
  assert.equal(manifest.requestDelta.ActualGET, 1);
  assert.equal(manifest.requestDelta.WinOpportunityAttempts, 1);
  for (const key of ["LoseOpportunity", "PATCH", "DELETE", "Publish", "BPFWrites", "OtherBusinessPOST", "ProductionRequests", "ExternalLLMCalls"]) assert.equal(manifest.requestDelta[key], 0, key);
  assert.equal(ledger.actionCount, 1);
  assert.equal(ledger.otherWinActionsExecuted, 0);
  assert.equal(ledger.loseActionsExecuted, 0);
  assert.equal(close.countBefore, 0);
  assert.equal(close.countAfter, 1);
  assert.equal(bpf.classification, "A / BPF Full Win Side Effect=None");
  assert.deepEqual(integrity.explicitRecordCountBeforeAfter, [3900, 3900]);
  assert.equal(integrity.nonCanaryOpportunityStateHashUnchanged, true);
  assert.equal(manifest.gates.remainingWinActions, 83);
  assert.equal(manifest.gates.remainingLoseActions, 8);
  assert.equal(manifest.p0, 0);
  assert.equal(manifest.p1, 0);
  assert.equal(manifest.p2, 0);
});

test("D6-R4A executor only permits the scoped canary and its public evidence excludes GUIDs", () => {
  const source = fs.readFileSync(new URL("../scripts/dataverse/phase1c5r2g-d6-full-import.mjs", import.meta.url), "utf8");
  assert.match(source, /D6_R4A_FULL_WIN_CANARY/);
  assert.match(source, /runD6R4AFullWinCanary/);
  assert.match(source, /verifyCanaryActualRevenue/);
  assert.match(source, /selectFullWinCanary/);
  assert.match(source, /performStateAction\(candidate, "WinOpportunity", "R4A-FULL-WIN-CANARY"\)/);
  assert.doesNotMatch(source, /dataversePatch/);
  for (const name of [
    "d365-ai-demo-200-d6-r4a-validation-manifest.json",
    "d365-ai-demo-200-d6-r4a-state-action-ledger-public.json",
    "d365-ai-demo-200-d6-r4a-opportunity-close-readback.json",
    "d365-ai-demo-200-d6-r4a-bpf-before-after.json",
    "d365-ai-demo-200-d6-r4a-business-integrity-summary.json",
    "d365-ai-demo-200-d6-r4a-full-win-canary-report.md",
    "d365-ai-demo-200-d6-r4b-full-lose-canary-decision-pack-zh.md",
    "d365-ai-demo-200-d6-r4-state-action-decision-pack-zh.md",
  ]) assert.equal(containsGuid(fs.readFileSync(new URL(`../docs/d365/${name}`, import.meta.url), "utf8")), false, name);
});

test("D6-R4C public evidence freezes the final state-action result without GUIDs", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r4c-validation-manifest.json", import.meta.url), "utf8"));
  const ledger = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r4c-state-action-ledger.json", import.meta.url), "utf8"));
  const final = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r4c-final-state-readback.json", import.meta.url), "utf8"));
  assert.equal(manifest.status, "FULL_STATE_ACTIONS_COMPLETED");
  assert.deepEqual(manifest.stateDistribution, { Won: 91, Active: 100, Lost: 9 });
  assert.deepEqual(manifest.opportunityClose, { win: 91, lose: 9, total: 100, duplicate: 0, attachments: 0 });
  assert.equal(ledger.actionCount, 90);
  assert.equal(ledger.winCount, 83);
  assert.equal(ledger.loseCount, 7);
  assert.equal(final.explicitRecordCount, 3900);
  assert.equal(final.bpf.target, 200);
  assert.equal(final.fullImportCompleted, false);
  assert.equal(final.cleanupAuthorized, false);
  assert.equal(manifest.p0, 0);
  assert.equal(manifest.p1, 0);
  assert.equal(manifest.p2, 0);
});

test("D6-R4C public files contain no Dataverse GUIDs or forbidden write counts", () => {
  const names = [
    "d365-ai-demo-200-d6-r4c-state-action-report.md",
    "d365-ai-demo-200-d6-r4c-validation-manifest.json",
    "d365-ai-demo-200-d6-r4c-state-action-ledger.json",
    "d365-ai-demo-200-d6-r4c-opportunity-close-summary.json",
    "d365-ai-demo-200-d6-r4c-bpf-integrity-summary.json",
    "d365-ai-demo-200-d6-r4c-final-state-readback.json",
  ];
  for (const name of names) {
    const text = fs.readFileSync(new URL(`../docs/d365/${name}`, import.meta.url), "utf8");
    assert.equal(containsGuid(text), false, name);
  }
  const final = JSON.parse(fs.readFileSync(new URL("../docs/d365/d365-ai-demo-200-d6-r4c-final-state-readback.json", import.meta.url), "utf8"));
  for (const key of ["ActualPOST", "TimelinePOST", "SignalPOST", "OtherBusinessPOST", "PATCH", "DELETE", "Publish", "BPFWrites", "ProductionRequests", "ExternalLLMCalls"]) {
    assert.equal(final.requestDelta[key], 0, key);
  }
});
