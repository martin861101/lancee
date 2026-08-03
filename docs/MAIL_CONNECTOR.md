# Messages and mail connector

## What was added

Messages is a workspace mail client backed by IMAP for incoming mail and SMTP
for outgoing mail. It is available as **Messages** in the dashboard sidebar and
as **Mail** in the Connections catalog.

The user-facing app includes:

- mailbox provider discovery and guided manual setup;
- live folders and server-side message search;
- message reading with sanitized HTML and plain-text fallback;
- unread-state updates, compose, reply, Cc, and Bcc;
- account health, refresh, and disconnect controls; and
- native automation rules for new incoming messages.

One shared mailbox can be connected per workspace. Workspace owners manage its
credential. Authenticated workspace collaborators can use the connected
mailbox and manage message rules.

## Account setup

1. Open **Messages** and enter the mailbox email address.
2. Select **Detect settings**.
3. For a recognized provider, review the provider-specific app-password or
   access instructions and enter the username and password.
4. For an unrecognized provider, open **Show server settings** and copy the
   IMAP/SMTP settings from the provider's help documentation.
5. Select **Test and connect**. The backend connects to both IMAP and SMTP
   before saving anything.

Discovery recognizes Gmail/Google Workspace, Microsoft 365/Outlook, Yahoo,
iCloud, Fastmail, and Zoho by email domain or MX records. Unknown domains get
safe conventional suggestions (`imap.<domain>` and `smtp.<domain>`) but remain
explicitly marked as manual so the user knows to verify them.

Many providers do not accept the normal account password when multi-factor
authentication is enabled. Create a provider app password and enter it in the
password field. Microsoft 365 tenants can disable password-based IMAP or SMTP
at the organization level; an administrator must allow those protocols before
this password connector can work.

## Security model

- Mail passwords are encrypted with AES-256-GCM through the existing token
  vault and `ENCRYPTION_MASTER_KEY`.
- Passwords are never returned by an API and never placed in automation logs.
- The owner can update settings without re-entering the saved password.
- Both IMAP and SMTP are tested before a credential is persisted.
- TLS certificates must be valid and TLS 1.2 or newer is required.
- SMTP submission on a non-implicit-TLS port requires STARTTLS.
- Hostnames are resolved before connecting. Loopback, link-local, and private
  addresses are rejected to prevent internal network probing.
- `MAIL_ALLOW_PRIVATE_HOSTS=true` is honored only outside production for local
  mail-server development.
- Readable message content is capped at 10 MB. HTML is sanitized server-side;
  remote images and unsafe elements are removed.

Production must set a 64-character hex `ENCRYPTION_MASTER_KEY`. Rotation uses
`ENCRYPTION_MASTER_KEY_PREVIOUS`, following the existing token-vault process.

## Message automation rules

Rules are evaluated only for new messages received after the account was
connected or last synchronized. The background poller defaults to every 60
seconds and can be changed with `MAIL_SYNC_INTERVAL_MS`; values below 30 seconds
are clamped to 30 seconds.

A rule can contain any combination of:

- **Sender contains** — matched against all `From` addresses;
- **Recipient contains** — matched against `To` and `Cc` addresses;
- **Subject contains**;
- **Keywords** — matched case-insensitively against subject and plain-text body;
  and
- **All/any mode** — controls how configured conditions are combined. In all
  mode every keyword must match; in any mode one keyword is enough.

The instruction passed to the automation supports these substitutions:

| Field | Value |
| --- | --- |
| `{{sender}}` | Comma-separated sender addresses |
| `{{recipient}}` | Comma-separated To and Cc addresses |
| `{{subject}}` | Message subject |
| `{{body}}` | Plain-text body, capped before dispatch |
| `{{messageId}}` | RFC message ID, with UID fallback |

Only active automations with `execution: core` are dispatched. Edge/n8n
automations are rejected when a rule is created or updated and checked again
when a message is evaluated. Message triggers do not call n8n.

The `mail_rule_events` table has a unique workspace/rule/message key. A message
therefore starts a given rule at most once, even when the user refreshes,
polling overlaps, or the same IMAP message is returned again.

## Persistence

The connector adds three workspace-scoped tables:

- `mail_accounts` — encrypted credential, server settings, health, and IMAP
  synchronization cursor;
- `mail_automation_rules` — match conditions, instruction template, native
  automation relationship, and enabled state; and
- `mail_rule_events` — idempotent message/rule claims and resulting automation
  run IDs.

The schema runs on PostgreSQL and the local SQLite fallback. Disconnecting a
mailbox deletes the credential but leaves rules available for a future mailbox
connection.

## API surface

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/mail/discover` | Discover provider settings and instructions |
| `GET/PUT/DELETE` | `/api/mail/account` | Read, connect/update, or disconnect the mailbox |
| `GET` | `/api/mail/folders` | List selectable IMAP folders |
| `GET` | `/api/mail/messages` | List/search message summaries in a folder |
| `GET` | `/api/mail/messages/:uid` | Read and mark one message seen |
| `POST` | `/api/mail/send` | Send mail with the connected SMTP account |
| `POST` | `/api/mail/sync` | Fetch new mail and evaluate rules immediately |
| `GET/POST` | `/api/mail/rules` | List or create message rules |
| `PUT/DELETE` | `/api/mail/rules/:id` | Update or delete a message rule |

Mutating operations use the application's existing origin and idempotency
protections. Account changes and disconnects require the workspace owner.

## Deployment and verification

The application host needs outbound DNS plus access to the provider's IMAP and
SMTP ports, commonly 993 and either 465 or 587. Configure:

```dotenv
ENCRYPTION_MASTER_KEY=<64-character-hex-key>
MAIL_SYNC_INTERVAL_MS=60000
MAIL_ALLOW_PRIVATE_HOSTS=false
```

Run the focused persistence/idempotency verification and the normal checks:

```bash
pnpm verify:mail
pnpm build
pnpm lint
```

`verify:mail` uses an isolated temporary SQLite database and does not contact a
real mail provider. A real account is tested only when an owner submits the
Messages setup form.

## Current limits

- The connector supports username/password or provider app-password login, not
  OAuth mail authorization.
- One shared mailbox is supported per workspace.
- The reader displays attachment metadata but does not download attachments.
- Sending file attachments and rich-text compose are not included yet.
- Mail stays on the provider; the application reads it live and persists only
  account settings, synchronization state, rules, and trigger records.
