import crypto from "node:crypto";

export const D6_FULL_IMPORT = Object.freeze({
  phase: "Phase 1C-5R2G-D6",
  authorization: "Phase 1C-5R2G-D6",
  expectedHost: "org91f5f65f.crm5.dynamics.com",
  productionHost: "lcn-crm.crm7.dynamics.com",
  generationRun: "R2G-A-GEN-001",
  formalWorkbook: Object.freeze({
    bytes: 570890,
    sha256: "af40bede1df13eb40ef5718f657d21ba570d1cc29feed5a9848616ddf5fbedea",
  }),
  pilotWorkbook: Object.freeze({
    bytes: 90392,
    sha256: "789e0c620199481c4de4532d14479b075a14d32eb375b20971723b3284fc1e36",
  }),
  entities: Object.freeze([
    "Account",
    "Contact",
    "Opportunity",
    "ServiceCoverage",
    "ActualManagement",
    "Timeline",
    "InteractionSignal",
  ]),
  formalCounts: Object.freeze({
    Account: 60,
    Contact: 120,
    Opportunity: 200,
    ServiceCoverage: 240,
    ActualManagement: 130,
    Timeline: 1800,
    InteractionSignal: 1350,
  }),
  pilotCounts: Object.freeze({
    Account: 7,
    Contact: 9,
    Opportunity: 24,
    ServiceCoverage: 15,
    ActualManagement: 12,
    Timeline: 206,
    InteractionSignal: 154,
  }),
  remainingCounts: Object.freeze({
    Account: 53,
    Contact: 111,
    Opportunity: 176,
    ServiceCoverage: 225,
    ActualManagement: 118,
    Timeline: 1594,
    InteractionSignal: 1196,
  }),
  batchSizes: Object.freeze({
    Account: Object.freeze([30, 23]),
    Contact: Object.freeze([30, 30, 30, 21]),
    Opportunity: Object.freeze([22, 22, 22, 22, 22, 22, 22, 22]),
    ServiceCoverage: Object.freeze([25, 25, 25, 25, 25, 25, 25, 25, 25]),
    ActualManagement: Object.freeze([20, 20, 20, 20, 20, 18]),
    Timeline: Object.freeze([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 94]),
    InteractionSignal: Object.freeze([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 96]),
    WinOpportunity: Object.freeze([12, 12, 12, 12, 12, 12, 12]),
    LoseOpportunity: Object.freeze([8]),
  }),
  finalState: Object.freeze({ Won: 91, Active: 100, Lost: 9 }),
  pilotState: Object.freeze({ Won: 7, Active: 16, Lost: 1 }),
  remainingStateActions: Object.freeze({ Won: 84, Lost: 8 }),
  explicitRemaining: 3473,
  explicitFinal: 3900,
  targetBpfFinal: 200,
  opportunityCloseFinal: 100,
});

export const D6_R1_OPPORTUNITY_RECOVERY = Object.freeze({
  phase: "Phase 1C-5R2G-D6-R1",
  authorization: "Phase 1C-5R2G-D6-R1",
  flag: "--resume-opportunity-only",
  failedToken: "DEMO-OPP-005",
  baselineExplicitRecords: 595,
  baselineEntityCounts: Object.freeze({
    Account: 60,
    Contact: 120,
    Opportunity: 28,
    ServiceCoverage: 15,
    ActualManagement: 12,
    Timeline: 206,
    InteractionSignal: 154,
  }),
  baselineBpfCount: 28,
  existingComplementOpportunityCount: 4,
  pendingOpportunityCount: 172,
  finalOpportunityCount: 200,
  finalBpfCount: 200,
  finalPreActionState: Object.freeze({ Won: 7, Active: 192, Lost: 1 }),
});

export const D6_R2_COVERAGE_ACTUAL = Object.freeze({
  phase: "Phase 1C-5R2G-D6-R2",
  authorization: "Phase 1C-5R2G-D6-R2",
  flag: "--resume-coverage-actual-only",
  baselineExplicitRecords: 767,
  baselineEntityCounts: Object.freeze({
    Account: 60,
    Contact: 120,
    Opportunity: 200,
    ServiceCoverage: 15,
    ActualManagement: 12,
    Timeline: 206,
    InteractionSignal: 154,
  }),
  baselineBpfCount: 200,
  remainingCoverageCount: 225,
  remainingActualCount: 118,
  finalExplicitRecords: 1110,
  finalCoverageCount: 240,
  finalActualCount: 130,
  expectedState: Object.freeze({ Won: 7, Active: 192, Lost: 1 }),
  actualDesiredParentDistribution: Object.freeze({ Won: 84, Active: 34, Lost: 0 }),
});

