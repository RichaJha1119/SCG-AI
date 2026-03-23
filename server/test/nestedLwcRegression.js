import dotenv from 'dotenv';
import { generateSalesforceComponent } from '../services/aiService.js';

dotenv.config();

const TEST_CASES = [
  {
    id: 'deep-nested-customer-onboarding',
    label: 'Deep Nested: Customer Onboarding',
    architecturePreference: 'nested',
    scenario: 'deep-nested',
    prompt: `Create a modular Salesforce LWC for “Customer Onboarding”.

Architecture:

Parent: customerOnboarding

Children: personalInfoSection, addressSection, reviewSection

Deep nesting requirement: addressSection must itself contain a nested child component called postalCodeLookup.

Behavior:

postalCodeLookup accepts postalCode via @api, performs client-side lookup stub (mock data), and emits addressupdate event with city and state.

addressSection listens to addressupdate, updates its local state, and emits sectionchange to the parent.

Parent aggregates all state and submits.

UI:

Use SLDS.

2-column rows wherever it makes sense.

Submit button only in parent.`,
    expectedParent: 'customerOnboarding',
    expectedBundles: ['customerOnboarding', 'personalInfoSection', 'addressSection', 'postalCodeLookup', 'reviewSection'],
    expectedChildren: ['personalInfoSection', 'addressSection', 'reviewSection'],
    expectedParentButtons: ['Submit'],
  },
  {
    id: 'conditional-nested-shipping-details',
    label: 'Conditional Nested: Shipping Details',
    architecturePreference: 'nested',
    scenario: 'conditional-nested',
    prompt: `Create a modular Salesforce LWC “Shipping Details” form.

Architecture:

Parent: shippingDetails

Children: shippingMethodSection, addressSection

Conditional children:

If Shipping Method = “Pickup” → render pickupLocationSection

If Shipping Method = “Delivery” → render deliveryWindowSection

Behavior:

shippingMethodSection contains a combobox with options Pickup/Delivery and emits methodchange.

Parent stores the method and conditionally renders the correct section.

Parent has Save + Cancel buttons at bottom.

Rules:

Do NOT include both conditional children at the same time.

Use SLDS and correct layout sizes.`,
    expectedParent: 'shippingDetails',
    expectedBundles: ['shippingDetails', 'shippingMethodSection', 'addressSection', 'pickupLocationSection', 'deliveryWindowSection'],
    expectedChildren: ['shippingMethodSection', 'addressSection'],
    expectedParentButtons: ['Save', 'Cancel'],
  },
  {
    id: 'event-propagation-order-entry',
    label: 'Bulk Event Propagation: Order Entry',
    architecturePreference: 'nested',
    scenario: 'bulk-event-propagation',
    prompt: `Create a modular Salesforce LWC “Order Entry” form with repeatable line items.

Architecture:

Parent: orderEntryForm

Children:

orderHeaderSection (Account, Order Date, Status)

lineItemsSection (manages list of line items)

lineItemRow (reusable row component)

Behavior:

lineItemsSection renders a list of lineItemRow components using for:each.

Each lineItemRow has Product, Quantity, Unit Price (Product + Quantity side-by-side, Unit Price separate).

Each row emits rowchange with { index, field, value }.

lineItemsSection aggregates line item state and emits sectionchange to parent.

Parent computes totalAmount and displays it in review area.

UI:

Add “Add Line Item” button inside lineItemsSection.

Submit button only in parent.`,
    expectedParent: 'orderEntryForm',
    expectedBundles: ['orderEntryForm', 'orderHeaderSection', 'lineItemsSection', 'lineItemRow'],
    expectedChildren: ['orderHeaderSection', 'lineItemsSection'],
    expectedParentButtons: ['Submit'],
  },
];

function fail(message) {
  return { pass: false, message };
}

function pass(message) {
  return { pass: true, message };
}

