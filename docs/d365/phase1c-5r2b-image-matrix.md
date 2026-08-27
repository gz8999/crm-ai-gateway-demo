# Phase 1C-5R2B Image Matrix

No Images were registered. This is the exact future configuration and uses no All Attributes image.

| Step | Image | Alias | Fields | Consumer/reason |
|---|---|---|---|---|
| PreValidation Update | PreImage | `PreImage` | Complete Actual snapshot: lookup, currency, annual, 12 Revenue fields | `EntityMapper.Merge` supplies old state for validation and reparent exclusion |
| PreOperation Update | PreImage | `PreImage` | Complete Actual snapshot: lookup, currency, annual, 12 Revenue fields | `EntityMapper.Merge` supplies missing months before child total calculation |
| PostOperation Create | PostImage | `PostImage` | Complete Actual snapshot: lookup, currency, annual, 12 Revenue fields | `EntityMapper.ToActual` identifies the new parent after persistence |
| PostOperation Update | PreImage | `PreImage` | Complete Actual snapshot: lookup, currency, annual, 12 Revenue fields | Identifies old parent for reparent/delete-style recalculation |
| PostOperation Update | PostImage | `PostImage` | Complete Actual snapshot: lookup, currency, annual, 12 Revenue fields | Identifies new parent after persistence |
| PostOperation Delete | PreImage | `PreImage` | Complete Actual snapshot: lookup, currency, annual, 12 Revenue fields | Target is unavailable after delete; identifies old parent |

Create PreValidation and PreOperation use Target and do not need an image. Every configured image uses the exact alias consumed by `PluginRuntime`. The complete set is deliberate: `EntityMapper.ToActual` enumerates the annual, currency, and all monthly fields even when a particular stage only needs the Opportunity ID for its final operation.