export const D6_R3_TIMELINE_SIGNAL = Object.freeze({
  phase: "Phase 1C-5R2G-D6-R3B",
  authorization: "Phase 1C-5R2G-D6-R3B",
  flag: "--resume-timeline-signal-only",
  baselineExplicitRecords: 2472,
  baselineEntityCounts: Object.freeze({
    Account: 60,
    Contact: 120,
    Opportunity: 200,
    ServiceCoverage: 240,
    ActualManagement: 130,
    Timeline: 1568,
    InteractionSignal: 154,
  }),
  baselineBpfCount: 200,
  previouslyExistingTimelineCount: 1568,
  remainingTimelineCount: 232,
  remainingSignalCount: 1196,
  annotationProjectionReferenceDate: "2026-07-18",
  sameDayCanaryToken: "TL-0653",
  remainingTimelineCategories: Object.freeze({
    phonecall: 0,
    appointment: 0,
    task: 0,
    historicalAnnotation: 224,
    sameDayAnnotation: 1,
    futureAnnotation: 7,
  }),
  finalExplicitRecords: 3900,
  finalTimelineCount: 1800,
  finalSignalCount: 1350,
  expectedState: Object.freeze({ Won: 7, Active: 192, Lost: 1 }),
  timelineBatchMaximum: 100,
  signalBatchMaximum: 100,
});

export const D6_R4A_FULL_WIN_CANARY = Object.freeze({
  phase: "Phase 1C-5R2G-D6-R4A",
  authorization: "Phase 1C-5R2G-D6-R4A",
  flag: "--full-win-canary-only",
  expectedRemainingWonCandidates: 84,
  expectedPreActionState: Object.freeze({ Won: 7, Active: 192, Lost: 1 }),
  expectedPostActionState: Object.freeze({ Won: 8, Active: 191, Lost: 1 }),
  expectedPreActionOpportunityCloseCount: 8,
  expectedPostActionOpportunityCloseCount: 9,
  maxWinAttempts: 1,
});

export const D6_R4B_FULL_LOSE_CANARY = Object.freeze({
  phase: "Phase 1C-5R2G-D6-R4B",
  authorization: "Phase 1C-5R2G-D6-R4B-R1",
  flag: "--full-lose-canary-only",
  expectedRemainingLostCandidates: 8,
  expectedPreActionState: Object.freeze({ Won: 8, Active: 191, Lost: 1 }),
  expectedPostActionState: Object.freeze({ Won: 8, Active: 190, Lost: 2 }),
  expectedPreActionOpportunityCloseCount: 9,
  expectedPostActionOpportunityCloseCount: 10,
  maxLoseAttempts: 1,
});

export const D6_R4C_FULL_STATE_ACTIONS = Object.freeze({
  phase: "Phase 1C-5R2G-D6-R4C",
  authorization: "Phase 1C-5R2G-D6-R4C",
  flag: "--full-state-actions",
  maxBatchSize: 10,
  preActionState: Object.freeze({ Won: 8, Active: 190, Lost: 2 }),
  finalState: Object.freeze({ Won: 91, Active: 100, Lost: 9 }),
  preActionOpportunityCloseCount: 10,
  finalOpportunityCloseCount: 100,
  remainingWinCandidates: 83,
  remainingLoseCandidates: 7,
});

const normalizedDate = (value) => value === null || value === undefined || value === "" ? null : String(value).slice(0, 10);
const ANNOTATION_BODY_MODES = new Set(["SameDayBodyDate", "FutureBodyPlannedDate"]);
const ANNOTATION_SYSTEM_DATE_FIELDS = new Set(["createdon", "modifiedon", "overriddencreatedon", "scheduledstart", "scheduledend", "actualstart", "actualend"]);

export function annotationProjectionMode(businessDate, referenceDate) {
  const business = normalizedDate(businessDate);
  const reference = normalizedDate(referenceDate);
  if (!business || !reference) throw new Error("Annotation business and reference dates are required");
  if (business < reference) return "HistoricalOverride";
  if (business === reference) return "SameDayBodyDate";
  return "FutureBodyPlannedDate";
}

