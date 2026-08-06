# WhatsApp connector (Baileys)

The Connections tab includes an owner-only WhatsApp connector. The owner enters
their own number in international format, starts the connection, and scans the
QR code in WhatsApp → Linked devices → Link a device.

## What it does

- Runs Baileys in the trusted Express backend; the browser never receives a
  WhatsApp credential.
- Stores the connection configuration per workspace and keeps the Baileys
  session under `.runtime/whatsapp/<workspace-id>` with a private directory.
- Verifies that the WhatsApp account returned by Baileys matches the configured
  self number before marking the connection live.
- Sends platform notifications only to that verified number. There is no API
  route or assistant tool that accepts an arbitrary WhatsApp recipient.
- Restores saved sessions at backend startup and automatically reconnects after
  transient socket closures, including Baileys `428 Connection Closed` events,
  with bounded exponential backoff.
- Requires the workspace owner for QR, connect, disconnect, and test-message
  actions. The test message requires an explicit confirmation in the UI and on
  the API request.

## Setup

Install dependencies and restart the backend:

```bash
pnpm install --frozen-lockfile
pnpm start
```

`@whiskeysockets/baileys` and `qrcode` are declared in `package.json` and
`pnpm-lock.yaml`. The QR image is generated server-side and returned only to an
authenticated owner while the pairing flow is active.

## Platform notification events

When enabled in the connector panel, the backend sends the following existing
workspace events to the verified self number: workspace setup completion, new
mail, sent mail, and invoice sent. Delivery is best-effort and never blocks the
primary workspace operation. If a transient disconnect is in progress, the
runtime retries delivery briefly after reconnecting; permanently unavailable
sessions are logged as skipped.

## Security and operations

Baileys is an unofficial WhatsApp Web client. Review WhatsApp’s terms and use a
dedicated business account where appropriate. Treat `.runtime/whatsapp` as
credential material: keep the host private, back it up securely, and do not
include it in source control or public backups. Disconnecting removes the saved
session. If the QR is rejected, the account changes, or WhatsApp reports a
logout, disconnect and scan a new QR code. Keep the `.runtime` volume persistent
in Docker so automatic startup restoration can reuse the linked session.

The connector is intentionally single-process for its live socket. A
multi-instance deployment should pin a workspace to one worker or move the
Baileys auth state and socket ownership into a dedicated service before scaling
horizontally.

Run the deterministic lifecycle check without contacting WhatsApp:

```bash
pnpm verify:whatsapp
```
