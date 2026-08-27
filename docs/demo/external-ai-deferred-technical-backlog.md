# External AI Deferred Technical Backlog

Status: **Controlled Validation Pending**. This backlog does not block the deterministic executive demo.

## Frozen Findings

- The current provider has returned legacy or incompatible field structures during controlled validation.
- Provider Transport v7 has not passed strict contract and repeatability gates.
- Provider Request Compatibility Ready remains false.
- Provider Transport Repeatability Ready remains false.
- Real Canary Authorized remains false.
- The current Goal 4A run retained 5/8 scenario snapshots after consuming the bounded 16-call budget; three earlier scenario responses were not persisted and are not counted as validated.

All R2-R6 evidence remains unchanged. GOAL 4A does not modify the Provider contract, execute a probe, select a real Canary, or call an external model.

## Post-Demo Options

1. Redesign the DeepSeek profile around a smaller transport contract.
2. Compare Pro and Flash serialization behavior with synthetic-only probes.
3. Evaluate a simpler strict tool schema while preserving Evidence and Safety requirements.
4. Evaluate another approved provider behind the same server-side gate.
5. Require repeatability and real-Canary authorization before exposing any external capability.

No item may enable CRM writeback or production access implicitly.
