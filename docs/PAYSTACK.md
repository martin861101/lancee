# Paystack payment flow

lancee implements one depth-first payment flow for South African workspaces:

```text
invoice details → Paystack hosted checkout → verified webhook → paid invoice
```

It uses Paystack's documented server-side secret-key authentication. There is
no assumed OAuth flow. A workspace owner submits a key over the authenticated
Connections form; the browser immediately discards it after the backend
encrypts and stores it.

## Configuration

Open **Connections → Paystack → Connect**, then enter the workspace's
`sk_test_...` or `sk_live_...` key. The backend encrypts it with AES-256-GCM
using the server session secret and stores only ciphertext plus a short
SHA-256 fingerprint.

The server-only environment key remains an optional bootstrap/fallback:

```dotenv
PAYSTACK_SECRET_KEY=sk_test_replace_me
PAYSTACK_BASE_URL=https://api.paystack.co
PAYSTACK_CALLBACK_URL=https://lancee.hookitupservices.com/?payment=paystack
```

Start with an `sk_test_...` key. The Connections and Money UIs report `test` or
`live` mode from the key prefix.

`PAYSTACK_BASE_URL` exists for deterministic local verification. Production
requires HTTPS. Do not point it at an untrusted proxy.

Copy the workspace webhook shown in Connections into the matching Paystack
dashboard:

```text
https://lancee.hookitupservices.com/api/webhooks/paystack/{workspaceId}
```

The unscoped `/api/webhooks/paystack` route remains for the environment-key
fallback.

## User flow

1. Open **Connections** and connect Paystack for the workspace.
2. Open **Money**, confirm the Paystack card says **Connected**, and check whether it is test or
   live mode.
3. Select **Create payment link**.
4. Enter the client, email, project, ZAR amount, description, and optional due
   date.
5. Confirm creation. lancee initializes a hosted Paystack checkout but does not
   email, message, or charge the client.
6. Review or copy the returned checkout link, then choose how to share it.
7. A verified `charge.success` webhook reconciles the invoice as paid.

The current flow intentionally supports ZAR only. Multi-currency work remains a
later roadmap item.

## Server routes

| Method | Route | Authentication |
| --- | --- | --- |
| GET | `/api/money/paystack/status` | Workspace session |
| POST | `/api/money/paystack/connection` | Owner session + `Idempotency-Key` |
| POST | `/api/money/paystack/disconnect` | Owner session + `Idempotency-Key` |
| GET | `/api/money/invoices` | Workspace session |
| POST | `/api/money/paystack/payment-links` | Workspace session + `Idempotency-Key` |
| POST | `/api/webhooks/paystack/:workspaceId` | Matching workspace Paystack HMAC signature |
| POST | `/api/webhooks/paystack` | Environment-fallback Paystack HMAC signature |

Initialization calls:

```http
POST https://api.paystack.co/transaction/initialize
Authorization: Bearer <PAYSTACK_SECRET_KEY>
```

The request carries amount in currency subunits, client email, `ZAR`, a stable
lancee provider reference, the callback URL, and bounded invoice/workspace
metadata.

## Persistence

| Table | Responsibility |
| --- | --- |
| `payment_connections` | Workspace provider state, mode, AES-GCM ciphertext, credential source, and non-secret fingerprint |
| `invoices` | Normalized invoice snapshot and immutable provider reference |
| `payment_links` | Initialization state, checkout URL, access code, idempotency request hash, and provider result |
| `payment_events` | Deduplicated webhook hash and processing outcome without raw payload storage |

Database triggers reject changes to invoice and payment-link provider
references after insertion.

## Webhook security and reconciliation

The webhook route receives the raw request body before JSON parsing. It
recomputes Paystack's `x-paystack-signature` as HMAC-SHA512 with the server
secret and compares it in constant time.

A signed event marks an invoice paid only when:

- the event type is `charge.success`;
- the provider reference matches a known Paystack payment link;
- the payment link belongs to the workspace encoded in the webhook URL;
- provider status is `success`;
- amount exactly matches the stored currency-subunit amount;
- currency exactly matches the stored currency.

Unknown, irrelevant, or mismatched signed events are acknowledged but do not
change money records. Exact duplicates do not reprocess. Raw provider payloads
are not retained; lancee stores a hash and normalized result.

## Honest boundaries

- Paystack checkout initialization and webhook reconciliation are live when a
  key is configured.
- The app creates a hosted link; it does not directly charge stored cards.
- Nothing is sent to a client automatically.
- Refunds, partial payments, disputes, transaction verification recovery, tax,
  and multi-currency are not yet implemented.
- Unsupported payment providers are not presented as connectable.

## Verification

Run:

```bash
pnpm build
pnpm lint
pnpm verify:paystack
```

The verifier uses a temporary local Paystack stub. It never contacts Paystack
or creates a real charge. It checks server-side authorization, request shape,
idempotent initialization, immutable references, signature rejection, amount
matching, successful reconciliation, duplicate handling, secret absence from
the database, and persistence after restart.

## Official provider references

- Authentication: <https://paystack.com/docs/api/authentication/>
- Transaction initialization: <https://paystack.com/docs/api/transaction/>
- Webhook verification: <https://paystack.com/docs/payments/webhooks/>
