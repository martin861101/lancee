Implement the finding from the Sol review below.

Treat the review as the specification. Do not perform another broad repository audit and do not redesign the AI architecture.

Work only in the files/subsystems required by these findings.

Fix these items:

- P1 — Medium-confidence results are not persisted for review or notified. The    runtime merely returns review_required; Core discards that result when
    completing the automation run, and no review item or notification is
    created. server/workflow-builder.mjs:235, server/index.mjs:1690
  - P1 — Users do not receive the required complete preview. The backend
    attaches preview, but the client type omits it and the UI never renders it.
    The approval card shows only summary prose and the definition hash—not exact    conditions, ordered actions, confidence policy, assumptions, warnings, or
    possible records. server/index.mjs:8738, src/lib/api.ts:316, src/components/    dashboard/WorkspaceChat.tsx:399
  - P1 — Capability drift remains. WORKFLOW_CAPABILITIES, CORE_TOOL_CATALOG, and    the assistant-facing create_workflow.tools enum are still separate
    handwritten lists. The canonical entries also acquire handlers only through
    a later wrapper rather than defining the required runtime/logging behavior
    themselves. server/workflow-builder.mjs:10, server/core.mjs:3, server/
    lancee-mcp.mjs:60
  - P1 — all/any trigger semantics are not represented by workflow definitions.
    Validation has no match-mode field, and activation always stores match_mode
    = 'all'; an any workflow cannot be created. server/workflow-builder.mjs:81,
    server/database.mjs:5780
  - P1 — Project and task actions bypass existing canonical services. Both
    handlers perform separate raw inserts. In particular, project creation
    bypasses the existing automation project service and its established job-
    card/draft-invoice behavior. server/database.mjs:7554, server/
    database.mjs:7659
  - P1 — Required observability is incomplete and logs raw email content.
    step.input_resolved records the extraction subject/body; storage
    sanitization removes credential-shaped keys but not body. There are also no
    workflow trigger matched/skipped, extraction-failed, action-started, or
    action-failed events. server/workflow-builder.mjs:227, server/
    database.mjs:55
  - P1 — The planner is a fixed regex builder, not the required context-aware
    structured planner. It receives only the objective, not registered schemas,
    supported triggers, connection state, or persisted partial planning state. A    clarification answer cannot resume the original proposal. server/workflow-
    builder.mjs:131, server/index.mjs:8621
  - P1 — The claimed E2E test bypasses the actual vertical slice. It injects a
    manually assembled runtime plan and invokes executeWorkflowDefinition
    directly rather than exercising the real assistant endpoint, displayed
    preview, mail polling/claiming, queue, and Core worker. It also omits most
    explicitly required failure, rollback, denial, confidence, isolation, and
    legacy cases. scripts/verify-workflow-builder.mjs:27

After implementation:

* run targeted tests/checks for affected areas;
* run the appropriate build/typecheck;
* inspect git diff for accidental unrelated changes;
* do not refactor unrelated code;
* do not commit or push;
* report each finding as FIXED or NOT FIXED with a short reason.

Follow AGENTS.md token/context rules.
