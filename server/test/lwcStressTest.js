import process from 'node:process';
import dotenv from 'dotenv';
import { generateSalesforceComponent } from '../services/aiService.js';

dotenv.config();

const PROMPTS = [
  {
    id: '1',
    name: 'Multi-column reasoning test',
    tier: 'tier1',
    prompt: `Create a Salesforce Lightning Web Component form with:

First Name + Last Name in one row

Email + Phone in one row

Street full width

City + State + Zip in one row

Country dropdown below

Submit button at bottom
Use proper SLDS grid and spacing.`,
    checks: ['row:first+last', 'row:email+phone', 'row:city+state+zip', 'field:street', 'has-dropdown', 'submit-bottom', 'uses-layout', 'spacing-classes'],
  },
  {
    id: '2',
    name: 'Repeating row pattern test',
    tier: 'tier1',
    prompt: `Build an LWC where every row contains two fields side by side:

Employee First + Last

Manager First + Last

Emergency Contact First + Last

Email + Phone

Submit button`,
    checks: [
      'row:employee first+last',
      'row:manager first+last',
      'row:emergency contact first+last',
      'row:email+phone',
      'pattern:consistent-2col-4rows',
      'button:submit',
      'uses-layout',
    ],
  },
  {
    id: '3',
    name: 'Section hierarchy test',
    tier: 'tier1',
    prompt: `Create a Salesforce onboarding form with sections:
Personal Info
Employment Info
Emergency Contact
Each section must be visually separated with proper spacing.
Use 2-column layout where appropriate.
Add Save button.`,
    checks: ['heading:personal info', 'heading:employment info', 'heading:emergency contact', 'spacing-classes', 'uses-layout', 'button:save'],
  },
  {
    id: '4',
    name: 'Admin configuration UI',
    tier: 'tier2',
    prompt: `Build a Salesforce admin configuration LWC with:
Object dropdown
Field dropdown
Field type dropdown
Required checkbox
Default value field
Object + Field should be on same row.
Save button at bottom.`,
    checks: ['row:object+field', 'dropdown-count:3', 'has-checkbox', 'button:save', 'uses-layout', 'spacing-classes'],
  },
  {
    id: '5',
    name: 'Dashboard layout intelligence',
    tier: 'tier2',
    prompt: `Create a Lightning Web Component dashboard with:

4 KPI cards in one row

chart section below

recent records table below
responsive layout`,
    checks: ['row:kpi4', 'has-table', 'uses-layout', 'responsive-layout', 'spacing-classes'],
  },
  {
    id: '6',
    name: 'Pixel-perfect enterprise form',
    tier: 'tier3',
    prompt: `Create a production-ready Salesforce LWC form.
Use proper SLDS spacing and alignment.
Fields appearing in same row must NEVER stack.
Include section headers and submit button.
Must look like real Salesforce UI.`,
    checks: ['uses-layout', 'layout-size-usage', 'has-headings-any', 'button:submit', 'spacing-classes'],
  },
  {
    id: '7',
    name: 'Validation + UX test',
    tier: 'tier3',
    prompt: `Create an LWC form with:
First Name
Last Name
Email (validate format)
Phone (required)
Show error messages for invalid inputs.
Add loading spinner on submit.`,
    checks: ['required:phone', 'validation-js', 'error-ui', 'spinner', 'event-handling', 'button:submit'],
  },
  {
    id: '8',
    name: 'Dynamic logic test',
    tier: 'tier3',
    prompt: `Create an LWC form where:
If Country = USA → show State dropdown
Otherwise → show text input
Include submit button and validation.`,
    checks: ['conditional-country-state', 'validation-js', 'button:submit', 'has-dropdown', 'event-handling'],
  },
  {
    id: '9',
    name: 'Ambiguous instruction test',
    tier: 'tier4',
    prompt: `Create a Salesforce form for customer onboarding.
Use best UX practices.
Group related fields logically.
Include submit button.`,
    checks: ['uses-layout', 'has-headings-any', 'button:submit', 'spacing-classes'],
  },
  {
    id: '10',
    name: 'Overloaded prompt test',
    tier: 'tier4',
    prompt: `Build a complex Salesforce LWC with:
personal info
address
employment
emergency contact
validation
submit + cancel
responsive layout
Must be production-ready.`,
    checks: ['has-headings-any', 'buttons:submit+cancel', 'validation-js', 'uses-layout', 'responsive-layout', 'spacing-classes'],
  },
  {
    id: '11',
    name: 'Master internal QA prompt',
    tier: 'master',
    prompt: `Create a production-quality Salesforce Lightning Web Component form.
Must use proper SLDS layout.
Must group fields logically.
Must never stack fields that belong in same row.
Include section headers and submit button.
Code must be enterprise-ready.`,
    checks: ['uses-layout', 'has-headings-any', 'button:submit', 'spacing-classes', 'layout-size-usage'],
  },
];

