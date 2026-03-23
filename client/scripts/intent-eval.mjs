import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRequestContract, buildResponsePlan, classifyIntentDecision } from '../src/orchestration/intentPolicy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const casesPath = path.join(__dirname, 'intent-eval-cases.json');
const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));

let passed = 0;
const failures = [];

for (const testCase of cases) {
  const request = buildRequestContract(
    testCase.prompt,
    testCase.componentType,
    Boolean(testCase.isRefinement),
    [],
    true,
    Boolean(testCase.hasPriorResult)
  );
  const decision = classifyIntentDecision(request);
  const responsePlan = buildResponsePlan(request, decision);

  const mismatches = [];
  if (decision.intent !== testCase.expectedIntent) {
    mismatches.push(`intent expected=${testCase.expectedIntent} actual=${decision.intent}`);
  }
  if (decision.action !== testCase.expectedAction) {
    mismatches.push(`action expected=${testCase.expectedAction} actual=${decision.action}`);
  }
  if (testCase.expectedMode && decision.mode !== testCase.expectedMode) {
    mismatches.push(`mode expected=${testCase.expectedMode} actual=${decision.mode}`);
  }
  if (testCase.expectedScope && decision.scope !== testCase.expectedScope) {
    mismatches.push(`scope expected=${testCase.expectedScope} actual=${decision.scope}`);
  }
  if (testCase.expectedRefinementScope && decision.refinementScope !== testCase.expectedRefinementScope) {
    mismatches.push(`refinementScope expected=${testCase.expectedRefinementScope} actual=${decision.refinementScope || 'none'}`);
  }
  if (testCase.expectedConfidence && decision.confidence !== testCase.expectedConfidence) {
    mismatches.push(`confidence expected=${testCase.expectedConfidence} actual=${decision.confidence}`);
  }
  if (testCase.riskLevel && decision.riskLevel !== testCase.riskLevel) {
    mismatches.push(`riskLevel expected=${testCase.riskLevel} actual=${decision.riskLevel}`);
  }
  if (typeof testCase.requiresContext === 'boolean' && decision.requiresContext !== testCase.requiresContext) {
    mismatches.push(`requiresContext expected=${testCase.requiresContext} actual=${decision.requiresContext}`);
  }
  if (typeof testCase.shouldAutoExecute === 'boolean' && decision.shouldAutoExecute !== testCase.shouldAutoExecute) {
    mismatches.push(`shouldAutoExecute expected=${testCase.shouldAutoExecute} actual=${decision.shouldAutoExecute}`);
  }
  if (Object.prototype.hasOwnProperty.call(testCase, 'secondaryIntent')) {
    const expectedSecondary = testCase.secondaryIntent ?? null;
    const actualSecondary = decision.secondaryIntent ?? null;
    if (actualSecondary !== expectedSecondary) {
      mismatches.push(`secondaryIntent expected=${expectedSecondary} actual=${actualSecondary}`);
    }
  }
  if (testCase.expectedTone && responsePlan.tone !== testCase.expectedTone) {
    mismatches.push(`tone expected=${testCase.expectedTone} actual=${responsePlan.tone}`);
  }
  if (testCase.expectedStructure && responsePlan.structure !== testCase.expectedStructure) {
    mismatches.push(`structure expected=${testCase.expectedStructure} actual=${responsePlan.structure}`);
  }
  if (testCase.expectedArchetype && responsePlan.archetype !== testCase.expectedArchetype) {
    mismatches.push(`archetype expected=${testCase.expectedArchetype} actual=${responsePlan.archetype}`);
  }
  if (testCase.expectedUserState && responsePlan.userState !== testCase.expectedUserState) {
    mismatches.push(`userState expected=${testCase.expectedUserState} actual=${responsePlan.userState}`);
  }
  if (typeof testCase.shouldExplainReasoning === 'boolean' && responsePlan.shouldExplainReasoning !== testCase.shouldExplainReasoning) {
    mismatches.push(`shouldExplainReasoning expected=${testCase.shouldExplainReasoning} actual=${responsePlan.shouldExplainReasoning}`);
  }
  if (typeof testCase.shouldOfferNextStep === 'boolean' && responsePlan.shouldOfferNextStep !== testCase.shouldOfferNextStep) {
    mismatches.push(`shouldOfferNextStep expected=${testCase.shouldOfferNextStep} actual=${responsePlan.shouldOfferNextStep}`);
  }
  if (testCase.expectedAcknowledgementPrefix) {
    const expectedPrefix = String(testCase.expectedAcknowledgementPrefix).toLowerCase();
    const actualPrefix = String(responsePlan.acknowledgementPrefix || '').toLowerCase();
    if (!actualPrefix.startsWith(expectedPrefix)) {
      mismatches.push(`acknowledgementPrefix expected~=${testCase.expectedAcknowledgementPrefix} actual=${responsePlan.acknowledgementPrefix || 'none'}`);
    }
  }

  if (mismatches.length === 0) {
    passed += 1;
    console.log(`PASS  ${testCase.name}`);
  } else {
    failures.push({ name: testCase.name, mismatches, decision, responsePlan, prompt: testCase.prompt });
    console.log(`FAIL  ${testCase.name}`);
  }
}

console.log('');
console.log(`Intent eval: ${passed}/${cases.length} passed`);

if (failures.length > 0) {
  console.log('');
  for (const fail of failures) {
    console.log(`- ${fail.name}`);
    for (const mismatch of fail.mismatches) {
      console.log(`  * ${mismatch}`);
    }
    console.log(`  * decision=${JSON.stringify(fail.decision)}`);
    console.log(`  * responsePlan=${JSON.stringify(fail.responsePlan)}`);
    console.log(`  * prompt=${fail.prompt}`);
  }
  process.exit(1);
}
