Agent Prompt — Fix Lancee MCP Result Chaining Globally

You are working on the Lancee platform.

We have isolated a bug in Lancee's MCP result contract that causes Hermes Agent to fail when chaining the output of one MCP tool into another.

IMPORTANT:
- Do not redesign unrelated Lancee functionality.
- Do not introduce filename-based lookup as a workaround.
- Do not weaken workspace authorization.
- Do not change working capability business logic unless required.
- Fix this at the shared MCP result-contract layer so ALL Lancee tools benefit.
- Preserve backwards compatibility internally where possible.
- Add regression tests.
- Inspect the existing implementation before editing.

PROJECT:
Lancee

PROJECT ROOT:
/home/apps/agent-app

RELEVANT FILES:
server/capabilities/result-contract.mjs
server/capabilities/registry.mjs
server/capabilities/files.mjs
server/capabilities/index.mjs
server/lancee-mcp.mjs
server/lancee-mcp-protocol.mjs

CURRENT ARCHITECTURE:

Capability
    ↓
capabilityRegistry.invoke()
    ↓
normalizeCapabilityResult()
    ↓
runtime.normalizeResult()
    ↓
MCP envelope
    ↓
content + structuredContent
    ↓
Hermes

The MCP protocol correctly sends the normalized envelope as both:

content:
  [{ type: "text", text: JSON.stringify(value) }]

structuredContent:
  value

Therefore do NOT patch the presentation layer to parse IDs out of text.

==================================================
BUG
==================================================

A file search successfully returns matching files.

Hermes displays the files correctly.

But when Hermes tries to use the search result in read_file, it generates a reference such as:

Result 1.data.results.files.0.id

and fails with:

"Result 1.data.results.files.0.id is unavailable."

This has been reproduced on a completely fresh dedicated Hermes installation, so it is not caused by old memory/session state.

The current list normalization in:

server/capabilities/result-contract.mjs

effectively produces BOTH:

data.files = [...]
data.results = [...]

For example:

{
  "success": true,
  "ok": true,
  "data": {
    "files": [
      {
        "id": "...",
        "type": "file",
        "name": "wine-chapters.pdf"
      }
    ],
    "results": [
      {
        "id": "...",
        "type": "file",
        "name": "wine-chapters.pdf"
      }
    ],
    "total": 1
  },
  "error": null
}

This creates two representations of the same collection.

Hermes then constructs an invalid hybrid path:

data.results.files[0].id

The canonical path should instead be:

data.results[0].id

==================================================
DESIRED MCP RESULT GRAMMAR
==================================================

Make the agent-facing MCP result contract extremely deterministic.

There should be ONE canonical representation for list results.

LIST RESULT:

{
  "success": true,
  "ok": true,
  "data": {
    "results": [
      {
        "id": "canonical-resource-id",
        "type": "file",
        "name": "example.pdf"
      }
    ],
    "total": 1
  },
  "artifacts": [],
  "warnings": [],
  "error": null,
  "metadata": { ... }
}

Canonical addressing:

LIST:
data.results[N].id

SINGLE RESOURCE:
data.resource.id

ERROR:
error.code
error.message

The effective agent grammar should therefore be:

LIST
Result X.data.results.N.id

SINGLE
Result X.data.resource.id

FAILURE
Result X.error.code
Result X.error.message

Do not expose redundant collection-specific arrays such as:

data.files
data.projects
data.clients

alongside data.results in the normalized MCP result unless there is an unavoidable compatibility requirement.

Internal capability functions may continue returning domain-specific structures.

For example:

file.search may internally return:

{
  files,
  total
}

The normalization boundary is responsible for translating that into the canonical MCP contract.

==================================================
IMPLEMENTATION
==================================================

Inspect the current implementation first.

In particular inspect:

server/capabilities/result-contract.mjs

The current list branch resembles:

if (contract.mode === 'list') {
  const data = baseObject(value)
  const rawItems = value?.[contract.collection]
  const results = normalizeCollection(rawItems, contract.resourceType)

  data[contract.collection] = results
  data.results = results

  if (!Number.isInteger(data.total)) data.total = results.length

  return {
    data,
    diagnostics: {
      resourceType: contract.resourceType,
      resultCount: results.length,
      canonicalIdPresent: true,
    },
  }
}

Refactor the MCP-facing list normalization toward:

if (contract.mode === 'list') {
  const rawItems = value?.[contract.collection]
  const results = normalizeCollection(
    rawItems,
    contract.resourceType,
  )

  return {
    data: {
      results,
      total: Number.isInteger(value?.total)
        ? value.total
        : results.length,
    },
    diagnostics: {
      resourceType: contract.resourceType,
      resultCount: results.length,
      canonicalIdPresent:
        results.every((item) => Boolean(item.id)),
    },
  }
}

Adapt this to the actual codebase rather than blindly pasting it.

Also inspect direct-list, optional-single, single-resource, dashboard and other result modes to make sure their output remains deterministic.

==================================================
CANONICAL RESOURCE IDs
==================================================

Do NOT remove the existing canonical ID normalization.

normalizeResource() should continue guaranteeing that MCP resources contain:

{
  id: "...",
  type: "...",
  ...
}

The resource ID must be:

- stable
- canonical
- machine consumable
- workspace scoped where appropriate
- directly accepted by downstream tools

Do not make filenames the primary identifier.

This matters because Lancee can legitimately contain:

wine-chapters.pdf
wine-chapters.pdf

