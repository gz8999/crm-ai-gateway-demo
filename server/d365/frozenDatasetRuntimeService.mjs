import { createPilotRuntimeService } from "../pilot/pilotRuntimeService.mjs";
import { createFrozenDatasetReader } from "./frozenDatasetReader.mjs";
import { D365_FROZEN_DEFAULT_OPPORTUNITY, D365_FROZEN_DEPARTMENTS, D365_FROZEN_EXPECTED_COUNTS, assertFullFrozenScope, buildFrozenScope } from "./frozenDatasetContract.mjs";
import { SCORE_SHOWCASE_TOKENS } from "../decision/executiveDemoContract.mjs";

export function createFrozenDatasetRuntimeService({ client, env = process.env, root = process.cwd(), now = () => new Date(), reader, startupDiagnostics = null } = {}) {
  return createPilotRuntimeService({
    client,
    env,
    root,
    now,
    reader: reader || createFrozenDatasetReader({ client, env, root, now, startupDiagnostics }),
    buildScope: buildFrozenScope,
    assertScope: assertFullFrozenScope,
    defaultOpportunity: D365_FROZEN_DEFAULT_OPPORTUNITY,
    departments: D365_FROZEN_DEPARTMENTS,
    expectedCounts: D365_FROZEN_EXPECTED_COUNTS,
    sourceLabel: "D365 Frozen Dataset",
    showcaseTokens: SCORE_SHOWCASE_TOKENS,
    startupDiagnostics,
  });
}
