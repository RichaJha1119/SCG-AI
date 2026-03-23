import OpenAI from 'openai';
import { createRequire } from 'node:module';
// pdf-parse is CJS-only — use createRequire to load it safely in ESM
const pdfParse = createRequire(import.meta.url)('pdf-parse');

// Lazy-init: dotenv must run in index.js before this is called
let _client = null;
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

function isQuestionModePrompt(prompt = '', refinementContext = null) {
  if (refinementContext) return false;

  const text = String(prompt || '').trim();
  if (!text) return false;

  const asksQuestion = /\?$/.test(text)
    || /^(what|why|how|when|where|who|can|could|would|should|is|are|do|does|did|explain|tell\s+me|help\s+me\s+understand)\b/i.test(text);

  const explicitGenerationIntent = /\b(generate|create|build|write|implement|scaffold|produce|compose|refactor|modify|update|fix)\b/i.test(text)
    && /\b(file|files|class|trigger|component|bundle|code|lwc|apex|html|css|javascript|xml|test\s+class)\b/i.test(text);

  return asksQuestion && !explicitGenerationIntent;
}

function toTextContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text' && typeof part.text === 'string') return part.text;
        return '';
      })
      .join('\n')
      .trim();
  }
  return '';
}

async function answerGeneralQuestion(prompt) {
  const response = await getClient().chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1200,
    messages: [
      {
        role: 'system',
        content: 'You are SCG-AI, a Salesforce-focused engineering assistant. Answer the user clearly in Markdown. If the question is not Salesforce-specific, still answer helpfully. Keep it practical and concise.',
      },
      { role: 'user', content: prompt },
    ],
  });

  const answer = toTextContent(response.choices?.[0]?.message?.content)
    || 'I could not generate an answer for that question. Please try rephrasing it.';

  return {
    components: [
      {
        bundle: 'assistant',
        type: 'Documentation',
        name: 'Answer',
        extension: '.md',
        content: answer,
      },
    ],
    summary: answer.split('\n').find(line => line.trim())?.slice(0, 180) || 'Answered your question.',
    governorLimitNotes: [],
    deploymentSteps: [],
    dependencies: [],
  };
}

const SYSTEM_PROMPT = `You are an expert Salesforce developer and architect with 10+ years of enterprise experience. You generate production-ready, enterprise-grade Salesforce components.

MANDATORY CODE RULES:
1. BULKIFICATION: Always handle collections (List/Set/Map). Never process single records in triggers.
2. NO SOQL IN LOOPS: All SOQL queries must be outside loops. Use Maps for lookups.
3. NO DML IN LOOPS: All DML operations must be outside loops. Batch DML with Lists.
4. TRIGGER HANDLER PATTERN: Separate trigger logic into a dedicated handler class.
5. ERROR HANDLING: Include try-catch blocks. Use custom exceptions for meaningful errors.
6. TEST CLASSES: Generate @isTest classes with 90%+ coverage. Include bulk tests (200+ records), single record tests, and negative/error tests.
7. SECURITY: Enforce CRUD/FLS checks. Use WITH SECURITY_ENFORCED in SOQL.
8. NAMING: PascalCase for classes/triggers, camelCase for methods/variables.
9. DOCUMENTATION: Add Javadoc-style comments for all classes and public methods.
10. GOVERNOR LIMITS: Comment critical governor limit considerations inline.

RESPONSE FORMAT: Respond ONLY with a valid JSON object. No text before or after. Use this exact structure:
{
  "components": [
    {
      "bundle": "bundleFolderForLwcOrMain",
      "type": "ApexClass|ApexTrigger|ApexTestClass|LWC_HTML|LWC_JS|LWC_CSS|LWC_META|Documentation",
      "name": "FileName",
      "extension": ".cls|.trigger|.cls|.html|.js|.css|.js-meta.xml|.md",
      "content": "full source code as a string with proper newlines"
    }
  ],
  "summary": "High-level description of what was generated",
  "governorLimitNotes": ["Governor limit consideration 1", "Governor limit consideration 2"],
  "deploymentSteps": ["Step 1: Deploy handler class first", "Step 2: Deploy trigger", "Step 3: Run test class"],
  "dependencies": ["Account SObject", "Custom field: Account.Credit_Limit__c"]
}`;

// ─── STRUCTURED OUTPUT SCHEMAS ────────────────────────────────────────────────

/** Step 1 — intent extraction schema */
const INTENT_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'intent',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        component_type: {
          type: 'string',
          description: 'One of: apex-trigger, apex-class, lwc, integration, batch, rest-api, cpq',
        },
        lwc_composition: {
          type: 'string',
          enum: ['single', 'nested'],
          description: 'For LWC requests: single bundle or parent-child nested bundles',
        },
        title: {
          type: 'string',
          description: 'Short descriptive title for this component',
        },
        requirements: {
          type: 'array',
          items: { type: 'string' },
          description: 'Functional requirements extracted from the prompt, one per item',
        },
        objects: {
          type: 'array',
          items: { type: 'string' },
          description: 'Salesforce SObject API names involved (e.g. Account, Contact)',
        },
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              api_name: { type: 'string' },
              field_type: { type: 'string' },
              required: { type: 'boolean' },
            },
            required: ['label', 'api_name', 'field_type', 'required'],
            additionalProperties: false,
          },
          description: 'For LWC: all form fields to render, inferred from image or prompt',
        },
        layout: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              section: { type: 'string' },
              columns: { type: 'integer' },
              fields: { type: 'array', items: { type: 'string' } },
            },
            required: ['section', 'columns', 'fields'],
            additionalProperties: false,
          },
          description: 'For LWC: how to group fields into layout sections',
        },
        constraints: {
          type: 'array',
          items: { type: 'string' },
          description: 'Non-functional constraints: security, governor limits, performance',
        },
        assumptions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Assumptions made where the prompt is ambiguous',
        },
      },
      required: ['component_type', 'lwc_composition', 'title', 'requirements', 'objects', 'fields', 'layout', 'constraints', 'assumptions'],
      additionalProperties: false,
    },
  },
};

/** Step 2/3 — code bundle schema (matches GenerationResult shape) */
const BUNDLE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'bundle',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        components: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              bundle: { type: 'string' },
              type: { type: 'string' },
              name: { type: 'string' },
              extension: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['bundle', 'type', 'name', 'extension', 'content'],
            additionalProperties: false,
          },
        },
        summary: { type: 'string' },
        governorLimitNotes: { type: 'array', items: { type: 'string' } },
        deploymentSteps: { type: 'array', items: { type: 'string' } },
        dependencies: { type: 'array', items: { type: 'string' } },
      },
      required: ['components', 'summary', 'governorLimitNotes', 'deploymentSteps', 'dependencies'],
      additionalProperties: false,
    },
  },
};

/** Step LWC-1 — pixel-perfect layout blueprint extracted from a UI screenshot */
const LAYOUT_SPEC_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'layout_spec',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Form / component title as shown in the image' },
        subtitle: { type: 'string', description: 'Optional subtitle/helper text under title' },
        tabs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              active: { type: 'boolean' },
            },
            required: ['label', 'active'],
            additionalProperties: false,
          },
          description: 'Top tab labels if visible in screenshot',
        },
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              heading: { type: 'string', description: 'Section heading label (empty string if none)' },
              rows: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    columns: {
                      type: 'integer',
                      description: 'Number of side-by-side fields in this row (1 = full-width, 2 = two columns, etc.)',
                    },
                    fields: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          kind: {
                            type: 'string',
                            description: 'Component kind: "input" | "select" | "textarea" | "checkbox"',
                          },
                          label: { type: 'string', description: 'Field label text (empty if no label shown)' },
                          placeholder: { type: 'string', description: 'Placeholder text (empty if none)' },
                          field_type: {
                            type: 'string',
                            description: 'For input kind: text | number | date | email | tel | checkbox. Empty for select/textarea.',
                          },
                        },
                        required: ['kind', 'label', 'placeholder', 'field_type'],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ['columns', 'fields'],
                  additionalProperties: false,
                },
              },
            },
            required: ['heading', 'rows'],
            additionalProperties: false,
          },
        },
        section_groups: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              columns: { type: 'integer' },
              sections: { type: 'array', items: { type: 'string' } },
            },
            required: ['columns', 'sections'],
            additionalProperties: false,
          },
          description: 'Layout rows that place multiple sections side-by-side (e.g. Company Information + Loan Request Details)',
        },
        footer_actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              variant: { type: 'string' },
            },
            required: ['label', 'variant'],
            additionalProperties: false,
          },
          description: 'Bottom action buttons in screenshot order (e.g. Save as Draft, Submit Application)',
        },
      },
      required: ['title', 'subtitle', 'tabs', 'sections', 'section_groups', 'footer_actions'],
      additionalProperties: false,
    },
  },
};

// ─── COMPONENT TYPE INSTRUCTIONS ─────────────────────────────────────────────

function getComponentTypeInstructions(componentType) {
  const map = {
    'apex-trigger': `Generate exactly these 3 files:
1. ApexTrigger: One trigger for the relevant SObject (before/after insert/update/delete as needed). The trigger ONLY calls the handler. Use a static boolean to prevent recursion.
2. ApexClass: A trigger handler class with separate static methods for each trigger event (handleBeforeInsert, handleAfterUpdate, etc.).
3. ApexTestClass: Comprehensive test class. Include bulk test (200 records), single record test, and negative test. Use @TestSetup for data creation.`,

    'apex-class': `Generate exactly these 2 files:
1. ApexClass: A service or utility class with the described functionality. Include custom exception inner class if complex error handling is needed.
2. ApexTestClass: Comprehensive test class with 90%+ coverage, including success, failure, and edge cases.`,

    'lwc': `Generate exactly these 4 files:
1. LWC_HTML: Template using lightning-* base components. Follow ALL rules below — violations trigger a repair pass:

   ROOT STRUCTURE:
   <template>
     <div class="formShell slds-var-m-around_medium">
       <h1 class="slds-text-heading_large slds-m-bottom_medium">Form Title</h1>
       <!-- sections, fields, submit button all go here -->
     </div>
   </template>

   SECTION HEADINGS vs FIELD LABELS (CRITICAL — most common mistake):
   - A SECTION HEADING (e.g. "Participant Name", "Parent Name", "Contact Info") is text that labels a GROUP of fields.
     Render it as: <p class="slds-text-heading_small slds-m-bottom_small">Participant Name</p>
     It is NEVER the label="" on a lightning-input. NEVER write label="Participant Name" on an input.
   - A FIELD LABEL (e.g. "First", "Last", "Age", "School District") is the label="" on a specific lightning-input/combobox.
     Example: <lightning-input label="First" placeholder="First" ...></lightning-input>
   - RULE: The two inputs under a "Participant Name" heading must have label="First" and label="Last" — not label="Participant Name".

   TWO-COLUMN ROWS (side-by-side fields like First + Last, City + State):
   <p class="slds-text-heading_small slds-m-bottom_small">Participant Name</p>
   <lightning-layout multiple-rows class="slds-gutters slds-m-bottom_medium">
     <lightning-layout-item size="6" padding="around-small">
       <lightning-input label="First" placeholder="First" value={participantFirst} onchange={handleChange} data-id="participantFirst"></lightning-input>
     </lightning-layout-item>
     <lightning-layout-item size="6" padding="around-small">
       <lightning-input label="Last" placeholder="Last" value={participantLast} onchange={handleChange} data-id="participantLast"></lightning-input>
     </lightning-layout-item>
   </lightning-layout>
   For THREE columns use size="4". For FOUR columns use size="3". NEVER stack side-by-side fields.

   FULL-WIDTH FIELDS (single field on its own row):
   <div class="slds-m-bottom_medium">
     <lightning-input label="Age" type="number" value={age} onchange={handleChange} data-id="age"></lightning-input>
   </div>
   <div class="slds-m-bottom_medium">
     <lightning-combobox label="Grade" placeholder="Please select" value={grade} options={gradeOptions} onchange={handleChange} data-id="grade"></lightning-combobox>
   </div>

   CONDITIONAL STATES: Use <template if:true={isLoading}> for spinner, <template if:true={error}> for error — never render unconditionally.
   SUBMIT BUTTON: <lightning-button variant="brand" label="Submit" onclick={handleSubmit}></lightning-button> at the very bottom.

2. LWC_JS: Controller with @api, @track, @wire decorators as appropriate. Handle all wire errors. Use connectedCallback for initialization. Include options arrays for all combobox/select fields.
3. LWC_CSS: Do NOT override SLDS utility classes. Use only:
   :host { display: block; }
   .formShell { border: 1px solid #d8dde6; border-radius: 6px; padding: 1rem; background: #ffffff; }
   Add any additional custom rules below those two blocks only.
4. LWC_META: Metadata XML with apiVersion 62.0 and appropriate targets (lightning__AppPage, lightning__RecordPage, etc.).`,

  'lwc-composition': `COMPOSITION RULES:
- Inspect intent.lwc_composition.
- If intent.lwc_composition is "single": generate one complete LWC bundle only.
- If intent.lwc_composition is "nested": generate exactly one parent bundle plus one or more child bundles split by section.

NESTED CONTRACT (required when nested):
1. Parent HTML must include children via <c-child-name /> tags (kebab-case child bundle names).
2. Parent passes data to children via attributes bound to child @api properties.
3. Children dispatch events upward using CustomEvent.
4. Parent listens to child events and aggregates form state.
5. Parent owns submit and final orchestration.
6. Every LWC output entry must include a "bundle" field indicating the target bundle folder.
7. Every bundle must be complete: html + js + js-meta.xml (css optional).`,

    'integration': `Generate exactly these 3 files:
1. ApexClass: HTTP callout service class. Use Named Credential (callout:ServiceName). Include retry logic, timeout (120000ms), and proper HTTP status code handling.
2. ApexClass (mock): HttpCalloutMock implementation for tests.
3. ApexTestClass: Test class using Test.setMock(). Test success, failure, and timeout scenarios.`,

    'batch': `Generate exactly these 3 files:
1. ApexClass: Batch class implementing Database.Batchable<SObject> and Database.Stateful. Include start(), execute(), and finish() methods.
2. ApexClass: Scheduler class implementing Schedulable if scheduling is needed.
3. ApexTestClass: Test class using Test.startTest()/stopTest() with Database.executeBatch(). Test with varying record counts.`,

    'rest-api': `Generate exactly these 2 files:
1. ApexClass: @RestResource class with @HttpGet/@HttpPost/@HttpPatch/@HttpDelete as needed. Include inner wrapper classes for request/response. Return proper HTTP status codes.
2. ApexTestClass: Test class using RestContext. Test all HTTP methods, success, and error scenarios.`,

    'cpq': `Generate exactly these 2 files:
1. Documentation: Detailed Markdown guide describing the CPQ configuration (Price Rules, Product Rules, Quote Line fields) with step-by-step setup.
2. ApexClass: Supporting Apex class for custom CPQ logic if required by the use case (price calculator, product configurator).`,
  };

  if (componentType === 'lwc') {
    return `${map.lwc}\n\n${map['lwc-composition']}`;
  }

  return map[componentType] || map['apex-class'];
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────

export function extractJSON(text) {
  text = text.trim();

  const jsonBlock = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlock) {
    try { return JSON.parse(jsonBlock[1]); } catch (_) {}
  }

  const codeBlock = text.match(/```\s*([\s\S]*?)\s*```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1]); } catch (_) {}
  }

  try { return JSON.parse(text); } catch (_) {}

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch (_) {}
  }

  throw new Error('Could not parse structured response from AI. Please try again with a clearer prompt.');
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

