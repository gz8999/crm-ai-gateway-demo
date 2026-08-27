import test from "node:test";
import assert from "node:assert/strict";
import { compareViewDefinition, createViewWithReadback } from "../scripts/dataverse/lib/phase1c3-view-reconciliation.mjs";

const view = {
  name: "实绩管理 - AI Demo",
  returnedtypecode: "aigw_actualmanagement",
  querytype: 0,
  isquickfindquery: false,
  fetchxml: '<fetch><entity name="aigw_actualmanagement"><attribute name="aigw_name"/><attribute name="aigw_opportunityid"/><attribute name="aigw_expectedorderdate"/><attribute name="aigw_annualactualrevenue"/><attribute name="aigw_annualactualrevenue_base"/><attribute name="modifiedon"/><order attribute="modifiedon" descending="true"/></entity></fetch>',
  layoutxml: '<grid name="resultset" object="11722" jump="aigw_name" select="1" icon="1" preview="1"><row name="result" id="aigw_actualmanagementid"><cell name="aigw_name" width="240"/><cell name="aigw_opportunityid" width="240"/><cell name="aigw_expectedorderdate" width="130"/><cell name="aigw_annualactualrevenue" width="150"/><cell name="aigw_annualactualrevenue_base" width="170"/><cell name="modifiedon" width="140"/></row></grid>',
};

test("Phase 1C-3 validates the six-column general view", () => {
  assert.deepEqual(compareViewDefinition(view, 11722), []);
});

test("Phase 1C-3 rejects filters and link-entities", () => {
  const invalid = { ...view, fetchxml: view.fetchxml.replace("</entity>", '<filter/><link-entity name="opportunity"/></entity>') };
  assert.deepEqual(compareViewDefinition(invalid, 11722).filter((item) => item.startsWith("fetch_")), ["fetch_filter", "fetch_link_entity"]);
});

test("Phase 1C-3 accepts a server-created view after POST timeout without retry", async () => {
  let posts = 0;
  let reads = 0;
  const result = await createViewWithReadback({
    postView: async () => { posts += 1; throw new Error("timeout"); },
    readViews: async () => (++reads >= 2 ? [view] : []),
    objectTypeCode: 11722,
    pollAttempts: 3,
    pollIntervalMs: 0,
  });
  assert.equal(result.status, "created_after_post_error");
  assert.equal(posts, 1);
  assert.equal(result.postRetried, false);
});

test("Phase 1C-3 blocks a mismatched or duplicate existing view", async () => {
  await assert.rejects(createViewWithReadback({ postView: async () => ({}), readViews: async () => [{ ...view, querytype: 1 }], objectTypeCode: 11722 }), (error) => error.code === "definition_mismatch");
  await assert.rejects(createViewWithReadback({ postView: async () => ({}), readViews: async () => [view, view], objectTypeCode: 11722 }), (error) => error.code === "duplicate_view_name");
});
