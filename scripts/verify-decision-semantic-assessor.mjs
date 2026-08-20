import assert from 'node:assert/strict'
import {
  createHermesDecisionAssessor,
  parseHermesDecisionAssessment,
} from '../server/decision-semantic-assessor.mjs'

let request
const assessor = createHermesDecisionAssessor({
  complete: async (value) => {
    request = value
    return {
      model: 'hermes-semantic-test',
      content: `\`\`\`json
{"comparable":true,"contextual_similarity":0.87,"shared_factors":["same intervention"],"material_differences":["different period"],"explanation":"Comparable with a material timing difference."}
\`\`\``,
    }
  },
})

const evidencePack = {
  contractVersion: 'semantic-reality-check-v1',
  evidencePackVersion: 'decision-evidence-pack-v1',
  newDecision: { decision: { id: 'dec_new' } },
  historicalDecision: { decision: { id: 'dec_old' } },
}
const result = await assessor.assess(evidencePack)
assert.equal(result.comparable, true)
assert.equal(result.contextualSimilarity, 0.87)
assert.deepEqual(result.sharedFactors, ['same intervention'])
assert.equal(result.modelVersion, 'hermes-semantic-test')
assert.equal(result.assessmentVersion, 'hermes-decision-assessment-v1')
assert(request.systemPrompt.includes('Do not recalculate or change authoritative metrics'))
assert(request.systemPrompt.includes('Do not invent evidence, claim causality'))
assert.deepEqual(JSON.parse(request.messages[0].content).evidence_pack, evidencePack)

assert.throws(
  () => parseHermesDecisionAssessment(
    '{"comparable":true,"contextual_similarity":1.2,"shared_factors":[],"material_differences":[],"explanation":"Invalid."}',
  ),
  (error) => error.code === 'HERMES_SEMANTIC_INVALID_RESPONSE',
)
assert.throws(
  () => parseHermesDecisionAssessment('not-json'),
  (error) => error.code === 'HERMES_SEMANTIC_INVALID_RESPONSE',
)
assert.throws(
  () => parseHermesDecisionAssessment(
    '{"comparable":true,"contextual_similarity":null,"shared_factors":[],"material_differences":[],"explanation":"Invalid."}',
  ),
  (error) => error.code === 'HERMES_SEMANTIC_INVALID_RESPONSE',
)

console.log('Hermes semantic reality check verified: bounded JSON contract, contextual-only prompt, provenance, and invalid-response rejection.')
