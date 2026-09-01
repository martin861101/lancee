# Collaboration Phase 2

## Existing models extended

Collaboration uses the existing `project_tasks`, `idea_notes`, `project_comments`, `workspace_members`, and `workspace_events` models. Project comments with a `task_id` are the existing task-comment surface; no parallel task, note, or comment system was added.

## Migration strategy

Startup migrations create `task_assignees`, `note_task_links`, and `mentions`, and add nullable `project_comments.created_by`. All additions are backwards-compatible: existing task, note, and comment rows remain valid without collaboration rows, and reads return empty `assignees`, `taskLinks`, and `mentions` collections.

The repository had no durable legacy task-assignee column to backfill. The prior Kanban bucket selector is a browser-local bucket presentation preference, not task ownership, so it remains untouched. If a durable legacy assignee field is introduced by an older deployment, it should be copied into `task_assignees` only after resolving the user to an active member in the task workspace; the legacy field should not be dropped in the same release.

Unassignment timestamps the normalized assignment row instead of deleting it. Reassignment reactivates that row, while the append-only workspace event log retains each assignment/unassignment transition. Disabling a member does not remove historical assignment or mention rows.

## Mention serialization

Editors store mentions as `@[Display Name](user:<user-id>)`. The server extracts the user ID, verifies an active membership in the trusted workspace, and synchronizes unique `mentions` rows. Renderers may display the token as `@Display Name`; the user ID is authoritative when a display name changes.

## Phase 3 boundary

Collaboration handlers append `task.assigned`, `task.unassigned`, `note.task_linked`, `note.task_unlinked`, and `member.mentioned` facts to `workspace_events`. Recipient user IDs are in `participant_refs_json` and `payload.recipients`; the source resource is represented by `entity_type`/`entity_id` and, for mention events, `payload.resource`. Phase 3 should consume unprocessed events and provide idempotent delivery without adding notification delivery calls to collaboration handlers.