export function buildProjectedAnnotationBody(originalBody, businessDate, mode) {
  if (!ANNOTATION_BODY_MODES.has(mode)) throw new Error(`Annotation body projection is not supported: ${mode}`);
  const marker = mode === "SameDayBodyDate" ? "【业务节点日期】" : "【计划节点日期】";
  const otherMarker = mode === "SameDayBodyDate" ? "【计划节点日期】" : "【业务节点日期】";
  const body = String(originalBody || "");
  if (body.includes(otherMarker)) throw new Error("Annotation body contains a conflicting date marker");
  if (body.includes(marker)) {
    if (body.split(marker).length - 1 !== 1) throw new Error("Annotation body contains a duplicate date marker");
    return body;
  }
  return `${marker}\n${normalizedDate(businessDate)}\n\n【记录内容】\n${body}`;
}

export function assertAnnotationPayloadFields(payload, mode) {
  const keys = Object.keys(payload || {});
  if (mode === "HistoricalOverride") {
    const plainKeys = keys.filter((key) => !key.endsWith("@odata.bind"));
    const bindKeys = keys.filter((key) => key.endsWith("@odata.bind"));
    const allowed = new Set(["subject", "notetext", "overriddencreatedon"]);
    if (plainKeys.some((key) => !allowed.has(key)) || !plainKeys.includes("subject") || !plainKeys.includes("notetext") || !plainKeys.includes("overriddencreatedon")) throw new Error("Annotation historical payload contains an unapproved field");
    if (bindKeys.length < 1 || bindKeys.length > 2) throw new Error("Annotation historical payload contains an invalid binding set");
    return true;
  }
  if (!ANNOTATION_BODY_MODES.has(mode)) throw new Error(`Unknown Annotation projection mode: ${mode}`);
  if (keys.some((key) => ANNOTATION_SYSTEM_DATE_FIELDS.has(key))) throw new Error("Annotation body-date payload contains a system date field");
  const plainKeys = keys.filter((key) => !key.endsWith("@odata.bind"));
  const bindKeys = keys.filter((key) => key.endsWith("@odata.bind"));
  if (plainKeys.length !== 2 || !plainKeys.includes("subject") || !plainKeys.includes("notetext")) throw new Error("Annotation body-date payload contains an unapproved field");
  if (bindKeys.length < 1 || bindKeys.length > 2) throw new Error("Annotation body-date payload contains an invalid binding set");
  return true;
}

export function assertFrozenOpportunityState(actual, expected, label = "Opportunity") {
  if (!expected || ![0, 1, 2].includes(Number(expected.statecode))) throw new Error(`${label} frozen state is invalid`);
  if (Number(actual.statecode) !== Number(expected.statecode)) throw new Error(`${label} statecode changed`);
  if (Number(actual.statuscode) !== Number(expected.statuscode)) throw new Error(`${label} statuscode changed`);
  const actualClose = normalizedDate(actual.actualclosedate);
  const expectedClose = normalizedDate(expected.actualclosedate);
  if (Number(expected.statecode) === 0 && actualClose !== null) throw new Error(`${label} Active actualclosedate must be empty`);
  if (Number(expected.statecode) !== 0 && expectedClose === null) throw new Error(`${label} frozen close date is missing`);
  if (actualClose !== expectedClose) throw new Error(`${label} actualclosedate changed`);
  return true;
}

export function assertTimelineParentCheckpoint(before, after, label = "Opportunity") {
  const fields = [
    "statecode",
    "statuscode",
    "actualclosedate",
    "protectedBusinessHash",
    "ownerId",
    "department",
    "accountId",
    "contactId",
    "bpfInstanceId",
    "bpfStageId",
    "bpfTraversedPath",
  ];
  for (const field of fields) {
    const left = field === "actualclosedate" ? normalizedDate(before[field]) : before[field];
    const right = field === "actualclosedate" ? normalizedDate(after[field]) : after[field];
    if (left !== right) throw new Error(`${label} ${field} changed during Timeline batch`);
  }
  return true;
}

export const TOKEN_FIELD = "_record_token";

