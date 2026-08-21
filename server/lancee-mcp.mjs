import {
  createLanceeCapabilityRegistry,
  LanceeCapabilityError,
  lanceeMcpCapabilityBindings,
} from './capabilities/index.mjs'
import {
  LANCEE_MCP_RESULT_CONTRACT_VERSION,
  mcpOutputSchema,
  normalizeCapabilityResult,
} from './capabilities/result-contract.mjs'
import { createDecisionDynamicsService } from './decision-dynamics.mjs'
import { recordWorkspaceEvent } from './workspace-events.mjs'

export const lanceeMcpScope = 'mcp:invoke'

const automationIdPattern = /^aut_[a-f0-9]{12}$/
const runIdPattern = /^run_[a-f0-9]{12}$/
const MAX_INSTRUCTION_LENGTH = 5_000
const MAX_FILE_CONTENT_LENGTH = 512_000

export class LanceeMcpError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message)
    this.name = 'LanceeMcpError'
    this.code = code
    this.status = status
    Object.assign(this, details)
  }
}

export const lanceeMcpToolDefinitions = [
  {
    name: 'run_workflow',
    title: 'Run Lancee workflow',
    description: 'Queue an active Lancee Core or Edge workflow for execution in the authorized workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_id: { type: 'string', pattern: '^aut_[a-f0-9]{12}$', description: 'The workflow automation id.' },
        instruction: { type: 'string', minLength: 1, maxLength: MAX_INSTRUCTION_LENGTH, description: 'The concrete instruction for this run.' },
        provider: { type: 'string', maxLength: 50, description: 'Optional connected integration provider used by an Edge workflow.' },
      },
      required: ['workflow_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: 'create_workflow',
    title: 'Create Lancee workflow',
    description: 'Create a workspace-scoped Lancee workflow with bounded Core tool permissions and make it active by default.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 2, maxLength: 120 },
        description: { type: 'string', minLength: 2, maxLength: 500 },
        model: { type: 'string', maxLength: 120 },
        prompt_template: { type: 'string', maxLength: MAX_INSTRUCTION_LENGTH, description: 'Optional reusable natural-language instruction or JSON step plan. It is used when a run does not provide an override.' },
        execution: { type: 'string', enum: ['core', 'edge'] },
        tools: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'workspace.summary',
              'projects.list',
              'clients.list',
              'invoices.list',
              'projects.update_status',
              'projects.create_draft_invoice',
            ],
          },
          maxItems: 20,
        },
        activate: { type: 'boolean', description: 'Set false only when the user explicitly asks for a draft.' },
      },
      required: ['name', 'description'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: 'query_dashboard',
    title: 'Query dashboard data',
    description: 'Read workspace-scoped dashboard records through Lancee’s database adapter, including PostgreSQL when configured. Raw SQL and cross-workspace access are not exposed.',
    inputSchema: {
      type: 'object',
      properties: {
        resource: { type: 'string', enum: ['database', 'projects', 'clients', 'invoices', 'draft_invoices', 'automations', 'automation_runs', 'files', 'connections', 'connector_requests', 'notifications', 'team'] },
        query: { type: 'string', maxLength: 200, description: 'Optional case-insensitive text filter.' },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      required: ['resource'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'create_client',
    title: 'Create dashboard client',
    description: 'Create or complete a workspace client record after human approval.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 2, maxLength: 120 },
        email: { type: 'string', maxLength: 254 },
        company: { type: 'string', maxLength: 160 },
        notes: { type: 'string', maxLength: 2000 },
      },
      required: ['name'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: 'create_project',
    title: 'Create dashboard project',
    description: 'Create a workspace project for an existing or new client after human approval.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 2, maxLength: 160 },
        client_id: { type: 'string', maxLength: 100 },
        client_name: { type: 'string', maxLength: 160 },
        client_email: { type: 'string', maxLength: 254 },
        scope: { type: 'string', maxLength: 500 },
        due: { type: 'string', maxLength: 40 },
        status: { type: 'string', enum: ['In progress', 'In review', 'Waiting on client', 'Ready'] },
      },
      required: ['name'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: 'set_project_status',
    title: 'Set project status',
    description: 'Move a workspace project to a supported dashboard status after human approval.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', pattern: '^prj_[a-z0-9_-]{6,80}$' },
        status: { type: 'string', enum: ['In progress', 'In review', 'Waiting on client', 'Ready'] },
      },
      required: ['project_id', 'status'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'create_file',
    title: 'Create workspace file',
    description: 'Create and save a text, Markdown, or JSON file in the Lancee Files library after human approval.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 240 },
        content: { type: 'string', maxLength: MAX_FILE_CONTENT_LENGTH },
        mime_type: { type: 'string', enum: ['text/plain', 'text/markdown', 'application/json'] },
      },
      required: ['name', 'content'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: 'request_connector',
    title: 'Add connector request',
    description: 'Add a requested connector to the Connections tab for workspace follow-up. This does not invent credentials or mark an unsupported provider connected.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 2, maxLength: 120 },
        category: { type: 'string', enum: ['Automation', 'Communication', 'Design', 'Payments', 'Storage', 'Other'] },
        details: { type: 'string', maxLength: 500 },
      },
      required: ['name', 'category'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: 'delete_workspace_resource',
    title: 'Delete workspace resource',
    description: 'Permanently delete a workspace automation or file. This high-risk action requires explicit approval and workspace-owner authority.',
    inputSchema: {
      type: 'object',
      properties: {
        resource: { type: 'string', enum: ['automation', 'file'] },
        id: { type: 'string', minLength: 5, maxLength: 100 },
        confirmation: { type: 'string', enum: ['DELETE'], description: 'Must be exactly DELETE.' },
      },
      required: ['resource', 'id', 'confirmation'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  },
  {
    name: 'get_workflow_status',
    title: 'Get workflow status',
    description: 'Read the status of a Lancee workflow or a specific workflow run, including recent activity.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_id: { type: 'string', pattern: '^aut_[a-f0-9]{12}$' },
        run_id: { type: 'string', pattern: '^run_[a-f0-9]{12}$' },
        include_runs: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'search_workflows',
    title: 'Search Lancee workflows',
    description: 'Search the authorized workspace for workflows by name, description, status, or execution mode.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', maxLength: 200 },
        status: { type: 'string', enum: ['all', 'draft', 'active', 'paused'] },
        execution: { type: 'string', enum: ['all', 'core', 'edge'] },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'schedule_job',
    title: 'Schedule workflow job',
    description: 'Persist a one-shot or repeating workflow run. A server scheduler claims due rows and records each run.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_id: { type: 'string', pattern: '^aut_[a-f0-9]{12}$' },
        instruction: { type: 'string', minLength: 1, maxLength: MAX_INSTRUCTION_LENGTH },
        run_at: { type: 'string', format: 'date-time', description: 'Future ISO-8601 time at which to start the first run.' },
        interval_seconds: { type: 'integer', minimum: 60, maximum: 2592000, description: 'Optional repeat interval between runs.' },
        provider: { type: 'string', maxLength: 50 },
      },
      required: ['workflow_id', 'instruction', 'run_at'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: 'get_logs',
    title: 'Get workflow logs',
    description: 'Read persisted event logs for a Lancee workflow run.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', pattern: '^run_[a-f0-9]{12}$' },
        level: { type: 'string', enum: ['all', 'info', 'warning', 'warn', 'error'] },
        event_type: { type: 'string', maxLength: 80 },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
      },
      required: ['run_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'create_decision',
    title: 'Create decision',
    description: 'Create a structured workspace decision and normalized Decision Vector after human approval.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 200 },
        decision_text: { type: 'string', minLength: 1, maxLength: 5000 },
        rationale: { type: 'string', maxLength: 5000 },
        intent: { type: 'string', minLength: 1, maxLength: 2000 },
        object_type: { type: 'string', minLength: 1, maxLength: 120 },
        object_id: { type: 'string', maxLength: 240 },
        decided_at: { type: 'string', format: 'date-time' },
        vector: {
          type: 'object',
          properties: {
            action_type: { type: 'string', minLength: 1, maxLength: 120 },
            target_type: { type: 'string', minLength: 1, maxLength: 120 },
            source_state: { type: 'string', maxLength: 120 },
            destination_state: { type: 'string', maxLength: 120 },
            intent_type: { type: 'string', minLength: 1, maxLength: 120 },
            expected_direction: { type: 'string', minLength: 1, maxLength: 120 },
          },
          required: ['action_type', 'target_type', 'intent_type', 'expected_direction'],
          additionalProperties: false,
        },
        expected_reaction: {
          type: 'object',
          properties: {
            metric_key: { type: 'string', minLength: 1, maxLength: 120 },
            direction: { type: 'string', minLength: 1, maxLength: 120 },
            expected_change: { type: 'number' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            review_due_at: {
              type: 'string',
              format: 'date-time',
              description: 'Optional future time when Lancee should ask for the measured outcome.',
            },
          },
          required: ['metric_key', 'direction', 'confidence'],
          additionalProperties: false,
        },
      },
      required: ['title', 'decision_text', 'intent', 'object_type', 'vector'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: 'list_decisions',
    title: 'List decisions',
    description: 'Primary entry point for recorded decision inputs: list workspace decisions with original language, rationale, intent, Decision Vectors, expected reactions, and review state.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'active', 'reviewed', 'archived'] },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'get_decision',
    title: 'Get decision',
    description: 'Read one workspace decision with its normalized vector and expected reaction.',
    inputSchema: {
      type: 'object',
      properties: { decision_id: { type: 'string', pattern: '^dec_[a-f0-9]{32}$' } },
      required: ['decision_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'schedule_decision_review',
    title: 'Schedule decision outcome review',
    description: 'Schedule a workspace notification to review one recorded expected metric after enough observation time has passed.',
    inputSchema: {
      type: 'object',
      properties: {
        decision_id: { type: 'string', pattern: '^dec_[a-f0-9]{32}$' },
        metric_key: { type: 'string', minLength: 1, maxLength: 120 },
        due_at: { type: 'string', format: 'date-time' },
      },
      required: ['decision_id', 'metric_key', 'due_at'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'list_decision_reviews',
    title: 'List decision outcome reviews',
    description: 'List only the scheduled, due, or completed outcome-review queue. An empty result means no matching reviews; it does not mean there are no decisions, evidence, or decision inputs. Use list_decisions to establish that.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'scheduled', 'due', 'completed', 'cancelled'] },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'record_outcome',
    title: 'Record decision outcome',
    description: 'Record deterministic baseline and observed metrics plus separate evidence and causal confidence after human approval.',
    inputSchema: {
      type: 'object',
      properties: {
        decision_id: { type: 'string', pattern: '^dec_[a-f0-9]{32}$' },
        metric_key: { type: 'string', minLength: 1, maxLength: 120 },
        unit: { type: 'string', maxLength: 80 },
        baseline_value: { type: 'number' },
        baseline_window_start: { type: 'string', format: 'date-time' },
        baseline_window_end: { type: 'string', format: 'date-time' },
        observed_value: { type: 'number' },
        observation_window_start: { type: 'string', format: 'date-time' },
        observation_window_end: { type: 'string', format: 'date-time' },
        outcome_class: { type: 'string', maxLength: 120 },
        observed_reason: { type: 'string', maxLength: 5000 },
        evidence_confidence: { type: 'number', minimum: 0, maximum: 1 },
        causal_confidence: { type: 'number', minimum: 0, maximum: 1 },
        analysis_design: {
          type: 'string',
          enum: ['observational_pre_post', 'controlled_before_after'],
        },
        control_baseline_value: { type: 'number' },
        control_observed_value: { type: 'number' },
      },
      required: ['decision_id', 'metric_key', 'evidence_confidence'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'get_decision_outcome',
    title: 'Get decision outcome',
    description: 'Read measured outcome, deterministic metric changes, expected-versus-actual result, and confounders.',
    inputSchema: {
      type: 'object',
      properties: { decision_id: { type: 'string', pattern: '^dec_[a-f0-9]{32}$' } },
      required: ['decision_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'get_decision_evidence',
    title: 'Get decision evidence',
    description: 'List provenance records attached to a workspace decision.',
    inputSchema: {
      type: 'object',
      properties: { decision_id: { type: 'string', pattern: '^dec_[a-f0-9]{32}$' } },
      required: ['decision_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'compare_decision',
    title: 'Compare decision',
    description: 'Compare bounded deterministic candidates, add a Hermes contextual reality check when available, and return Lancee-scored results.',
    inputSchema: {
      type: 'object',
      properties: {
        decision_id: { type: 'string', pattern: '^dec_[a-f0-9]{32}$' },
        limit: { type: 'integer', minimum: 1, maximum: 5 },
        threshold: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['decision_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'get_decision_comparison',
    title: 'Get decision comparison',
    description: 'Read the machine assessment and latest human-reviewed effective assessment for one workspace comparison.',
    inputSchema: {
      type: 'object',
      properties: { comparison_id: { type: 'string', pattern: '^dcmp_[a-f0-9]{32}$' } },
      required: ['comparison_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'review_decision_comparison',
    title: 'Review decision comparison',
    description: 'Confirm, correct, or reject a Hermes contextual comparison while retaining the original machine assessment and Lancee metrics.',
    inputSchema: {
      type: 'object',
      properties: {
        comparison_id: { type: 'string', pattern: '^dcmp_[a-f0-9]{32}$' },
        action: { type: 'string', enum: ['confirmed', 'corrected', 'rejected'] },
        comparable: { type: 'boolean' },
        contextual_similarity: { type: 'number', minimum: 0, maximum: 1 },
        shared_factors: {
          type: 'array',
          items: { type: 'string', minLength: 1, maxLength: 500 },
          maxItems: 20,
        },
        material_differences: {
          type: 'array',
          items: { type: 'string', minLength: 1, maxLength: 500 },
          maxItems: 20,
        },
        explanation: { type: 'string', minLength: 1, maxLength: 2000 },
      },
      required: ['comparison_id', 'action'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: 'refresh_decision_intelligence',
    title: 'Refresh Decision Intelligence',
    description: 'Run the bounded deterministic learning cycle for the authorized workspace after human approval.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'list_decision_patterns',
    title: 'List decision patterns',
    description: 'List evidence-thresholded recurring outcome patterns detected from measured workspace decisions.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['all', 'active', 'emerging', 'retired'] },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'list_decision_predictions',
    title: 'List decision predictions',
    description: 'List bounded empirical outcome predictions with intervals, confidence, samples, and source decisions.',
    inputSchema: {
      type: 'object',
      properties: {
        decision_id: { type: 'string', pattern: '^dec_[a-f0-9]{32}$' },
        status: { type: 'string', enum: ['all', 'active', 'measured', 'superseded'] },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'list_decision_warnings',
    title: 'List decision warnings',
    description: 'List proactive evidence warnings without converting historical association into causality.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['all', 'active', 'acknowledged', 'dismissed', 'resolved'] },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'review_decision_warning',
    title: 'Review decision warning',
    description: 'Acknowledge or dismiss one workspace warning after human approval.',
    inputSchema: {
      type: 'object',
      properties: {
        warning_id: { type: 'string', pattern: '^dwrn_[a-f0-9]{32}$' },
        action: { type: 'string', enum: ['acknowledged', 'dismissed'] },
      },
      required: ['warning_id', 'action'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'get_decision_causal_assessment',
    title: 'Get decision causal assessment',
    description: 'Read the bounded association or controlled before/after estimate and its explicit assumptions.',
    inputSchema: {
      type: 'object',
      properties: {
        decision_id: { type: 'string', pattern: '^dec_[a-f0-9]{32}$' },
        metric_key: { type: 'string', minLength: 1, maxLength: 120 },
      },
      required: ['decision_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'get_decision_learning_model',
    title: 'Get decision learning model',
    description: 'Read the active versioned structural calibration model and its bounded training provenance.',
    inputSchema: {
      type: 'object',
      properties: {
        model_type: { type: 'string', enum: ['structural_similarity', 'outcome_prediction'] },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'get_decision_intelligence_overview',
    title: 'Get Decision Intelligence overview',
    description: 'Read exact workspace-scoped Decision Intelligence counts, learning thresholds, category relationships, and recent persisted intelligence events without recomputing intelligence.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'call_external_api',
    title: 'Call external API',
    description: 'Call a public HTTP API with bounded time, body, and response size. Redirects, private hosts, cookies, and authorization headers are blocked.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', minLength: 1, maxLength: 2048, format: 'uri' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] },
        headers: { type: 'object', additionalProperties: { type: 'string', maxLength: 500 }, maxProperties: 20 },
        body: { description: 'JSON-compatible request body. It is limited to 32 KB.' },
        timeout_ms: { type: 'integer', minimum: 250, maximum: 15000 },
      },
      required: ['url'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
]

const platformCapabilityMetadata = Object.freeze({
  run_workflow: { permissions: ['automations:run'], risk: 'internal-write', approval: true, tags: ['automation', 'run'] },
  create_workflow: { permissions: ['automations:write'], risk: 'internal-write', approval: true, tags: ['automation', 'create'] },
  query_dashboard: { permissions: ['workspace:read'], risk: 'read', approval: false, tags: ['workspace', 'query'] },
  create_client: { permissions: ['clients:write'], risk: 'internal-write', approval: true, tags: ['client', 'create'] },
  create_project: { permissions: ['projects:write'], risk: 'internal-write', approval: true, tags: ['project', 'create'] },
  set_project_status: { permissions: ['projects:write'], risk: 'internal-write', approval: true, tags: ['project', 'status'] },
  request_connector: { permissions: ['integrations:write'], risk: 'internal-write', approval: true, tags: ['integration', 'request'] },
  delete_workspace_resource: { permissions: ['workspace:delete'], risk: 'destructive', approval: true, tags: ['workspace', 'delete'] },
  get_workflow_status: { permissions: ['automations:read'], risk: 'read', approval: false, tags: ['automation', 'status'] },
  search_workflows: { permissions: ['automations:read'], risk: 'read', approval: false, tags: ['automation', 'search'] },
  schedule_job: { permissions: ['automations:schedule'], risk: 'internal-write', approval: true, tags: ['job', 'automation', 'schedule'] },
  get_logs: { permissions: ['automations:read'], risk: 'read', approval: false, tags: ['automation', 'logs'] },
  create_decision: { permissions: ['decisions:write'], risk: 'internal-write', approval: true, tags: ['decision', 'create'] },
  list_decisions: { permissions: ['decisions:read'], risk: 'read', approval: false, tags: ['decision', 'list'] },
  get_decision: { permissions: ['decisions:read'], risk: 'read', approval: false, tags: ['decision', 'read'] },
  schedule_decision_review: { permissions: ['decisions:write'], risk: 'internal-write', approval: true, tags: ['decision', 'outcome', 'review', 'schedule'] },
  list_decision_reviews: { permissions: ['decisions:read'], risk: 'read', approval: false, tags: ['decision', 'outcome', 'review', 'attention'] },
  record_outcome: { permissions: ['decisions:write'], risk: 'internal-write', approval: true, tags: ['decision', 'outcome'] },
  get_decision_outcome: { permissions: ['decisions:read'], risk: 'read', approval: false, tags: ['decision', 'outcome'] },
  get_decision_evidence: { permissions: ['decisions:read'], risk: 'read', approval: false, tags: ['decision', 'evidence'] },
  compare_decision: { permissions: ['decisions:read'], risk: 'read', approval: false, tags: ['decision', 'comparison'] },
  get_decision_comparison: { permissions: ['decisions:read'], risk: 'read', approval: false, tags: ['decision', 'comparison', 'review'] },
  review_decision_comparison: { permissions: ['decisions:write'], risk: 'internal-write', approval: true, tags: ['decision', 'comparison', 'review', 'correction'] },
  refresh_decision_intelligence: { permissions: ['decisions:write'], risk: 'internal-write', approval: true, tags: ['decision', 'learning', 'refresh'] },
  list_decision_patterns: { permissions: ['decisions:read'], risk: 'read', approval: false, tags: ['decision', 'pattern', 'learning'] },
  list_decision_predictions: { permissions: ['decisions:read'], risk: 'read', approval: false, tags: ['decision', 'prediction', 'forecast'] },
  list_decision_warnings: { permissions: ['decisions:read'], risk: 'read', approval: false, tags: ['decision', 'warning', 'risk'] },
  review_decision_warning: { permissions: ['decisions:write'], risk: 'internal-write', approval: true, tags: ['decision', 'warning', 'review'] },
  get_decision_causal_assessment: { permissions: ['decisions:read'], risk: 'read', approval: false, tags: ['decision', 'causal', 'evidence'] },
  get_decision_learning_model: { permissions: ['decisions:read'], risk: 'read', approval: false, tags: ['decision', 'learning', 'model'] },
  get_decision_intelligence_overview: { permissions: ['decisions:read'], risk: 'read', approval: false, tags: ['decision', 'learning', 'overview', 'timeline'] },
})

function createPlatformCapabilityDefinitions(executePlatform) {
  return Object.entries(platformCapabilityMetadata).map(([toolName, metadata]) => {
    const tool = lanceeMcpToolDefinitions.find((candidate) => candidate.name === toolName)
    const id = lanceeMcpCapabilityBindings[toolName]
    if (!tool || !id) throw new TypeError(`Missing Lancee platform capability contract for ${toolName}.`)
    return {
      id,
      namespace: id.split('.')[0],
      version: '1.0.0',
      description: tool.description,
      provider: 'lancee.platform',
      inputSchema: tool.inputSchema,
      outputSchema: { type: 'object' },
      requiredPermissions: metadata.permissions,
      riskLevel: metadata.risk,
      requiresApproval: metadata.approval,
      timeoutMs: toolName.startsWith('execute_') ? 20_000 : 30_000,
      concurrencyLimit: toolName.startsWith('execute_') ? 1 : 8,
      estimatedCost: 0,
      supportsAsync: false,
      tags: metadata.tags,
      execute: ({ input, context, invocation }) => executePlatform(toolName, context, input, invocation),
    }
  })
}

function objectArguments(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'Tool arguments must be an object.')
  }
  return value
}

function textArgument(args, key, { required = false, maxLength = 200 } = {}) {
  const value = String(args[key] || '').trim()
  if (required && !value) {
    throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', `${key} is required.`)
  }
  if (value.length > maxLength) {
    throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', `${key} must be ${maxLength} characters or fewer.`)
  }
  return value
}

function automationId(value) {
  const id = textArgument({ value }, 'value', { required: true, maxLength: 80 })
  if (!automationIdPattern.test(id)) {
    throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'A valid workflow id is required.')
  }
  return id
}

function runId(value) {
  const id = textArgument({ value }, 'value', { required: true, maxLength: 80 })
  if (!runIdPattern.test(id)) {
    throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'A valid workflow run id is required.')
  }
  return id
}

function requireContext(context) {
  if (!context?.workspace?.id || !context?.user?.id) {
    throw new LanceeMcpError('MCP_CONTEXT_UNAVAILABLE', 'The connector workspace is unavailable.', 401)
  }
  return context
}

function publicContext(context) {
  return {
    user: { id: context.user.id, name: context.user.name, email: context.user.email },
    workspace: { id: context.workspace.id, name: context.workspace.name },
    membership: context.membership,
  }
}

export function createLanceeMcpRuntime({
  database,
  coreToolIds = [],
  executeAutomationRun,
  enqueueCoreJob,
  prepareAutomationRun,
  capabilities = null,
  requestImpl,
  dnsLookup,
  env,
  now,
  renderPdf,
  renderDocx,
  browserWorker,
  executionWorker,
  sharpImpl,
  integrationGateway,
  semanticDecisionAssessor,
  authorize,
  audit,
}) {
  const availableCoreTools = new Set(coreToolIds)
  const decisionDynamics = createDecisionDynamicsService({
    database,
    semanticAssessor: semanticDecisionAssessor || null,
  })
  let schedulerTimer = null
  let schedulerBusy = false
  let lastDecisionIntelligenceRun = 0

  const requireOwner = (context) => {
    if (context.membership?.role !== 'owner') {
      throw new LanceeMcpError('MCP_OWNER_REQUIRED', 'This high-risk action requires a workspace owner.', 403)
    }
  }

  async function queryDashboard(context, args) {
    const resource = textArgument(args, 'resource', { required: true, maxLength: 40 })
    const readers = {
      database: () => database.getDatabaseInfo(),
      projects: () => database.listProjects(context.workspace.id),
      clients: () => database.listClients(context.workspace.id),
      invoices: () => database.listInvoices(context.workspace.id),
      draft_invoices: () => database.listDraftInvoices(context.workspace.id),
      automations: () => database.listAutomations(context.workspace.id),
      automation_runs: () => database.listAutomationRuns(context.workspace.id),
      files: () => database.listWorkspaceDocuments(context.workspace.id),
      connections: () => database.listIntegrations(context.workspace.id),
      connector_requests: () => database.listIntegrationRequests(context.workspace.id),
      notifications: () => database.listWorkspaceNotifications(context.workspace.id),
      team: () => database.listTeamMembers(context.workspace.id),
    }
    if (!readers[resource]) throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'Choose a supported dashboard resource.')
    const value = await readers[resource]()
    if (!Array.isArray(value)) return { resource, data: value }
    const query = textArgument(args, 'query', { maxLength: 200 }).toLowerCase()
    const limit = Number.isInteger(args.limit) ? Math.min(100, Math.max(1, args.limit)) : 50
    const matching = query
      ? value.filter((item) => JSON.stringify(item).toLowerCase().includes(query))
      : value
    return { resource, rows: matching.slice(0, limit), total: matching.length }
  }

  async function createClient(context, args) {
    const name = textArgument(args, 'name', { required: true, maxLength: 120 })
    const email = textArgument(args, 'email', { maxLength: 254 }).toLowerCase()
    const company = textArgument(args, 'company', { maxLength: 160 })
    const notes = textArgument(args, 'notes', { maxLength: 2_000 })
    if (name.length < 2 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'Use a client name of at least two characters and a valid optional email address.')
    }
    return { client: await database.createClient({ workspaceId: context.workspace.id, name, email, company, notes }) }
  }

  async function createProject(context, args) {
    const name = textArgument(args, 'name', { required: true, maxLength: 160 })
    const clientId = textArgument(args, 'client_id', { maxLength: 100 }) || null
    const clientName = textArgument(args, 'client_name', { maxLength: 160 })
    const clientEmail = textArgument(args, 'client_email', { maxLength: 254 }).toLowerCase()
    const scope = textArgument(args, 'scope', { maxLength: 500 }) || 'Created by the Lancee assistant.'
    const due = textArgument(args, 'due', { maxLength: 40 }) || 'Set date'
    const status = textArgument(args, 'status', { maxLength: 40 }) || 'In progress'
    if (name.length < 2 || (!clientId && !clientName && !clientEmail)) {
      throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'A project name and client id, name, or email are required.')
    }
    if (clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
      throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'The client email is invalid.')
    }
    if (!['In progress', 'In review', 'Waiting on client', 'Ready'].includes(status)) {
      throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'Use a supported project status.')
    }
    const project = await database.createProject({
      workspaceId: context.workspace.id,
      name,
      clientId,
      client: clientName || clientEmail || clientId,
      clientEmail,
      scope,
      due,
      status,
    })
    await recordWorkspaceEvent({
      database,
      context,
      eventType: 'project.created',
      entityType: 'project',
      entityId: project.id,
      clientId: project.clientId,
      projectId: project.id,
      payload: { name: project.name, status: project.status, source: 'lancee_mcp' },
      importance: 70,
    })
    return { project }
  }

  async function requestConnector(context, args) {
    const name = textArgument(args, 'name', { required: true, maxLength: 120 })
    const category = textArgument(args, 'category', { required: true, maxLength: 40 })
    const details = textArgument(args, 'details', { maxLength: 500 })
    if (name.length < 2 || !['Automation', 'Communication', 'Design', 'Payments', 'Storage', 'Other'].includes(category)) {
      throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'Use a valid connector name and category.')
    }
    const connector = await database.createIntegrationRequest({
      workspaceId: context.workspace.id,
      requestedBy: context.user.id,
      name,
      category,
      details,
    })
    return { connector }
  }

  async function deleteWorkspaceResource(context, args) {
    requireOwner(context)
    if (args.confirmation !== 'DELETE') throw new LanceeMcpError('MCP_CONFIRMATION_REQUIRED', 'Type DELETE to confirm this high-risk action.')
    const resource = textArgument(args, 'resource', { required: true, maxLength: 20 })
    const id = textArgument(args, 'id', { required: true, maxLength: 100 })
    if (resource === 'automation') {
      if (!automationIdPattern.test(id)) throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'A valid automation id is required.')
      if (!(await database.deleteAutomation(context.workspace.id, id))) throw new LanceeMcpError('MCP_RESOURCE_NOT_FOUND', 'Automation not found.', 404)
    } else if (resource === 'file') {
      if (!/^doc_[a-f0-9]{16}$/.test(id)) throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'A valid workspace file id is required.')
      if (!(await database.getWorkspaceDocument(context.workspace.id, id))) throw new LanceeMcpError('MCP_RESOURCE_NOT_FOUND', 'File not found.', 404)
      await database.deleteWorkspaceDocument(context.workspace.id, id)
    } else {
      throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'Only automations and workspace files can be deleted through this tool.')
    }
    return { deleted: true, resource, id }
  }

  async function runWorkflow(context, args) {
    const workflowId = automationId(args.workflow_id)
    const provider = textArgument(args, 'provider', { maxLength: 50 }) || null
    if (provider && !/^[a-z0-9][a-z0-9._-]{1,49}$/i.test(provider)) {
      throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'provider must be a valid integration id.')
    }
    const workspaceId = context.workspace.id
    const workflow = await database.getAutomation(workspaceId, workflowId)
    if (!workflow) throw new LanceeMcpError('MCP_WORKFLOW_NOT_FOUND', 'Workflow not found.', 404)
    if (workflow.status !== 'active') throw new LanceeMcpError('MCP_WORKFLOW_NOT_ACTIVE', 'Activate this workflow before running it.', 409)
    const instruction = textArgument(args, 'instruction', { maxLength: MAX_INSTRUCTION_LENGTH }) || workflow.instructionTemplate
    if (!instruction) throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'instruction is required because this workflow has no saved prompt template.')
    await prepareAutomationRun?.(context, workflow, provider)
    const run = await database.createAutomationRun({
      workspaceId,
      automationId: workflowId,
      triggeredBy: context.user.id,
      instruction,
    })
    await database.appendAutomationRunEvent({
      workspaceId,
      runId: run.id,
      eventType: 'run.queued',
      message: workflow.execution === 'core'
        ? 'Core workflow queued by Lancee MCP.'
        : 'Edge workflow queued by Lancee MCP.',
      output: { execution: workflow.execution, source: 'lancee-mcp' },
    })
    const job = {
      workspaceId,
      userId: context.user.id,
      automationId: workflowId,
      runId: run.id,
      provider,
    }
    const queued = workflow.execution === 'core' && Boolean(await enqueueCoreJob?.(job))
    if (!queued) {
      void executeAutomationRun(context, workflow, run, provider).catch((error) => {
        console.error('Lancee MCP workflow run failed:', error)
      })
    }
    return {
      workflow: { id: workflow.id, name: workflow.name, execution: workflow.execution },
      run: { ...run, queued, source: 'lancee-mcp' },
    }
  }

  async function scheduleJob(context, args) {
    const workflowId = automationId(args.workflow_id)
    const instruction = textArgument(args, 'instruction', { required: true, maxLength: MAX_INSTRUCTION_LENGTH })
    const workflow = await database.getAutomation(context.workspace.id, workflowId)
    if (!workflow) throw new LanceeMcpError('MCP_WORKFLOW_NOT_FOUND', 'Workflow not found.', 404)
    if (workflow.status !== 'active') throw new LanceeMcpError('MCP_WORKFLOW_NOT_ACTIVE', 'Activate this workflow before scheduling it.', 409)
    const runAt = new Date(textArgument(args, 'run_at', { required: true, maxLength: 80 }))
    const delay = runAt.getTime() - Date.now()
    if (!Number.isFinite(runAt.getTime()) || delay < 1_000 || delay > 365 * 24 * 60 * 60 * 1000) {
      throw new LanceeMcpError('MCP_INVALID_SCHEDULE', 'run_at must be between one second and one year in the future.')
    }
    const intervalSeconds = args.interval_seconds === undefined ? null : Number(args.interval_seconds)
    if (intervalSeconds !== null && (!Number.isInteger(intervalSeconds) || intervalSeconds < 60 || intervalSeconds > 2_592_000)) {
      throw new LanceeMcpError('MCP_INVALID_SCHEDULE', 'interval_seconds must be between 60 and 2,592,000 seconds.')
    }
    const provider = textArgument(args, 'provider', { maxLength: 50 }) || null
    if (provider && !/^[a-z0-9][a-z0-9._-]{1,49}$/i.test(provider)) {
      throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'provider must be a valid integration id.')
    }
    const schedule = await database.createAutomationSchedule({
      workspaceId: context.workspace.id,
      automationId: workflowId,
      createdBy: context.user.id,
      instruction,
      provider,
      runAt: runAt.toISOString(),
      intervalSeconds,
    })
    return { schedule }
  }

  async function dispatchDueSchedules() {
    if (schedulerBusy) return
    schedulerBusy = true
    try {
      const dueSchedules = await database.listDueAutomationSchedules(new Date().toISOString(), 50)
      for (const candidate of dueSchedules) {
        const schedule = await database.claimAutomationSchedule({
          selectedWorkspaceId: candidate.workspaceId,
          id: candidate.id,
          now: new Date().toISOString(),
        })
        if (!schedule) continue
        const context = await database.getContextByIds(schedule.createdBy, schedule.workspaceId)
        if (!context) {
          await database.failAutomationSchedule({
            selectedWorkspaceId: schedule.workspaceId,
            id: schedule.id,
            error: 'The schedule owner or workspace is no longer available.',
          })
          continue
        }
        try {
          const result = await runWorkflow(publicContext(context), {
            workflow_id: schedule.workflowId,
            instruction: schedule.instruction,
            provider: schedule.provider || undefined,
          })
          if (schedule.intervalSeconds) {
            await database.rescheduleAutomationSchedule({
              selectedWorkspaceId: schedule.workspaceId,
              id: schedule.id,
              runAt: new Date(Date.now() + schedule.intervalSeconds * 1000).toISOString(),
              lastRunId: result.run.id,
            })
          } else {
            await database.completeAutomationSchedule({
              selectedWorkspaceId: schedule.workspaceId,
              id: schedule.id,
              lastRunId: result.run.id,
            })
          }
        } catch (error) {
          await database.failAutomationSchedule({
            selectedWorkspaceId: schedule.workspaceId,
            id: schedule.id,
            error: error.message || 'Scheduled workflow failed.',
          })
        }
      }
      await decisionDynamics.dispatchDueObservationReviews({ limit: 50 })
      if (Date.now() - lastDecisionIntelligenceRun >= 5 * 60 * 1_000) {
        lastDecisionIntelligenceRun = Date.now()
        await decisionDynamics.runAutonomousDecisionIntelligence({ limit: 20 })
      }
    } finally {
      schedulerBusy = false
    }
  }

  async function startScheduler({ intervalMs = 1_000 } = {}) {
    if (schedulerTimer) return stopScheduler
    await database.recoverAutomationSchedules()
    await dispatchDueSchedules()
    schedulerTimer = setInterval(() => void dispatchDueSchedules(), intervalMs)
    schedulerTimer.unref?.()
    return stopScheduler
  }

  async function stopScheduler() {
    if (!schedulerTimer) return
    clearInterval(schedulerTimer)
    schedulerTimer = null
  }

  async function invokePlatformTool(name, context, args) {
    if (name === 'run_workflow') return runWorkflow(context, args)
    if (name === 'query_dashboard') return queryDashboard(context, args)
    if (name === 'create_client') return createClient(context, args)
    if (name === 'create_project') return createProject(context, args)
    if (name === 'set_project_status') {
      const projectId = textArgument(args, 'project_id', { required: true, maxLength: 100 })
      const status = textArgument(args, 'status', { required: true, maxLength: 40 })
      if (!/^prj_[a-z0-9_-]{6,80}$/i.test(projectId) || !['In progress', 'In review', 'Waiting on client', 'Ready'].includes(status)) {
        throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'A valid project id and status are required.')
      }
      const project = await database.updateProjectStatus(context.workspace.id, projectId, status)
      if (!project) throw new LanceeMcpError('MCP_RESOURCE_NOT_FOUND', 'Project not found.', 404)
      return { project }
    }
    if (name === 'request_connector') return requestConnector(context, args)
    if (name === 'delete_workspace_resource') return deleteWorkspaceResource(context, args)
    if (name === 'create_workflow') {
      const nameValue = textArgument(args, 'name', { required: true, maxLength: 120 })
      const description = textArgument(args, 'description', { required: true, maxLength: 500 })
      if (nameValue.length < 2 || description.length < 2) throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'Workflow name and description must be at least two characters.')
      const model = textArgument(args, 'model', { maxLength: 120 }) || 'Rules + connected tools'
      const instructionTemplate = textArgument(args, 'prompt_template', { maxLength: MAX_INSTRUCTION_LENGTH })
      const execution = args.execution === undefined ? 'core' : String(args.execution)
      if (!['core', 'edge'].includes(execution)) throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'execution must be core or edge.')
      const tools = args.tools === undefined
        ? (execution === 'core' ? ['workspace.summary', 'projects.list'] : [])
        : args.tools
      if (!Array.isArray(tools) || tools.length > 20 || tools.some((tool) => typeof tool !== 'string' || !availableCoreTools.has(tool))) {
        throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'One or more requested Core tools are unavailable.')
      }
      const workflow = await database.createAutomation({
        workspaceId: context.workspace.id,
        createdBy: context.user.id,
        name: nameValue,
        description,
        model,
        instructionTemplate,
        execution,
        tools: [...new Set(tools)],
      })
      const readyWorkflow = args.activate === false
        ? workflow
        : await database.setAutomationStatus(context.workspace.id, workflow.id, 'active')
      return { workflow: readyWorkflow }
    }
    if (name === 'search_workflows') {
      const query = textArgument(args, 'query', { maxLength: 200 }).toLowerCase()
      const status = args.status === undefined ? 'all' : String(args.status)
      const execution = args.execution === undefined ? 'all' : String(args.execution)
      const limit = Number.isInteger(args.limit) ? Math.min(50, Math.max(1, args.limit)) : 20
      if (!['all', 'draft', 'active', 'paused'].includes(status) || !['all', 'core', 'edge'].includes(execution)) {
        throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'Use supported workflow status and execution filters.')
      }
      const workflows = (await database.listAutomations(context.workspace.id)).filter((workflow) => {
        const matchesQuery = !query || `${workflow.name} ${workflow.description}`.toLowerCase().includes(query)
        return matchesQuery && (status === 'all' || workflow.status === status) && (execution === 'all' || workflow.execution === execution)
      })
      return { workflows: workflows.slice(0, limit), total: workflows.length }
    }
    if (name === 'get_workflow_status') {
      const workflowId = args.workflow_id ? automationId(args.workflow_id) : null
      const selectedRunId = args.run_id ? runId(args.run_id) : null
      if (!workflowId && !selectedRunId) throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'workflow_id or run_id is required.')
      if (selectedRunId) {
        const run = await database.getAutomationRun(context.workspace.id, selectedRunId)
        if (!run) throw new LanceeMcpError('MCP_RUN_NOT_FOUND', 'Workflow run not found.', 404)
        const workflow = await database.getAutomation(context.workspace.id, run.automationId)
        return { workflow, run }
      }
      const workflow = await database.getAutomation(context.workspace.id, workflowId)
      if (!workflow) throw new LanceeMcpError('MCP_WORKFLOW_NOT_FOUND', 'Workflow not found.', 404)
      const runs = args.include_runs === false
        ? []
        : (await database.listAutomationRuns(context.workspace.id)).filter((run) => run.automationId === workflowId).slice(0, 20)
      const scheduled = await database.listAutomationSchedules(context.workspace.id, workflowId)
      return { workflow, runs, schedules: scheduled }
    }
    if (name === 'schedule_job') return scheduleJob(context, args)
    if (name === 'get_logs') {
      const selectedRunId = runId(args.run_id)
      const run = await database.getAutomationRun(context.workspace.id, selectedRunId)
      if (!run) throw new LanceeMcpError('MCP_RUN_NOT_FOUND', 'Workflow run not found.', 404)
      const requestedLevel = args.level === undefined ? 'all' : String(args.level)
      const level = requestedLevel === 'warn' ? 'warning' : requestedLevel
      const eventType = textArgument(args, 'event_type', { maxLength: 80 })
      const limit = Number.isInteger(args.limit) ? Math.min(200, Math.max(1, args.limit)) : 100
      if (!['all', 'info', 'warning', 'error'].includes(level)) throw new LanceeMcpError('MCP_INVALID_ARGUMENTS', 'Use all, info, warning, or error for level.')
      const logs = (run.events || []).filter((event) => (level === 'all' || event.level === level) && (!eventType || event.eventType === eventType))
      return { runId: selectedRunId, logs: logs.slice(0, limit), total: logs.length }
    }
    if (name === 'create_decision') {
      const expectedReaction = args.expected_reaction
        ? [{
            metricKey: args.expected_reaction.metric_key,
            direction: args.expected_reaction.direction,
            expectedChange: args.expected_reaction.expected_change,
            confidence: args.expected_reaction.confidence,
            reviewDueAt: args.expected_reaction.review_due_at,
          }]
        : []
      const decision = await decisionDynamics.createDecision(context, {
        title: args.title,
        decisionText: args.decision_text,
        rationale: args.rationale,
        intent: args.intent,
        objectType: args.object_type,
        objectId: args.object_id,
        decidedAt: args.decided_at,
        vector: {
          objectType: args.object_type,
          actionType: args.vector.action_type,
          targetType: args.vector.target_type,
          sourceState: args.vector.source_state,
          destinationState: args.vector.destination_state,
          intentType: args.vector.intent_type,
          expectedDirection: args.vector.expected_direction,
        },
        expectedReactions: expectedReaction,
      })
      return { decision }
    }
    if (name === 'list_decisions') {
      const decisions = await decisionDynamics.listDecisions(context, {
        status: args.status || null,
        limit: args.limit,
      })
      return { decisions, total: decisions.length }
    }
    if (name === 'get_decision') {
      const decision = await decisionDynamics.getDecision(context, args.decision_id)
      if (!decision) throw new LanceeMcpError('MCP_RESOURCE_NOT_FOUND', 'Decision not found.', 404)
      return { decision }
    }
    if (name === 'schedule_decision_review') {
      const review = await decisionDynamics.scheduleDecisionReview(context, args.decision_id, {
        metricKey: args.metric_key,
        dueAt: args.due_at,
      })
      return { review }
    }
    if (name === 'list_decision_reviews') {
      const reviews = await decisionDynamics.listDecisionReviews(context, {
        status: args.status,
        limit: args.limit,
      })
      return {
        reviews,
        total: reviews.length,
        resultScope: 'decision_outcome_reviews',
        emptyResultMeaning: 'No outcome reviews matched this query. This does not establish whether decisions, evidence, or decision inputs exist.',
      }
    }
    if (name === 'record_outcome') {
      const hasControlValues = args.control_baseline_value !== undefined ||
        args.control_observed_value !== undefined
      if (hasControlValues && args.analysis_design !== 'controlled_before_after') {
        throw new LanceeMcpError(
          'MCP_INVALID_ARGUMENTS',
          'Control values require analysis_design controlled_before_after.',
        )
      }
      const result = await decisionDynamics.recordOutcome(context, args.decision_id, {
        metric: {
          metricKey: args.metric_key,
          unit: args.unit,
          baselineValue: args.baseline_value,
          baselineWindowStart: args.baseline_window_start,
          baselineWindowEnd: args.baseline_window_end,
          observedValue: args.observed_value,
          observationWindowStart: args.observation_window_start,
          observationWindowEnd: args.observation_window_end,
        },
        outcomeClass: args.outcome_class,
        observedReason: args.observed_reason,
        evidenceConfidence: args.evidence_confidence,
        causalConfidence: args.causal_confidence,
        causalAnalysis: {
          designType: args.analysis_design,
          controlBaselineValue: args.control_baseline_value,
          controlObservedValue: args.control_observed_value,
        },
      })
      return { outcome: { id: args.decision_id, ...result } }
    }
    if (name === 'get_decision_outcome') {
      const result = await decisionDynamics.getDecisionOutcome(context, args.decision_id)
      if (!result) throw new LanceeMcpError('MCP_RESOURCE_NOT_FOUND', 'Decision not found.', 404)
      return { outcome: { id: args.decision_id, ...result } }
    }
    if (name === 'get_decision_evidence') {
      const evidence = await decisionDynamics.getDecisionEvidence(context, args.decision_id)
      if (!evidence) throw new LanceeMcpError('MCP_RESOURCE_NOT_FOUND', 'Decision not found.', 404)
      return { evidence, total: evidence.length }
    }
    if (name === 'compare_decision') {
      const result = await decisionDynamics.compareDecision(context, args.decision_id, {
        limit: args.limit,
        threshold: args.threshold,
      })
      return result
    }
    if (name === 'get_decision_comparison') {
      const comparison = await decisionDynamics.getDecisionComparison(context, args.comparison_id)
      if (!comparison) throw new LanceeMcpError('MCP_RESOURCE_NOT_FOUND', 'Decision comparison not found.', 404)
      return { comparison }
    }
    if (name === 'review_decision_comparison') {
      const comparison = await decisionDynamics.reviewDecisionComparison(context, args.comparison_id, {
        action: args.action,
        comparable: args.comparable,
        contextualSimilarity: args.contextual_similarity,
        sharedFactors: args.shared_factors,
        materialDifferences: args.material_differences,
        explanation: args.explanation,
      })
      return { comparison }
    }
    if (name === 'refresh_decision_intelligence') {
      return { refresh: await decisionDynamics.refreshDecisionIntelligence(context) }
    }
    if (name === 'list_decision_patterns') {
      const patterns = await decisionDynamics.listDecisionPatterns(context, {
        status: args.status,
        limit: args.limit,
      })
      return { patterns, total: patterns.length }
    }
    if (name === 'list_decision_predictions') {
      const predictions = await decisionDynamics.listDecisionPredictions(context, {
        decisionId: args.decision_id,
        status: args.status,
        limit: args.limit,
      })
      return { predictions, total: predictions.length }
    }
    if (name === 'list_decision_warnings') {
      const warnings = await decisionDynamics.listDecisionWarnings(context, {
        status: args.status,
        limit: args.limit,
      })
      return { warnings, total: warnings.length }
    }
    if (name === 'review_decision_warning') {
      const warning = await decisionDynamics.reviewDecisionWarning(context, args.warning_id, args.action)
      return { warning }
    }
    if (name === 'get_decision_causal_assessment') {
      const assessment = await decisionDynamics.getDecisionCausalAssessment(
        context,
        args.decision_id,
        args.metric_key,
      )
      if (!assessment) throw new LanceeMcpError('MCP_RESOURCE_NOT_FOUND', 'Causal assessment not found.', 404)
      return { assessment }
    }
    if (name === 'get_decision_learning_model') {
      const model = await decisionDynamics.getDecisionLearningModel(context, args.model_type)
      if (!model) throw new LanceeMcpError('MCP_RESOURCE_NOT_FOUND', 'Decision learning model not found.', 404)
      return { model }
    }
    if (name === 'get_decision_intelligence_overview') {
      return { overview: await decisionDynamics.getDecisionIntelligenceOverview(context) }
    }
    throw new LanceeMcpError('MCP_TOOL_NOT_FOUND', `Unknown Lancee MCP tool: ${name}.`, 404)
  }

  const capabilityRegistry = capabilities || createLanceeCapabilityRegistry({
    database,
    requestImpl,
    dnsLookup,
    env,
    now,
    renderPdf,
    renderDocx,
    browserWorker,
    executionWorker,
    sharpImpl,
    integrationGateway,
    authorize,
    audit,
    additionalCapabilities: createPlatformCapabilityDefinitions(invokePlatformTool),
  })

  async function invoke(name, rawArguments, rawContext, invocation = {}) {
    const context = requireContext(rawContext)
    const args = objectArguments(rawArguments)
    const capabilityId = lanceeMcpCapabilityBindings[name]
    if (!capabilityId || !capabilityRegistry.has(capabilityId)) {
      throw new LanceeMcpError('MCP_TOOL_NOT_FOUND', `Unknown Lancee MCP tool: ${name}.`, 404)
    }
    if (name === 'call_external_api') requireOwner(context)
    try {
      return await capabilityRegistry.invoke(capabilityId, args, context, {
        origin: 'mcp',
        ...invocation,
      })
    } catch (error) {
      if (error instanceof LanceeCapabilityError) {
        throw new LanceeMcpError(`MCP_${error.code}`, error.message, error.status)
      }
      throw error
    }
  }

  function normalizeResult(name, result, metadata = {}) {
    const capabilityId = lanceeMcpCapabilityBindings[name]
    const capability = capabilityId ? capabilityRegistry.get(capabilityId) : null
    if (!capabilityId || !capability) {
      throw new LanceeMcpError('MCP_TOOL_NOT_FOUND', `Unknown Lancee MCP tool: ${name}.`, 404)
    }
    try {
      const normalized = normalizeCapabilityResult(capabilityId, result)
      return {
        success: true,
        ok: true,
        data: normalized.data,
        artifacts: normalized.artifacts,
        warnings: normalized.warnings,
        error: null,
        metadata: {
          contractVersion: LANCEE_MCP_RESULT_CONTRACT_VERSION,
          tool: name,
          capabilityId,
          provider: capability.provider,
          ...metadata,
          ...normalized.diagnostics,
        },
      }
    } catch (error) {
      throw new LanceeMcpError('MCP_INVALID_RESULT', error.message || 'The tool returned an invalid result.', 502)
    }
  }

  function listTools() {
    return Object.entries(lanceeMcpCapabilityBindings).flatMap(([name, capabilityId]) => {
      const capability = capabilityRegistry.get(capabilityId)
      if (!capability) return []
      const existing = lanceeMcpToolDefinitions.find((tool) => tool.name === name)
      const openWorld = ['web', 'browser', 'integration'].includes(capability.namespace)
      return [{
        name,
        title: existing?.title || name.split('_').map((word) => word[0].toUpperCase() + word.slice(1)).join(' '),
        description: capability.description,
        inputSchema: capability.inputSchema,
        outputSchema: mcpOutputSchema(),
        annotations: existing?.annotations || {
          readOnlyHint: capability.riskLevel === 'read',
          destructiveHint: ['destructive', 'administrative'].includes(capability.riskLevel),
          idempotentHint: capability.riskLevel === 'read',
          ...(openWorld ? { openWorldHint: true } : {}),
        },
      }]
    })
  }

  return {
    invoke,
    normalizeResult,
    startScheduler,
    stopScheduler,
    dispatchDueSchedules,
    listCapabilities: () => capabilityRegistry.list(),
    listTools,
    capabilities: capabilityRegistry,
  }
}