as two separate resources.

read_file must continue accepting:

{
  "file_id": "<canonical id>"
}

not:

{
  "filename": "wine-chapters.pdf"
}

==================================================
OUTPUT SCHEMA
==================================================

Review:

mcpOutputSchema()

Ensure the output schema accurately describes the canonical MCP result.

For list operations it must clearly support:

data.results[]

where each item includes at minimum:

id
type

and optionally:

name

Do not create schema ambiguity suggesting that a collection lives under:

data.results.files
data.results.projects
etc.

structuredContent must continue containing the normalized result.

Do not remove structuredContent.

==================================================
GLOBAL AUDIT
==================================================

This is NOT a file-only fix.

Audit every result contract in:

lanceeMcpResultContracts

including resources such as:

clients
projects
tasks
invoices
files
workflows
jobs
approvals
connections
users
payments
web pages
artifacts

Look specifically for list→single or list→mutation chains.

Examples:

search_files
    ↓
data.results[0].id
    ↓
read_file({ file_id })

project search/list
    ↓
data.results[0].id
    ↓
project get/update

client search/list
    ↓
data.results[0].id
    ↓
client get/update

invoice list
    ↓
data.results[0].id
    ↓
invoice get/send/etc.

workflow list/search
    ↓
data.results[0].id
    ↓
workflow get/update/run

job list
    ↓
data.results[0].id
    ↓
job get/cancel/etc.

Every chained resource must expose a canonical ID that the next tool accepts directly.

==================================================
REGRESSION TESTS
==================================================

Add automated tests around the MCP protocol/result-contract boundary.

At minimum test:

1. file.search normalization

Assert:

result.success === true
result.data.results is an array
result.data.results[0].id exists

Assert the redundant MCP collection does NOT exist:

result.data.files === undefined

2. Canonical file chain

search_files
→ obtain data.results[0].id
→ pass directly into read_file.file_id
→ read succeeds

3. Duplicate filenames

Create/mock two files with identical names but different IDs.

search_files must return both with distinct canonical IDs.

read_file using each ID must address the correct resource.

4. Other list resources

Test representative:

projects
clients
invoices
workflows/jobs if available

Each should expose:

data.results[N].id

5. Single-resource contract

Ensure get/read/create style tools expose:

data.resource.id

where applicable.

6. Error contract

Ensure failures expose:

success: false
ok: false
error.code
error.message

7. structuredContent

Perform a protocol-level tools/call test.

Assert that:

result.structuredContent

contains the canonical normalized envelope.

Do not merely test the text representation.

==================================================
IMPORTANT: TOOL-CHAINING TEST
==================================================

Add at least one test that mimics an actual agent chain.

Do NOT manually reconstruct the ID.

Conceptually:

const search = await callTool('search_files', {...})

const id = search.structuredContent.data.results[0].id

const read = await callTool('read_file', {
    file_id: id
})

assert read succeeds

This test protects the exact failure currently occurring in Hermes.

==================================================
COMPATIBILITY
==================================================

Before removing collection-specific keys from normalized MCP output, search the repository for code consuming patterns such as:

.data.files
.data.projects
.data.clients
.data.workflows

Determine whether those consumers use:

- raw capability output
or
- normalized MCP output

Do not break Lancee's internal UI/API merely because MCP normalization changes.

Raw/internal capability return structures may remain unchanged.

The goal is:

INTERNAL:
{ files: [...] }

MCP:
{
  data: {
    results: [...]
  }
}

==================================================
SECURITY
==================================================

Do not alter:

workspace scoping
MCP bearer authentication
mcp:invoke scope
device authorization
permission checks
owner checks
mutation approval
idempotency protection

Canonical IDs must never allow cross-workspace access.

Downstream tools must continue resolving the resource within the authenticated workspace rather than trusting the ID globally.

==================================================
VALIDATION
==================================================

After implementation:

1. Run the relevant unit/integration tests.
2. Run the project's existing full test/lint suite where practical.
3. Report any unrelated existing failures separately.
4. Rebuild/restart the Lancee container if required.
5. Verify:

GET /mcp

still returns:

405 Method Not Allowed
Allow: POST

6. Verify MCP initialization and tools/list.
7. Verify the existing Lancee connector token still authenticates.
8. Test search_files through MCP.
9. Inspect structuredContent.

Expected shape:

{
  "data": {
    "results": [
      {
        "id": "...",
        "type": "file",
        "name": "wine-chapters.pdf"
      }
    ],
    "total": ...
  }
}

10. Test read_file using exactly:

structuredContent.data.results[0].id

11. Finally test through Hermes with:

"Find wine-chapters.pdf in my Lancee workspace, read it, and give me a short summary. Use only read operations."

PASS CONDITION:

Hermes must successfully perform:

search_files
→ canonical ID
→ read_file
→ file contents
→ summary

without:

"Result 1.data.results.files.0.id is unavailable."

==================================================
DELIVERABLE
==================================================

At completion report:

1. Root cause confirmed
2. Files changed
3. Exact MCP result contract before/after
4. Tests added
5. Test results
6. Any compatibility changes required
7. Whether search_files → read_file passes directly
8. Whether duplicate filename handling passes
9. Whether representative non-file chaining passes
10. Whether the end-to-end Hermes test passes

Do not declare the issue fixed merely because unit tests pass.

The final acceptance criterion is successful real-world:

Hermes
→ Lancee MCP search_files
→ data.results[N].id
→ read_file
→ content returned.