export function sha256(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : stableJson(value));
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function rowsFromMatrix(matrix, tokenField = TOKEN_FIELD) {
  if (!Array.isArray(matrix) || matrix.length < 2) throw new Error("Workbook matrix must contain a header and data rows");
  const headers = matrix[0].map((value) => String(value || ""));
  if (!headers.includes(tokenField)) throw new Error(`Workbook matrix is missing ${tokenField}`);
  const rows = matrix.slice(1)
    .filter((values) => values.some((value) => value !== null && value !== undefined && value !== ""))
    .map((values) => {
      const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? null]));
      if (tokenField !== TOKEN_FIELD) row[TOKEN_FIELD] = row[tokenField];
      return row;
    });
  return { headers, rows };
}

export function exactComplement(formalRows, pilotRows, entityName) {
  const formalTokens = formalRows.map((row) => String(row[TOKEN_FIELD] || ""));
  const pilotTokens = pilotRows.map((row) => String(row[TOKEN_FIELD] || ""));
  assertUniqueTokens(formalTokens, `${entityName} formal`);
  assertUniqueTokens(pilotTokens, `${entityName} Pilot`);
  const formalSet = new Set(formalTokens);
  for (const token of pilotTokens) if (!formalSet.has(token)) throw new Error(`${entityName} Pilot token is absent from Formal Projection: ${token}`);
  const pilotSet = new Set(pilotTokens);
  const rows = formalRows.filter((row) => !pilotSet.has(String(row[TOKEN_FIELD]))).sort(compareTokens);
  const overlap = rows.filter((row) => pilotSet.has(String(row[TOKEN_FIELD])));
  if (overlap.length) throw new Error(`${entityName} remaining/Pilot overlap detected`);
  return rows;
}

export function assertUniqueTokens(tokens, label) {
  const invalid = tokens.filter((token) => !token);
  if (invalid.length) throw new Error(`${label} contains empty tokens`);
  const duplicates = tokens.filter((token, index) => tokens.indexOf(token) !== index);
  if (duplicates.length) throw new Error(`${label} contains duplicate token: ${duplicates[0]}`);
}

export function compareTokens(left, right) {
  return String(left[TOKEN_FIELD] || left.token || "").localeCompare(String(right[TOKEN_FIELD] || right.token || ""));
}

export function buildStableBatches(rows, sizes, prefix) {
  const expected = sizes.reduce((sum, size) => sum + size, 0);
  if (rows.length !== expected) throw new Error(`${prefix} batch size contract expected ${expected}, received ${rows.length}`);
  const sorted = [...rows].sort(compareTokens);
  const batches = [];
  let offset = 0;
  for (let index = 0; index < sizes.length; index += 1) {
    const size = sizes[index];
    const batchRows = sorted.slice(offset, offset + size);
    if (batchRows.length !== size) throw new Error(`${prefix}${index + 1} batch size mismatch`);
    batches.push({ id: `${prefix}${index + 1}`, size, rows: batchRows });
    offset += size;
  }
  return batches;
}

export function buildMaximumBatches(rows, maximum, prefix) {
  if (!Number.isInteger(maximum) || maximum < 1) throw new Error("Maximum batch size must be a positive integer");
  const sorted = [...rows].sort(compareTokens);
  return Array.from({ length: Math.ceil(sorted.length / maximum) }, (_, index) => {
    const batchRows = sorted.slice(index * maximum, (index + 1) * maximum);
    return { id: `${prefix}${index + 1}`, size: batchRows.length, rows: batchRows };
  });
}

export function classifyRemainingTimeline(rows, serverDate) {
  const normalizedServerDate = String(serverDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedServerDate)) throw new Error("Server date must be YYYY-MM-DD");
  const buckets = {
    phonecall: [],
    appointment: [],
    task: [],
    historicalAnnotation: [],
    sameDayAnnotation: [],
    futureAnnotation: [],
  };
  for (const row of rows) {
    const activity = String(row.activity_entity || "");
    const effectiveDate = typeof row.scheduledend_or_actualend === "string"
      ? row.scheduledend_or_actualend.slice(0, 10)
      : new Date((Number(row.scheduledend_or_actualend) - 25569) * 86400000).toISOString().slice(0, 10);
    if (activity === "annotation") {
      const mode = annotationProjectionMode(effectiveDate, normalizedServerDate);
      const category = mode === "HistoricalOverride" ? "historicalAnnotation" : mode === "SameDayBodyDate" ? "sameDayAnnotation" : "futureAnnotation";
      buckets[category].push(row);
    }
    else if (Object.hasOwn(buckets, activity)) buckets[activity].push(row);
    else throw new Error(`Unsupported Timeline activity type: ${activity}`);
  }
  for (const rowsForType of Object.values(buckets)) rowsForType.sort(compareTokens);
  return buckets;
}

