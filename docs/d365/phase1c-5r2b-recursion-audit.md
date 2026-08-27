# Phase 1C-5R2B SharedVariables and Recursion Audit

The recursion guard is offline-audited from the source and CI assembly:

1. The Plugin is registered only on `aigw_actualmanagement`; it is not registered on `opportunity`.
2. Each Plugin stage calls `PluginRuntime.Skip` with a stage-specific marker.
3. `SharedVariablesAdapter` copies the SDK `ParameterCollection` through an explicit `foreach`; Core receives an `IDictionary<string, object>` and has no Microsoft.Xrm.Sdk reference.
4. `ExecutionGuard.ShouldSkip` returns true when `Context.Depth > 1` or the marker already exists.
5. On the first invocation, the marker is explicitly written back with `Context.SharedVariables[marker] = value`; a copied Dictionary is never assumed to write back automatically.
6. Parent updates are issued only when the rounded value changes, reducing unnecessary downstream activity.
7. The Plugin never listens to the parent Opportunity update, so the parent write cannot re-enter this assembly through a registered Opportunity step.

The guard is a defense in depth measure. It does not replace the registration boundary or the business invariant that each Opportunity has at most one Actual Management record.
