# Core vs .Edge Model & Security Protocol

# Technical Architecture: Core vs. Edge Model & Security Protocol

## 1. Executive Summary

This document defines the production system architecture for a dual-layer, multi-tenant agentic SaaS platform. The architecture separates central intelligence, state, and security (**The Core**) from client-specific third-party integration routing (**The Edge**).

This decoupled design prevents external API dependencies from blocking core agentic logic, ensures strict multi-tenant data isolation, and optimizes resource utilization at scale.

***

## 2. System Architecture Breakdown

```
 +-------------------------------------------------------------------------+
 |                                THE CORE                                 |
 |  (Custom Node.js/Python Server - Stateless, Scalable, ACID Compliant)   |
 |                                                                         |
 |  +--------------------+   +-------------------+   +------------------+  |
 |  |  AI Orchestrator   |   | Token Encryption  |   | Platform Backend |  |
 |  | (LangGraph/Agents) |   |    Vault (KMS)    |   |  & Core API Keys |  |
 |  +---------+----------+   +---------+---------+   +--------+---------+  |
 +------------|------------------------|----------------------|------------+
              |                        |                      |
              v                        v                      v
   +----------------------------------------------------------------------+
   |                      PostgreSQL Database (RLS)                       |
   |              Encrypted Tokens | Tenant Data | State                  |
   +-----------------------------------|----------------------------------+
                                       |
                   Internal Decrypted Payloads over VPC
                                       v
 +-------------------------------------------------------------------------+
 |                                THE EDGE                                 |
 |               (Isolated Queue-Mode n8n Worker Instances)                |
 |                                                                         |
 |  +---------------------+   +------------------+   +------------------+  |
 |  | Client Webhook Rec. |   | Pre-built Nodes  |   | Integration Edge |  |
 |  |  (Ephemeral Exec)   |   | (Stripe/Slack)   |   | Retries & Maps   |  |
 |  +---------------------+   +------------------+   +------------------+  |
 +-------------------------------------------------------------------------+

```

### 2.1 The Core (Intelligence, State & Security)

The Core is the central backend system (Node.js/TypeScript or Python) built for low latency and high concurrency. It is the sole component with access to the primary database.

* **AI & Agentic Orchestration:** Executes multi-step reasoning, state transitions, prompt assembly, and tool selection.
* **Identity & Security Gatekeeper:** Handles user authentication, RBAC, tenant context validation, and token encryption/decryption.
* **Database Management:** Direct, transactional interface to PostgreSQL using Row-Level Security (RLS).
* **Core Workflows:** High-volume, standard SaaS operations (billing checks, internal workspace alerts, notifications).

### 2.2 The Edge (Integration Router)

The Edge consists of lightweight, containerized execution workers (n8n running in Queue Mode backed by Redis).

* **Zero Persistent State:** The Edge maintains no database connection and stores zero tenant secrets.
* **API Normalization:** Maps generic JSON payloads from the Core to specific, third-party API structures (Stripe, HubSpot, Slack, custom ERPs).
* **Execution & Resilience:** Manages rate limits, API pagination, error retries, and exponential backoff loops.

***

## 3. API Token Storage Strategy

All third-party tokens (OAuth Access Tokens, Refresh Tokens, static API Keys) are encrypted at rest inside PostgreSQL. No unencrypted secrets reside in the database or pass across public network interfaces.

### 3.1 PostgreSQL Vault Schema

```sql
CREATE TABLE tenant_integration_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL, -- e.g., 'gmail', 'stripe', 'slack'
    encrypted_access_token TEXT NOT NULL,
    encrypted_refresh_token TEXT,
    token_type VARCHAR(20) DEFAULT 'Bearer',
    expires_at TIMESTAMPTZ,
    iv VARCHAR(32) NOT NULL, -- Initialization vector for AES-256-GCM
    auth_tag VARCHAR(32) NOT NULL, -- Authentication tag for AES-256-GCM
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_tenant_provider UNIQUE(tenant_id, provider)
);

-- Enable Row Level Security
ALTER TABLE tenant_integration_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON tenant_integration_tokens
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

```

### 3.2 Encryption Mechanics

* **Algorithm:** AES-256-GCM (Authenticated Encryption).
* **Master Key Management:** The encryption key is pulled at runtime from a secure environment variable or cloud Key Management Service (KMS), never stored in the codebase or database.
* **Rotation Support:** Each record contains a unique Initialization Vector (`iv`) and Authentication Tag (`auth_tag`) to allow key rotation without database corruption.

***

## 4. Token Passing & Runtime Execution Logic

To enforce a zero-trust boundary, tokens are decrypted strictly **in memory** by the Core API server at the exact moment an Edge job is generated, then passed over an internal network.

### 4.1 Step-by-Step Sequence

```mermaid
sequenceDiagram
    autonumber
    participant Agent as Core AI Agent
    participant CoreAPI as Core API Server
    participant KMS as KMS / Env Key
    participant DB as PostgreSQL
    participant Edge as Edge Worker (n8n)
    participant External as 3rd Party API (Stripe/Slack)

    Agent->>CoreAPI: Request Tool Action (e.g., Send Invoice)
    CoreAPI->>DB: Fetch Encrypted Token for Tenant ID
    DB-->>CoreAPI: Return Encrypted Record (Token + IV + Tag)
    CoreAPI->>KMS: Retrieve Master Encryption Key
    KMS-->>CoreAPI: Master Key
    CoreAPI->>CoreAPI: Decrypt Token in Memory (AES-256-GCM)
    
    Note over CoreAPI,Edge: Internal VPC / Private Network Transfer
    CoreAPI->>Edge: Dispatch HTTP POST to Private Webhook (Payload + Bearer Token)
    
    Edge->>External: Execute API Call (Authorization: Bearer <Token>)
    External-->>Edge: API Response Status & Body
    Edge-->>CoreAPI: Execution Status Callback
    
    Note over Edge: Memory Garbage Collection (Token Dumped)
    CoreAPI->>Agent: Resume Agent Execution Loop

```