export function selectStableCanaries(buckets) {
  return Object.fromEntries(Object.entries(buckets).map(([name, rows]) => [name, rows.length ? rows[0] : null]));
}

export function groupSignalsBySourceActivity(rows, timelineByToken) {
  const buckets = { phonecall: [], appointment: [], task: [], annotation: [] };
  for (const row of rows) {
    const activity = timelineByToken.get(row.aigw_sourceactivitytoken)?.activity_entity;
    if (!Object.hasOwn(buckets, activity)) throw new Error(`Signal source Timeline activity is unavailable: ${row.aigw_sourceactivitytoken}`);
    buckets[activity].push(row);
  }
  for (const rowsForType of Object.values(buckets)) rowsForType.sort(compareTokens);
  return buckets;
}

export function selectOpportunityRecoveryRows(remainingOpportunityRows, privateRecords) {
  const existing = new Set(
    Object.entries(privateRecords || {})
      .filter(([key, record]) => key.startsWith("Opportunity:") && record?.exactRecordId)
      .map(([, record]) => String(record.stableToken || "")),
  );
  const sorted = [...remainingOpportunityRows].sort(compareTokens);
  const alreadyImported = sorted.filter((row) => existing.has(String(row[TOKEN_FIELD])));
  const pending = sorted.filter((row) => !existing.has(String(row[TOKEN_FIELD])));
  if (alreadyImported.length !== D6_R1_OPPORTUNITY_RECOVERY.existingComplementOpportunityCount) {
    throw new Error(`D6-R1 existing complement Opportunity count expected ${D6_R1_OPPORTUNITY_RECOVERY.existingComplementOpportunityCount}, received ${alreadyImported.length}`);
  }
  if (pending.length !== D6_R1_OPPORTUNITY_RECOVERY.pendingOpportunityCount) {
    throw new Error(`D6-R1 pending Opportunity count expected ${D6_R1_OPPORTUNITY_RECOVERY.pendingOpportunityCount}, received ${pending.length}`);
  }
  if (String(pending[0]?.[TOKEN_FIELD]) !== D6_R1_OPPORTUNITY_RECOVERY.failedToken) {
    throw new Error(`D6-R1 must resume at ${D6_R1_OPPORTUNITY_RECOVERY.failedToken}`);
  }
  return { alreadyImported, pending };
}

export function selectCoverageCanaries(remainingCoverageRows) {
  const sorted = [...remainingCoverageRows].sort(compareTokens);
  const compositeKey = sorted.find((row) => row.aigw_startdate !== null && row.aigw_startdate !== undefined && row.aigw_startdate !== "");
  const nullStartDate = sorted.find((row) => row.aigw_startdate === null || row.aigw_startdate === undefined || row.aigw_startdate === "");
  if (!compositeKey) throw new Error("D6-R2 Coverage composite-key Canary is missing");
  if (!nullStartDate) throw new Error("D6-R2 Coverage null-start-date Canary is missing");
  if (compositeKey[TOKEN_FIELD] === nullStartDate[TOKEN_FIELD]) throw new Error("D6-R2 Coverage Canaries must be distinct");
  return { compositeKey, nullStartDate };
}

export function actualDesiredParentDistribution(actualRows, opportunityRows) {
  const opportunityByToken = new Map(opportunityRows.map((row) => [String(row[TOKEN_FIELD]), row]));
  const distribution = { Won: 0, Active: 0, Lost: 0 };
  for (const actual of actualRows) {
    const parent = opportunityByToken.get(String(actual.aigw_opportunityid_token));
    if (!parent) throw new Error(`D6-R2 Actual parent is missing: ${actual.aigw_opportunityid_token}`);
    const desired = String(parent._desired_state || "");
    if (desired === "赢单") distribution.Won += 1;
    else if (desired === "开放") distribution.Active += 1;
    else if (desired === "丢单") distribution.Lost += 1;
    else throw new Error(`D6-R2 unsupported desired parent state: ${desired}`);
  }
  return distribution;
}

export function validateComplementCounts(complement) {
  for (const entity of D6_FULL_IMPORT.entities) {
    const actual = complement[entity]?.length ?? -1;
    const expected = D6_FULL_IMPORT.remainingCounts[entity];
    if (actual !== expected) throw new Error(`${entity} complement expected ${expected}, received ${actual}`);
  }
  const total = Object.values(complement).reduce((sum, rows) => sum + rows.length, 0);
  if (total !== D6_FULL_IMPORT.explicitRemaining) throw new Error(`Remaining explicit total expected ${D6_FULL_IMPORT.explicitRemaining}, received ${total}`);
  return true;
}