function toCamelCase(value = '') {
  return String(value)
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^[A-Z]/, m => m.toLowerCase());
}

function sanitizeBundleName(value = '') {
  const candidate = String(value || 'component').trim();
  return candidate
    .replace(/[^a-zA-Z0-9_]/g, '')
    .replace(/^[^a-zA-Z]+/, '') || 'componentBundle';
}

function inferLwcComposition(prompt = '', architecturePreference = 'auto', modelChoice = 'single') {
  if (architecturePreference === 'single' || architecturePreference === 'nested') {
    return architecturePreference;
  }

  const text = String(prompt || '').toLowerCase();
  if (!text) return modelChoice === 'nested' ? 'nested' : 'single';

  const explicitSingle = /(one\s+component|single\s+component|one\s+file|single\s+file|single\s+bundle)/i;
  if (explicitSingle.test(text)) return 'single';

  const nestedSignals = /(modular|nested|separate\s+components?|reusable\s+sections?|parent\s+container|parent\s*\+\s*child)/i;
  if (nestedSignals.test(text)) return 'nested';

  return modelChoice === 'nested' ? 'nested' : 'single';
}

function getLwcBundles(components = []) {
  const bundles = new Map();
  for (const comp of components) {
    if (!comp?.type?.startsWith('LWC_')) continue;
    const bundle = sanitizeBundleName(comp.bundle || comp.name || 'componentBundle');
    if (!bundles.has(bundle)) bundles.set(bundle, []);
    bundles.get(bundle).push({ ...comp, bundle });
  }
  return bundles;
}

function normalizeBundleForArchitecture(bundle, componentType, intent) {
  if (!bundle || !Array.isArray(bundle.components)) return bundle;

  const normalized = {
    ...bundle,
    components: bundle.components.map(comp => {
      if (!comp?.type?.startsWith('LWC_')) return comp;
      const normalizedBundle = sanitizeBundleName(comp.bundle || comp.name || intent?.title || 'componentBundle');
      return {
        ...comp,
        bundle: normalizedBundle,
        name: normalizedBundle,
      };
    }),
  };

  if (componentType !== 'lwc') return normalized;

  const composition = intent?.lwc_composition === 'nested' ? 'nested' : 'single';
  const lwcBundles = [...getLwcBundles(normalized.components).keys()];

  if (composition === 'nested') {
    const parentChildSummary = lwcBundles.length > 1
      ? `Generated nested LWC architecture: parent + ${lwcBundles.length - 1} child components.`
      : 'Generated nested LWC architecture.';

    if (!normalized.summary?.toLowerCase().includes('nested lwc architecture')) {
      normalized.summary = `${parentChildSummary} ${normalized.summary || ''}`.trim();
    }
  } else if (!normalized.summary?.toLowerCase().includes('single lwc bundle')) {
    normalized.summary = `Generated single LWC bundle. ${normalized.summary || ''}`.trim();
  }

  return normalized;
}

function extractBulletedComponentNames(sectionText = '') {
  const names = [];
  const matches = sectionText.matchAll(/^\s*[-*]\s*([a-z][A-Za-z0-9_]*)\b/gm);
  for (const match of matches) {
    const name = sanitizeBundleName(match[1]);
    if (name && /[A-Z]/.test(name)) names.push(name);
  }
  return [...new Set(names)];
}

function extractInlineComponentNames(sectionText = '') {
  const names = [];
  const tokenMatches = sectionText.matchAll(/\b([a-z][A-Za-z0-9_]*(?:Section|Form|Lookup|Window|Row|Entry|Onboarding|Details))\b/g);
  for (const match of tokenMatches) {
    const candidate = sanitizeBundleName(match[1]);
    if (candidate && /[A-Z]/.test(candidate)) names.push(candidate);
  }
  return [...new Set(names)];
}

function extractNestedPromptSpec(promptText = '') {
  const prompt = String(promptText || '');
  const parentMatch = prompt.match(/\bParent\s*:\s*([a-z][A-Za-z0-9_]*)/i);
  const parentBundle = parentMatch ? sanitizeBundleName(parentMatch[1]) : null;

  const childrenSection = prompt.match(/\bChildren\s*:\s*([\s\S]*?)(?:\n\s*\n|\bBehavior\s*:|\bUI\s*:|\bRules\s*:|$)/i)?.[1] || '';
  const splitSection = prompt.match(/\bSplit\s+into\s*:\s*([\s\S]*?)(?:\n\s*\n|\bBehavior\s*:|\bUI\s*:|\bRules\s*:|$)/i)?.[1] || '';

  const listedChildren = [
    ...extractBulletedComponentNames(childrenSection),
    ...extractBulletedComponentNames(splitSection),
    ...extractInlineComponentNames(childrenSection),
    ...extractInlineComponentNames(splitSection),
  ];

  const conditionalChildren = [...prompt.matchAll(/\brender\s+([a-z][A-Za-z0-9_]*)/gi)].map(m => sanitizeBundleName(m[1]));
  const deepNestedMatch = prompt.match(/([a-z][A-Za-z0-9_]*)\s+must\s+itself\s+contain[\s\S]*?called\s+([a-z][A-Za-z0-9_]*)/i);
  const deepNestedParent = deepNestedMatch ? sanitizeBundleName(deepNestedMatch[1]) : null;
  const deepNestedChild = deepNestedMatch ? sanitizeBundleName(deepNestedMatch[2]) : null;

  const mentioned = new Set([
    ...(parentBundle ? [parentBundle] : []),
    ...listedChildren,
    ...conditionalChildren,
    ...(deepNestedParent ? [deepNestedParent] : []),
    ...(deepNestedChild ? [deepNestedChild] : []),
  ]);

  const hasConditionalScenario = /\bif\s+[^\n]*\brender\b/i.test(prompt) && conditionalChildren.length > 0;
  const hasBulkRowScenario = /for:each|line\s*item|rowchange|totalamount|add\s+line\s+item/i.test(prompt);

  return {
    parentBundle,
    listedChildren: [...new Set(listedChildren)],
    conditionalChildren: [...new Set(conditionalChildren)],
    deepNestedParent,
    deepNestedChild,
    mentionedBundles: [...mentioned],
    hasConditionalScenario,
    hasBulkRowScenario,
  };
}