function normalize(value = '') {
  return String(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function labelsEquivalent(expected, actual) {
  const exp = normalize(expected).replace(/[^a-z0-9\s]/g, '');
  const act = normalize(actual).replace(/[^a-z0-9\s]/g, '');
  if (!exp || !act) return false;
  if (exp === act) return true;
  if (exp.includes(act) || act.includes(exp)) return true;
  const compact = value => value.replace(/\b(name|field|api)\b/g, '').replace(/\s+/g, ' ').trim();
  const expCompact = compact(exp);
  const actCompact = compact(act);
  return !!expCompact && !!actCompact && (expCompact === actCompact || expCompact.includes(actCompact) || actCompact.includes(expCompact));
}

function getArtifact(result, type, ext) {
  return (result?.components || []).find(
    component => component?.type === type || component?.extension === ext,
  )?.content || '';
}

function getLayoutBlocks(html) {
  return html.match(/<lightning-layout\b[\s\S]*?<\/lightning-layout>/gi) || [];
}

function getItemCount(layoutBlock) {
  const items = layoutBlock.match(/<lightning-layout-item\b/gi) || [];
  return items.length;
}

function hasRowWithLabels(html, labels) {
  const blocks = getLayoutBlocks(html);
  const expected = labels.map(normalize);
  return blocks.some(block => {
    const found = [...block.matchAll(/\blabel="([^"]+)"/gi)].map(match => normalize(match[1]));
    return expected.every(label => found.some(actual => labelsEquivalent(label, actual)));
  });
}

function hasButtonLabel(html, buttonLabel) {
  const label = normalize(buttonLabel);
  const found = [...html.matchAll(/<lightning-button\b[^>]*\blabel="([^"]+)"/gi)].map(match => normalize(match[1]));
  return found.includes(label);
}

function hasSectionHeading(html, headingText) {
  const text = headingText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`<(?:p|h1|h2|h3|h4)[^>]*>${text}<\\/(?:p|h1|h2|h3|h4)>`, 'i');
  return regex.test(html);
}

function hasAnyHeading(html) {
  return /<(?:p|h1|h2|h3|h4)[^>]*>[^<]+<\/(?:p|h1|h2|h3|h4)>/i.test(html);
}

function hasSpacingClasses(html) {
  return /slds-(?:var-)?m-(?:top|bottom|around)_(?:x-small|small|medium|large)/i.test(html);
}

function hasLayoutSizeUsage(html) {
  return /<lightning-layout-item\b[^>]*\bsize="(?:[3-9]|1[0-2])"/i.test(html);
}

function isSubmitAtBottom(html) {
  const buttons = [...html.matchAll(/<lightning-button\b[^>]*\blabel="([^"]+)"[^>]*>/gi)].map(match => normalize(match[1]));
  if (buttons.length === 0) return false;
  const last = buttons[buttons.length - 1];
  return last === 'submit' || last === 'save';
}

function hasDropdown(html) {
  return /<lightning-(?:combobox|select)\b/i.test(html);
}

function hasCheckbox(html) {
  return /<lightning-input\b[^>]*\btype="checkbox"/i.test(html) || /<lightning-checkbox-group\b/i.test(html);
}

function hasRequiredField(html, fieldLabel) {
  const escaped = fieldLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`<lightning-input\\b[^>]*\\blabel="${escaped}"[^>]*\\brequired\\b`, 'i');
  return regex.test(html);
}

function hasValidationJs(js) {
  return /(checkValidity|reportValidity|setCustomValidity|validity\.)/i.test(js);
}

function hasErrorUi(html) {
  return /if:(?:true|false)=\{[^}]*error[^}]*\}|class="[^"]*(?:error|slds-text-color_error)[^"]*"/i.test(html);
}

function hasSpinner(html) {
  return /<lightning-spinner\b/i.test(html);
}