export function selectRemainingStateActions(formalOpportunityRows, pilotOpportunityRows) {
  const pilot = new Set(pilotOpportunityRows.map((row) => String(row[TOKEN_FIELD])));
  const remaining = formalOpportunityRows.filter((row) => !pilot.has(String(row[TOKEN_FIELD])));
  const won = remaining.filter((row) => String(row._desired_state) === "赢单").sort(compareTokens);
  const lost = remaining.filter((row) => String(row._desired_state) === "丢单").sort(compareTokens);
  const active = remaining.filter((row) => String(row._desired_state) === "开放").sort(compareTokens);
  const expected = { won: D6_FULL_IMPORT.remainingStateActions.Won, lost: D6_FULL_IMPORT.remainingStateActions.Lost, active: D6_FULL_IMPORT.finalState.Active - D6_FULL_IMPORT.pilotState.Active };
  if (won.length !== expected.won || lost.length !== expected.lost || active.length !== expected.active) {
    throw new Error(`Remaining state distribution mismatch: ${JSON.stringify({ won: won.length, lost: lost.length, active: active.length })}`);
  }
  return { won, lost, active };
}

export function selectFullWinCanary(frozenWonCandidates, currentStateByToken, priorActions = {}) {
  if (!Array.isArray(frozenWonCandidates) || frozenWonCandidates.length !== D6_R4A_FULL_WIN_CANARY.expectedRemainingWonCandidates) {
    throw new Error(`Remaining Win Candidate Count must be ${D6_R4A_FULL_WIN_CANARY.expectedRemainingWonCandidates}`);
  }
  const active = frozenWonCandidates.filter((candidate) => {
    const token = String(candidate?.opportunityToken || candidate?.[TOKEN_FIELD] || "");
    const state = currentStateByToken?.[token];
    const prior = priorActions?.[token];
    return token
      && Number(state?.statecode) === 0
      && Number(state?.statuscode) === 1
      && (state?.actualclosedate === null || state?.actualclosedate === undefined || state?.actualclosedate === "")
      && Number(state?.opportunityCloseCount) === 0
      && !String(prior?.actionStatus || "").startsWith("Succeeded");
  }).sort((left, right) => String(left?.opportunityToken || left?.[TOKEN_FIELD] || "").localeCompare(String(right?.opportunityToken || right?.[TOKEN_FIELD] || "")));
  if (active.length !== D6_R4A_FULL_WIN_CANARY.expectedRemainingWonCandidates) {
    throw new Error(`Live Remaining Win Candidate Count must be ${D6_R4A_FULL_WIN_CANARY.expectedRemainingWonCandidates}, received ${active.length}`);
  }
  return active[0];
}

export function fullWinCanaryRequestStatsAreSafe(requests) {
  return Number(requests?.WinOpportunityAttempts || 0) <= D6_R4A_FULL_WIN_CANARY.maxWinAttempts
    && Number(requests?.LoseOpportunity || 0) === 0
    && Number(requests?.PATCH || 0) === 0
    && Number(requests?.DELETE || 0) === 0
    && Number(requests?.Publish || 0) === 0
    && Number(requests?.BPFWrites || 0) === 0
    && Number(requests?.OtherBusinessPOST || 0) === 0
    && Number(requests?.ProductionRequests || 0) === 0
    && Number(requests?.ExternalLLMCalls || 0) === 0;
}

export function expectedActualCountFromFrozenProjection(opportunityToken, actualRows) {
  return (actualRows || []).filter((row) => String(row?.aigw_opportunityid_token || "") === String(opportunityToken)).length;
}

export function assertActualCountMatchesFrozenProjection(actualCount, expectedCount, opportunityToken) {
  if (Number(actualCount) !== Number(expectedCount)) {
    throw new Error(`Actual Count mismatch for ${opportunityToken}: expected ${expectedCount}, received ${actualCount}`);
  }
  return true;
}

