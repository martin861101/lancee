# Lancee Cleanup & Stabilisation Actions

🔴 P0 — Broken / confusing behaviour

[x] Fix Connections → Manage so it opens connection management instead of disconnecting the integration.

[x] Move Disconnect actions into the connection-management screen and treat them as destructive actions.

[x] Add proper confirmation before disconnecting Google Workspace, SMTP/IMAP, payment or other integrations.

[x] Add ability to disconnect an SMTP/IMAP mailbox cleanly.

[x] Add Reconnect / Re-authorise behaviour for expired or broken connections.

[ ] Standardise connection states: Connected, Syncing, Attention Required, Disconnected, Error.

[ ] Audit buttons, menus and actions throughout Lancee for dead, incorrect or placeholder behaviour.

[ ] Improve API/network error handling so failures don't leave screens in broken loading states.


🟠 P1 — Meetings

[ ] Redesign/polish the meeting room layout.

[x] Add proper pre-join camera/microphone preview.

[x] Build meeting Settings.

[x] Allow camera, microphone and speaker device selection.

[x] Allow device switching while already in a meeting.

[ ] Improve participant grid and active-speaker behaviour.

[ ] Improve screen-sharing layout and controls.

[ ] Add participant panel.

[ ] Add copy/invite-link UX.

[ ] Clearly separate Leave meeting from End meeting for everyone.

[ ] Add appropriate host controls and permissions.

[ ] Add connection/network quality indication.

[ ] Test meeting UX with 1, 2 and multiple participants.

[ ] Test camera, microphone, screen share and reconnect behaviour against the real LiveKit deployment.

[ ] Complete responsive/mobile meeting layout.

[ ] Add proper empty/loading/error/reconnecting states.

[ ] Do not add recording/transcription/AI meeting intelligence yet.


🟠 P1 — Google Workspace & Calendar

The current branch already requests Google Calendar, Gmail and Drive permissions as part of the unified Google Workspace OAuth work.

[ ] Build the actual Google Calendar integration.

[ ] Add Lancee Calendar UI.

[ ] Support Month / Week / Day / Agenda views.

[ ] Import/sync Google Calendar events.

[ ] Show Lancee meetings in Calendar.

[ ] Show project deadlines and important tasks in Calendar.

[ ] Define which Lancee events are local-only versus written back to Google.

[ ] Handle recurring Google events.

[ ] Handle cancelled/changed events.

[ ] Handle timezone differences correctly.

[ ] Add Calendar sync status and last-sync information.

[ ] Avoid duplicate events when Lancee meetings and Google events refer to the same meeting.

[ ] Review whether current Google scopes are exactly what Lancee needs before production OAuth verification.


🟠 P1 — Projects

[ ] Redesign the project detail experience.

[ ] Reduce information overload.

[ ] Establish a clear project header with client, status, deadline and primary actions.

[ ] Create proper project sections/tabs such as Overview / Tasks / Files / Messages / Meetings / Money / Activity.

[ ] Improve project creation flow.

[ ] Improve editing project details.

[ ] Improve project status management.

[ ] Improve task management inside projects.

[ ] Make project deadlines/calendar integration obvious.

[ ] Improve client ↔ project relationship UX.

[ ] Surface project-related meetings properly.

[ ] Surface related invoices/quotes without forcing users into another disconnected workflow.

[ ] Break up the oversized WorkPanel.tsx; it is currently roughly 78 KB and has accumulated too many responsibilities.

[ ] Review responsive/mobile project UX.


🟠 P1 — Mail / Messages

[ ] Build proper Connected Mailboxes management.

[ ] Add SMTP/IMAP disconnect.

[ ] Add reconnect.

[ ] Add Edit Configuration where appropriate.

[ ] Add Test IMAP.

[ ] Add Test SMTP.

[ ] Display mailbox health.

[ ] Display last successful sync.

[ ] Add manual Sync Now.

[ ] Improve errors for authentication/TLS/connection failures.

[ ] Verify disconnecting a mailbox does not destroy unrelated rules/data.

[ ] Clearly distinguish Google Gmail connections from manually configured IMAP/SMTP accounts.

[ ] Review Inbox/Sent/Drafts UX.

[ ] Make mail-to-client/project linking easier.


🟠 P1 — Invoicing & Quotes

The underlying invoice system is more developed than the current presentation suggests: Lancee already has multiple templates and automated PDF rendering verification.

[ ] Completely polish the invoice templates.

[ ] Make the templates visually distinct rather than slight variations.

[ ] Create Modern / Minimal / Creative / Classic templates.

[ ] Improve invoice PDF typography and spacing.

[ ] Improve line-item presentation.

[ ] Improve totals/VAT/tax presentation.

[ ] Improve payment details.

[ ] Support business logo cleanly.

[ ] Support company registration/VAT information.

[ ] Support bank/payment information.

[ ] Add workspace-level default invoice settings.

[ ] Add default payment terms.