function hasTextarea(html) {
  return /<lightning-textarea\b/i.test(html);
}

function hasKpi4Row(html) {
  return getLayoutBlocks(html).some(block => getItemCount(block) >= 4);
}

function hasTable(html) {
  return /<lightning-datatable\b|<table\b/i.test(html);
}

function hasFieldLabel(html, fieldLabel) {
  const expected = normalize(fieldLabel);
  const labels = [...html.matchAll(/\blabel="([^"]+)"/gi)].map(match => normalize(match[1]));
  return labels.some(label => labelsEquivalent(expected, label));
}

function hasDropdownCount(html, minCount) {
  const count = (html.match(/<lightning-(combobox|select)\b/gi) || []).length;
  return count >= minCount;
}

function hasEventHandling(js) {
  return /(handleSubmit|handleChange|onchange|onclick|addEventListener)/i.test(js);
}

function hasResponsiveLayout(html) {
  return /small-device-size|medium-device-size|large-device-size|slds-wrap/i.test(html);
}

function hasConsistentTwoColPattern(html, minRows) {
  const blocks = getLayoutBlocks(html);
  const rowBlocks = blocks.filter(block => {
    const labels = [...block.matchAll(/\blabel="([^"]+)"/gi)].map(match => normalize(match[1]));
    return labels.length >= 2;
  });
  if (rowBlocks.length < minRows) return false;
  return rowBlocks.every(block => getItemCount(block) === 2);
}