function toKebabCase(value = '') {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function groupBundles(components = []) {
  const lwc = components.filter(c => String(c.type || '').startsWith('LWC_'));
  const bundles = new Map();

  for (const component of lwc) {
    const bundle = component.bundle || component.name;
    if (!bundle) continue;
    if (!bundles.has(bundle)) bundles.set(bundle, []);
    bundles.get(bundle).push(component);
  }

  return bundles;
}

function findParentBundle(bundleMap) {
  for (const [bundleName, files] of bundleMap.entries()) {
    const html = files.find(file => file.type === 'LWC_HTML')?.content || '';
    if (/<c-[a-z0-9-]+\b/i.test(html)) {
      return bundleName;
    }
  }
  return null;
}

function hasAllRequiredBundleFiles(files = []) {
  const types = new Set(files.map(file => file.type));
  return types.has('LWC_HTML') && types.has('LWC_JS') && types.has('LWC_META');
}

function getBundleFile(bundleMap, bundleName, type) {
  return bundleMap.get(bundleName)?.find(file => file.type === type)?.content || '';
}

function hasButtonLabel(html, label) {
  return new RegExp(`<lightning-button\\b[^>]*\\blabel="${label}"`, 'i').test(html);
}

function hasAllButtonLabels(html, labels = []) {
  return labels.every(label => hasButtonLabel(html, label));
}

function hasAnyActionButton(html) {
  return /<lightning-button\b[^>]*\blabel="(?:submit|save|cancel)"/i.test(html);
}

function hasTag(html, bundleName) {
  const tag = `c-${toKebabCase(bundleName)}`;
  return new RegExp(`<${tag}\\b`, 'i').test(html);
}

function validateBundleCompleteness(checks, bundleMap, bundleNames) {
  for (const bundleName of bundleNames) {
    checks.push(
      hasAllRequiredBundleFiles(bundleMap.get(bundleName))
        ? pass(`Bundle completeness OK for ${bundleName}`)
        : fail(`Bundle ${bundleName} missing html/js/meta`)
    );
  }
}

function validateSubmitOnlyInParent(checks, bundleMap, parentBundle, requiredButtons = ['Submit']) {
  const parentHtml = getBundleFile(bundleMap, parentBundle, 'LWC_HTML');
  checks.push(
    hasAllButtonLabels(parentHtml, requiredButtons)
      ? pass(`Parent includes required action button(s): ${requiredButtons.join(', ')}`)
      : fail(`Parent missing required action button(s): ${requiredButtons.join(', ')}`)
  );

  for (const [bundleName] of bundleMap.entries()) {
    if (bundleName === parentBundle) continue;
    const childHtml = getBundleFile(bundleMap, bundleName, 'LWC_HTML');
    checks.push(
      !hasAnyActionButton(childHtml)
        ? pass(`Child ${bundleName} has no submit/save/cancel button`)
        : fail(`Child ${bundleName} contains submit/save/cancel button`)
    );
  }
}

function validateMetaExposure(checks, bundleMap, parentBundle) {
  const parentMeta = getBundleFile(bundleMap, parentBundle, 'LWC_META');
  checks.push(
    /<target>\s*lightning__(?:AppPage|RecordPage)\s*<\/target>/i.test(parentMeta)
      ? pass('Parent meta exposes AppPage/RecordPage target')
      : fail('Parent meta missing AppPage/RecordPage target exposure')
  );

  for (const [bundleName] of bundleMap.entries()) {
    if (bundleName === parentBundle) continue;
    const childMeta = getBundleFile(bundleMap, bundleName, 'LWC_META');
    const childExposesStandalone = /<target>\s*lightning__(?:AppPage|RecordPage|HomePage)\s*<\/target>/i.test(childMeta);
    checks.push(
      !childExposesStandalone
        ? pass(`Child meta is not standalone-exposed: ${bundleName}`)
        : fail(`Child meta should not expose app/record/home targets: ${bundleName}`)
    );
  }
}

function validateDeploymentOrder(checks, generated) {
  const deploymentText = (generated.deploymentSteps || []).join('\n').toLowerCase();
  const hasChildDeploy = /deploy\s+child\s+bundle/.test(deploymentText);
  const hasParentDeploy = /deploy\s+parent\s+bundle/.test(deploymentText);
  checks.push(
    hasChildDeploy && hasParentDeploy
      ? pass('Deployment order includes child then parent bundle steps')
      : fail('Deployment steps missing child/parent bundle order instructions')
  );
}

function validateExpectedBundles(checks, bundleNames, expectedBundles) {
  for (const bundle of expectedBundles || []) {
    checks.push(
      bundleNames.includes(bundle)
        ? pass(`Expected bundle present: ${bundle}`)
        : fail(`Missing expected bundle: ${bundle}`)
    );
  }
}

function validateExpectedParentAndChildren(checks, bundleMap, parentBundle, expectedParent, expectedChildren) {
  const parentHtml = getBundleFile(bundleMap, parentBundle, 'LWC_HTML');

  checks.push(
    parentBundle === expectedParent
      ? pass(`Expected parent bundle detected: ${expectedParent}`)
      : fail(`Expected parent ${expectedParent}, detected ${parentBundle || 'none'}`)
  );

  for (const child of expectedChildren || []) {
    checks.push(
      hasTag(parentHtml, child)
        ? pass(`Parent renders child tag for ${child}`)
        : fail(`Parent is missing child tag for ${child}`)
    );
  }
}

function validateDeepNestedScenario(checks, bundleMap) {
  const addressHtml = getBundleFile(bundleMap, 'addressSection', 'LWC_HTML');
  const addressJs = getBundleFile(bundleMap, 'addressSection', 'LWC_JS');
  const postalJs = getBundleFile(bundleMap, 'postalCodeLookup', 'LWC_JS');

  checks.push(
    hasTag(addressHtml, 'postalCodeLookup')
      ? pass('addressSection renders nested postalCodeLookup child')
      : fail('addressSection.html missing <c-postal-code-lookup>')
  );

  checks.push(
    /dispatchEvent\s*\(\s*new\s+CustomEvent\s*\(\s*['"]addressupdate['"]/i.test(postalJs)
      ? pass('postalCodeLookup dispatches addressupdate event')
      : fail('postalCodeLookup.js missing addressupdate CustomEvent dispatch')
  );

  checks.push(
    /onaddressupdate\s*=\s*\{[A-Za-z_$][\w$]*\}/i.test(addressHtml)
      ? pass('addressSection listens to onaddressupdate from postalCodeLookup')
      : fail('addressSection.html missing onaddressupdate event handler')
  );

  checks.push(
    /dispatchEvent\s*\(\s*new\s+CustomEvent\s*\(\s*['"]sectionchange['"]/i.test(addressJs)
      ? pass('addressSection re-emits sectionchange upward')
      : fail('addressSection.js missing sectionchange re-emit')
  );
}

function validateConditionalNestedScenario(checks, bundleMap) {
  const parentHtml = getBundleFile(bundleMap, 'shippingDetails', 'LWC_HTML');
  const parentJs = getBundleFile(bundleMap, 'shippingDetails', 'LWC_JS');
  const methodJs = getBundleFile(bundleMap, 'shippingMethodSection', 'LWC_JS');

  checks.push(
    /<template\b[^>]*if:true=\{isPickup\}[\s\S]*?<c-pickup-location-section\b/i.test(parentHtml)
      ? pass('Parent conditionally renders pickupLocationSection with if:true={isPickup}')
      : fail('Parent missing conditional template for pickupLocationSection')
  );

  checks.push(
    /<template\b[^>]*if:true=\{isDelivery\}[\s\S]*?<c-delivery-window-section\b/i.test(parentHtml)
      ? pass('Parent conditionally renders deliveryWindowSection with if:true={isDelivery}')
      : fail('Parent missing conditional template for deliveryWindowSection')
  );

  checks.push(
    /\bisPickup\b/.test(parentJs) && /\bisDelivery\b/.test(parentJs)
      ? pass('Parent JS defines isPickup/isDelivery state or getters')
      : fail('Parent JS missing isPickup/isDelivery derived state')
  );

  checks.push(
    /dispatchEvent\s*\(\s*new\s+CustomEvent\s*\(\s*['"]methodchange['"]/i.test(methodJs)
      ? pass('shippingMethodSection dispatches methodchange event')
      : fail('shippingMethodSection.js missing methodchange dispatch')
  );

  checks.push(
    /<c-shipping-method-section\b[^>]*\bonmethodchange\s*=\s*\{[A-Za-z_$][\w$]*\}/i.test(parentHtml)
      ? pass('Parent listens to onmethodchange from shippingMethodSection')
      : fail('Parent missing onmethodchange wiring for shippingMethodSection')
  );
}

function validateBulkEventPropagationScenario(checks, bundleMap) {
  const parentHtml = getBundleFile(bundleMap, 'orderEntryForm', 'LWC_HTML');
  const parentJs = getBundleFile(bundleMap, 'orderEntryForm', 'LWC_JS');
  const lineItemsHtml = getBundleFile(bundleMap, 'lineItemsSection', 'LWC_HTML');
  const lineItemsJs = getBundleFile(bundleMap, 'lineItemsSection', 'LWC_JS');
  const lineItemRowHtml = getBundleFile(bundleMap, 'lineItemRow', 'LWC_HTML');
  const lineItemRowJs = getBundleFile(bundleMap, 'lineItemRow', 'LWC_JS');

  checks.push(
    /for:each=\{[^}]+\}[\s\S]*?<c-line-item-row\b[\s\S]*?key=\{[^}]+\}/i.test(lineItemsHtml)
      ? pass('lineItemsSection renders lineItemRow with for:each and key binding')
      : fail('lineItemsSection.html missing for:each + keyed <c-line-item-row> rendering')
  );

  checks.push(
    /dispatchEvent\s*\(\s*new\s+CustomEvent\s*\(\s*['"]rowchange['"][\s\S]*?detail\s*:\s*\{[\s\S]*?index\s*:/i.test(lineItemRowJs)
      ? pass('lineItemRow dispatches rowchange with index in event detail')
      : fail('lineItemRow.js missing rowchange dispatch with index detail')
  );

  const immutableUpdate = /\bthis\.[A-Za-z_$][\w$]*\s*=\s*\[\s*\.\.\.\s*this\.[A-Za-z_$][\w$]*/.test(lineItemsJs)
    || /\bthis\.[A-Za-z_$][\w$]*\s*=\s*this\.[A-Za-z_$][\w$]*\.map\(/.test(lineItemsJs);
  checks.push(
    immutableUpdate
      ? pass('lineItemsSection updates array state immutably')
      : fail('lineItemsSection.js does not show immutable array update pattern')
  );

  checks.push(
    /dispatchEvent\s*\(\s*new\s+CustomEvent\s*\(\s*['"]sectionchange['"]/i.test(lineItemsJs)
      ? pass('lineItemsSection re-emits sectionchange to parent')
      : fail('lineItemsSection.js missing sectionchange re-emit')
  );

  checks.push(
    /\btotalAmount\b[\s\S]*?(reduce|\+\s*(?:Number|parseFloat|parseInt)?)/i.test(parentJs) && /\{totalAmount\}/.test(parentHtml)
      ? pass('Parent computes and renders totalAmount')
      : fail('Parent missing totalAmount compute-and-render flow')
  );

  checks.push(
    hasButtonLabel(lineItemsHtml, 'Add Line Item')
      ? pass('Add Line Item button exists in lineItemsSection')
      : fail('lineItemsSection.html missing Add Line Item button')
  );

  checks.push(
    !hasButtonLabel(parentHtml, 'Add Line Item') && !hasButtonLabel(lineItemRowHtml, 'Add Line Item')
      ? pass('Add Line Item button is scoped to lineItemsSection only')
      : fail('Add Line Item button appears outside lineItemsSection')
  );

  const allHtml = [parentHtml, lineItemsHtml, lineItemRowHtml, getBundleFile(bundleMap, 'orderHeaderSection', 'LWC_HTML')].join('\n');
  checks.push(
    !/\bstyle\s*=\s*['"][^'"]+['"]/i.test(allHtml)
      ? pass('No inline style attributes detected')
      : fail('Inline style attributes detected in Order Entry bundles')
  );

  checks.push(
    /<lightning-layout\b/i.test(lineItemRowHtml) && /<lightning-layout-item\b/i.test(lineItemRowHtml)
      ? pass('lineItemRow uses lightning-layout for side-by-side fields')
      : fail('lineItemRow.html missing lightning-layout/lightning-layout-item usage')
  );
}

function validateNestedCase(testCase, generated) {
  const checks = [];
  const bundleMap = groupBundles(generated.components || []);
  const bundleNames = [...bundleMap.keys()];
  const parentBundle = findParentBundle(bundleMap);

  checks.push(bundleNames.length >= 2 ? pass(`Created ${bundleNames.length} LWC bundles`) : fail(`Expected nested bundles, got ${bundleNames.length}`));
  validateExpectedBundles(checks, bundleNames, testCase.expectedBundles || []);
  validateBundleCompleteness(checks, bundleMap, bundleNames);

  if (!parentBundle) {
    checks.push(fail('Could not detect a parent bundle that renders child tags'));
    return checks;
  }

  validateExpectedParentAndChildren(checks, bundleMap, parentBundle, testCase.expectedParent, testCase.expectedChildren || []);
  validateSubmitOnlyInParent(checks, bundleMap, parentBundle, testCase.expectedParentButtons || ['Submit']);
  validateMetaExposure(checks, bundleMap, parentBundle);
  validateDeploymentOrder(checks, generated);

  if (testCase.scenario === 'deep-nested') {
    validateDeepNestedScenario(checks, bundleMap);
  } else if (testCase.scenario === 'conditional-nested') {
    validateConditionalNestedScenario(checks, bundleMap);
  } else if (testCase.scenario === 'bulk-event-propagation') {
    validateBulkEventPropagationScenario(checks, bundleMap);
  }

  return checks;
}

async function runCase(testCase) {
  const start = Date.now();

  try {
    const generated = await generateSalesforceComponent(
      testCase.prompt,
      'lwc',
      null,
      null,
      [],
      testCase.architecturePreference
    );

    const checks = validateNestedCase(testCase, generated);
    const passed = checks.filter(check => check.pass).length;
    const failed = checks.length - passed;

    return {
      id: testCase.id,
      label: testCase.label,
      durationMs: Date.now() - start,
      checks,
      passed,
      failed,
      ok: failed === 0,
      summary: generated.summary,
    };
  } catch (error) {
    return {
      id: testCase.id,
      label: testCase.label,
      durationMs: Date.now() - start,
      checks: [fail(`Execution error: ${error instanceof Error ? error.message : String(error)}`)],
      passed: 0,
      failed: 1,
      ok: false,
      summary: '',
    };
  }
}

function printResult(result) {
  const status = result.ok ? 'PASS' : 'FAIL';
  const icon = result.ok ? '✅' : '❌';

  console.log(`\n${icon} [${status}] ${result.id} — ${result.label}`);
  console.log(`Duration: ${result.durationMs}ms | Passed: ${result.passed} | Failed: ${result.failed}`);
  if (result.summary) {
    console.log(`Summary: ${result.summary}`);
  }

  for (const check of result.checks) {
    const checkIcon = check.pass ? '  ✓' : '  ✗';
    console.log(`${checkIcon} ${check.message}`);
  }
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set. Cannot run nested LWC regression tests.');
    process.exit(1);
  }

  console.log(`Running nested LWC regression suite (${TEST_CASES.length} cases)...`);

  const results = [];
  for (const testCase of TEST_CASES) {
    console.log(`\n→ Executing ${testCase.id}`);
    const result = await runCase(testCase);
    results.push(result);
    printResult(result);
  }

  const totalChecks = results.reduce((sum, result) => sum + result.checks.length, 0);
  const totalFailed = results.reduce((sum, result) => sum + result.failed, 0);
  const allPassed = totalFailed === 0;

  console.log('\n=== Nested LWC Regression Summary ===');
  console.log(`Cases: ${results.length}`);
  console.log(`Checks: ${totalChecks}`);
  console.log(`Failed checks: ${totalFailed}`);

  if (!allPassed) {
    console.error('Nested LWC regression suite failed.');
    process.exit(1);
  }

  console.log('Nested LWC regression suite passed.');
}

main();