[ ] Add custom footer/notes.

[ ] Improve invoice preview.

[ ] Ensure PDF output matches the preview.

[ ] Bring quotes and invoices under the same document design system.

[ ] Test long invoices and multi-page PDFs.

[ ] Test long client/business names and unusual line items.


🟡 P2 — Connections UX

[ ] Create a consistent connection-management screen.

[ ] Show account/email connected to each service.

[ ] Show enabled capabilities such as Gmail / Calendar / Drive.

[ ] Show permissions/scopes where useful.

[ ] Show last sync.

[ ] Show connection health.

[ ] Provide Reconnect.

[ ] Put Disconnect in a Danger Zone.

[ ] Remove obsolete integrations from the UI.

[ ] Make Google Workspace feel like one coherent integration, rather than three unrelated connectors.

[ ] Keep the integrations list focused on Lancee's actual product direction.


🟡 P2 — Settings

[ ] Reorganise Settings into logical categories.

[ ] Workspace/profile.

[ ] Branding.

[ ] Notifications.

[ ] Mail.

[ ] Calendar.

[ ] Meetings.

[ ] Invoicing.

[ ] Team/permissions.

[ ] Connections.

[ ] Security.

[ ] Ensure settings aren't duplicated elsewhere in the application.

[ ] Standardise Save / Saved / Unsaved Changes behaviour.


🟡 P2 — Navigation & Information Architecture

The current app still exposes a large number of top-level destinations through the application shell.

[ ] Audit every sidebar item.

[ ] Remove obsolete/experimental items.

[ ] Decide whether Storefront still belongs.

[ ] Review Services.

[ ] Review Workspace Builder visibility after onboarding.

[ ] Review distinction between Automations and Workflows.

[ ] Review whether Results needs to be top-level.

[ ] Make Calendar first-class.

[ ] Avoid making Meetings another unnecessary permanent sidebar destination.

[ ] Reduce overall navigation complexity.


A cleaner target is roughly:

HOME

Clients
Projects
Calendar
Messages
Files
Ideas

BUSINESS

Invoicing
Automations
Analytics

WORKSPACE

Team
Connections
Settings

🟡 P2 — Product-wide UI/UX cleanup

[ ] Restore consistent premium Lancee visual language.

[ ] Standardise page headers.

[ ] Standardise content widths.

[ ] Standardise cards.

[ ] Standardise border radius.

[ ] Standardise shadows/borders.

[ ] Standardise buttons and button hierarchy.

[ ] Standardise inputs/selects.

[ ] Standardise dropdown menus.

[ ] Standardise tabs.

[ ] Standardise modals.

[ ] Standardise confirmation dialogs.

[ ] Standardise side panels/drawers.

[ ] Standardise tables.

[ ] Standardise status badges.

[ ] Standardise icons.

[ ] Improve typography hierarchy.

[ ] Fix inconsistent spacing.

[ ] Audit dark/light theme behaviour if both remain supported.

[ ] Improve responsive behaviour throughout.

[ ] Restore/fix intentional animations without adding distracting motion.


🟡 P2 — States & feedback

[ ] Proper loading states.

[ ] Skeletons where appropriate.

[ ] Empty states that tell the user what to do next.

[ ] Consistent success feedback.

[ ] Consistent error feedback.

[ ] Consistent confirmation dialogs.

[ ] Unsaved-change warnings.

[ ] Disabled-state explanations.

[ ] Offline/network failure behaviour.

[ ] Retry behaviour.

[ ] Connection-loss handling.


🔵 P3 — Codebase cleanup

[ ] Break App.tsx into application shell/router/feature ownership instead of allowing it to continue growing.

[ ] Break WorkPanel into project-specific components.

[ ] Review other unusually large components.

[ ] Move feature-specific state/API calls into feature modules.

[ ] Remove dead components.

[ ] Remove dead CSS.

[ ] Remove obsolete assets.

[ ] Remove deprecated integrations.

[ ] Review the large unused/ area so agents don't treat historical documentation as current requirements.

[ ] Establish AGENT_LANCEE.md as the definitive current product/architecture specification.

[ ] Document deprecated/future functionality explicitly.

[ ] Review TODO/FIXME/temporary implementation comments.

[ ] Remove old compatibility code where it is genuinely no longer required.


🔵 P3 — Quality & regression protection

[ ] Add tests for connection/reconnection/disconnection.

[ ] Add Google OAuth regression tests.

[ ] Add mailbox connection tests.

[ ] Add Calendar sync tests.

[ ] Add meeting lifecycle tests.

[ ] Add project CRUD tests.

[ ] Add invoice generation tests.

[ ] Add permissions/workspace-isolation tests.

[ ] Test refresh/deep-link behaviour for major screens.

[ ] Test multiple workspaces/users.

[ ] Test mobile layouts.

[ ] Run accessibility checks.

[ ] Run production build/lint/type-check/test verification.

[ ] Perform a final independent agent audit after cleanup.