function hasConditionalCountryState(html, js) {
  const hasCountry = /country/i.test(html) || /country/i.test(js);
  const hasStateDropdown = /<lightning-(combobox|select)\b[^>]*\blabel="[^"]*state[^"]*"/i.test(html);
  const hasStateInput = /<lightning-input\b[^>]*\blabel="[^"]*state[^"]*"/i.test(html);
  const hasCondition = /if:true=\{|if:false=\{|\bisUsa\b|\bselectedCountry\b|\bcountry\b/i.test(html + ' ' + js);
  return hasCountry && hasStateDropdown && hasStateInput && hasCondition;
}

const CHECK_CATEGORY = {
  'row:first+last': 'layout',
  'row:email+phone': 'layout',
  'row:city+state+zip': 'layout',
  'row:employee first+last': 'layout',
  'row:manager first+last': 'layout',
  'row:emergency contact first+last': 'layout',
  'row:object+field': 'layout',
  'row:kpi4': 'layout',
  'field:street': 'layout',
  'uses-layout': 'layout',
  'layout-size-usage': 'layout',
  'submit-bottom': 'layout',
  'pattern:consistent-2col-4rows': 'consistency',
  'heading:personal info': 'realism',
  'heading:employment info': 'realism',
  'heading:emergency contact': 'realism',
  'has-headings-any': 'realism',
  'spacing-classes': 'realism',
  'has-table': 'realism',
  'responsive-layout': 'realism',
  'has-dropdown': 'realism',
  'dropdown-count:3': 'realism',
  'has-checkbox': 'realism',
  'button:submit': 'realism',
  'button:save': 'realism',
  'buttons:submit+cancel': 'realism',
  'required:phone': 'logic',
  'validation-js': 'logic',
  'error-ui': 'logic',
  'spinner': 'logic',
  'event-handling': 'logic',
  'conditional-country-state': 'logic',
};

function evaluateCheck(checkId, html, js) {
  switch (checkId) {
    case 'row:first+last':
      return { pass: hasRowWithLabels(html, ['First', 'Last']), detail: 'First + Last in one layout row' };
    case 'row:email+phone':
      return { pass: hasRowWithLabels(html, ['Email', 'Phone']), detail: 'Email + Phone in one layout row' };
    case 'row:employee first+last':
      return { pass: hasRowWithLabels(html, ['Employee First', 'Employee Last']), detail: 'Employee First + Last in one layout row' };
    case 'row:manager first+last':
      return { pass: hasRowWithLabels(html, ['Manager First', 'Manager Last']), detail: 'Manager First + Last in one layout row' };
    case 'row:emergency contact first+last':
      return { pass: hasRowWithLabels(html, ['Emergency Contact First', 'Emergency Contact Last']), detail: 'Emergency Contact First + Last in one layout row' };
    case 'row:company+title':
      return { pass: hasRowWithLabels(html, ['Company', 'Title']), detail: 'Company + Title in one layout row' };
    case 'row:object+field':
      return { pass: hasRowWithLabels(html, ['Object', 'Field']), detail: 'Object + Field in one row' };
    case 'row:city+state+zip':
      return { pass: hasRowWithLabels(html, ['City', 'State', 'Zip']), detail: 'City + State + Zip in one row' };
    case 'field:street':
      return { pass: hasFieldLabel(html, 'Street'), detail: 'Street field is present as a full-width row field' };
    case 'submit-bottom':
      return { pass: isSubmitAtBottom(html), detail: 'Submit/Save appears as bottom action' };
    case 'uses-layout':
      return { pass: /<lightning-layout\b/i.test(html) && /<lightning-layout-item\b/i.test(html), detail: 'Uses lightning-layout + lightning-layout-item' };
    case 'spacing-classes':
      return { pass: hasSpacingClasses(html), detail: 'Uses SLDS spacing utility classes' };
    case 'heading:personal info':
      return { pass: hasSectionHeading(html, 'Personal Info'), detail: 'Has Personal Info section heading' };
    case 'heading:contact info':
      return { pass: hasSectionHeading(html, 'Contact Info'), detail: 'Has Contact Info section heading' };
    case 'heading:address':
      return { pass: hasSectionHeading(html, 'Address'), detail: 'Has Address section heading' };
    case 'heading:employment info':
      return { pass: hasSectionHeading(html, 'Employment Info'), detail: 'Has Employment Info section heading' };
    case 'heading:emergency contact':
      return { pass: hasSectionHeading(html, 'Emergency Contact'), detail: 'Has Emergency Contact section heading' };
    case 'has-headings-any':
      return { pass: hasAnyHeading(html), detail: 'Has at least one heading element' };
    case 'buttons:save+cancel':
      return { pass: hasButtonLabel(html, 'Save') && hasButtonLabel(html, 'Cancel'), detail: 'Has Save and Cancel buttons' };
    case 'buttons:submit+cancel':
      return { pass: hasButtonLabel(html, 'Submit') && hasButtonLabel(html, 'Cancel'), detail: 'Has Submit and Cancel buttons' };
    case 'button:save':
      return { pass: hasButtonLabel(html, 'Save'), detail: 'Has Save button' };
    case 'button:submit':
      return { pass: hasButtonLabel(html, 'Submit'), detail: 'Has Submit button' };
    case 'layout-size-usage':
      return { pass: hasLayoutSizeUsage(html), detail: 'Uses explicit size attributes on layout items' };
    case 'dropdown-count:3':
      return { pass: hasDropdownCount(html, 3), detail: 'Has at least 3 dropdown controls' };
    case 'has-dropdown':
      return { pass: hasDropdown(html), detail: 'Has dropdown control (combobox/select)' };
    case 'has-checkbox':
      return { pass: hasCheckbox(html), detail: 'Has checkbox input/group' };
    case 'required:phone':
      return { pass: hasRequiredField(html, 'Phone'), detail: 'Phone is marked required' };
    case 'validation-js':
      return { pass: hasValidationJs(js), detail: 'JS includes validation logic' };
    case 'error-ui':
      return { pass: hasErrorUi(html), detail: 'Has error UI/conditional error rendering' };
    case 'spinner':
      return { pass: hasSpinner(html), detail: 'Has lightning-spinner' };
    case 'has-textarea':
      return { pass: hasTextarea(html), detail: 'Has textarea field' };
    case 'row:kpi4':
      return { pass: hasKpi4Row(html), detail: 'Has row with at least 4 layout items' };
    case 'has-table':
      return { pass: hasTable(html), detail: 'Has table/datatable section' };
    case 'pattern:consistent-2col-4rows':
      return { pass: hasConsistentTwoColPattern(html, 4), detail: 'Uses consistent 2-column pattern across required rows' };
    case 'event-handling':
      return { pass: hasEventHandling(js), detail: 'JS includes event handlers for interactions' };
    case 'responsive-layout':
      return { pass: hasResponsiveLayout(html), detail: 'Layout includes responsive behavior' };
    case 'conditional-country-state':
      return { pass: hasConditionalCountryState(html, js), detail: 'Country-driven conditional State input/dropdown is implemented' };
    default:
      return { pass: false, detail: `Unknown check: ${checkId}` };
  }
}

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  const tier1 = args.has('--tier1');
  const tier2 = args.has('--tier2');
  const tier3 = args.has('--tier3');
  const tier4 = args.has('--tier4');
  const hardOnly = args.has('--hard');
  const masterOnly = args.has('--master');
  const coreOnly = args.has('--core');
  const listOnly = args.has('--list');
  const stability = args.has('--stability');

  const repeatsArg = argv.find(token => token.startsWith('--repeats='));
  const repeats = repeatsArg ? Math.max(1, parseInt(repeatsArg.split('=')[1], 10) || 1) : (stability ? 3 : 1);

  const idArg = argv.find(token => token.startsWith('--ids='));
  const ids = idArg ? idArg.split('=')[1].split(',').map(item => item.trim()).filter(Boolean) : [];

  return { tier1, tier2, tier3, tier4, hardOnly, masterOnly, coreOnly, listOnly, stability, repeats, ids };
}

function selectCases(options) {
  if (options.ids.length > 0) {
    const selected = PROMPTS.filter(testCase => options.ids.includes(testCase.id));
    const missing = options.ids.filter(id => !selected.some(testCase => testCase.id === id));
    return { selected, missing };
  }

  const explicitTierSelection = options.tier1 || options.tier2 || options.tier3 || options.tier4;
  if (explicitTierSelection) {
    const selected = PROMPTS.filter(testCase =>
      (options.tier1 && testCase.tier === 'tier1') ||
      (options.tier2 && testCase.tier === 'tier2') ||
      (options.tier3 && testCase.tier === 'tier3') ||
      (options.tier4 && testCase.tier === 'tier4')
    );
    return { selected, missing: [] };
  }

  if (options.hardOnly) return { selected: PROMPTS.filter(testCase => ['tier3', 'tier4'].includes(testCase.tier)), missing: [] };
  if (options.masterOnly) return { selected: PROMPTS.filter(testCase => testCase.tier === 'master'), missing: [] };
  if (options.coreOnly) return { selected: PROMPTS.filter(testCase => ['tier1', 'tier2'].includes(testCase.tier)), missing: [] };
  return { selected: PROMPTS, missing: [] };
}

async function runCaseOnce(testCase, runIndex = 1) {
  const start = Date.now();
  try {
    const result = await generateSalesforceComponent(testCase.prompt, 'lwc', null, null, []);
    const html = getArtifact(result, 'LWC_HTML', '.html');
    const js = getArtifact(result, 'LWC_JS', '.js');

    if (!html) {
      return {
        runIndex,
        id: testCase.id,
        name: testCase.name,
        status: 'FAIL',
        score: 0,
        durationMs: Date.now() - start,
        checks: testCase.checks.map(check => ({ check, pass: false, detail: 'Missing LWC_HTML artifact' })),
      };
    }

    const checks = testCase.checks.map(check => {
      const resultCheck = evaluateCheck(check, html, js);
      return { check, pass: resultCheck.pass, detail: resultCheck.detail, category: CHECK_CATEGORY[check] || 'other' };
    });

    const passCount = checks.filter(check => check.pass).length;
    const score = Math.round((passCount / checks.length) * 100);

    return {
      runIndex,
      id: testCase.id,
      name: testCase.name,
      status: passCount === checks.length ? 'PASS' : 'FAIL',
      score,
      durationMs: Date.now() - start,
      checks,
    };
  } catch (error) {
    return {
      runIndex,
      id: testCase.id,
      name: testCase.name,
      status: 'ERROR',
      score: 0,
      durationMs: Date.now() - start,
      checks: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runCase(testCase, repeats) {
  const runs = [];
  for (let index = 1; index <= repeats; index++) {
    runs.push(await runCaseOnce(testCase, index));
  }

  const score = Math.round(runs.reduce((sum, run) => sum + run.score, 0) / runs.length);
  const durationMs = runs.reduce((sum, run) => sum + run.durationMs, 0);
  const failedRuns = runs.filter(run => run.status !== 'PASS').length;
  const status = failedRuns === 0 ? 'PASS' : (runs.every(run => run.status === 'ERROR') ? 'ERROR' : 'FAIL');

  const baseChecks = runs[0]?.checks || [];
  const checks = baseChecks.map(base => {
    const passRuns = runs.filter(run => run.checks.some(ch => ch.check === base.check && ch.pass)).length;
    return {
      check: base.check,
      detail: base.detail,
      category: base.category,
      passRuns,
      totalRuns: runs.length,
      pass: passRuns === runs.length,
    };
  });

  const stability = Math.round((runs.filter(run => run.status === 'PASS').length / runs.length) * 100);

  return {
    id: testCase.id,
    name: testCase.name,
    tier: testCase.tier,
    status,
    score,
    stability,
    durationMs,
    checks,
    runs,
  };
}

function printList(cases) {
  console.log('LWC stress test cases:');
  for (const testCase of cases) {
    console.log(`  ${testCase.id}. [${testCase.tier}] ${testCase.name}`);
  }
}

function categoryAverages(results) {
  const categories = ['layout', 'consistency', 'realism', 'logic'];
  const out = {};

  for (const category of categories) {
    let total = 0;
    let pass = 0;
    for (const result of results) {
      for (const check of result.checks || []) {
        if (check.category === category) {
          total += check.totalRuns || 1;
          pass += check.passRuns ?? (check.pass ? 1 : 0);
        }
      }
    }
    out[category] = total > 0 ? Math.round((pass / total) * 100) : null;
  }
  return out;
}

function printReport(results) {
  console.log('\n=== LWC STRESS TEST REPORT ===');

  for (const result of results) {
    console.log(`\n[${result.status}] #${result.id} ${result.name} (${result.score}% avg | stability ${result.stability}% | ${result.durationMs}ms total)`);
    for (const run of result.runs) {
      const emoji = run.status === 'PASS' ? '✓' : run.status === 'FAIL' ? '✗' : '!';
      console.log(`  ${emoji} run ${run.runIndex}: ${run.status} (${run.score}% | ${run.durationMs}ms)`);
      if (run.error) console.log(`    error: ${run.error}`);
    }
    for (const check of result.checks) {
      console.log(`  ${check.pass ? '✓' : '✗'} ${check.check} — ${check.detail} (${check.passRuns}/${check.totalRuns})`);
    }
  }

  const total = results.length;
  const pass = results.filter(result => result.status === 'PASS').length;
  const fail = results.filter(result => result.status === 'FAIL').length;
  const error = results.filter(result => result.status === 'ERROR').length;
  const averageScore = total > 0 ? Math.round(results.reduce((sum, result) => sum + result.score, 0) / total) : 0;
  const averageStability = total > 0 ? Math.round(results.reduce((sum, result) => sum + result.stability, 0) / total) : 0;
  const category = categoryAverages(results);

  console.log('\n=== SUMMARY ===');
  console.log(`Total: ${total}`);
  console.log(`Pass: ${pass}`);
  console.log(`Fail: ${fail}`);
  console.log(`Error: ${error}`);
  console.log(`Average score: ${averageScore}%`);
  console.log(`Average stability: ${averageStability}%`);
  console.log('\n=== ELITE CHECKS ===');
  if (category.layout !== null) console.log(`1) Layout correctness: ${category.layout}%`);
  if (category.consistency !== null) console.log(`2) Consistency: ${category.consistency}%`);
  if (category.realism !== null) console.log(`3) Enterprise realism: ${category.realism}%`);
  if (category.logic !== null) console.log(`4) Logic/UX correctness: ${category.logic}%`);
  console.log(`5) Regeneration stability: ${averageStability}%`);

  if (fail > 0 || error > 0 || averageStability < 80) {
    process.exitCode = 1;
  }
}

async function main() {
  const options = parseArgs(process.argv);
  const { selected, missing } = selectCases(options);

  if (missing.length > 0) {
    console.error(`Unknown test id(s): ${missing.join(', ')}`);
    process.exit(1);
  }

  if (selected.length === 0) {
    console.error('No test cases selected.');
    process.exit(1);
  }

  if (options.listOnly) {
    printList(selected);
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set. Export it before running stress tests.');
    process.exit(1);
  }

  console.log(`Running ${selected.length} LWC stress test(s), ${options.repeats} run(s) each...`);
  const results = [];

  for (const testCase of selected) {
    console.log(`\n→ Running #${testCase.id} ${testCase.name}`);
    const result = await runCase(testCase, options.repeats);
    results.push(result);
    const emoji = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '🛑';
    console.log(`${emoji} ${result.status} (${result.score}% avg, stability ${result.stability}%) in ${result.durationMs}ms total`);
  }

  printReport(results);
}

main();