export function selectFullLoseCanary(frozenLostCandidates, currentStateByToken, priorActions = {}) {
  if (!Array.isArray(frozenLostCandidates) || frozenLostCandidates.length !== D6_R4B_FULL_LOSE_CANARY.expectedRemainingLostCandidates) {
    throw new Error(`Remaining Lose Candidate Count must be ${D6_R4B_FULL_LOSE_CANARY.expectedRemainingLostCandidates}`);
  }
  const active = frozenLostCandidates.filter((candidate) => {
    const token = String(candidate?.opportunityToken || candidate?.[TOKEN_FIELD] || "");
    const state = currentStateByToken?.[token];
    const prior = priorActions?.[token];
    const expectedActualCount = candidate?.expectedActualCount ?? state?.expectedActualCount;
    const actualCount = state?.actualCount;
    return token
      && Number(state?.statecode) === 0
      && Number(state?.statuscode) === 1
      && (state?.actualclosedate === null || state?.actualclosedate === undefined || state?.actualclosedate === "")
      && Number(state?.opportunityCloseCount) === 0
      && (expectedActualCount === undefined || Number(actualCount) === Number(expectedActualCount))
      && !String(prior?.actionStatus || "").startsWith("Succeeded");
  }).sort((left, right) => String(left?.opportunityToken || left?.[TOKEN_FIELD] || "").localeCompare(String(right?.opportunityToken || right?.[TOKEN_FIELD] || "")));
  if (active.length !== D6_R4B_FULL_LOSE_CANARY.expectedRemainingLostCandidates) {
    throw new Error(`Live Remaining Lose Candidate Count must be ${D6_R4B_FULL_LOSE_CANARY.expectedRemainingLostCandidates}, received ${active.length}`);
  }
  return active[0];
}

export function fullLoseCanaryRequestStatsAreSafe(requests) {
  return Number(requests?.LoseOpportunityAttempts || 0) <= D6_R4B_FULL_LOSE_CANARY.maxLoseAttempts
    && Number(requests?.LoseOpportunitySuccess || 0) <= D6_R4B_FULL_LOSE_CANARY.maxLoseAttempts
    && Number(requests?.WinOpportunityAttempts || 0) === 0
    && Number(requests?.ActualPOST || 0) === 0
    && Number(requests?.TimelinePOST || 0) === 0
    && Number(requests?.SignalPOST || 0) === 0
    && Number(requests?.OtherBusinessPOST || 0) === 0
    && Number(requests?.PATCH || 0) === 0
    && Number(requests?.DELETE || 0) === 0
    && Number(requests?.Publish || 0) === 0
    && Number(requests?.BPFWrites || 0) === 0
    && Number(requests?.ProductionRequests || 0) === 0
    && Number(requests?.ExternalLLMCalls || 0) === 0;
}

export function fullStateActionsRequestStatsAreSafe(requests) {
  return Number(requests?.WinOpportunityAttempts || 0) <= D6_R4C_FULL_STATE_ACTIONS.remainingWinCandidates
    && Number(requests?.LoseOpportunityAttempts || 0) <= D6_R4C_FULL_STATE_ACTIONS.remainingLoseCandidates
    && Number(requests?.WinOpportunitySuccess || 0) <= D6_R4C_FULL_STATE_ACTIONS.remainingWinCandidates
    && Number(requests?.LoseOpportunitySuccess || 0) <= D6_R4C_FULL_STATE_ACTIONS.remainingLoseCandidates
    && Number(requests?.ActualPOST || 0) === 0
    && Number(requests?.TimelinePOST || 0) === 0
    && Number(requests?.SignalPOST || 0) === 0
    && Number(requests?.OtherBusinessPOST || 0) === 0
    && Number(requests?.PATCH || 0) === 0
    && Number(requests?.DELETE || 0) === 0
    && Number(requests?.Publish || 0) === 0
    && Number(requests?.BPFWrites || 0) === 0
    && Number(requests?.ProductionRequests || 0) === 0
    && Number(requests?.ExternalLLMCalls || 0) === 0;
}

export function containsGuid(value) {
  return /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(typeof value === "string" ? value : JSON.stringify(value));
}

export function requestStatsAreSafe(requests) {
  return Number(requests.PATCH || 0) === 0
    && Number(requests.DELETE || 0) === 0
    && Number(requests.Publish || 0) === 0
    && Number(requests.BPFWrites || 0) === 0
    && Number(requests.TeamRoleMembershipChanges || 0) === 0
    && Number(requests.ProductionRequests || 0) === 0
    && Number(requests.ExternalLLMCalls || 0) === 0;
}