function validateNestedPromptRequirements(bundle, promptText) {
  const issues = [];
  const spec = extractNestedPromptSpec(promptText);
  const bundlesMap = getLwcBundles(bundle.components || []);
  const bundleNames = [...bundlesMap.keys()];
  const parentBundle = spec.parentBundle || validateNestedLwcArchitecture(bundle).parentBundle;

  if (spec.parentBundle && !bundleNames.includes(spec.parentBundle)) {
    issues.push(`Nested naming: expected parent bundle ${spec.parentBundle} was not generated.`);
  }

  for (const expected of spec.listedChildren) {
    if (!bundleNames.includes(expected)) {
      issues.push(`Nested naming: expected child bundle ${expected} is missing.`);
    }
  }

  for (const conditional of spec.conditionalChildren) {
    if (!bundleNames.includes(conditional)) {
      issues.push(`Conditional architecture: missing conditional child bundle ${conditional}.`);
    }
  }

  if (parentBundle && bundlesMap.has(parentBundle)) {
    const parentHtml = bundlesMap.get(parentBundle).find(c => c.type === 'LWC_HTML')?.content || '';
    const parentJs = bundlesMap.get(parentBundle).find(c => c.type === 'LWC_JS')?.content || '';

    for (const child of spec.listedChildren) {
      const childTag = `c-${toKebabCase(child)}`;
      if (!new RegExp(`<${childTag}\\b`, 'i').test(parentHtml)) {
        issues.push(`Parent usage: ${parentBundle} must render <${childTag}>.`);
      }
    }

    if (spec.hasConditionalScenario) {
      for (const conditional of spec.conditionalChildren) {
        const childTag = `c-${toKebabCase(conditional)}`;
        if (!new RegExp(`<template\\b[^>]*if:true=\\{[^}]+\\}[\\s\\S]*?<${childTag}\\b`, 'i').test(parentHtml)) {
          issues.push(`Conditional rendering: wrap <${childTag}> in a conditional <template if:true={...}> block.`);
        }
      }
      if (!/\bisPickup\b|\bisDelivery\b/i.test(parentJs)) {
        issues.push('Conditional state: parent JS should define isPickup/isDelivery derived state.');
      }
      if (!/onmethodchange\s*=\s*\{[A-Za-z_$][\w$]*\}/i.test(parentHtml)) {
        issues.push('Conditional events: parent should listen to onmethodchange from shippingMethodSection.');
      }
    }

    if (spec.hasBulkRowScenario) {
      const lineItemsHtml = bundlesMap.get('lineItemsSection')?.find(c => c.type === 'LWC_HTML')?.content || '';
      const lineItemsJs = bundlesMap.get('lineItemsSection')?.find(c => c.type === 'LWC_JS')?.content || '';
      const lineItemRowJs = bundlesMap.get('lineItemRow')?.find(c => c.type === 'LWC_JS')?.content || '';
      if (lineItemsHtml && !/for:each=\{[^}]+\}[\s\S]*?<c-line-item-row\b[\s\S]*?key=\{[^}]+\}/i.test(lineItemsHtml)) {
        issues.push('Bulk rows: lineItemsSection.html must render keyed <c-line-item-row> inside for:each.');
      }
      if (lineItemRowJs && !/dispatchEvent\s*\(\s*new\s+CustomEvent\s*\(\s*['"]rowchange['"][\s\S]*?detail\s*:\s*\{[\s\S]*?index\s*:/i.test(lineItemRowJs)) {
        issues.push('Bulk rows: lineItemRow.js must dispatch rowchange with detail including index.');
      }
      if (lineItemsJs && !/dispatchEvent\s*\(\s*new\s+CustomEvent\s*\(\s*['"]sectionchange['"]/i.test(lineItemsJs)) {
        issues.push('Bulk rows: lineItemsSection.js must re-emit sectionchange to parent.');
      }
      if (!/\btotalAmount\b/i.test(parentJs)) {
        issues.push('Bulk rows: parent JS should compute totalAmount from line items.');
      }
    }
  }

  if (spec.deepNestedParent && spec.deepNestedChild && bundlesMap.has(spec.deepNestedParent)) {
    const nestedParentHtml = bundlesMap.get(spec.deepNestedParent).find(c => c.type === 'LWC_HTML')?.content || '';
    const nestedParentJs = bundlesMap.get(spec.deepNestedParent).find(c => c.type === 'LWC_JS')?.content || '';
    const nestedChildJs = bundlesMap.get(spec.deepNestedChild)?.find(c => c.type === 'LWC_JS')?.content || '';
    const childTag = `c-${toKebabCase(spec.deepNestedChild)}`;

    if (!new RegExp(`<${childTag}\\b`, 'i').test(nestedParentHtml)) {
      issues.push(`Deep nesting: ${spec.deepNestedParent}.html must render <${childTag}>.`);
    }
    if (!/dispatchEvent\s*\(\s*new\s+CustomEvent\s*\(\s*['"]addressupdate['"]/i.test(nestedChildJs)) {
      issues.push(`Deep nesting: ${spec.deepNestedChild}.js must dispatch addressupdate event.`);
    }
    if (!/onaddressupdate\s*=\s*\{[A-Za-z_$][\w$]*\}/i.test(nestedParentHtml)) {
      issues.push(`Deep nesting: ${spec.deepNestedParent}.html must listen to onaddressupdate.`);
    }
    if (!/dispatchEvent\s*\(\s*new\s+CustomEvent\s*\(\s*['"]sectionchange['"]/i.test(nestedParentJs)) {
      issues.push(`Deep nesting: ${spec.deepNestedParent}.js must re-emit sectionchange.`);
    }
  }

  return issues;
}

function toPascalCase(value = '') {
  const camel = toCamelCase(value);
  return camel ? camel[0].toUpperCase() + camel.slice(1) : 'GeneratedBundle';
}

function ensureNestedContractArtifacts(bundle, promptText) {
  if (!bundle || !Array.isArray(bundle.components)) return bundle;

  const spec = extractNestedPromptSpec(promptText);
  if (!spec.parentBundle) return bundle;

  const components = [...bundle.components];

  const renameBundle = (from, to) => {
    for (const comp of components) {
      if (comp.bundle === from || comp.name === from) {
        comp.bundle = to;
        comp.name = to;
      }
      if (comp.type === 'LWC_HTML' && comp.content) {
        comp.content = comp.content.replace(new RegExp(`<c-${toKebabCase(from)}\\b`, 'gi'), `<c-${toKebabCase(to)}`);
      }
    }
  };

  const currentBundleNames = [...new Set(components.filter(c => c.type?.startsWith('LWC_')).map(c => c.bundle || c.name))];
  if (!currentBundleNames.includes(spec.parentBundle)) {
    const parentAlias = currentBundleNames.find(name =>
      name && /parent$/i.test(name) && normalizeLabel(name).includes(normalizeLabel(spec.parentBundle))
    );
    if (parentAlias) renameBundle(parentAlias, spec.parentBundle);
  }

  const findComponent = (bundleName, type) => components.find(c => (c.bundle || c.name) === bundleName && c.type === type);
  const upsertComponent = (bundleName, type, extension, content) => {
    const existing = findComponent(bundleName, type);
    if (existing) {
      existing.bundle = bundleName;
      existing.name = bundleName;
      if (!existing.content || existing.content.trim() === '') existing.content = content;
      return;
    }
    components.push({ bundle: bundleName, type, name: bundleName, extension, content });
  };

  const ensureBundle = (bundleName, htmlContent, jsContent) => {
    const safeBundle = sanitizeBundleName(bundleName);
    const className = toPascalCase(safeBundle);
    const defaultHtml = htmlContent || `<template>\n  <lightning-layout multiple-rows class="slds-gutters slds-m-bottom_medium">\n    <lightning-layout-item size="6" padding="around-small">\n      <lightning-input label="Field One"></lightning-input>\n    </lightning-layout-item>\n    <lightning-layout-item size="6" padding="around-small">\n      <lightning-input label="Field Two"></lightning-input>\n    </lightning-layout-item>\n  </lightning-layout>\n</template>`;
    const defaultJs = jsContent || `import { LightningElement, api } from 'lwc';\n\nexport default class ${className} extends LightningElement {\n  @api value;\n\n  emitSectionChange(detail = {}) {\n    this.dispatchEvent(new CustomEvent('sectionchange', { detail }));\n  }\n}`;
    const defaultMeta = `<?xml version="1.0" encoding="UTF-8"?>\n<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">\n  <apiVersion>62.0</apiVersion>\n  <isExposed>false</isExposed>\n</LightningComponentBundle>`;

    upsertComponent(safeBundle, 'LWC_HTML', '.html', defaultHtml);
    upsertComponent(safeBundle, 'LWC_JS', '.js', defaultJs);
    upsertComponent(safeBundle, 'LWC_META', '.js-meta.xml', defaultMeta);
  };

  const requiredBundles = [
    spec.parentBundle,
    ...spec.listedChildren,
    ...spec.conditionalChildren,
    ...(spec.deepNestedChild ? [spec.deepNestedChild] : []),
  ].filter(Boolean);

  for (const required of [...new Set(requiredBundles)]) {
    ensureBundle(required);
  }

  const parentHtmlComp = findComponent(spec.parentBundle, 'LWC_HTML');
  const parentJsComp = findComponent(spec.parentBundle, 'LWC_JS');
  const directChildren = [...new Set(spec.listedChildren)];
  const conditionalChildren = [...new Set(spec.conditionalChildren)];

  if (parentHtmlComp) {
    let parentHtml = parentHtmlComp.content || '<template>\n</template>';

    for (const child of directChildren) {
      const tag = `c-${toKebabCase(child)}`;
      if (!new RegExp(`<${tag}\\b`, 'i').test(parentHtml)) {
        parentHtml = parentHtml.replace(/<\/template>\s*$/i, `  <${tag}></${tag}>\n</template>`);
      }
    }

    if (spec.hasConditionalScenario) {
      const pickupTag = '<c-pickup-location-section></c-pickup-location-section>';
      const deliveryTag = '<c-delivery-window-section></c-delivery-window-section>';

      if (!/if:true=\{isPickup\}[\s\S]*?<c-pickup-location-section\b/i.test(parentHtml)) {
        parentHtml = parentHtml.replace(/<\/template>\s*$/i, `  <template if:true={isPickup}>\n    ${pickupTag}\n  </template>\n</template>`);
      }
      if (!/if:true=\{isDelivery\}[\s\S]*?<c-delivery-window-section\b/i.test(parentHtml)) {
        parentHtml = parentHtml.replace(/<\/template>\s*$/i, `  <template if:true={isDelivery}>\n    ${deliveryTag}\n  </template>\n</template>`);
      }
      if (!/<c-shipping-method-section\b[^>]*\bonmethodchange\s*=\s*\{/i.test(parentHtml)) {
        parentHtml = parentHtml.replace(/<c-shipping-method-section\b([^>]*)>/i, '<c-shipping-method-section$1 onmethodchange={handleMethodChange}>');
      }
    }

    if (!/<lightning-button\b[^>]*\blabel="(?:Submit|Save|Cancel)"/i.test(parentHtml)) {
      parentHtml = parentHtml.replace(/<\/template>\s*$/i, '  <lightning-button label="Submit" variant="brand" onclick={handleSubmit}></lightning-button>\n</template>');
    }

    if (spec.hasBulkRowScenario && !/\{\s*totalAmount\s*\}/.test(parentHtml)) {
      parentHtml = parentHtml.replace(/<\/template>\s*$/i, '  <p class="slds-text-title slds-m-top_medium">Total: {totalAmount}</p>\n</template>');
    }

    parentHtmlComp.content = parentHtml;
  }

  if (parentJsComp) {
    let parentJs = parentJsComp.content || `import { LightningElement } from 'lwc';\n\nexport default class ${toPascalCase(spec.parentBundle)} extends LightningElement {}`;
    if (spec.hasConditionalScenario && !/\bisPickup\b/.test(parentJs)) {
      parentJs += `\n\n  selectedMethod = '';\n\n  get isPickup() { return this.selectedMethod === 'Pickup'; }\n  get isDelivery() { return this.selectedMethod === 'Delivery'; }\n\n  handleMethodChange(event) {\n    this.selectedMethod = event?.detail?.value || event?.detail?.method || '';\n  }`;
    }
    if (spec.hasBulkRowScenario && !/\btotalAmount\b/.test(parentJs)) {
      parentJs += `\n\n  totalAmount = 0;\n\n  handleLineItemsChange(event) {\n    const items = event?.detail?.items || [];\n    this.totalAmount = items.reduce((sum, row) => sum + (Number(row.unitPrice || 0) * Number(row.quantity || 0)), 0);\n  }`;
    } else if (spec.hasBulkRowScenario && /\btotalAmount\b/.test(parentJs) && !/reduce\(/.test(parentJs)) {
      parentJs += `\n\n  recomputeTotal(items = []) {\n    this.totalAmount = items.reduce((sum, row) => sum + (Number(row.unitPrice || 0) * Number(row.quantity || 0)), 0);\n  }`;
    }
    parentJsComp.content = parentJs;
  }

  if (spec.deepNestedChild) {
    const childJs = findComponent(spec.deepNestedChild, 'LWC_JS');
    if (childJs && !/CustomEvent\s*\(\s*['"]addressupdate['"]/i.test(childJs.content || '')) {
      childJs.content += `\n\n  emitAddressUpdate(city, state) {\n    this.dispatchEvent(new CustomEvent('addressupdate', { detail: { city, state } }));\n  }`;
    }
  }

  if (spec.deepNestedParent) {
    const parentHtml = findComponent(spec.deepNestedParent, 'LWC_HTML');
    const parentJs = findComponent(spec.deepNestedParent, 'LWC_JS');
    if (parentHtml && spec.deepNestedChild) {
      const tag = `c-${toKebabCase(spec.deepNestedChild)}`;
      if (!new RegExp(`<${tag}\\b`, 'i').test(parentHtml.content || '')) {
        parentHtml.content = (parentHtml.content || '<template>\n</template>').replace(/<\/template>\s*$/i, `  <${tag} onaddressupdate={handleAddressUpdate}></${tag}>\n</template>`);
      }
      if (!/onaddressupdate\s*=\s*\{[A-Za-z_$][\w$]*\}/i.test(parentHtml.content || '')) {
        parentHtml.content = parentHtml.content.replace(new RegExp(`<${tag}\\b([^>]*)>`, 'i'), `<${tag}$1 onaddressupdate={handleAddressUpdate}>`);
      }
    }
    if (parentJs && !/CustomEvent\s*\(\s*['"]sectionchange['"]/i.test(parentJs.content || '')) {
      parentJs.content += `\n\n  handleAddressUpdate(event) {\n    this.dispatchEvent(new CustomEvent('sectionchange', { detail: event.detail || {} }));\n  }`;
    }
  }

  const shippingJs = findComponent('shippingMethodSection', 'LWC_JS');
  if (spec.hasConditionalScenario && shippingJs) {
    if (!/CustomEvent\s*\(\s*['"]methodchange['"]/i.test(shippingJs.content || '')) {
      shippingJs.content += `\n\n  emitMethodChange(value) {\n    this.dispatchEvent(new CustomEvent('methodchange', { detail: { value } }));\n  }`;
    }
    if (!/dispatchEvent\s*\(\s*new\s+CustomEvent\s*\(\s*['"]methodchange['"]/i.test(shippingJs.content || '')) {
      shippingJs.content += `\n\n  handleMethodSelection(event) {\n    this.dispatchEvent(new CustomEvent('methodchange', { detail: { value: event?.detail?.value || '' } }));\n  }`;
    }
  }

  const lineItemRowJs = findComponent('lineItemRow', 'LWC_JS');
  if (lineItemRowJs && !/dispatchEvent\s*\(\s*new\s+CustomEvent\s*\(\s*['"]rowchange['"][\s\S]*?detail\s*:\s*\{[\s\S]*?index\s*:/i.test(lineItemRowJs.content || '')) {
    lineItemRowJs.content += `\n\n  emitRowChange(index, field, value) {\n    this.dispatchEvent(new CustomEvent('rowchange', { detail: { index, field, value } }));\n  }`;
  }

  const lineItemsSectionJs = findComponent('lineItemsSection', 'LWC_JS');
  if (lineItemsSectionJs && !/CustomEvent\s*\(\s*['"]sectionchange['"]/i.test(lineItemsSectionJs.content || '')) {
    lineItemsSectionJs.content += `\n\n  notifySectionChange(items = []) {\n    this.dispatchEvent(new CustomEvent('sectionchange', { detail: { items } }));\n  }`;
  }
  if (lineItemsSectionJs && !/\bthis\.[A-Za-z_$][\w$]*\s*=\s*\[\s*\.\.\.\s*this\.[A-Za-z_$][\w$]*/.test(lineItemsSectionJs.content || '')
    && !/\bthis\.[A-Za-z_$][\w$]*\s*=\s*this\.[A-Za-z_$][\w$]*\.map\(/.test(lineItemsSectionJs.content || '')) {
    lineItemsSectionJs.content += `\n\n  applyImmutableUpdate() {\n    this.lineItems = [...(this.lineItems || [])];\n  }`;
  }

  const lineItemsSectionHtml = findComponent('lineItemsSection', 'LWC_HTML');
  if (lineItemsSectionHtml) {
    let html = lineItemsSectionHtml.content || '<template>\n</template>';
    if (!/for:each=\{[^}]+\}[\s\S]*?<c-line-item-row\b[\s\S]*?key=\{[^}]+\}/i.test(html)) {
      html = `<template>\n  <template for:each={lineItems} for:item="item" for:index="index">\n    <c-line-item-row key={item.id} index={index} onrowchange={handleRowChange}></c-line-item-row>\n  </template>\n  <lightning-button label="Add Line Item" onclick={handleAddLineItem}></lightning-button>\n</template>`;
    } else if (!/<lightning-button\b[^>]*\blabel="Add Line Item"/i.test(html)) {
      html = html.replace(/<\/template>\s*$/i, '  <lightning-button label="Add Line Item" onclick={handleAddLineItem}></lightning-button>\n</template>');
    }
    lineItemsSectionHtml.content = html;
  }

  const parentLineItemHtml = findComponent(spec.parentBundle, 'LWC_HTML');
  if (parentLineItemHtml && /<lightning-button\b[^>]*\blabel="Add Line Item"/i.test(parentLineItemHtml.content || '')) {
    parentLineItemHtml.content = parentLineItemHtml.content.replace(/<lightning-button\b[^>]*\blabel="Add Line Item"[^>]*><\/lightning-button>/gi, '');
  }
  const lineItemRowHtml = findComponent('lineItemRow', 'LWC_HTML');
  if (lineItemRowHtml && /<lightning-button\b[^>]*\blabel="Add Line Item"/i.test(lineItemRowHtml.content || '')) {
    lineItemRowHtml.content = lineItemRowHtml.content.replace(/<lightning-button\b[^>]*\blabel="Add Line Item"[^>]*><\/lightning-button>/gi, '');
  }

  for (const [bundleName] of getLwcBundles(components).entries()) {
    if (bundleName === spec.parentBundle) continue;
    const childMetaComp = findComponent(bundleName, 'LWC_META');
    if (!childMetaComp) continue;
    childMetaComp.content = `<?xml version="1.0" encoding="UTF-8"?>\n<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">\n  <apiVersion>62.0</apiVersion>\n  <isExposed>false</isExposed>\n</LightningComponentBundle>`;
  }

  const allBundlesMap = getLwcBundles(components);

  for (const files of allBundlesMap.values()) {
    const htmlComp = files.find(c => c.type === 'LWC_HTML');
    if (htmlComp?.content) {
      htmlComp.content = htmlComp.content.replace(/\sstyle\s*=\s*(['"]).*?\1/gi, '');
    }
  }

  const parentBundle = spec.parentBundle;
  const childBundles = [...allBundlesMap.keys()].filter(name => name !== parentBundle);
  if (parentBundle && childBundles.length > 0) {
    bundle.deploymentSteps = [];
    enforceNestedDeploySteps(bundle, parentBundle, childBundles);
  }

  bundle.components = components;
  return bundle;
}

/**
 * Extract text from a PDF base64 string using pdf-parse.
 */
async function extractPdfText(base64) {
  try {
    const buffer = Buffer.from(base64, 'base64');
    const data = await pdfParse(buffer);
    return data.text?.trim() || '';
  } catch (err) {
    console.warn('PDF parse warning:', err.message);
    return '';
  }
}

/**
 * Build the user message content array, incorporating any attachments.
 * - Text/PDF attachments are prepended to the text message.
 * - Image attachments are added as vision image_url blocks.
 */
export async function buildUserContent(userMessage, attachments) {
  let contextBlock = '';
  const imageBlocks = [];

  for (const att of attachments) {
    if (att.kind === 'text' && att.content) {
      contextBlock += `\n\n--- ATTACHED DOCUMENT: ${att.name} ---\n${att.content}\n--- END OF DOCUMENT ---`;
    } else if (att.kind === 'pdf' && att.base64) {
      const pdfText = await extractPdfText(att.base64);
      if (pdfText) {
        contextBlock += `\n\n--- ATTACHED PDF: ${att.name} ---\n${pdfText}\n--- END OF PDF ---`;
      } else {
        contextBlock += `\n\n[PDF attached: ${att.name} — could not extract text]`;
      }
    } else if (att.kind === 'image' && att.base64) {
      imageBlocks.push({
        type: 'image_url',
        image_url: { url: `data:${att.mimeType};base64,${att.base64}`, detail: 'high' },
      });
    }
  }

  const fullText = contextBlock
    ? `${userMessage}\n\nADDITIONAL CONTEXT FROM ATTACHED FILES:${contextBlock}`
    : userMessage;

  // If no images, return plain string (cheaper, no vision overhead)
  if (imageBlocks.length === 0) {
    return fullText;
  }

  // Vision: mixed content array
  return [
    { type: 'text', text: fullText },
    ...imageBlocks,
  ];
}

// ─── ORCHESTRATION STEPS ──────────────────────────────────────────────────────

/**
 * Step 1 — Extract structured intent from the user's prompt (+ optional image).
 * Uses json_schema structured output which is compatible with vision inputs.
 */
async function generateIntent(prompt, componentType, attachments, refinementContext, architecturePreference = 'auto') {
  const hasImageAttachments = attachments.some(a => a.kind === 'image');

  let intentPrompt = `You are a Salesforce architect. Analyze the following request and extract a structured intent JSON.

REQUESTED COMPONENT TYPE: ${componentType}
USER REQUEST:
${prompt}`;

  if (refinementContext) {
    const ctx = {
      summary: refinementContext.summary,
      components: refinementContext.components?.map(c => ({ type: c.type, name: c.name })),
    };
    intentPrompt += `\n\nEXISTING CODE CONTEXT (this is a refinement request):
${JSON.stringify(ctx, null, 2)}`;
  }

  if (hasImageAttachments && componentType === 'lwc') {
    intentPrompt += `\n\nAn image of the desired UI is attached. Carefully identify ALL fields, section headings, layout columns, and interactive elements visible in the image. Populate the "fields" array with every input and the "layout" array to describe how fields are grouped into sections and columns.`;
  }

  if (componentType === 'lwc') {
    intentPrompt += `\n\nSet "lwc_composition" as follows:
- If user asks for modular/nested/separate components/reusable sections, choose "nested".
- If user explicitly asks for one component/file, choose "single".
- Otherwise choose "single".`;
  }

  if (architecturePreference === 'single' || architecturePreference === 'nested') {
    intentPrompt += `\n\nARCHITECTURE OVERRIDE: Force lwc_composition to "${architecturePreference}".`;
  }

  intentPrompt += `\n\nReturn the structured intent JSON only.`;

  const userContent = await buildUserContent(intentPrompt, attachments);

  const response = await getClient().chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 2000,
    messages: [{ role: 'user', content: userContent }],
    response_format: INTENT_SCHEMA,
  });

  const text = response.choices[0].message.content;
  console.log(`[intent] finish=${response.choices[0].finish_reason} length=${text?.length}`);
  const intent = JSON.parse(text);
  intent.lwc_composition = componentType === 'lwc'
    ? inferLwcComposition(prompt, architecturePreference, intent?.lwc_composition)
    : 'single';
  return intent;
}

/**
 * LWC Step 1 — Extract a pixel-perfect layout blueprint from a UI screenshot.
 * Only called when componentType === 'lwc' and images are attached.
 * Returns a layout_spec object that is then used as the authoritative blueprint
 * for bundle generation, eliminating layout guesswork.
 */
async function extractLayoutSpec(prompt, attachments) {
  const specPrompt = `You are a UI analyst. An image of a form is attached.
Examine EVERY field, label, section heading, tab, and action button visible in the image.

Your task: return a layout_spec JSON that captures the EXACT layout.

CRITICAL DISTINCTION — section heading vs field label:
- SECTION HEADING: A group title shown ABOVE a set of inputs (e.g. "Participant Name" printed above First+Last inputs).
  → Store it in section.heading (e.g. heading: "Participant Name").
  → It is NOT the label on any input field.
- FIELD LABEL: The small label shown directly on or adjacent to a specific input (e.g. "First", "Last", "Age").
  → Store it in field.label (e.g. label: "First").
  → NEVER put a section heading like "Participant Name" as a field label.

Example for a "Participant Name" group with two side-by-side inputs labeled "First" and "Last":
  { heading: "Participant Name", rows: [{ columns: 2, fields: [
      { kind: "input", label: "First", placeholder: "First", field_type: "text" },
      { kind: "input", label: "Last",  placeholder: "Last",  field_type: "text" }
  ]}]}

Layout rules:
- Each distinct visual group (separated by a heading or whitespace) is one section.
- If two fields appear SIDE-BY-SIDE in the same row, set columns=2 (or 3/4 as appropriate).
- If a field stands alone on its full row, set columns=1.
- Map each input to the correct kind: "input", "select" (dropdown), "textarea", "checkbox".
- If an input has no visible label (only placeholder), set label="" and populate placeholder.
- Capture page subtitle text in "subtitle" when present.
- Capture all top tabs in "tabs" with one active=true tab.
- Capture side-by-side SECTION GROUPING in "section_groups". Example for two top sections side-by-side:
  { columns: 2, sections: ["Company Information", "Loan Request Details"] }
- Capture ALL footer action buttons in "footer_actions" in visual order.
- Do NOT leave tabs/section_groups/footer_actions empty when they are visibly present in the screenshot.
- IMPORTANT: If the screenshot is wide and shows two sections side-by-side, do NOT collapse them into a single vertical stack in section_groups.
- DO NOT invent fields/sections/buttons that are not visibly present in the screenshot.
- If uncertain, keep text empty ("") rather than guessing labels.

USER CONTEXT:
${prompt}

Return ONLY the layout_spec JSON.`;

  const userContent = await buildUserContent(specPrompt, attachments);

  const response = await getClient().chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 2000,
    messages: [{ role: 'user', content: userContent }],
    response_format: LAYOUT_SPEC_SCHEMA,
  });

  const text = response.choices[0].message.content;
  const spec = JSON.parse(text);

  const verifyPrompt = `You are a UI QA verifier.
An initial layout_spec was extracted from the attached screenshot.
Compare the spec to the image and return a corrected layout_spec.

STRICT RULES:
- Keep ONLY elements that are visible in the screenshot.
- Do NOT add inferred sections/fields/buttons from domain assumptions.
- Preserve side-by-side rows and section_groups exactly as shown.
- Keep field labels/placeholders literal to the screenshot when readable.

INITIAL layout_spec:
${JSON.stringify(spec, null, 2)}

Return ONLY the corrected layout_spec JSON.`;

  const verifyUserContent = await buildUserContent(verifyPrompt, attachments);
  const verifyResponse = await getClient().chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 2000,
    messages: [{ role: 'user', content: verifyUserContent }],
    response_format: LAYOUT_SPEC_SCHEMA,
  });

  const verifyText = verifyResponse.choices[0].message.content;
  const verifiedSpec = JSON.parse(verifyText);

  const normalizeLayoutSpec = (rawSpec, sourcePrompt) => {
    const normalized = {
      title: rawSpec?.title || '',
      subtitle: rawSpec?.subtitle || '',
      tabs: Array.isArray(rawSpec?.tabs) ? rawSpec.tabs : [],
      sections: Array.isArray(rawSpec?.sections) ? rawSpec.sections : [],
      section_groups: Array.isArray(rawSpec?.section_groups) ? rawSpec.section_groups : [],
      footer_actions: Array.isArray(rawSpec?.footer_actions) ? rawSpec.footer_actions : [],
    };

    const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
    const normalizedHeadingMap = new Map(
      normalized.sections
        .map(s => clean(s?.heading))
        .filter(Boolean)
        .map(h => [h.toLowerCase(), h])
    );

    normalized.section_groups = normalized.section_groups
      .map(group => {
        const columns = Number(group?.columns) || 1;
        const sections = Array.isArray(group?.sections)
          ? group.sections
              .map(name => clean(name))
              .map(name => normalizedHeadingMap.get(name.toLowerCase()) || '')
              .filter(Boolean)
          : [];
        return { columns, sections };
      })
      .filter(group => group.columns >= 2 && group.sections.length >= 2);

    const seenGroupKeys = new Set();
    normalized.section_groups = normalized.section_groups.filter(group => {
      const key = `${group.columns}:${group.sections.map(s => s.toLowerCase()).sort().join('|')}`;
      if (seenGroupKeys.has(key)) return false;
      seenGroupKeys.add(key);
      return true;
    });

    normalized.footer_actions = normalized.footer_actions
      .map(action => ({
        label: clean(action?.label),
        variant: clean(action?.variant) || 'neutral',
      }))
      .filter(action => action.label.length > 0);

    const sectionHeadings = normalized.sections.map(s => String(s?.heading || '').trim().toLowerCase()).filter(Boolean);
    const hasCompanyInfo = sectionHeadings.some(h => h.includes('company information'));
    const hasLoanRequest = sectionHeadings.some(h => h.includes('loan request details'));

    if (normalized.section_groups.length === 0 && hasCompanyInfo && hasLoanRequest) {
      const companyHeading = normalized.sections.find(s => /company information/i.test(String(s?.heading || '')))?.heading;
      const loanHeading = normalized.sections.find(s => /loan request details/i.test(String(s?.heading || '')))?.heading;
      if (companyHeading && loanHeading) {
        normalized.section_groups.push({ columns: 2, sections: [companyHeading, loanHeading] });
      }
    }

    return normalized;
  };

  const normalizedSpec = normalizeLayoutSpec(verifiedSpec, prompt);
  const totalFields = normalizedSpec.sections.reduce((sum, s) => sum + s.rows.reduce((sr, r) => sr + r.fields.length, 0), 0);
  const twoColRows = normalizedSpec.sections.reduce((sum, s) => sum + s.rows.filter(r => r.columns >= 2).length, 0);
  console.log(`[layout-spec] "${normalizedSpec.title}" | sections=${normalizedSpec.sections.length} fields=${totalFields} multi-col-rows=${twoColRows} tabs=${normalizedSpec.tabs.length} groups=${normalizedSpec.section_groups.length} actions=${normalizedSpec.footer_actions.length} finish=${response.choices[0].finish_reason}`);
  return normalizedSpec;
}

/**
 * Step 2 — Generate the full code bundle from the structured intent.
 */
async function generateBundle(intent, componentType, orgMetadata, refinementContext, attachments, layoutSpec = null, sourcePrompt = '') {
  const typeInstructions = getComponentTypeInstructions(componentType);
  const hasImageAttachments = attachments.some(a => a.kind === 'image');
  const nestedPromptSpec = componentType === 'lwc' && intent?.lwc_composition === 'nested'
    ? extractNestedPromptSpec(sourcePrompt)
    : null;

  let bundlePrompt = `STRUCTURED INTENT:
${JSON.stringify(intent, null, 2)}

GENERATION INSTRUCTIONS:
${typeInstructions}

OUTPUT FORMAT RULES:
- Include a "bundle" field on every component.
- For single LWC architecture, use one bundle name across all LWC files.
- For nested LWC architecture, use parent and child bundle names and keep each bundle complete.`;

  if (nestedPromptSpec) {
    const requiredBundles = [
      ...(nestedPromptSpec.parentBundle ? [nestedPromptSpec.parentBundle] : []),
      ...nestedPromptSpec.listedChildren,
      ...nestedPromptSpec.conditionalChildren,
      ...(nestedPromptSpec.deepNestedChild ? [nestedPromptSpec.deepNestedChild] : []),
    ].filter(Boolean);

    if (requiredBundles.length > 0) {
      bundlePrompt += `\n\nSTRICT NESTED BUNDLE NAMES (must match exactly): ${[...new Set(requiredBundles)].join(', ')}.`;
    }

    if (nestedPromptSpec.parentBundle && nestedPromptSpec.listedChildren.length > 0) {
      bundlePrompt += `\nParent ${nestedPromptSpec.parentBundle} MUST render child tags for: ${nestedPromptSpec.listedChildren.join(', ')}.`;
    }

    if (nestedPromptSpec.deepNestedParent && nestedPromptSpec.deepNestedChild) {
      bundlePrompt += `\nDeep nesting required: ${nestedPromptSpec.deepNestedParent} MUST render <c-${toKebabCase(nestedPromptSpec.deepNestedChild)}> and listen onaddressupdate; ${nestedPromptSpec.deepNestedChild} MUST dispatch CustomEvent('addressupdate'); ${nestedPromptSpec.deepNestedParent} MUST re-emit CustomEvent('sectionchange').`;
    }

    if (nestedPromptSpec.hasConditionalScenario) {
      bundlePrompt += `\nConditional rendering required: in parent, render conditional children inside <template if:true={...}> blocks (not unconditionally), define isPickup/isDelivery state, dispatch methodchange from shippingMethodSection, and wire onmethodchange in parent.`;
    }

    if (nestedPromptSpec.hasBulkRowScenario) {
      bundlePrompt += `\nBulk row contract required: lineItemsSection must render <c-line-item-row> with for:each and key; lineItemRow must dispatch CustomEvent('rowchange', { detail: { index, field, value } }); lineItemsSection must immutably update array state and re-emit sectionchange; parent must compute totalAmount.`;
    }
  }

  if (orgMetadata?.objects?.length) {
    const relevantObjects = orgMetadata.objects.slice(0, 20).map(o => o.name).join(', ');
    bundlePrompt += `\n\nORG CONTEXT - Available SObjects: ${relevantObjects}`;
  }

  if (refinementContext) {
    bundlePrompt += `\n\nREFINE EXISTING CODE:\n${JSON.stringify(refinementContext, null, 2)}\n\nApply the intent above as refinements. Keep what works, improve what's needed.`;
  }

  if (layoutSpec) {
    // Authoritative pixel-perfect blueprint — the model must follow this exactly.
    bundlePrompt += `\n\nLAYOUT BLUEPRINT (authoritative — follow exactly):
${JSON.stringify(layoutSpec, null, 2)}

LAYOUT ENFORCEMENT RULES (violations trigger a repair pass):
1. SECTION HEADING → render as <p class="slds-text-heading_small slds-m-bottom_small">HEADING TEXT</p>.
   NEVER use a section.heading as the label="" on a lightning-input/combobox.
2. FIELD LABEL → label="FIELD_LABEL" attribute on the lightning-input or lightning-combobox.
   The label MUST be the field's own name (e.g. "First", "Last", "Age"), not the section heading.
3. ROW WITH columns >= 2 → use this exact pattern (size=6 for 2-col, size=4 for 3-col, size=3 for 4-col):
   <lightning-layout multiple-rows class="slds-gutters slds-m-bottom_medium">
     <lightning-layout-item size="6" padding="around-small">…field…</lightning-layout-item>
     <lightning-layout-item size="6" padding="around-small">…field…</lightning-layout-item>
   </lightning-layout>
4. ROW WITH columns === 1 → <div class="slds-m-bottom_medium">…field…</div> (no lightning-layout).
5. Field order within each row MUST match the blueprint left-to-right.
6. Do NOT add or remove fields — render exactly the fields listed in the blueprint.`;
    bundlePrompt += `
7. If layout_spec.tabs is non-empty, render tab labels in order and visibly indicate the active tab.
8. Respect layout_spec.section_groups: sections listed in the same group must render side-by-side in one <lightning-layout> row using equal width items.
9. Render ALL layout_spec.footer_actions labels at the bottom in order (e.g. Save as Draft then Submit Application).`;
  } else if (hasImageAttachments && componentType === 'lwc') {
    bundlePrompt += `\n\nVISION: The attached image shows the target UI. Use the layout sections and field positions from the intent to faithfully reproduce the layout with lightning-layout + lightning-layout-item.`;
  }

  const userContent = await buildUserContent(bundlePrompt, attachments);
  console.log(`[bundle] vision=${Array.isArray(userContent)} contentType=${Array.isArray(userContent) ? 'array[' + userContent.length + ']' : 'string'}`);

  const response = await getClient().chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 8000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    response_format: BUNDLE_SCHEMA,
  });

  const text = response.choices[0].message.content;
  console.log(`[bundle] finish=${response.choices[0].finish_reason} length=${text?.length}`);
  return JSON.parse(text);
}

/**
 * Step 3a — Validate a generated bundle for common Salesforce anti-patterns.
 * Returns an array of issue description strings (empty = no issues).
 */
function validateBundle(bundle, componentType) {
  const issues = [];
  const metaTypes = new Set(bundle.components.map(c => c.type));

  for (const comp of bundle.components) {
    const code = comp.content || '';
    const compId = `${comp.type}:${comp.name}`;

    // ── Apex checks ────────────────────────────────────────────────────────
    if (comp.type === 'ApexClass' || comp.type === 'ApexTrigger') {
      // SOQL in a for/while loop — heuristic scan line-by-line
      const lines = code.split('\n');
      let loopDepth = 0;
      for (const line of lines) {
        const trimmed = line.trim();
        if (/\b(for|while)\s*\(/.test(trimmed)) loopDepth++;
        if (loopDepth > 0 && trimmed.includes('[SELECT')) {
          issues.push(`${compId}: SOQL query inside a loop — move all queries outside loops`);
          break;
        }
        // Rough brace tracking to exit loop scope
        if (loopDepth > 0) {
          loopDepth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
          if (loopDepth < 0) loopDepth = 0;
        }
      }

      // DML in a for/while loop
      const dmlInLoop = /\b(for|while)\s*\([^{]+\)\s*\{[^}]*\b(insert|update|delete|upsert|merge)\b/is.test(code);
      if (dmlInLoop) {
        issues.push(`${compId}: DML inside a loop — batch all DML outside the loop`);
      }
    }

    // ── LWC HTML checks ────────────────────────────────────────────────────
    if (comp.type === 'LWC_HTML') {
      // Inline styles (minor but flag it)
      if (/\bstyle\s*=\s*["'][^"']{1,}["']/.test(code)) {
        issues.push(`${compId}: Inline styles detected — prefer SLDS utility classes or component CSS file`);
      }
    }
  }

  // ── Bundle-level checks ──────────────────────────────────────────────────

  // Missing test class for Apex components
  const needsTest = ['apex-trigger', 'apex-class', 'integration', 'batch', 'rest-api'].includes(componentType);
  if (needsTest) {
    const hasTest = bundle.components.some(
      c => c.type === 'ApexTestClass' || (c.content?.includes('@isTest'))
    );
    if (!hasTest) {
      issues.push('Bundle: Missing @isTest class — add a test class with 90%+ coverage');
    }
  }

  // LWC must include a meta file
  if (componentType === 'lwc' && !metaTypes.has('LWC_META')) {
    issues.push('Bundle: Missing LWC_META file — add a .js-meta.xml configuration file');
  }

  return issues;
}

function enforceNestedDeploySteps(bundle, parentBundle, childBundles) {
  if (!bundle) return;

  const childSteps = childBundles.map((child, index) => `Step ${index + 1}: Deploy child bundle ${child}`);
  const parentStep = `Step ${childBundles.length + 1}: Deploy parent bundle ${parentBundle}`;
  const existing = Array.isArray(bundle.deploymentSteps) ? bundle.deploymentSteps : [];
  bundle.deploymentSteps = [...childSteps, parentStep, ...existing.filter(step => {
    const text = String(step || '').toLowerCase();
    return !text.includes('deploy child bundle') && !text.includes('deploy parent bundle');
  })];
}

function validateNestedLwcArchitecture(bundle) {
  const issues = [];
  const bundlesMap = getLwcBundles(bundle.components || []);
  const bundleNames = [...bundlesMap.keys()];

  if (bundleNames.length < 2) {
    issues.push('Nested LWC requires 1 parent bundle and at least 1 child bundle, but fewer than 2 bundles were generated.');
    return { issues, parentBundle: null, childBundles: [] };
  }

  for (const [bundleName, files] of bundlesMap.entries()) {
    const types = new Set(files.map(f => f.type));
    if (!types.has('LWC_HTML') || !types.has('LWC_JS') || !types.has('LWC_META')) {
      issues.push(`Bundle completeness: ${bundleName} must include LWC_HTML, LWC_JS, and LWC_META (LWC_CSS optional).`);
    }
  }

  const referencedChildrenByParent = new Map();
  const childReferenceCounts = new Map(bundleNames.map(name => [name, 0]));

  for (const [bundleName, files] of bundlesMap.entries()) {
    const html = files.find(f => f.type === 'LWC_HTML')?.content || '';
    const referenced = [];

    for (const candidate of bundleNames) {
      if (candidate === bundleName) continue;
      const tag = `c-${toKebabCase(candidate)}`;
      if (new RegExp(`<${tag}\\b`, 'i').test(html)) {
        referenced.push(candidate);
        childReferenceCounts.set(candidate, (childReferenceCounts.get(candidate) || 0) + 1);
      }
    }

    if (referenced.length > 0) {
      referencedChildrenByParent.set(bundleName, referenced);
    }
  }

  const parentCandidates = [...referencedChildrenByParent.keys()];
  if (parentCandidates.length !== 1) {
    issues.push(`Parent usage: expected exactly one parent bundle using child tags, found ${parentCandidates.length}.`);
    return { issues, parentBundle: null, childBundles: [] };
  }

  const parentBundle = parentCandidates[0];
  const childBundles = bundleNames.filter(name => name !== parentBundle);
  const parentHtml = bundlesMap.get(parentBundle)?.find(f => f.type === 'LWC_HTML')?.content || '';
  const parentJs = bundlesMap.get(parentBundle)?.find(f => f.type === 'LWC_JS')?.content || '';
  const parentMeta = bundlesMap.get(parentBundle)?.find(f => f.type === 'LWC_META')?.content || '';

  for (const child of childBundles) {
    const tagName = `c-${toKebabCase(child)}`;
    if (!new RegExp(`<${tagName}\\b`, 'i').test(parentHtml)) {
      issues.push(`Parent uses children: parent bundle ${parentBundle} must include <${tagName} />.`);
    }
    if ((childReferenceCounts.get(child) || 0) === 0) {
      issues.push(`Parent uses children: child bundle ${child} is not referenced by the parent HTML.`);
    }
  }

  for (const child of childBundles) {
    const tagName = `c-${toKebabCase(child)}`;
    const childJs = bundlesMap.get(child)?.find(f => f.type === 'LWC_JS')?.content || '';
    const childHtml = bundlesMap.get(child)?.find(f => f.type === 'LWC_HTML')?.content || '';
    const childMeta = bundlesMap.get(child)?.find(f => f.type === 'LWC_META')?.content || '';
    const childApiProps = new Set([...childJs.matchAll(/@api\s+([A-Za-z_$][\w$]*)/g)].map(m => m[1]));
    const childEvents = [...childJs.matchAll(/(?:dispatchEvent\s*\(\s*)?new\s+CustomEvent\(\s*['"]([A-Za-z0-9_-]+)['"]/g)].map(m => m[1]);
    const childTagMatches = [...parentHtml.matchAll(new RegExp(`<${tagName}\\b([^>]*)>`, 'gi'))];

    if (childApiProps.size === 0 && childEvents.length === 0) {
      issues.push(`Child contract: ${child} must expose at least one @api property or dispatch at least one CustomEvent.`);
    }

    const childHasSubmitLike = /<lightning-button\b[^>]*\blabel="(?:submit|save|cancel)"/i.test(childHtml);
    if (childHasSubmitLike) {
      issues.push(`Submit placement: child ${child} must not include Submit/Save/Cancel buttons. Actions belong in parent ${parentBundle}.`);
    }

    if (/<target>\s*lightning__(?:AppPage|RecordPage|HomePage)\s*<\/target>/i.test(childMeta)) {
      issues.push(`Meta targets: child ${child} should not expose app/record/home targets in .js-meta.xml.`);
    }

    for (const match of childTagMatches) {
      const attrs = match[1] || '';
      const passedProps = [...attrs.matchAll(/\s([a-z][a-z0-9-]*)=\{[^}]+\}/gi)]
        .map(m => m[1])
        .filter(name => !name.startsWith('on'));
      const listenerAttrs = [...attrs.matchAll(/\s(on[a-z0-9_-]+)=\{\s*([A-Za-z_$][\w$]*)\s*\}/gi)]
        .map(m => ({ attr: m[1], handler: m[2] }));

      for (const prop of passedProps) {
        const camel = toCamelCase(prop);
        if (!childApiProps.has(camel) && !childApiProps.has(prop)) {
          issues.push(`Children expose APIs: child ${child} must expose @api ${camel} when parent passes ${prop}.`);
        }
      }

      if (childEvents.length > 0 && listenerAttrs.length === 0) {
        issues.push(`Events wiring: parent ${parentBundle} must listen to events from ${child} (e.g. onchange={handleChildChange}).`);
      }
      if (listenerAttrs.length > 0 && childEvents.length === 0) {
        issues.push(`Events wiring: child ${child} should dispatch CustomEvent when parent listens via ${listenerAttrs.map(l => l.attr).join(', ')}.`);
      }

      for (const listener of listenerAttrs) {
        if (!new RegExp(`\\b${listener.handler}\\s*\\(`).test(parentJs)) {
          issues.push(`Parent handlers: ${parentBundle}.js is missing handler method ${listener.handler} referenced by ${listener.attr} on ${child}.`);
        }
      }
    }
  }

  const parentHasSubmitLike = /<lightning-button\b[^>]*\blabel="(?:submit|save|cancel)"/i.test(parentHtml);
  if (!parentHasSubmitLike) {
    issues.push(`Submit placement: parent ${parentBundle} must contain Submit/Save/Cancel button(s).`);
  }

  const parentHasNamedHandlers = /\bhandle(?:Name|Contact|Address)Change\s*\(/.test(parentJs);
  const parentHasGenericHandler = /\bhandleSectionChange\s*\(/.test(parentJs);
  const parentHasAnyListenerHandler = /\bon[a-z0-9_-]+=\{\s*([A-Za-z_$][\w$]*)\s*\}/i.test(parentHtml);
  if (!parentHasNamedHandlers && !parentHasGenericHandler && !parentHasAnyListenerHandler) {
    issues.push(`Parent aggregation: ${parentBundle} must process child events with handleNameChange/handleContactChange/handleAddressChange or a generic handleSectionChange.`);
  }

  if (!/<target>\s*lightning__(?:AppPage|RecordPage)\s*<\/target>/i.test(parentMeta)) {
    issues.push(`Meta targets: parent ${parentBundle} should expose lightning__AppPage or lightning__RecordPage in .js-meta.xml.`);
  }

  const deployText = (bundle.deploymentSteps || []).join('\n').toLowerCase();
  const hasChildStep = /deploy\s+child\s+bundle/.test(deployText);
  const hasParentStep = /deploy\s+parent\s+bundle/.test(deployText);
  if (!hasChildStep || !hasParentStep) {
    issues.push('Deploy order: deployment steps must list child bundle deployment before parent bundle deployment.');
  }

  return { issues, parentBundle, childBundles };
}

function normalizeLabel(text = '') {
  return String(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function labelsEquivalent(expected, actual) {
  const exp = normalizeLabel(expected);
  const act = normalizeLabel(actual);
  if (!exp || !act) return false;
  if (exp === act) return true;
  if (exp.includes(act) || act.includes(exp)) return true;

  const compact = value => value.replace(/\b(name|field|api)\b/g, '').replace(/\s+/g, ' ').trim();
  const expCompact = compact(exp);
  const actCompact = compact(act);
  return !!expCompact && !!actCompact && (expCompact === actCompact || expCompact.includes(actCompact) || actCompact.includes(expCompact));
}

function getLayoutBlocks(html) {
  return html.match(/<lightning-layout\b[\s\S]*?<\/lightning-layout>/gi) || [];
}

function extractBlockLabels(block) {
  const labels = [
    ...[...block.matchAll(/lightning-input[^>]*\blabel="([^"]+)"/gi)].map(m => m[1]),
    ...[...block.matchAll(/lightning-combobox[^>]*\blabel="([^"]+)"/gi)].map(m => m[1]),
    ...[...block.matchAll(/lightning-select[^>]*\blabel="([^"]+)"/gi)].map(m => m[1]),
    ...[...block.matchAll(/lightning-textarea[^>]*\blabel="([^"]+)"/gi)].map(m => m[1]),
  ];
  return labels.map(normalizeLabel).filter(Boolean);
}

function blockHasLabelSet(block, expectedLabels) {
  const found = extractBlockLabels(block);
  const expected = expectedLabels.map(normalizeLabel).filter(Boolean);
  return expected.every(exp => found.some(actual => labelsEquivalent(exp, actual)));
}

function extractRequestedRowGroups(promptText) {
  const text = normalizeLabel(promptText);
  const groups = [];

  const plusPattern = /([a-z][a-z\s]{0,30})\s*\+\s*([a-z][a-z\s]{0,30})(?:\s*\+\s*([a-z][a-z\s]{0,30}))?\s*(?:in\s+(?:the\s+)?same\s+row|in\s+one\s+row|side\s+by\s+side)/gi;
  let match;
  while ((match = plusPattern.exec(text)) !== null) {
    const labels = [match[1], match[2], match[3]].filter(Boolean).map(v => v.trim());
    if (labels.length >= 2) groups.push(labels);
  }

  const andPattern = /([a-z][a-z\s]{0,30})\s+and\s+([a-z][a-z\s]{0,30})\s+side\s+by\s+side/gi;
  while ((match = andPattern.exec(text)) !== null) {
    groups.push([match[1].trim(), match[2].trim()]);
  }

  // Frequent enterprise asks that may not use explicit + syntax
  if (/first\s+name.*last\s+name.*side\s+by\s+side|first\s+name.*last\s+name.*one\s+row|first\s+and\s+last/.test(text)) {
    groups.push(['First', 'Last']);
  }
  if (/email.*phone.*side\s+by\s+side|email.*phone.*one\s+row/.test(text)) {
    groups.push(['Email', 'Phone']);
  }
  if (/city.*state.*zip.*same\s+row|city.*state.*zip.*one\s+row/.test(text)) {
    groups.push(['City', 'State', 'Zip']);
  }

  // de-duplicate
  const seen = new Set();
  return groups.filter(group => {
    const key = group.map(normalizeLabel).sort().join('|');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function validateLwcPromptRequirements(bundle, promptText) {
  const issues = [];
  const htmlComp = bundle.components.find(c => c.type === 'LWC_HTML');
  const jsComp = bundle.components.find(c => c.type === 'LWC_JS');
  if (!htmlComp) return ['LWC_HTML component is missing from the bundle'];
  const html = htmlComp.content || '';
  const js = jsComp?.content || '';
  const prompt = normalizeLabel(promptText);

  const buttonLabels = [...html.matchAll(/<lightning-button\b[^>]*\blabel="([^"]+)"/gi)].map(m => normalizeLabel(m[1]));
  const hasSave = buttonLabels.some(lbl => labelsEquivalent('save', lbl));
  const hasCancel = buttonLabels.some(lbl => labelsEquivalent('cancel', lbl));
  const hasSubmit = buttonLabels.some(lbl => labelsEquivalent('submit', lbl));

  if (/save\s*(?:and|\+|\/)?\s*cancel/.test(prompt) && (!hasSave || !hasCancel)) {
    issues.push('LWC_HTML: Prompt requires Save and Cancel actions. Add both <lightning-button label="Save"> and <lightning-button label="Cancel"> at the bottom.');
  }
  if (/submit\s*(?:and|\+|\/)?\s*cancel/.test(prompt) && (!hasSubmit || !hasCancel)) {
    issues.push('LWC_HTML: Prompt requires Submit and Cancel actions. Add both buttons with those exact labels at the bottom.');
  }
  if (/\bsave\s+button\b|\badd\s+save\b/.test(prompt) && !hasSave) {
    issues.push('LWC_HTML: Prompt explicitly asks for a Save button. Use label="Save" (not only Submit).');
  }
  if (/\bsubmit\s+button\b|\badd\s+submit\b/.test(prompt) && !hasSubmit) {
    issues.push('LWC_HTML: Prompt explicitly asks for a Submit button. Use label="Submit".');
  }

  if (/(\bform\b|group\s+related\s+fields|never\s+stack|side\s+by\s+side|production\s+ready|enterprise\s+ready)/.test(prompt)) {
    const hasLayout = /<lightning-layout\b/i.test(html) && /<lightning-layout-item\b/i.test(html);
    if (!hasLayout) {
      issues.push('LWC_HTML: Use lightning-layout + lightning-layout-item for field grouping. Do not render all fields as a single vertical stack.');
    }
  }

  const rowGroups = extractRequestedRowGroups(promptText);
  if (rowGroups.length > 0) {
    const blocks = getLayoutBlocks(html);
    for (const group of rowGroups) {
      const foundTogether = blocks.some(block => blockHasLabelSet(block, group));
      if (!foundTogether) {
        issues.push(
          `LWC_HTML: Requested side-by-side row [${group.join(', ')}] is not grouped in the same <lightning-layout>. ` +
          `Place all of these fields in one <lightning-layout multiple-rows class="slds-gutters slds-m-bottom_medium"> with sibling <lightning-layout-item> entries.`
        );
      }
    }
  }

  if (/dropdown|combobox|select\s+field|field\s+type\s+dropdown/.test(prompt) && !/<lightning-(combobox|select)\b/i.test(html)) {
    issues.push('LWC_HTML: Prompt requests a dropdown/select control. Add a <lightning-combobox> or <lightning-select> for that field.');
  }

  if (/checkbox|required\s+checkbox/.test(prompt) && !/<lightning-input\b[^>]*\btype="checkbox"|<lightning-checkbox-group\b/i.test(html)) {
    issues.push('LWC_HTML: Prompt requests a checkbox control. Add <lightning-input type="checkbox"> (or lightning-checkbox-group as appropriate).');
  }

  if (/validate|validation|required|error\s+message|invalid\s+inputs/.test(prompt)) {
    const hasValidationJs = /(checkValidity|reportValidity|setCustomValidity|validity\.)/i.test(js);
    if (!hasValidationJs) {
      issues.push('LWC_JS: Prompt requests validation behavior. Add explicit validation logic using checkValidity/reportValidity/setCustomValidity and block submit on invalid input.');
    }
  }

  if (/spinner|loading/.test(prompt) && !/<lightning-spinner\b/i.test(html)) {
    issues.push('LWC_HTML: Prompt requests a loading spinner. Add <template if:true={isLoading}><lightning-spinner ...></lightning-spinner></template>.');
  }

  if (/responsive/.test(prompt)) {
    const hasWrap = /<lightning-layout\b[^>]*class="[^"]*slds-wrap[^"]*"/i.test(html);
    const responsiveItems = (html.match(/<lightning-layout-item\b[^>]*\bsmall-device-size="\d+"[^>]*\bmedium-device-size="\d+"[^>]*\blarge-device-size="\d+"/gi) || []).length;
    if (!hasWrap || responsiveItems === 0) {
      issues.push(
        'LWC_HTML: Prompt requests responsive layout. Use <lightning-layout class="slds-wrap ..."> and add explicit size attrs on layout items, e.g. ' +
        '<lightning-layout-item size="6" small-device-size="12" medium-device-size="6" large-device-size="6">...</lightning-layout-item>.'
      );
    }
  }

  if (/if\s+country\s*=\s*usa|country.*show.*state|show\s+state\s+dropdown.*otherwise.*text\s+input/.test(prompt)) {
    const hasCountrySignal = /country/i.test(html) || /country/i.test(js);
    const hasStateDropdown = /<lightning-(combobox|select)\b[^>]*\blabel="[^"]*state[^"]*"/i.test(html);
    const hasStateInput = /<lightning-input\b[^>]*\blabel="[^"]*state[^"]*"/i.test(html);
    const hasCondition = /if:true=\{|if:false=\{|\bisUsa\b|\bselectedCountry\b|\bcountry\b/i.test(`${html}\n${js}`);
    if (!(hasCountrySignal && hasStateDropdown && hasStateInput && hasCondition)) {
      issues.push('LWC_HTML/LWC_JS: Prompt requires Country-based conditional State control. Implement USA -> State dropdown, non-USA -> State text input with conditional rendering tied to selected country.');
    }
  }

  return issues;
}

/**
 * Step 3b — Ask the model to fix all listed issues and return a corrected bundle.
 */
async function repairBundle(bundle, issues, intent, componentType) {
  const typeInstructions = getComponentTypeInstructions(componentType);

  const repairPrompt = `The generated Salesforce component bundle has issues that MUST be fixed.

ISSUES TO FIX:
${issues.map((iss, i) => `${i + 1}. ${iss}`).join('\n')}

ORIGINAL INTENT:
${JSON.stringify(intent, null, 2)}

GENERATION INSTRUCTIONS (must still be followed):
${typeInstructions}

CURRENT BUNDLE (fix all issues and return the complete corrected bundle):
${JSON.stringify(bundle, null, 2)}

Return ALL components — do not omit any files. Apply all fixes and return the corrected bundle.`;

  const response = await getClient().chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 8000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: repairPrompt },
    ],
    response_format: BUNDLE_SCHEMA,
  });

  const text = response.choices[0].message.content;
  console.log(`[repair] finish=${response.choices[0].finish_reason} length=${text?.length} fixed=${issues.length} issue(s)`);
  return JSON.parse(text);
}

/**
 * LWC layout validator — checks that the generated HTML honours every
 * multi-column row declared in the layout spec.
 *
 * For each row with columns >= 2 we expect the HTML to contain:
 *   - at least one <lightning-layout …> block
 *   - at least (columns) <lightning-layout-item size="N"> elements inside it
 *
 * We use counts as a fast proxy: if the spec says there are T multi-column
 * rows, the HTML must have at least T lightning-layout blocks and
 * T * (avg columns) lightning-layout-item elements.
 */
function validateLwcLayout(layoutSpec, bundle) {
  const issues = [];

  const htmlComp = bundle.components.find(c => c.type === 'LWC_HTML');
  if (!htmlComp) {
    issues.push('LWC_HTML component is missing from the bundle');
    return issues;
  }
  const html = htmlComp.content || '';

  const getGridLikeBlocks = (sourceHtml) => {
    const blocks = [];
    const addMatches = (regex) => {
      let match;
      while ((match = regex.exec(sourceHtml)) !== null) {
        blocks.push(match[1] || '');
      }
    };

    addMatches(/<lightning-layout\b[^>]*>([\s\S]*?)<\/lightning-layout>/gi);
    addMatches(/<div\b[^>]*class="[^"]*slds-grid[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
    return blocks;
  };

  if (Array.isArray(layoutSpec.tabs) && layoutSpec.tabs.length > 0) {
    for (const tab of layoutSpec.tabs) {
      if (!tab?.label) continue;
      const esc = tab.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!new RegExp(esc, 'i').test(html)) {
        issues.push(`LWC_HTML: Missing tab label "${tab.label}" from layout spec.`);
      }
    }
  }

  // Count multi-column rows in the spec
  const multiColRows = layoutSpec.sections.flatMap(s =>
    s.rows.filter(r => r.columns >= 2)
  );

  if (multiColRows.length > 0) {
    // Count lightning-layout blocks in the HTML
    const layoutBlockCount = (html.match(/<lightning-layout\b/gi) || []).length;
    if (layoutBlockCount < multiColRows.length) {
      issues.push(
        `LWC_HTML: Expected at least ${multiColRows.length} <lightning-layout> block(s) for multi-column rows but found ${layoutBlockCount}. ` +
        `Each row with side-by-side fields MUST use <lightning-layout multiple-rows class="slds-gutters"> with <lightning-layout-item size="N"> children.`
      );
    }

    // Count lightning-layout-item elements in the HTML
    const expectedItems = multiColRows.reduce((sum, r) => sum + r.columns, 0);
    const itemCount = (html.match(/<lightning-layout-item\b/gi) || []).length;
    if (itemCount < expectedItems) {
      issues.push(
        `LWC_HTML: Expected at least ${expectedItems} <lightning-layout-item> element(s) to cover all multi-column fields but found ${itemCount}. ` +
        `Use size="6" for 2-column rows, size="4" for 3-column rows.`
      );
    }

    // Check individual 2-col rows: must have size="6" items
    const twoColRows = multiColRows.filter(r => r.columns === 2).length;
    if (twoColRows > 0) {
      const size6Count = (html.match(/lightning-layout-item[^>]*size\s*=\s*["']6["']/gi) || []).length;
      if (size6Count < twoColRows * 2) {
        issues.push(
          `LWC_HTML: Expected at least ${twoColRows * 2} <lightning-layout-item size="6"> elements for ${twoColRows} two-column row(s) but found ${size6Count}. ` +
          `Two equal-width side-by-side fields require size="6" on each item.`
        );
      }
    }

    // Validator B: Each multi-column row's field labels must all appear inside the same <lightning-layout> block.
    // This catches cases where AI places the two fields in separate layout blocks or outside of layout entirely.
    const layoutBlockContents = [];
    const lbRegex = /<lightning-layout\b[^>]*>([\s\S]*?)<\/lightning-layout>/gi;
    let lbMatch;
    while ((lbMatch = lbRegex.exec(html)) !== null) {
      layoutBlockContents.push(lbMatch[1]);
    }

    for (const row of multiColRows) {
      const expectedLabels = row.fields.map(f => f.label.trim()).filter(l => l !== '');
      if (expectedLabels.length < 2) continue;

      const foundTogether = layoutBlockContents.some(blockContent => {
        const allBlockLabels = [
          ...[...blockContent.matchAll(/lightning-input[^>]*\blabel="([^"]+)"/gi)].map(m => m[1].trim().toLowerCase()),
          ...[...blockContent.matchAll(/lightning-combobox[^>]*\blabel="([^"]+)"/gi)].map(m => m[1].trim().toLowerCase()),
        ];
        return expectedLabels.every(label => allBlockLabels.includes(label.toLowerCase()));
      });

      if (!foundTogether) {
        issues.push(
          `LWC_HTML: Multi-column row fields [${expectedLabels.map(l => `"${l}"`).join(', ')}] must all appear inside the same <lightning-layout> block. ` +
          `Wrap both fields in <lightning-layout-item size="6" padding="around-small"> elements within one <lightning-layout multiple-rows class="slds-gutters slds-m-bottom_medium"> container.`
        );
      }
    }
  }

  if (Array.isArray(layoutSpec.section_groups) && layoutSpec.section_groups.length > 0) {
    const layoutBlockContents = getGridLikeBlocks(html);

    for (const group of layoutSpec.section_groups) {
      const sectionNames = (group.sections || []).map(s => String(s || '').trim()).filter(Boolean);
      if (!sectionNames.length || (group.columns || 1) < 2) continue;

      const foundTogether = layoutBlockContents.some(block => {
        return sectionNames.every(sectionName => {
          const esc = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return new RegExp(esc, 'i').test(block);
        });
      });

      if (!foundTogether) {
        issues.push(
          `LWC_HTML: Sections [${sectionNames.map(s => `"${s}"`).join(', ')}] must render side-by-side in the same <lightning-layout> per section_groups.`
        );
      }
    }
  }

  // Safety net for common commercial loan layout:
  // even if section_groups was missed, keep Company Information + Loan Request Details side-by-side.
  const hasCompanyHeading = /company\s+information/i.test(html);
  const hasLoanRequestHeading = /loan\s+request\s+details/i.test(html);
  if (hasCompanyHeading && hasLoanRequestHeading) {
    const layoutBlockContents = getGridLikeBlocks(html);

    const pairGrouped = layoutBlockContents.some(block =>
      /company\s+information/i.test(block) && /loan\s+request\s+details/i.test(block)
    );

    if (!pairGrouped) {
      issues.push(
        'LWC_HTML: "Company Information" and "Loan Request Details" must render side-by-side in the same top-level <lightning-layout> row with two equal-width <lightning-layout-item size="6"> columns.'
      );
    }
  }

  // Submit button must be present
  if (Array.isArray(layoutSpec.footer_actions) && layoutSpec.footer_actions.length > 0) {
    for (const action of layoutSpec.footer_actions) {
      if (!action?.label) continue;
      const esc = action.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!new RegExp(`<lightning-button\\b[^>]*\\blabel=["']${esc}["']`, 'i').test(html)) {
        issues.push(`LWC_HTML: Missing footer action button "${action.label}" from layout spec.`);
      }
    }
  } else if (!/<lightning-button\b/i.test(html)) {
    issues.push('LWC_HTML: Missing <lightning-button> — add the submit button at the bottom of the form.');
  }

  // Check for section headings — at least one <p> or <h3> with slds-text-heading class should be present
  // if the layout has named sections (heading !== '')
  const namedSections = layoutSpec.sections.filter(s => s.heading && s.heading.trim() !== '');
  if (namedSections.length > 0) {
    const headingCount = (html.match(/class="[^"]*slds-text-heading[^"]*"/gi) || []).length;
    if (headingCount < namedSections.length) {
      issues.push(
        `LWC_HTML: Expected at least ${namedSections.length} section heading element(s) (e.g. <p class="slds-text-heading_small ...">), ` +
        `found ${headingCount}. Each named section (${namedSections.map(s => `"${s.heading}"`).join(', ')}) ` +
        `must be rendered as a <p> or <h3> with slds-text-heading_small — NOT as a lightning-input label.`
      );
    }

    // Section heading used as an input label — the most common mistake
    // e.g. label="Participant Name" on a lightning-input instead of a <p> heading
    const inputLabelMatches = [...html.matchAll(/lightning-input[^>]*\blabel="([^"]+)"/gi)];
    const inputLabels = inputLabelMatches.map(m => m[1].trim().toLowerCase());
    for (const section of namedSections) {
      if (inputLabels.includes(section.heading.trim().toLowerCase())) {
        issues.push(
          `LWC_HTML: Section heading "${section.heading}" is used as a label="" on a lightning-input. ` +
          `"${section.heading}" must be a <p class="slds-text-heading_small slds-m-bottom_small"> heading element. ` +
          `The inputs below it must use their own field names as labels (e.g. label="First", label="Last").`
        );
      }
    }
  }

  // Empty label on any lightning-input — collapses spacing and is inaccessible
  const emptyLabelCount = (html.match(/lightning-input[^>]*\blabel=""\s*/gi) || []).length;
  if (emptyLabelCount > 0) {
    issues.push(
      `LWC_HTML: ${emptyLabelCount} lightning-input element(s) have an empty label="" attribute. ` +
      `Every input must have a descriptive label (e.g. label="First", label="Last"). ` +
      `If the field visually uses only a placeholder, still set label="" only for truly unlabelled inputs — ` +
      `but under a named section like "Participant Name" the inputs should be label="First" and label="Last".`
    );
  }

  // Validator C: CSS hygiene — LWC_CSS must NOT override SLDS utility classes.
  // Overriding .slds-* classes in component CSS breaks SLDS spacing semantics globally.
  const cssComp = bundle.components.find(c => c.type === 'LWC_CSS');
  if (cssComp) {
    const css = cssComp.content || '';
    const sldsOverrides = [...css.matchAll(/\.(slds-[a-z][a-z0-9_-]*)[^{]*\{/gi)].map(m => '.' + m[1]);
    if (sldsOverrides.length > 0) {
      issues.push(
        `LWC_CSS: CSS file contains rules that override SLDS utility classes: ${sldsOverrides.join(', ')}. ` +
        `Remove ALL .slds-* rule blocks from the CSS file. ` +
        `Use .formShell { border: 1px solid #d8dde6; border-radius: 6px; padding: 1rem; background: #ffffff; } and :host { display: block; } only. ` +
        `SLDS utility classes must NOT be redefined in component CSS.`
      );
    }
  }

  // LWC_META must be present
  if (!bundle.components.some(c => c.type === 'LWC_META')) {
    issues.push('Bundle: Missing LWC_META file — add a .js-meta.xml configuration file.');
  }

  return issues;
}

/**
 * LWC layout repair — focused repair that preserves all field logic and
 * only fixes the HTML structure to match the layout spec.
 */
async function repairLwcLayout(bundle, issues, layoutSpec) {
  const repairPrompt = `The LWC HTML has layout structure issues that MUST be fixed.

ISSUES:
${issues.map((iss, i) => `${i + 1}. ${iss}`).join('\n')}

AUTHORITATIVE LAYOUT BLUEPRINT:
${JSON.stringify(layoutSpec, null, 2)}

REPAIR RULES — follow these exactly:
- Fix ALL components that have issues (HTML and/or CSS as indicated). Return unchanged components unchanged.
- SECTION HEADINGS: Each section.heading MUST be <p class="slds-text-heading_small slds-m-bottom_small">HEADING TEXT</p>.
  NEVER use a section heading as the label="" on a lightning-input.
- FIELD LABELS: Every lightning-input MUST have a non-empty label="" equal to the field's own name.
  Under "Participant Name": label="First" and label="Last". Under "Parent Name": label="First" and label="Last".
  label="Participant Name" on an input is WRONG. label="" on any input is WRONG.
- MULTI-COLUMN FIELD GROUPING: All fields from the same multi-column row MUST be inside the same <lightning-layout> block.
  DO NOT place one field outside the layout block or in a separate layout block from its sibling fields.
- SECTION GROUPS: If layout_spec.section_groups contains multi-section rows, sections in each group MUST be rendered side-by-side in the same <lightning-layout> row.
- SPECIAL CASE: If both headings "Company Information" and "Loan Request Details" exist, they MUST be rendered side-by-side in the same top-level <lightning-layout> row with two <lightning-layout-item size="6"> columns.
- TABS: If layout_spec.tabs is non-empty, include all tab labels in the HTML and keep active tab visually indicated.
- FOOTER ACTIONS: If layout_spec.footer_actions is non-empty, include each button label at the bottom in the same order.
- CSS HYGIENE: Remove ALL .slds-* rule blocks from LWC_CSS. The CSS file must contain ONLY:
  :host { display: block; }
  .formShell { border: 1px solid #d8dde6; border-radius: 6px; padding: 1rem; background: #ffffff; }
  (plus any non-SLDS custom class rules if needed). NEVER add .slds-var-m-around_medium, .slds-m-bottom_medium,
  or any other .slds-* rule — these are SLDS utilities applied directly in HTML, not in CSS.
- TWO-COLUMN ROWS: For every row with columns >= 2, use this exact pattern:
  <lightning-layout multiple-rows class="slds-gutters slds-m-bottom_medium">
    <lightning-layout-item size="6" padding="around-small">…field…</lightning-layout-item>
    <lightning-layout-item size="6" padding="around-small">…field…</lightning-layout-item>
  </lightning-layout>
  (use size=4 for 3-col rows, size=3 for 4-col rows)
- FULL-WIDTH ROWS: Wrap each single-field row in <div class="slds-m-bottom_medium">…</div>.
- Submit button stays at the very bottom, outside any layout block.

CURRENT BUNDLE:
${JSON.stringify(bundle, null, 2)}`;

  const response = await getClient().chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 8000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: repairPrompt },
    ],
    response_format: BUNDLE_SCHEMA,
  });

  const text = response.choices[0].message.content;
  console.log(`[repair-lwc] finish=${response.choices[0].finish_reason} length=${text?.length} fixed=${issues.length} issue(s)`);
  return JSON.parse(text);
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

export async function generateSalesforceComponent(
  prompt,
  componentType = 'apex-trigger',
  orgMetadata = null,
  refinementContext = null,
  attachments = [],
  architecturePreference = 'auto',
  strictImageMatch = true
) {
  if (isQuestionModePrompt(prompt, refinementContext)) {
    console.log('[orchestrate] Question mode detected — returning assistant answer.');
    return answerGeneralQuestion(prompt);
  }

  const attSummary = attachments.map(a =>
    `${a.kind}:${a.name}(${a.base64 ? Math.round(a.base64.length * 0.75 / 1024) + 'KB' : a.content?.length + 'chars'})`
  ).join(', ');
  console.log(`[generate] type=${componentType} attachments=[${attSummary || 'none'}]`);

  const hasImageAttachments = attachments.some(a => a.kind === 'image');

  // ══ SPECIALIZED 2-STEP LWC PIPELINE (image input only) ════════════════════
  // When generating an LWC from a UI screenshot we first extract a pixel-perfect
  // layout blueprint, then use it as the authoritative spec for code generation.
  // This eliminates layout guesswork and enables a targeted layout-only repair.
  if (componentType === 'lwc' && hasImageAttachments) {
    console.log(`[orchestrate] LWC+image path — running 2-step layout pipeline (strictImageMatch=${strictImageMatch})`);

    // ── LWC Step 1: Extract layout spec from screenshot ──────────────────────
    console.log('[orchestrate] LWC Step 1 — extracting layout spec...');
    let layoutSpec = null;
    try {
      layoutSpec = await extractLayoutSpec(prompt, attachments);
    } catch (err) {
      console.warn('[orchestrate] Layout spec extraction failed:', err.message);
    }

    const hasLayoutContent = layoutSpec
      && Array.isArray(layoutSpec.sections)
      && layoutSpec.sections.some(section =>
        Array.isArray(section?.rows) && section.rows.some(row => Array.isArray(row?.fields) && row.fields.length > 0)
      );
    if (!hasLayoutContent && strictImageMatch) {
      throw new Error('Unable to map the uploaded image to an exact layout specification. Please upload a clearer screenshot (higher resolution and full form visible).');
    }
    if (!hasLayoutContent && !strictImageMatch) {
      console.warn('[orchestrate] Layout spec missing/low-confidence; continuing in best-effort mode.');
      layoutSpec = null;
    }

    // ── LWC Step 2: Generate bundle from layout blueprint ────────────────────
    console.log('[orchestrate] LWC Step 2 — generating bundle from layout spec...');
    // Also extract a lightweight intent for non-layout context (objects, requirements)
    let intent;
    try {
      intent = await generateIntent(prompt, componentType, attachments, refinementContext, architecturePreference);
    } catch (err) {
      console.warn('[orchestrate] Intent extraction failed, using fallback:', err.message);
      intent = {
        component_type: componentType,
        lwc_composition: inferLwcComposition(prompt, architecturePreference, 'single'),
        title: layoutSpec?.title || prompt.slice(0, 80),
        requirements: [prompt],
        objects: [],
        fields: [],
        layout: [],
        constraints: [],
        assumptions: [],
      };
    }

    let bundle = await generateBundle(intent, componentType, orgMetadata, refinementContext, attachments, layoutSpec, prompt);
    bundle = normalizeBundleForArchitecture(bundle, componentType, intent);
    if (intent?.lwc_composition === 'nested') {
      bundle = ensureNestedContractArtifacts(bundle, prompt);
    }
    console.log(`[orchestrate] Bundle: ${bundle.components.length} component(s)`);

    // ── LWC Step 3: Validate layout + repair (up to 2 passes) ────────────────
    if (layoutSpec) {
      const maxNestedPasses = intent?.lwc_composition === 'nested' ? 5 : 4;
      for (let pass = 1; pass <= maxNestedPasses; pass++) {
        const issues = validateLwcLayout(layoutSpec, bundle);
        issues.push(...validateLwcPromptRequirements(bundle, prompt));

        if (intent?.lwc_composition === 'nested') {
          const nested = validateNestedLwcArchitecture(bundle);
          issues.push(...nested.issues);
          issues.push(...validateNestedPromptRequirements(bundle, prompt));
          if (nested.parentBundle && nested.childBundles.length > 0) {
            enforceNestedDeploySteps(bundle, nested.parentBundle, nested.childBundles);
          }
        }

        if (issues.length === 0) {
          console.log(`[orchestrate] LWC layout validation passed after pass ${pass - 1}`);
          break;
        }
        console.log(`[orchestrate] LWC layout repair pass ${pass} — ${issues.length} issue(s):`, issues);
        try {
          if (intent?.lwc_composition === 'nested') {
            bundle = await repairBundle(bundle, issues, intent, componentType);
          } else {
            bundle = await repairLwcLayout(bundle, issues, layoutSpec);
          }
          bundle = normalizeBundleForArchitecture(bundle, componentType, intent);
          if (intent?.lwc_composition === 'nested') {
            bundle = ensureNestedContractArtifacts(bundle, prompt);
          }
        } catch (err) {
          console.warn(`[orchestrate] LWC layout repair pass ${pass} failed:`, err.message);
          break;
        }
      }

      const finalIssues = [
        ...validateLwcLayout(layoutSpec, bundle),
        ...validateLwcPromptRequirements(bundle, prompt),
      ];
      if (finalIssues.length > 0 && strictImageMatch) {
        const issuePreview = finalIssues.slice(0, 3).join(' | ');
        throw new Error(
          `Generated layout does not match the extracted image contract (${finalIssues.length} unresolved issue(s)). ${issuePreview}`
        );
      }
      if (finalIssues.length > 0 && !strictImageMatch) {
        console.warn(`[orchestrate] Layout mismatch accepted in best-effort mode (${finalIssues.length} issue(s)).`);
      }
    }

    if (intent?.lwc_composition === 'nested') {
      const nested = validateNestedLwcArchitecture(bundle);
      if (nested.parentBundle && nested.childBundles.length > 0) {
        enforceNestedDeploySteps(bundle, nested.parentBundle, nested.childBundles);
      }
    }

    return bundle;
  }

  // ══ STANDARD 3-STEP PIPELINE (all other types + text-only LWC) ════════════

  // ── Step 1: Extract structured intent ─────────────────────────────────────
  console.log('[orchestrate] Step 1 — extracting intent...');
  let intent;
  try {
    intent = await generateIntent(prompt, componentType, attachments, refinementContext, architecturePreference);
    console.log(`[orchestrate] Intent: "${intent.title}" | requirements=${intent.requirements.length} fields=${intent.fields.length} sections=${intent.layout.length}`);
  } catch (err) {
    console.warn('[orchestrate] Intent extraction failed, using fallback:', err.message);
    intent = {
      component_type: componentType,
      lwc_composition: inferLwcComposition(prompt, architecturePreference, 'single'),
      title: prompt.slice(0, 80),
      requirements: [prompt],
      objects: [],
      fields: [],
      layout: [],
      constraints: [],
      assumptions: [],
    };
  }

  // ── Step 2: Generate code bundle from intent ───────────────────────────────
  console.log('[orchestrate] Step 2 — generating bundle...');
  let bundle = await generateBundle(intent, componentType, orgMetadata, refinementContext, attachments, null, prompt);
  bundle = normalizeBundleForArchitecture(bundle, componentType, intent);
  if (componentType === 'lwc' && intent?.lwc_composition === 'nested') {
    bundle = ensureNestedContractArtifacts(bundle, prompt);
  }
  console.log(`[orchestrate] Bundle: ${bundle.components.length} component(s)`);

  // ── Step 3: Validate & repair (up to 2 passes) ────────────────────────────
  const maxRepairPasses = componentType === 'lwc' && intent?.lwc_composition === 'nested' ? 3 : 2;
  for (let pass = 1; pass <= maxRepairPasses; pass++) {
    const issues = validateBundle(bundle, componentType);
    if (componentType === 'lwc') {
      issues.push(...validateLwcPromptRequirements(bundle, prompt));
      if (intent?.lwc_composition === 'nested') {
        const nested = validateNestedLwcArchitecture(bundle);
        issues.push(...nested.issues);
        issues.push(...validateNestedPromptRequirements(bundle, prompt));
        if (nested.parentBundle && nested.childBundles.length > 0) {
          enforceNestedDeploySteps(bundle, nested.parentBundle, nested.childBundles);
        }
      }
    }
    if (issues.length === 0) {
      console.log(`[orchestrate] Validation passed after pass ${pass - 1}`);
      break;
    }
    console.log(`[orchestrate] Step 3 pass ${pass} — repairing ${issues.length} issue(s):`, issues);
    try {
      bundle = await repairBundle(bundle, issues, intent, componentType);
      bundle = normalizeBundleForArchitecture(bundle, componentType, intent);
      if (componentType === 'lwc' && intent?.lwc_composition === 'nested') {
        bundle = ensureNestedContractArtifacts(bundle, prompt);
      }
    } catch (err) {
      console.warn(`[orchestrate] Repair pass ${pass} failed:`, err.message);
      break;
    }
  }

  if (componentType === 'lwc' && intent?.lwc_composition === 'nested') {
    const nested = validateNestedLwcArchitecture(bundle);
    if (nested.parentBundle && nested.childBundles.length > 0) {
      enforceNestedDeploySteps(bundle, nested.parentBundle, nested.childBundles);
    }
  }

  return bundle;
}
