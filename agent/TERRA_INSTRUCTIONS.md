Implement the finding from the Sol review below.

Treat the review as the specification. Do not perform another broad repository audit and do not redesign the AI architecture.

Work only in the files/subsystems required by these findings.

Fix this 1 item:

1. ui_action is missing from the frontend AIChatMeta union and parseChatMeta allowlist. Valid responses using the new intent are silently normalized to conversation, dropping toolsUsed    and accurate metadata. See ui/src/lib/api.ts:61 and ui/src/lib/api.ts:519.

After implementation:

* run targeted tests/checks for affected areas;
* run the appropriate build/typecheck;
* inspect git diff for accidental unrelated changes;
* do not refactor unrelated code;
* do not commit or push;
* report each finding as FIXED or NOT FIXED with a short reason.

Follow AGENTS.md token/context rules.
