# Paystack payment flow

lancee implements one depth-first payment flow for the current South African,
single-workspace deployment:

```text
invoice details → Paystack hosted checkout → verified webhook → paid invoice
```

It uses Paystack's documented server-side secret-key authentication. There is
no assumed OAuth flow and the secret never enters the browser or SQLite.

## Configuration

Add to the server-only `.env`:

```dotenv
PAYSTACK_SECRET_KEY=sk_test_replace_me
PAYSTACK_BASE_URL=https://api.paystack.co
PAYSTACK_CALLBACK_URL=https://agents.hygridtech.co.za/?payment=paystack
```

Start with an `sk_test_...` key. The Money UI reports `test` or `live` mode from
the key prefix. lancee stores only a short SHA-256 fingerprint and the fact
that the connection comes from the environment.

`PAYSTACK_BASE_URL` exists for deterministic local verification. Production
requires HTTPS. Do not point it at an untrusted proxy.

In the Paystack dashboard, configure the webhook:

```text
https://agents.hygridtech.co.za/api/webhooks/paystack
```

## User flow

1. Open **Money**.
2. Confirm the Paystack card says **Connected** and check whether it is test or
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
| GET | `/api/money/invoices` | Workspace session |
| POST | `/api/money/paystack/payment-links` | Workspace session + `Idempotency-Key` |
| POST | `/api/webhooks/paystack` | Paystack HMAC signature |

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
| `payment_connections` | Workspace provider state, mode, credential source, and non-secret fingerprint |
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
- Stripe and PayPal remain labelled previews.

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
SQLite, and persistence after restart.

## Official provider references

- Authentication: <https://paystack.com/docs/api/authentication/>
- Transaction initialization: <https://paystack.com/docs/api/transaction/>
- Webhook verification: <https://paystack.com/docs/payments/webhooks/>
