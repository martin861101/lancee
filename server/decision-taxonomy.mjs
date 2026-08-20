export const DECISION_VECTOR_VERSION = 'decision-vector-v1'

export const DECISION_VECTOR_FIELDS = Object.freeze([
  'objectType',
  'actionType',
  'targetType',
  'sourceState',
  'destinationState',
  'intentType',
  'expectedDirection',
])

export function normalizeTaxonomyValue(value, { required = false, field = 'value' } = {}) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120)
  if (required && !normalized) throw new TypeError(`${field} is required.`)
  return normalized || null
}

export function normalizeDecisionVector(value = {}, fallbackObjectType = null) {
  return {
    objectType: normalizeTaxonomyValue(value.objectType ?? value.object_type ?? fallbackObjectType, {
      required: true,
      field: 'objectType',
    }),
    actionType: normalizeTaxonomyValue(value.actionType ?? value.action_type, {
      required: true,
      field: 'actionType',
    }),
    targetType: normalizeTaxonomyValue(value.targetType ?? value.target_type, {
      required: true,
      field: 'targetType',
    }),
    sourceState: normalizeTaxonomyValue(value.sourceState ?? value.source_state),
    destinationState: normalizeTaxonomyValue(value.destinationState ?? value.destination_state),
    intentType: normalizeTaxonomyValue(value.intentType ?? value.intent_type, {
      required: true,
      field: 'intentType',
    }),
    expectedDirection: normalizeTaxonomyValue(value.expectedDirection ?? value.expected_direction, {
      required: true,
      field: 'expectedDirection',
    }),
    vectorVersion: DECISION_VECTOR_VERSION,
  }
}