### 4.2 Webhook Payload Structure (Core → Edge)

The Core constructs a standardized payload sent via HTTP POST to the n8n internal webhook endpoint.

```json
{
  "event_id": "evt_9876543210",
  "tenant_id": "tenant_abc123",
  "action": "STRIPE_CREATE_INVOICE",
  "auth": {
    "token_type": "Bearer",
    "access_token": "sk_live_51NxXXXXXXXXXXXXXXXXXXXX"
  },
  "payload": {
    "customer_id": "cus_L9xXXXXXXX",
    "amount_cents": 15000,
    "currency": "usd",
    "description": "Monthly Workspace Subscription"
  }
}

```

### 4.3 Security & Isolation Controls

1. **Private Network Binding:** n8n webhook listeners bind exclusively to internal Docker network interfaces (`172.x.x.x`) or private VPC subnets. External access to n8n webhook endpoints is blocked by ingress firewalls.
2. **Short-Lived Payloads:** Tokens in the Edge environment exist only within the ephemeral execution scope of the specific workflow run.
3. **Log Sanitization:** n8n execution logging is configured to automatically redact fields under the `auth` key path to prevent plain-text bearer tokens from appearing in worker stdout or execution history logs.

***

## 5. Summary Matrix: Responsibilities

| Feature                    | The Core (Custom Code)               | The Edge (n8n Engine)            |
| -------------------------- | ------------------------------------ | -------------------------------- |
| **Primary Responsibility** | AI Orchestration, State & Auth       | API Schema Mapping & Delivery    |
| **Secrets Access**         | Direct access to DB Encryption Vault | Ephemeral (received per request) |
| **Database Connection**    | Yes (PostgreSQL via RLS)             | None                             |
| **Network Visibility**     | Public Gateway / Internal VPC        | Internal VPC Only                |
| **Failure Handling**       | Business logic & fallback choices    | API Retries, Rate Limit Backoffs |

###

***

### Node.js AES-256-GCM encryption helper functions



Here is the complete, self-contained TypeScript module for AES-256-GCM encryption and decryption.

This implementation includes strict type definitions, buffer handling, and error checking to integrate directly with your PostgreSQL schema.

```typescript
// src/utils/encryption.ts
import crypto from 'node:crypto';

// Standard AES-256-GCM settings
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 16 bytes is standard for node:crypto AES
const KEY_LENGTH = 32; // 256 bits = 32 bytes

export interface EncryptedTokenData {
  encrypted_access_token: string;
  iv: string;
  auth_tag: string;
}

/**
 * Validates and parses the master key from the environment.
 * Expects a 64-character hex string (32 bytes).
 */
function getMasterKey(): Buffer {
  const masterKeyString = process.env.ENCRYPTION_MASTER_KEY;
  
  if (!masterKeyString) {
    throw new Error('ENCRYPTION_MASTER_KEY environment variable is not set.');
  }

  const keyBuffer = Buffer.from(masterKeyString, 'hex');
  
  if (keyBuffer.length !== KEY_LENGTH) {
    throw new Error(`Invalid Master Key length: Expected ${KEY_LENGTH} bytes, got ${keyBuffer.length} bytes.`);
  }

  return keyBuffer;
}

/**
 * Encrypts a plaintext API or OAuth token.
 * 
 * @param plainTextToken The raw string token to encrypt.
 * @returns Object containing the hex-encoded ciphertext, IV, and auth tag.
 */
export function encryptToken(plainTextToken: string): EncryptedTokenData {
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainTextToken, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    encrypted_access_token: encrypted,
    iv: iv.toString('hex'),
    auth_tag: authTag.toString('hex'),
  };
}

/**
 * Decrypts a previously encrypted token using its IV and Auth Tag.
 * 
 * @param encryptedData The ciphertext, IV, and auth tag retrieved from PostgreSQL.
 * @returns The original plaintext token.
 * @throws Will throw if the auth tag is invalid (tampering detected).
 */
export function decryptToken(encryptedData: EncryptedTokenData): string {
  const key = getMasterKey();
  
  const ivBuffer = Buffer.from(encryptedData.iv, 'hex');
  const authTagBuffer = Buffer.from(encryptedData.auth_tag, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
  decipher.setAuthTag(authTagBuffer);

  try {
    let decrypted = decipher.update(encryptedData.encrypted_access_token, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    // Standard node:crypto behavior throws on auth tag mismatch
    throw new Error(`Token decryption failed. The payload may have been tampered with or the master key changed. Details: ${(error as Error).message}`);
  }
}

// ============================================================================
// Usage Example / Testing Block (Can be safely removed in production)
// ============================================================================
if (require.main === module) {
  // Generate a mock master key for testing (32 bytes = 64 hex characters)
  process.env.ENCRYPTION_MASTER_KEY = crypto.randomBytes(32).toString('hex');

  const mockOAuthToken = 'ya29.a0AfB_byC1xyz...'; // Simulated Gmail or Stripe token

  console.log('--- Original Token ---');
  console.log(mockOAuthToken);

  // 1. Core saves to DB
  const encryptedPayload = encryptToken(mockOAuthToken);
  console.log('\n--- Saved to PostgreSQL ---');
  console.log(encryptedPayload);

  // 2. Core retrieves from DB & passes to Edge
  const decryptedToken = decryptToken(encryptedPayload);
  console.log('\n--- Decrypted for n8n Webhook ---');
  console.log(decryptedToken);

  console.assert(mockOAuthToken === decryptedToken, 'Decryption mismatch!');
}

```
