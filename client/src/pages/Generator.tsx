import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ShieldCheck, ListChecks, PackageOpen, Loader2, CheckCircle2, Code2, Database } from 'lucide-react';
import { api } from '../api/client';
import type { GenerationResult, SalesforceConnection, ComponentType, LwcArchitectureMode } from '../types';
import { COMPONENT_TYPE_LABELS } from '../types';
import PromptPanel, { type Attachment, type PromptHistoryEntry } from '../components/PromptPanel';
import {
  buildRequestContract as buildIntentRequestContract,
  buildResponsePlan,
  classifyIntentDecision,
  isExampleRequestPrompt,
} from '../orchestration/intentPolicy.js';
import type { IntentDecision, RequestContract, ResponsePlan } from '../orchestration/intentPolicy.js';

const CodeViewer = lazy(() => import('../components/CodeViewer'));
const DeployPanel = lazy(() => import('../components/DeployPanel'));
const SalesforceConnect = lazy(() => import('../components/SalesforceConnect'));

interface GenerationTraceContext {
  prompt: string;
  componentType: ComponentType;
  attachmentCount: number;
  strictImageMatch: boolean;
  usedOrgMetadata: boolean;
  isPartialRefinement?: boolean;
  updatingFiles?: string[];
}

interface SalesforceObjectSummary {
  name: string;
  label: string;
  custom: boolean;
  queryable: boolean;
}

interface SalesforceOrgMetadata {
  objects?: SalesforceObjectSummary[];
  fieldsByObject?: Record<string, string[]>;
}

type PipelineRoute = 'lwc' | 'integration' | 'rest-api' | 'core';

interface PlanContract {
  route: PipelineRoute;
  refinementMode: 'partial' | 'full';
  steps: string[];
}

interface ValidationContract {
  ok: boolean;
  blockers: string[];
  warnings: string[];
}

interface PendingExecution {
  prompt: string;
  componentType: ComponentType;
  isRefinement: boolean;
  attachments: Attachment[];
  architectureMode: LwcArchitectureMode;
  strictImageMatch: boolean;
  requestContract: RequestContract;
  intentContract: IntentDecision;
  planContract: PlanContract;
  validationContract: ValidationContract;
}

interface PendingExampleSelection {
  componentType: ComponentType;
  examples: string[];
}

interface TelemetryEvent {
  ts: string;
  type: 'intent_decision' | 'misroute_candidate' | 'plan_confirmation' | 'auto_repair' | 'verification_failure';
  details: Record<string, unknown>;
}

const TELEMETRY_KEY = 'scg.intentTelemetry';

const LOADING_PLANS: Record<ComponentType, string[]> = {
  'apex-trigger': ['Trigger Handler', 'Trigger', 'Test Class'],
  'apex-class': ['Service Class', 'Support Utilities', 'Test Class'],
  lwc: ['HTML Template', 'JavaScript Controller', 'CSS Styling', 'Metadata File'],
  integration: ['Integration Service', 'Retry Logic', 'Error Handling Layer'],
  batch: ['Batch Class', 'Scheduler Hook', 'Test Class'],
  'rest-api': ['REST Resource', 'DTO Models', 'Validation Layer', 'Test Class'],
  cpq: ['Pricing Rule Config', 'Validation Logic', 'Deployment Notes'],
};

const EXTRA_EXAMPLES: Record<ComponentType, string[]> = {
  'apex-trigger': [
    'Create an Apex trigger on Opportunity that prevents stage regression after Closed Won.',
    'Create an Apex trigger on Case that auto-assigns priority based on customer tier and SLA breach risk.',
    'Create an Apex trigger on Contact that blocks duplicate primary emails across active accounts.',
  ],
  'apex-class': [
    'Create an Apex service class that calculates tiered commission by product family and region.',
    'Create an Apex utility class that normalizes phone numbers and validates country-specific formats.',
    'Create an Apex class that syncs account credit status from an external API with retry and backoff.',
  ],
  lwc: [
    'Create a Lightning Web Component that shows quote line margin analysis with inline variance badges.',
    'Create a Lightning Web Component dashboard for account health with risk score trend and alerts.',
    'Create a Lightning Web Component wizard for onboarding with progress tracking and draft restore.',
  ],
  integration: [
    'Create an integration service that sends invoice events to ERP with idempotency keys and retries.',
    'Create an integration service that pulls shipment updates every 15 minutes and maps status to cases.',
    'Create an integration layer for payment gateway callbacks with signature verification and dead-letter queue.',
  ],
  batch: [
    'Create a Batch Apex job that archives completed tasks older than 12 months into a history object.',
    'Create a Batch Apex job that recalculates entitlement milestones for open cases nightly.',
    'Create a Batch Apex process that updates opportunity scoring from usage snapshots each weekend.',
  ],
  'rest-api': [
    'Create a REST API endpoint that returns account summary plus top 5 open opportunities.',
    'Create a REST API endpoint to upsert contacts in bulk with partial success reporting.',
    'Create a REST API endpoint that exposes case timeline with pagination and field-level security checks.',
  ],
  cpq: [
    'Create CPQ price rules for volume discounts with product-family exceptions.',
    'Create CPQ validation rules that enforce minimum margin by segment and deal type.',
    'Create CPQ quote calculator logic for prorated ramp pricing over multi-year contracts.',
  ],
};

function deriveComponentName(result: GenerationResult): string {
  const first = result.components[0];
  if (first?.name) return first.name;
  return 'GeneratedComponent';
}

function normalizePromptText(prompt: string): string {
  return String(prompt || '').replace(/\s+/g, ' ').trim();
}

function routePipeline(componentType: ComponentType): PipelineRoute {
  if (componentType === 'lwc') return 'lwc';
  if (componentType === 'integration') return 'integration';
  if (componentType === 'rest-api') return 'rest-api';
  return 'core';
}

function buildPlanContract(request: RequestContract): PlanContract {
  const route = routePipeline(request.componentType);
  const steps = [
    'normalize_request',
    'validate_inputs',
    `route_${route}`,
    'generate_bundle',
    'validate_bundle',
    'repair_before_return',
  ];

  return {
    route,
    refinementMode: request.isRefinement ? 'partial' : 'full',
    steps,
  };
}

function validatePlanContract(request: RequestContract, plan: PlanContract, hasOrgMetadata: boolean): ValidationContract {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!request.promptNormalized) {
    blockers.push('Prompt is empty.');
  }

  if (request.isRefinement && !request.hasPriorResult) {
    blockers.push('Refinement requested but no prior generated result is available.');
  }

  if (request.promptNormalized.length < 6) {
    warnings.push('Prompt is very short; output may be too generic.');
  }

  if (plan.route === 'lwc' && request.strictImageMatch && request.attachmentCount === 0) {
    warnings.push('Strict image match is enabled but no image/video frames were attached.');
  }

  if ((plan.route === 'integration' || plan.route === 'rest-api') && !hasOrgMetadata) {
    warnings.push('No Salesforce metadata context; object/field accuracy may be lower.');
  }

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
  };
}

function repairGeneratedResult(generated: GenerationResult): GenerationResult {
  const dedupe = (arr: string[]) => Array.from(new Set(arr.map((v) => v.trim()).filter(Boolean)));
  return {
    ...generated,
    summary: normalizePromptText(generated.summary),
    governorLimitNotes: dedupe(generated.governorLimitNotes ?? []),
    deploymentSteps: dedupe(generated.deploymentSteps ?? []),
    dependencies: dedupe(generated.dependencies ?? []),
  };
}

function extractRequestedFieldHint(prompt: string): string | null {
  const text = normalizePromptText(prompt);
  if (!text) return null;

  const patterns = [
    /add\s+(?:an?\s+)?(?:additional\s+|extra\s+)?(?:field|filed)\s+(.+?)(?:\s+(?:to|into|in|on|for|within)\b|$)/i,
    /add\s+(.+?)\s+(?:field|filed)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const cleaned = match[1]
      .replace(/\b(this|that|the|a|an|form|screen|component)\b/gi, ' ')
      .replace(/\b(additional|extra|new)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned) return cleaned;
  }

  return null;
}

function applyCommonFieldTypos(value: string): string {
  const dictionary: Record<string, string> = {
    aontact: 'contact',
    contect: 'contact',
    filed: 'field',
    numbr: 'number',
    adress: 'address',
  };

  return value
    .toLowerCase()
    .split(/\s+/)
    .map((token) => dictionary[token] ?? token)
    .join(' ')
    .trim();
}

function verifyRequestedFieldPresence(generated: GenerationResult, prompt: string): string[] {
  const requestedField = extractRequestedFieldHint(prompt);
  if (!requestedField) return [];

  const rawNeedle = requestedField.toLowerCase();
  const correctedNeedle = applyCommonFieldTypos(requestedField);
  const allContent = generated.components
    .map((component) => `${component.name}${component.extension}\n${component.content || ''}`.toLowerCase())
    .join('\n');

  const exactFound = allContent.includes(rawNeedle) || allContent.includes(correctedNeedle);
  if (exactFound) return [];

  const significantTokens = correctedNeedle
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !['field', 'additional', 'extra'].includes(token));

  if (significantTokens.length > 0) {
    const matchedTokens = significantTokens.filter((token) => allContent.includes(token));
    if (matchedTokens.length >= significantTokens.length) {
      return [];
    }
  }

  return [`Requested field "${requestedField}" was not found in generated artifacts.`];
}

function verifyGeneratedResult(generated: GenerationResult, prompt: string): string[] {
  const blockers: string[] = [];

  if (!generated || !Array.isArray(generated.components) || generated.components.length === 0) {
    blockers.push('No artifacts were generated.');
    return blockers;
  }

  const emptyArtifacts = generated.components.filter((component) => !String(component.content || '').trim());
  if (emptyArtifacts.length > 0) {
    blockers.push(`${emptyArtifacts.length} generated artifact(s) were empty.`);
  }

  const missingName = generated.components.filter((component) => !String(component.name || '').trim());
  if (missingName.length > 0) {
    blockers.push(`${missingName.length} generated artifact(s) were missing a file name.`);
  }

  if (!String(generated.summary || '').trim()) {
    blockers.push('Summary was empty.');
  }

  blockers.push(...verifyRequestedFieldPresence(generated, prompt));

  return blockers;
}

function appendTelemetryEvent(event: TelemetryEvent): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(TELEMETRY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const base = Array.isArray(parsed) ? parsed : [];
    const next = [...base, event].slice(-200);
    window.localStorage.setItem(TELEMETRY_KEY, JSON.stringify(next));
  } catch {
    // Ignore telemetry failures to keep generation flow resilient.
  }
}

function isMisrouteComplaintPrompt(prompt: string): boolean {
  const text = normalizePromptText(prompt).toLowerCase();
  if (!text) return false;
  return /\b(why did you regenerate|why you did|recreate all|all together|partial (fix|patch|update)|should be partial|not full|full regenerate)\b/.test(text);
}

function isQuestionPrompt(prompt: string): boolean {
  const text = String(prompt || '').trim();
  if (!text) return false;
  return /\?$/.test(text) || /^(what|why|how|when|where|who|can|could|would|should|is|are|do|does|did)\b/i.test(text);
}

type QuestionComplexity = 'simple' | 'medium' | 'complex' | 'high-stakes';

function classifyQuestionComplexity(prompt: string): QuestionComplexity {
  const text = String(prompt || '').toLowerCase().trim();
  const len = text.length;

  if (/\b(security|compliance|production|deploy|legal|pii|gdpr|breach|incident|outage)\b/.test(text)) {
    return 'high-stakes';
  }

  if (/\b(compare|architecture|tradeoff|strategy|analyze|design|scalability|performance|root cause|why)\b/.test(text) || len > 220) {
    return 'complex';
  }

  if (len > 90 || /\b(check|verify|review|confirm|validate)\b/.test(text)) {
    return 'medium';
  }

  return 'simple';
}

function getQuestionResponseDelay(prompt: string): number {
  const complexity = classifyQuestionComplexity(prompt);
  if (complexity === 'high-stakes') return 2600;
  if (complexity === 'complex') return 1900;
  if (complexity === 'medium') return 1200;
  return 700;
}

function getThinkingAcknowledgement(prompt: string): string {
  const complexity = classifyQuestionComplexity(prompt);
  if (complexity === 'high-stakes') return 'Good question. Let me quickly verify this before I answer.';
  if (complexity === 'complex') return 'Let me think that through for a second.';
  if (complexity === 'medium') return 'Give me a second, checking that now.';
  return 'Let me check that quickly.';
}

function summarizeVerificationFromResult(prompt: string, latestResult: GenerationResult | null): string | null {
  if (!latestResult) return null;

  const promptText = String(prompt || '').toLowerCase();
  const allContent = latestResult.components.map((c) => c.content || '').join('\n').toLowerCase();
  const asksExistingApplications = /\b(existing application|existing applications)\b/.test(promptText);

  if (asksExistingApplications) {
    const matching = latestResult.components.filter((c) => /\b(existing application|existing applications)\b/.test((c.content || '').toLowerCase()));
    if (matching.length > 0) {
      const where = matching.slice(0, 2).map((c) => `${c.name}${c.extension}`).join(', ');
      return `Yes, I can see Existing Applications in the current generated version. I found it in ${where}.`;
    }
    if (/\b(existing application|existing applications)\b/.test(allContent)) {
      return 'Yes, Existing Applications appears in the current generated version.';
    }
    return 'I checked the current generated files and I do not see Existing Applications yet. If you want, I can add it in the next update.';
  }

  return `I reviewed the latest generated version with ${latestResult.components.length} file(s). Tell me exactly what you want verified, and I will confirm it directly.`;
}

function buildFeedbackResponse(prompt: string): string {
  const text = String(prompt || '').trim();
  const normalized = text.toLowerCase();

  if (/thank/.test(normalized)) {
    return 'You are welcome. If you want another tweak, tell me what to change and I will apply it.';
  }

  if (/good|great|awesome|perfect|nice|works|working|all good/.test(normalized)) {
    return 'Great, glad this looks right. Tell me the next change whenever you are ready.';
  }

  return 'Understood. Share the next change and I will update it.';
}

function buildQuestionFirstResponse(prompt: string, componentType: ComponentType): string {
  const compactPrompt = String(prompt || '').replace(/\s+/g, ' ').trim();
  const preview = compactPrompt.length > 120 ? `${compactPrompt.slice(0, 120)}...` : compactPrompt;
  return [
    `I read this as a question: "${preview}".`,
    `Before creating a ${COMPONENT_TYPE_LABELS[componentType]}, I want to confirm your expected behavior and constraints so we build the right thing.`,
    'If you want, I can quickly suggest options first, then generate once you confirm.'
  ].join(' ');
}

function buildResponseAcknowledgement(plan: ResponsePlan): string {
  return plan.acknowledgementPrefix || '';
}

function buildNextStepHint(componentType: ComponentType, plan: ResponsePlan): string {
  if (!plan.shouldOfferNextStep) return '';

  if (plan.actionDecision === 'clarify') {
    return `I can either explain first or apply a targeted ${COMPONENT_TYPE_LABELS[componentType]} update once you confirm.`;
  }

  if (plan.hiddenPreferences.minimizeChange || plan.hiddenPreferences.preserveStructure || plan.hiddenPreferences.avoidFullRewrite) {
    return 'If you want, I can apply only the minimal change and keep the rest unchanged.';
  }

  if (plan.actionDecision === 'explain' || plan.actionDecision === 'compare') {
    return 'If useful, I can also provide a quick targeted follow-up update after this answer.';
  }

  return '';
}

function composePlannedResponse(base: string, componentType: ComponentType, plan: ResponsePlan): string {
  const trimmed = String(base || '').trim();
  if (!trimmed) return trimmed;

  const alreadyAcknowledged = /^(you'?re right|yes[,\s-]|good question|that makes sense)/i.test(trimmed);
  let response = trimmed;

  if ((plan.directives.acknowledgeFirst || plan.structure.startsWith('acknowledge') || plan.tone === 'reassuring') && !alreadyAcknowledged) {
    const ack = buildResponseAcknowledgement(plan);
    if (ack) response = `${ack} ${response}`;
  }

  const hint = buildNextStepHint(componentType, plan);
  if (hint && !response.toLowerCase().includes(hint.toLowerCase())) {
    response = `${response} ${hint}`;
  }

  return response;
}

function buildDirectQuestionResponse(prompt: string, isConnectedToSalesforce: boolean, latestResult: GenerationResult | null): string | null {
  const text = normalizePromptText(prompt).toLowerCase();

  const asksFileNames = /\b(file names?|filenames?)\b/.test(text);
  const asksFileInventory = /\b(file|files|artifact|artifacts)\b/.test(text)
    && /\b(list|show|tell|give|count|number|no\.?|how many|which|what)\b/.test(text)
    && /\b(created|craeted|generated|built|produced|output)\b/.test(text);

  if (/\b(what all files|which files|generated files|files are generated|files generated|files created|created files)\b/.test(text)
    || asksFileNames
    || asksFileInventory) {
    if (!latestResult || !latestResult.components || latestResult.components.length === 0) {
      return 'No generated files are available yet. Generate once and I will list all produced files.';
    }

    const fileList = latestResult.components
      .map((component) => `${component.name}${component.extension || ''}`)
      .filter(Boolean)
      .slice(0, 12);

    return `Generated ${latestResult.components.length} file(s): ${fileList.join(', ')}.`;
  }

  if (/\b(connect|connection|login|authenticate|auth)\b/.test(text) && /\b(salesforce|org)\b/.test(text)) {
    if (isConnectedToSalesforce) {
      return [
        'You are already connected to Salesforce in this workspace.',
        'Use the Connect panel in the top-right to verify org details or disconnect/reconnect if needed.',
        'After that, open the Salesforce Data tab to inspect objects and fields before generating.',
      ].join(' ');
    }

    return [
      'Use the Connect Salesforce panel in the top-right of Generator Workspace.',
      'Sign in to your org, then confirm connection status is shown as connected.',
      'Next, open Salesforce Data to verify metadata and then generate/deploy from the workspace actions.',
    ].join(' ');
  }

  if (/\b(where|how|see|view|find|show)\b/.test(text) && /\b(object|objects|field|fields|metadata)\b/.test(text) && /\b(salesforce|org)\b/.test(text)) {
    if (!isConnectedToSalesforce) {
      return [
        'Connect your Salesforce org first using the Connect panel at the top-right.',
        'After connecting, switch to the Salesforce Data tab to browse objects and fields.',
        'Use the search box there to quickly find object names and labels.',
      ].join(' ');
    }

    return [
      'Go to Salesforce Data tab in Generator Workspace.',
      'The left panel lists Salesforce objects, and the right panel shows fields for the selected object.',
      'Use the object search box to find a specific object by API name or label.',
    ].join(' ');
  }

  if (/\b(connected|connection status|am i connected|is it connected)\b/.test(text) && /\b(salesforce|org)\b/.test(text)) {
    return isConnectedToSalesforce
      ? 'Yes, the app currently has an active Salesforce session. You can use Salesforce Data tab to inspect objects and fields.'
      : 'No active Salesforce session is detected. Use the Connect Salesforce panel (top-right) to sign in first.';
  }

  if (/\b(deploy|deployment|push to org|send to org)\b/.test(text)) {
    return [
      'After generation, use the Deploy action in the workspace header or summary action area.',
      'If not connected, connect your Salesforce org first from the top-right Connect panel.',
      'Then run deploy and review deployment steps shown in the preview/details section.',
    ].join(' ');
  }

  if (/\b(save|library|where.*saved|store)\b/.test(text)) {
    return [
      'Generated output can be saved to Library from the deploy/action controls.',
      'Open the Library page to view saved components, search by type, and reopen details in Code Viewer.',
    ].join(' ');
  }

  if (/\b(what can this app do|features|supported)\b/.test(text)) {
    return [
      'This app can generate and refine Apex Triggers, Apex Classes, LWCs, Integrations, Batch jobs, REST APIs, and CPQ logic.',
      'It also supports Salesforce org connect, metadata browsing (objects/fields), deployment actions, and library save/reuse.',
    ].join(' ');
  }

  return null;
}

function buildPolicyResponse(intent: string, latestResult: GenerationResult | null): string {
  if (intent === 'diff') {
    if (!latestResult || latestResult.components.length === 0) {
      return 'No prior generated version is available to compare yet. Generate a version first, then ask for compare/diff.';
    }
    return `I can compare versions. Current generated bundle has ${latestResult.components.length} file(s). Ask what you want compared (structure, fields, validations, or dependencies).`;
  }

  if (intent === 'undo') {
    return 'Undo intent detected. Automatic restore is not enabled yet in this UI, so please confirm what version you want to restore and I will apply it safely.';
  }

  if (intent === 'learning') {
    return 'Sure. Ask the exact part you want to learn, and I will explain it step by step without modifying generated code.';
  }

  return 'I processed your request in response mode and did not start code generation.';
}

function buildExampleResponse(componentType: ComponentType): string {
  const examples = EXTRA_EXAMPLES[componentType] ?? [];
  if (examples.length === 0) {
    return `Sure. I can share more ${COMPONENT_TYPE_LABELS[componentType]} examples. Tell me your domain (sales, service, finance, operations), and I will tailor three examples.`;
  }

  return [
    `Absolutely. Here are three additional ${COMPONENT_TYPE_LABELS[componentType]} examples:`,
    `1) ${examples[0]}`,
    `2) ${examples[1]}`,
    `3) ${examples[2]}`,
    'Reply with the one you want, and I will generate it next.',
  ].join(' ');
}

function parseExampleSelection(prompt: string, max: number): number | null {
  const text = normalizePromptText(prompt).toLowerCase();
  if (!text) return null;

  const directNumber = text.match(/^([1-9])$/);
  if (directNumber) {
    const idx = Number(directNumber[1]);
    return idx >= 1 && idx <= max ? idx - 1 : null;
  }

  const optionNumber = text.match(/^(option\s+)?([1-9])$/);
  if (optionNumber) {
    const idx = Number(optionNumber[2]);
    return idx >= 1 && idx <= max ? idx - 1 : null;
  }

  return null;
}

function buildClarificationResponse(prompt: string, componentType: ComponentType, responsePlan?: ResponsePlan): string {
  const compactPrompt = String(prompt || '').replace(/\s+/g, ' ').trim();
  const preview = compactPrompt.length > 120 ? `${compactPrompt.slice(0, 120)}...` : compactPrompt;

  if (responsePlan?.archetype === 'clarify_narrow_options' || responsePlan?.structure === 'clarify_with_options') {
    const keepUnchanged = responsePlan.hiddenPreferences.minimizeChange
      || responsePlan.hiddenPreferences.preserveStructure
      || responsePlan.hiddenPreferences.avoidFullRewrite;
    const targetedLine = keepUnchanged
      ? `2) Apply a targeted update to the current ${COMPONENT_TYPE_LABELS[componentType]} and keep everything else unchanged.`
      : `2) Apply a targeted update to the current ${COMPONENT_TYPE_LABELS[componentType]}.`;

    return [
      `I want to make sure I apply exactly what you mean for "${preview}".`,
      'Choose one option:',
      '1) Explain/review only (no code changes).',
      targetedLine,
      '3) Full regenerate.',
    ].join(' ');
  }

  return [
    `I read this as ambiguous: "${preview}".`,
    `Should I just explain/review this, or apply a partial update to the current ${COMPONENT_TYPE_LABELS[componentType]}?`,
    'Reply with: explain only, partial update, or full regenerate.'
  ].join(' ');
}

function isConfirmationPrompt(prompt: string): boolean {
  const text = normalizePromptText(prompt).toLowerCase();
  return /^(yes|yep|yeah|ok|okay|go ahead|proceed|continue|apply|do it|run it|ship it)([!.\s].*)?$/.test(text);
}

function isCancelPrompt(prompt: string): boolean {
  const text = normalizePromptText(prompt).toLowerCase();
  return /^(no|cancel|stop|never mind|dont|don't|skip)([!.\s].*)?$/.test(text);
}

function shouldRequirePlanConfirmation(request: RequestContract, intent: IntentDecision): boolean {
  if (intent.action !== 'generate') return false;

  const text = request.promptNormalized.toLowerCase();
  if (intent.refinementScope === 'full') return true;
  if (/\b(from scratch|regenerate|rewrite|redo|rebuild|start over|entire|whole|everything|all of it)\b/.test(text)) return true;
  if (request.isRefinement && /\b(major|big|large|broad|across all|across the app)\b/.test(text)) return true;
  return false;
}

function buildPlanConfirmationResponse(componentType: ComponentType, plan: PlanContract, intent: IntentDecision): string {
  const scopeText = intent.refinementScope === 'full' ? 'full regenerate' : plan.refinementMode === 'partial' ? 'targeted update' : 'full generation';
  const stepsText = plan.steps.slice(0, 4).join(' -> ');
  return `Planned ${scopeText} for ${COMPONENT_TYPE_LABELS[componentType]} using ${plan.route} pipeline. Plan: ${stepsText}. Reply \"go ahead\" to execute or \"cancel\" to stop.`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function playGenerationCompleteSound(): void {
  if (typeof window === 'undefined') return;

  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1174, context.currentTime + 0.14);

    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.26);

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + 0.28);

    window.setTimeout(() => {
      void context.close();
    }, 450);
  } catch {
    // Ignore audio API failures so generation UX is never blocked.
  }
}

function buildTraceLines(ctx: GenerationTraceContext | null, output: GenerationResult | null): string[] {
  if (!ctx) return [];

  const lines: string[] = [];
  const mode = isQuestionPrompt(ctx.prompt) ? 'question-answer' : 'generation';

  lines.push(`Request mode detected: ${mode}.`);
  lines.push(`Component type requested: ${COMPONENT_TYPE_LABELS[ctx.componentType]}.`);

  if (ctx.attachmentCount > 0) {
    lines.push(`Attachments analyzed: ${ctx.attachmentCount} file(s).`);
  } else {
    lines.push('No attachments were provided.');
  }

  if (ctx.componentType === 'lwc') {
    lines.push(`Strict image match: ${ctx.strictImageMatch ? 'enabled' : 'disabled'}.`);
  }

  lines.push(
    ctx.usedOrgMetadata
      ? 'Salesforce metadata context was used to reduce invalid object and field references.'
      : 'No Salesforce metadata context was available for this run.'
  );

  if (output) {
    lines.push(`Output generated: ${output.components.length} artifact(s).`);
    if (output.dependencies?.length) lines.push(`Dependencies listed: ${output.dependencies.length}.`);
    if (output.deploymentSteps?.length) lines.push(`Deployment steps prepared: ${output.deploymentSteps.length}.`);
  }

  return lines;
}

function buildLiveTracePlan(ctx: GenerationTraceContext): string[] {
  const lines: string[] = [
    'Reading your request and identifying the expected output format.',
    `Preparing a ${COMPONENT_TYPE_LABELS[ctx.componentType]} generation plan.`,
    'Applying Salesforce best-practice checks (bulkification, limits, and deployment readiness).',
  ];

  if (ctx.attachmentCount > 0) {
    lines.push(`Analyzing ${ctx.attachmentCount} attachment(s) for additional context and constraints.`);
  }

  if (ctx.componentType === 'lwc') {
    lines.push(
      ctx.strictImageMatch
        ? 'Using strict image matching to enforce layout fidelity.'
        : 'Using best-effort image matching for a more flexible layout interpretation.'
    );
  }

  lines.push('Drafting artifacts and running validation before finalizing output.');
  return lines;
}

function buildAcknowledgement(prompt: string, componentType: ComponentType): string {
  const compactPrompt = String(prompt || '').replace(/\s+/g, ' ').trim();
  const preview = compactPrompt.length > 90 ? `${compactPrompt.slice(0, 90)}...` : compactPrompt;
  return `Yes, I can create this ${COMPONENT_TYPE_LABELS[componentType]} for you: "${preview}". I am starting now.`;
}

function toPascalCase(value: string): string {
  return String(value || '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

function deriveDynamicArtifactName(prompt: string, componentType: ComponentType): string {
  const normalized = normalizePromptText(prompt);
  const quoted = normalized.match(/["']([^"']{2,40})["']/);
  const objectMatch = normalized.match(/\b(?:on|for)\s+([A-Za-z][A-Za-z0-9_]{1,30})\b/i);
  const rawBase = quoted?.[1] || objectMatch?.[1] || 'Generated';
  const base = toPascalCase(rawBase) || 'Generated';

  if (componentType === 'apex-trigger') return `${base}Trigger`;
  if (componentType === 'apex-class') return `${base}Service`;
  if (componentType === 'batch') return `${base}Batch`;
  if (componentType === 'rest-api') return `${base}Api`;
  if (componentType === 'integration') return `${base}Integration`;
  if (componentType === 'lwc') return `${base}Panel`;
  if (componentType === 'cpq') return `${base}PricingRule`;
  return `${base}Artifact`;
}

function inferLikelyUpdatedFiles(
  prompt: string,
  previousResult: GenerationResult | null,
  componentType: ComponentType,
  fallbackArtifactName: string
): string[] {
  const promptText = normalizePromptText(prompt).toLowerCase();
  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'only', 'just', 'please', 'update', 'improve', 'fix', 'add',
    'code', 'file', 'files', 'component', 'class', 'trigger', 'apex', 'lwc', 'api', 'batch', 'rest'
  ]);
  const tokens = promptText
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((token) => token.length >= 3 && !stopWords.has(token));

  // Expand scope when prompt clearly asks for broader, cross-file changes.
  let maxFilesToUpdate = 2;
  if (/\b(all|entire|whole|across|multiple|multi|several|every|full|comprehensive|architecture|refactor|restructure|overhaul)\b/.test(promptText)) {
    maxFilesToUpdate = 6;
  } else if (/\b(section|layout|validation|handler|service|controller|html|js|css|meta|test)\b/.test(promptText)) {
    maxFilesToUpdate = 4;
  }

  if (componentType === 'lwc') {
    // LWC updates commonly span html/js/meta and sometimes css.
    maxFilesToUpdate = Math.max(maxFilesToUpdate, 4);
  }

  const artifacts = previousResult?.components ?? [];
  if (artifacts.length === 0) {
    if (componentType === 'apex-trigger') return [`${fallbackArtifactName}.trigger`, `${fallbackArtifactName}Handler.cls`].slice(0, maxFilesToUpdate);
    if (componentType === 'lwc') {
      return [
        `${fallbackArtifactName}.html`,
        `${fallbackArtifactName}.js`,
        `${fallbackArtifactName}.css`,
        `${fallbackArtifactName}.js-meta.xml`,
      ].slice(0, maxFilesToUpdate);
    }
    return [`${fallbackArtifactName}.cls`];
  }

  const scored = artifacts.map((artifact) => {
    const fileName = `${artifact.name}${artifact.extension || ''}`;
    const haystack = `${artifact.name} ${artifact.content || ''}`.toLowerCase();
    const score = tokens.reduce((acc, token) => (haystack.includes(token) ? acc + 1 : acc), 0);
    return { fileName, score };
  });

  const selected = scored
    .sort((a, b) => b.score - a.score)
    .filter((item, index) => item.score > 0 || index < maxFilesToUpdate)
    .slice(0, maxFilesToUpdate)
    .map((item) => item.fileName)
    .filter(Boolean);

  return selected.length > 0 ? selected : scored.slice(0, maxFilesToUpdate).map((item) => item.fileName);
}

export default function Generator() {
  const generationAbortRef = useRef<AbortController | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentType, setCurrentType] = useState<ComponentType>('apex-trigger');
  const [promptHistory, setPromptHistory] = useState<PromptHistoryEntry[]>([]);
  const [sfConnection, setSfConnection] = useState<SalesforceConnection | null>(null);
  const [orgMetadata, setOrgMetadata] = useState<object | null>(null);
  const [traceContext, setTraceContext] = useState<GenerationTraceContext | null>(null);
  const [isTraceOpen, setIsTraceOpen] = useState(false);
  const [activeInfoTab, setActiveInfoTab] = useState<'notes' | 'steps' | 'deps'>('notes');
  const [workspaceTab, setWorkspaceTab] = useState<'generator' | 'salesforce'>('generator');
  const [loadingStep, setLoadingStep] = useState(0);
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1024;
  });
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    if (typeof window === 'undefined') return 320;
    const saved = Number(window.localStorage.getItem('scg.leftPanelWidth'));
    return Number.isFinite(saved) && saved >= 280 && saved <= 560 ? saved : 320;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [metadataSearch, setMetadataSearch] = useState('');
  const [debouncedMetadataSearch, setDebouncedMetadataSearch] = useState('');
  const [metadataPage, setMetadataPage] = useState(1);
  const [selectedObjectName, setSelectedObjectName] = useState<string>('');
  const [selectedObjectFields, setSelectedObjectFields] = useState<string[]>([]);
  const [isFieldsLoading, setIsFieldsLoading] = useState(false);
  const [loadExampleSignal, setLoadExampleSignal] = useState(0);
  const [pendingExecution, setPendingExecution] = useState<PendingExecution | null>(null);
  const [pendingExampleSelection, setPendingExampleSelection] = useState<PendingExampleSelection | null>(null);

  const dynamicArtifactName = useMemo(() => {
    const sourcePrompt = traceContext?.prompt || promptHistory[promptHistory.length - 1]?.prompt || '';
    return deriveDynamicArtifactName(sourcePrompt, currentType);
  }, [traceContext?.prompt, promptHistory, currentType]);
  const loadingPlan = useMemo(() => {
    if (traceContext?.isPartialRefinement && Array.isArray(traceContext.updatingFiles) && traceContext.updatingFiles.length > 0) {
      return traceContext.updatingFiles;
    }
    if (currentType === 'apex-trigger') return ['Trigger Handler', dynamicArtifactName, 'Validation Rules'];
    if (currentType === 'apex-class') return [dynamicArtifactName, 'Support Utilities', 'Validation Rules'];
    if (currentType === 'batch') return [dynamicArtifactName, 'Scheduler Setup', 'Validation Rules'];
    return LOADING_PLANS[currentType] ?? ['Core Components', 'Validation Layer', 'Validation Rules'];
  }, [currentType, dynamicArtifactName, traceContext]);
  const completedCount = Math.min(loadingStep, loadingPlan.length);
  const activeStepNumber = Math.min(loadingStep + 1, loadingPlan.length);
  const progressPercent = Math.min(95, Math.round((activeStepNumber / loadingPlan.length) * 100));
  const traceLines = useMemo(() => buildTraceLines(traceContext, result), [traceContext, result]);
  const partialUpdateStatusText = useMemo(() => {
    if (!isLoading || !traceContext?.isPartialRefinement) return '';
    return `${loadingPlan.length} file${loadingPlan.length === 1 ? '' : 's'} being updated based on requested scope.`;
  }, [isLoading, traceContext, loadingPlan.length]);
  const activeLoadingStatusText = useMemo(() => {
    const active = loadingPlan[Math.min(loadingStep, Math.max(loadingPlan.length - 1, 0))] || dynamicArtifactName;
    if (traceContext?.isPartialRefinement) {
      return `Updating ${active} (${activeStepNumber}/${loadingPlan.length})...`;
    }
    return `Creating ${active}...`;
  }, [traceContext?.isPartialRefinement, loadingPlan, loadingStep, dynamicArtifactName, activeStepNumber]);
  const latestTraceLines = useMemo(() => {
    const latest = promptHistory[promptHistory.length - 1];
    if (latest?.traceLines && latest.traceLines.length > 0) return latest.traceLines;
    return traceLines;
  }, [promptHistory, traceLines]);
  const metadata = (orgMetadata ?? null) as SalesforceOrgMetadata | null;
  const metadataObjects = useMemo(() => metadata?.objects ?? [], [metadata]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedMetadataSearch(metadataSearch);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [metadataSearch]);

  const filteredMetadataObjects = useMemo(() => {
    const query = debouncedMetadataSearch.trim().toLowerCase();
    if (!query) return metadataObjects;
    return metadataObjects
      .filter((obj) => obj.name.toLowerCase().includes(query) || obj.label.toLowerCase().includes(query));
  }, [metadataObjects, debouncedMetadataSearch]);

  useEffect(() => {
    setMetadataPage(1);
  }, [debouncedMetadataSearch]);

  const visibleMetadataObjects = useMemo(() => {
    const PAGE_SIZE = 80;
    return filteredMetadataObjects.slice(0, metadataPage * PAGE_SIZE);
  }, [filteredMetadataObjects, metadataPage]);
  const selectedObjectMeta = useMemo(
    () => metadataObjects.find((obj) => obj.name === selectedObjectName) ?? null,
    [metadataObjects, selectedObjectName]
  );

  useEffect(() => {
    if (!isLoading) {
      setLoadingStep(0);
      return;
    }

    const interval = window.setInterval(() => {
      setLoadingStep((prev) => Math.min(prev + 1, loadingPlan.length - 1));
    }, 1400);

    return () => window.clearInterval(interval);
  }, [isLoading, loadingPlan.length]);

  useEffect(() => {
    let cancelled = false;

    async function loadOrgMetadata() {
      if (!sfConnection?.sessionId) {
        setOrgMetadata(null);
        return;
      }

      try {
        const metadata = await api.salesforce.metadata(sfConnection.sessionId);
        if (!cancelled) setOrgMetadata(metadata as object);
      } catch {
        if (!cancelled) setOrgMetadata(null);
      }
    }

    loadOrgMetadata();
    return () => {
      cancelled = true;
    };
  }, [sfConnection?.sessionId]);

  useEffect(() => {
    if (!selectedObjectName) {
      setSelectedObjectFields([]);
      return;
    }

    let cancelled = false;

    async function loadObjectFields() {
      if (!sfConnection?.sessionId) return;

      const cached = metadata?.fieldsByObject?.[selectedObjectName];
      if (cached && cached.length > 0) {
        setSelectedObjectFields(cached);
        return;
      }

      try {
        setIsFieldsLoading(true);
        const response = await api.salesforce.metadata(sfConnection.sessionId, [selectedObjectName]) as SalesforceOrgMetadata;
        if (cancelled) return;
        const fields = response.fieldsByObject?.[selectedObjectName] ?? [];
        setSelectedObjectFields(fields);
      } catch {
        if (!cancelled) setSelectedObjectFields([]);
      } finally {
        if (!cancelled) setIsFieldsLoading(false);
      }
    }

    loadObjectFields();
    return () => {
      cancelled = true;
    };
  }, [selectedObjectName, sfConnection?.sessionId, metadata]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia('(max-width: 1023px)');
    const apply = (value: boolean) => {
      setIsMobileViewport(value);
      if (value) setIsResizing(false);
    };

    apply(media.matches);

    const listener = (event: MediaQueryListEvent) => {
      apply(event.matches);
    };

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }

    media.addListener(listener);
    return () => media.removeListener(listener);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    if (isMobileViewport) return;

    function handleMouseMove(event: MouseEvent) {
      const minWidth = 280;
      const maxWidth = Math.min(560, window.innerWidth - 480);
      const next = Math.max(minWidth, Math.min(maxWidth, event.clientX));
      setLeftPanelWidth(next);
    }

    function handleMouseUp() {
      setIsResizing(false);
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, isMobileViewport]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('scg.leftPanelWidth', String(leftPanelWidth));
  }, [leftPanelWidth]);

  function clearPendingPlanFlags() {
    setPromptHistory(prev => prev.map(entry => (entry.pendingPlan ? { ...entry, pendingPlan: false } : entry)));
  }

  function clearPendingExampleFlags() {
    setPromptHistory(prev => prev.map(entry => (
      entry.pendingExampleSelection
        ? { ...entry, pendingExampleSelection: false, exampleOptions: undefined }
        : entry
    )));
  }

  async function handleExampleSelection(index: number) {
    if (!pendingExampleSelection) return;
    if (index < 0 || index >= pendingExampleSelection.examples.length) return;

    const selectedPrompt = pendingExampleSelection.examples[index];
    setPendingExampleSelection(null);
    clearPendingExampleFlags();

    const selectionEntryId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPromptHistory(prev => [
      ...prev,
      {
        id: selectionEntryId,
        prompt: `option ${index + 1}`,
        componentType: pendingExampleSelection.componentType,
        version: prev.length + 1,
        isRefinement: Boolean(result),
        attachmentCount: 0,
        timestamp: new Date(),
        responseSummary: `Great choice. Executing option ${index + 1}: ${selectedPrompt}`,
        status: 'success',
        traceLines: ['Resolved example selection via quick option chip.'],
      },
    ]);

    await handleGenerate(
      selectedPrompt,
      pendingExampleSelection.componentType,
      Boolean(result),
      [],
      'auto',
      true,
      true
    );
  }

  async function handlePendingPlanAction(action: 'confirm' | 'cancel') {
    if (!pendingExecution) return;

    if (action === 'confirm') {
      const queued = pendingExecution;
      appendTelemetryEvent({
        ts: new Date().toISOString(),
        type: 'plan_confirmation',
        details: { decision: 'confirm', prompt: queued.prompt, componentType: queued.componentType },
      });
      setPendingExecution(null);
      clearPendingPlanFlags();
      await handleGenerate(
        queued.prompt,
        queued.componentType,
        queued.isRefinement,
        queued.attachments,
        queued.architectureMode,
        queued.strictImageMatch,
        true
      );
      return;
    }

    const queued = pendingExecution;
    appendTelemetryEvent({
      ts: new Date().toISOString(),
      type: 'plan_confirmation',
      details: { decision: 'cancel', prompt: queued.prompt, componentType: queued.componentType },
    });
    setPendingExecution(null);
    clearPendingPlanFlags();
    setError('');
    const entryId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPromptHistory(prev => [
      ...prev,
      {
        id: entryId,
        prompt: 'cancel',
        componentType: queued.componentType,
        version: prev.length + 1,
        isRefinement: queued.isRefinement,
        attachmentCount: queued.attachments.length,
        timestamp: new Date(),
        responseSummary: 'Cancelled from quick action. No generation was executed.',
        status: 'success',
        orchestration: {
          request: queued.requestContract,
          intent: queued.intentContract,
          plan: queued.planContract,
          validation: queued.validationContract,
        },
        traceLines: ['Pending plan was cancelled via quick action.'],
      },
    ]);
  }

  async function handleGenerate(
    prompt: string,
    componentType: ComponentType,
    isRefinement: boolean,
    attachments: Attachment[] = [],
    architectureMode: LwcArchitectureMode = 'auto',
    strictImageMatch = true,
    bypassPlanConfirmation = false
  ) {
    const normalizedPrompt = normalizePromptText(prompt);

    if (pendingExampleSelection) {
      const selectedIndex = parseExampleSelection(normalizedPrompt, pendingExampleSelection.examples.length);

      if (selectedIndex !== null) {
        const selectedPrompt = pendingExampleSelection.examples[selectedIndex];
        const selectionEntryId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setPendingExampleSelection(null);
        setError('');
        setPromptHistory(prev => [
          ...prev,
          {
            id: selectionEntryId,
            prompt,
            componentType: pendingExampleSelection.componentType,
            version: prev.length + 1,
            isRefinement,
            attachmentCount: attachments.length,
            timestamp: new Date(),
            responseSummary: `Great choice. Executing option ${selectedIndex + 1}: ${selectedPrompt}`,
            status: 'success',
            traceLines: ['Resolved numeric example selection to a concrete generation request.'],
          },
        ]);

        await handleGenerate(
          selectedPrompt,
          pendingExampleSelection.componentType,
          Boolean(result),
          attachments,
          architectureMode,
          strictImageMatch,
          true
        );
        return;
      }

      // Any non-selection prompt replaces pending example context.
      setPendingExampleSelection(null);
      clearPendingExampleFlags();
    }

    if (pendingExecution) {
      if (isConfirmationPrompt(normalizedPrompt)) {
        const queued = pendingExecution;
        appendTelemetryEvent({
          ts: new Date().toISOString(),
          type: 'plan_confirmation',
          details: { decision: 'confirm', prompt: queued.prompt, componentType: queued.componentType, via: 'text' },
        });
        setPendingExecution(null);
        clearPendingPlanFlags();
        await handleGenerate(
          queued.prompt,
          queued.componentType,
          queued.isRefinement,
          queued.attachments,
          queued.architectureMode,
          queued.strictImageMatch,
          true
        );
        return;
      }

      if (isCancelPrompt(normalizedPrompt)) {
        const entryId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        appendTelemetryEvent({
          ts: new Date().toISOString(),
          type: 'plan_confirmation',
          details: { decision: 'cancel', prompt: pendingExecution.prompt, componentType: pendingExecution.componentType, via: 'text' },
        });
        setPendingExecution(null);
        clearPendingPlanFlags();
        setError('');
        setPromptHistory(prev => [
          ...prev,
          {
            id: entryId,
            prompt,
            componentType: pendingExecution.componentType,
            version: prev.length + 1,
            isRefinement: pendingExecution.isRefinement,
            attachmentCount: pendingExecution.attachments.length,
            timestamp: new Date(),
            responseSummary: 'Cancelled. No generation was run. Share your next instruction whenever you are ready.',
            status: 'success',
            orchestration: {
              request: pendingExecution.requestContract,
              intent: pendingExecution.intentContract,
              plan: pendingExecution.planContract,
              validation: pendingExecution.validationContract,
            },
            traceLines: [
              'Pending plan was cancelled by user.',
            ],
          },
        ]);
        return;
      }

      // User sent a different instruction; replace the stale pending plan with the new request flow.
      setPendingExecution(null);
      clearPendingPlanFlags();
    }

    const entryId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const requestContract = buildIntentRequestContract(
      prompt,
      componentType,
      isRefinement,
      attachments,
      strictImageMatch,
      Boolean(result)
    );
    const intentContract = classifyIntentDecision(requestContract);
    const responsePlan = buildResponsePlan(requestContract, intentContract);
    const planContract = buildPlanContract(requestContract);
    const validationContract = validatePlanContract(requestContract, planContract, Boolean(orgMetadata));
    appendTelemetryEvent({
      ts: new Date().toISOString(),
      type: 'intent_decision',
      details: {
        prompt: requestContract.promptNormalized,
        componentType,
        isRefinement,
        intent: intentContract.intent,
        action: intentContract.action,
        confidence: intentContract.confidence,
      },
    });

    if (isMisrouteComplaintPrompt(prompt)) {
      appendTelemetryEvent({
        ts: new Date().toISOString(),
        type: 'misroute_candidate',
        details: {
          prompt: requestContract.promptNormalized,
          componentType,
          hasPriorResult: requestContract.hasPriorResult,
          detectedIntent: intentContract.intent,
          detectedAction: intentContract.action,
        },
      });
    }

    if (intentContract.intent === 'feedback') {
      setError('');
      setPromptHistory(prev => [
        ...prev,
        {
          id: entryId,
          prompt,
          componentType,
          version: prev.length + 1,
          isRefinement,
          attachmentCount: attachments.length,
          timestamp: new Date(),
          responseSummary: buildFeedbackResponse(prompt),
          status: 'success',
          orchestration: {
            request: requestContract,
            intent: intentContract,
            responsePlan,
            plan: planContract,
            validation: validationContract,
          },
          traceLines: [
            `Intent contract: ${JSON.stringify(intentContract)}`,
            `Plan contract: ${JSON.stringify(planContract)}`,
            'Skipped generation for feedback/chit-chat request.',
            'Returned a direct conversational response.',
          ],
        },
      ]);
      return;
    }

    if (intentContract.action === 'clarify') {
      setError('');
      setPromptHistory(prev => [
        ...prev,
        {
          id: entryId,
          prompt,
          componentType,
          version: prev.length + 1,
          isRefinement,
          attachmentCount: attachments.length,
          timestamp: new Date(),
          responseSummary: buildClarificationResponse(prompt, componentType, responsePlan),
          status: 'success',
          orchestration: {
            request: requestContract,
            intent: intentContract,
            responsePlan,
            plan: planContract,
            validation: validationContract,
          },
          traceLines: [
            `Intent contract: ${JSON.stringify(intentContract)}`,
            `Plan contract: ${JSON.stringify(planContract)}`,
            'Skipped generation because intent action requires clarification first.',
          ],
        },
      ]);
      return;
    }

    if (intentContract.intent === 'question' || intentContract.intent === 'review') {
      setError('');
      const ack = responsePlan.needsReassurance
        ? 'I understand the concern. Let me check this quickly.'
        : getThinkingAcknowledgement(prompt);
      setPromptHistory(prev => [
        ...prev,
        {
          id: entryId,
          prompt,
          componentType,
          version: prev.length + 1,
          isRefinement,
          attachmentCount: attachments.length,
          timestamp: new Date(),
          responseSummary: ack,
          orchestration: {
            request: requestContract,
            intent: intentContract,
            responsePlan,
            plan: planContract,
            validation: validationContract,
          },
          traceLines: [
            `Intent contract: ${JSON.stringify(intentContract)}`,
            `Plan contract: ${JSON.stringify(planContract)}`,
            'Reviewing the latest context before answering.',
          ],
        },
      ]);

      await sleep(getQuestionResponseDelay(prompt));

      const exampleAnswer = isExampleRequestPrompt(prompt) ? buildExampleResponse(componentType) : null;
      const directAnswer = intentContract.intent === 'question'
        ? buildDirectQuestionResponse(prompt, Boolean(sfConnection?.sessionId), result)
        : null;
      const verifiedAnswer = intentContract.intent === 'review'
        ? summarizeVerificationFromResult(prompt, result)
        : null;
      const finalAnswer = exampleAnswer ?? directAnswer ?? verifiedAnswer ?? buildQuestionFirstResponse(prompt, componentType);
      const plannedAnswer = composePlannedResponse(finalAnswer, componentType, responsePlan);
      if (exampleAnswer) {
        const examples = EXTRA_EXAMPLES[componentType] ?? [];
        if (examples.length > 0) {
          setPendingExampleSelection({
            componentType,
            examples,
          });
        }
      }
      setPromptHistory(prev => prev.map(entry =>
        entry.id === entryId
          ? {
              ...entry,
              responseSummary: plannedAnswer,
              status: 'success',
              pendingExampleSelection: Boolean(exampleAnswer),
              exampleOptions: exampleAnswer ? (EXTRA_EXAMPLES[componentType] ?? []) : undefined,
              traceLines: [
                `Intent contract: ${JSON.stringify(intentContract)}`,
                'Reviewed available context and latest generated output.',
                'Answered directly without starting code generation.',
              ],
            }
          : entry
      ));
      return;
    }

    if (intentContract.action === 'respond') {
      setError('');
      setPromptHistory(prev => [
        ...prev,
        {
          id: entryId,
          prompt,
          componentType,
          version: prev.length + 1,
          isRefinement,
          attachmentCount: attachments.length,
          timestamp: new Date(),
          responseSummary: composePlannedResponse(buildPolicyResponse(intentContract.intent, result), componentType, responsePlan),
          status: 'success',
          orchestration: {
            request: requestContract,
            intent: intentContract,
            responsePlan,
            plan: planContract,
            validation: validationContract,
          },
          traceLines: [
            `Intent contract: ${JSON.stringify(intentContract)}`,
            'Policy routed this request to response-only mode.',
          ],
        },
      ]);
      return;
    }

    if (!validationContract.ok) {
      const blockerText = validationContract.blockers.join(' ');
      setError(blockerText);
      setPromptHistory(prev => [
        ...prev,
        {
          id: entryId,
          prompt,
          componentType,
          version: prev.length + 1,
          isRefinement,
          attachmentCount: attachments.length,
          timestamp: new Date(),
          responseSummary: blockerText,
          status: 'error',
          orchestration: {
            request: requestContract,
            intent: intentContract,
            responsePlan,
            plan: planContract,
            validation: validationContract,
          },
          traceLines: [
            `Intent contract: ${JSON.stringify(intentContract)}`,
            `Plan contract: ${JSON.stringify(planContract)}`,
            `Validation contract: ${JSON.stringify(validationContract)}`,
            'Generation stopped due to validation blockers.',
          ],
        },
      ]);
      return;
    }

    if (!bypassPlanConfirmation && shouldRequirePlanConfirmation(requestContract, intentContract)) {
      setError('');
      setPendingExecution({
        prompt,
        componentType,
        isRefinement,
        attachments,
        architectureMode,
        strictImageMatch,
        requestContract,
        intentContract,
        planContract,
        validationContract,
      });
      setPromptHistory(prev => [
        ...prev,
        {
          id: entryId,
          prompt,
          componentType,
          version: prev.length + 1,
          isRefinement,
          attachmentCount: attachments.length,
          timestamp: new Date(),
          responseSummary: buildPlanConfirmationResponse(componentType, planContract, intentContract),
          status: 'success',
          pendingPlan: true,
          orchestration: {
            request: requestContract,
            intent: intentContract,
            plan: planContract,
            validation: validationContract,
          },
          traceLines: [
            `Intent contract: ${JSON.stringify(intentContract)}`,
            `Plan contract: ${JSON.stringify(planContract)}`,
            'Execution paused pending explicit confirmation for high-impact scope.',
          ],
        },
      ]);
      return;
    }

    const isPartialRefinement = intentContract.intent === 'refine' && intentContract.refinementScope === 'partial';
    const partialUpdateFiles = isPartialRefinement
      ? inferLikelyUpdatedFiles(prompt, result, componentType, deriveDynamicArtifactName(prompt, componentType))
      : [];

    const runContext: GenerationTraceContext = {
      prompt,
      componentType,
      attachmentCount: attachments.length,
      strictImageMatch,
      usedOrgMetadata: Boolean(orgMetadata),
      isPartialRefinement,
      updatingFiles: partialUpdateFiles,
    };

    setIsLoading(true);
    setError('');
    setCurrentType(componentType);
    setWorkspaceTab('generator');
    setTraceContext(runContext);
    setIsTraceOpen(false);

    // Record this prompt in history before sending
    const acknowledgement = buildAcknowledgement(prompt, componentType);

    setPromptHistory(prev => [
      ...prev,
      {
        id: entryId,
        prompt,
        componentType,
        version: prev.length + 1,
        isRefinement,
        attachmentCount: attachments.length,
        timestamp: new Date(),
        responseSummary: acknowledgement,
        orchestration: {
          request: requestContract,
          intent: intentContract,
          plan: planContract,
          validation: validationContract,
        },
      },
    ]);

    const liveTracePlan = buildLiveTracePlan(runContext);
    setPromptHistory(prev => prev.map(entry =>
      entry.id === entryId
        ? {
            ...entry,
            traceLines: [
              `Intent contract: ${JSON.stringify(intentContract)}`,
              `Plan contract: ${JSON.stringify(planContract)}`,
              `Validation contract: ${JSON.stringify(validationContract)}`,
              ...(liveTracePlan.length > 0 ? [liveTracePlan[0]] : []),
            ],
              responseSummary: acknowledgement,
          }
        : entry
    ));

    let liveTraceIndex = 1;
    const liveTraceTimer = window.setInterval(() => {
      if (liveTraceIndex >= liveTracePlan.length) {
        window.clearInterval(liveTraceTimer);
        return;
      }

      const nextLine = liveTracePlan[liveTraceIndex];
      liveTraceIndex += 1;

      setPromptHistory(prev => prev.map(entry =>
        entry.id === entryId
          ? {
              ...entry,
              traceLines: [...(entry.traceLines ?? []), nextLine],
            }
          : entry
      ));
    }, 1200);

    try {
      generationAbortRef.current?.abort();
      const generationController = new AbortController();
      generationAbortRef.current = generationController;

      const generatedRaw = await api.generate(
        prompt,
        componentType,
        isRefinement && result ? result : null,
        orgMetadata,
        attachments,
        architectureMode,
        strictImageMatch,
        generationController.signal
      );
      let generated = repairGeneratedResult(generatedRaw);
      let verificationBlockers = verifyGeneratedResult(generated, prompt);
      let autoRepairAttempted = false;

      if (verificationBlockers.length > 0) {
        autoRepairAttempted = true;
        appendTelemetryEvent({
          ts: new Date().toISOString(),
          type: 'auto_repair',
          details: {
            status: 'attempt',
            blockers: verificationBlockers,
            componentType,
            isRefinement,
          },
        });

        const repairPrompt = [
          prompt,
          '',
          'Repair requirement: previous output failed structural verification.',
          `Failures: ${verificationBlockers.join(' ')}`,
          'Return a complete corrected bundle where every artifact has a filename, non-empty content, and a concise summary.',
        ].join('\n');

        const repairedRaw = await api.generate(
          repairPrompt,
          componentType,
          isRefinement && result ? result : null,
          orgMetadata,
          attachments,
          architectureMode,
          strictImageMatch,
          generationController.signal
        );
        generated = repairGeneratedResult(repairedRaw);
        verificationBlockers = verifyGeneratedResult(generated, prompt);

        appendTelemetryEvent({
          ts: new Date().toISOString(),
          type: 'auto_repair',
          details: {
            status: verificationBlockers.length === 0 ? 'success' : 'failed',
            blockers: verificationBlockers,
            componentType,
            isRefinement,
          },
        });
      }

      if (verificationBlockers.length > 0) {
        appendTelemetryEvent({
          ts: new Date().toISOString(),
          type: 'verification_failure',
          details: { blockers: verificationBlockers, componentType, isRefinement },
        });
        throw new Error(`Post-generation verification failed after repair: ${verificationBlockers.join(' ')}`);
      }

      const successTrace = [
        ...liveTracePlan,
        ...buildTraceLines(runContext, generated),
        ...(autoRepairAttempted ? ['Auto-repair pass executed to fix verification blockers.'] : []),
      ];
      const dedupedSuccessTrace = Array.from(new Set(successTrace));
      setPromptHistory(prev => prev.map(entry =>
        entry.id === entryId
          ? {
              ...entry,
              traceLines: dedupedSuccessTrace,
              responseSummary: generated.summary,
              artifactCount: generated.components.length,
              status: 'success',
            }
          : entry
      ));
      setResult(generated);
      playGenerationCompleteSound();
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setPromptHistory(prev => prev.map(entry =>
          entry.id === entryId
            ? {
                ...entry,
                traceLines: [...(entry.traceLines ?? []), 'Generation stopped by user.'],
                responseSummary: 'Generation stopped.',
                artifactCount: 0,
                status: 'error',
              }
            : entry
        ));
        setError('');
        return;
      }

      const rawMessage = err instanceof Error ? err.message : 'Generation failed';
      const failureTrace = [...liveTracePlan, ...buildTraceLines(runContext, null), `Generation failed: ${rawMessage}`];
      const dedupedFailureTrace = Array.from(new Set(failureTrace));
      setPromptHistory(prev => prev.map(entry =>
        entry.id === entryId
          ? {
              ...entry,
              traceLines: dedupedFailureTrace,
              responseSummary: rawMessage,
              artifactCount: 0,
              status: 'error',
            }
          : entry
      ));
      if (/exact layout specification|image contract/i.test(rawMessage)) {
        setError(`${rawMessage} Try a higher-resolution screenshot with the full form visible and minimal cropping, or disable Strict image match for best-effort output.`);
      } else {
        setError(rawMessage);
      }
    } finally {
      generationAbortRef.current = null;
      window.clearInterval(liveTraceTimer);
      setIsLoading(false);
    }
  }

  function handleStopGeneration() {
    generationAbortRef.current?.abort();
  }

  async function handleSaveCurrentWork(): Promise<{ ok: boolean; message: string }> {
    if (!result) {
      return { ok: false, message: 'No generated result available to save.' };
    }

    const nameBase = deriveComponentName(result);
    const saveName = nameBase || `Generated-${new Date().toISOString().slice(0, 10)}`;

    try {
      await api.components.save({
        name: saveName,
        prompt: promptHistory[promptHistory.length - 1]?.prompt || '',
        componentType: currentType,
        components: result.components,
        summary: result.summary,
        governorLimitNotes: result.governorLimitNotes,
        deploymentSteps: result.deploymentSteps,
        dependencies: result.dependencies,
      });
      return { ok: true, message: 'Saved to Library.' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Save failed';
      return { ok: false, message };
    }
  }

  const componentName = result ? deriveComponentName(result) : '';

  return (
    <div className={`flex h-full min-h-0 overflow-hidden flex-col lg:flex-row ${isResizing ? 'select-none cursor-col-resize' : ''}`}>
      {/* Left panel — prompt input */}
      <div
        style={isMobileViewport ? undefined : { width: `${leftPanelWidth}px` }}
        className="w-full lg:shrink-0 border-b lg:border-b-0 lg:border-r border-black/10 bg-white flex flex-col overflow-hidden lg:min-w-[280px]"
      >
        <div className="flex-1 min-h-0 overflow-hidden">
          <PromptPanel
            onGenerate={handleGenerate}
            onStopGeneration={handleStopGeneration}
            isLoading={isLoading}
            hasResult={!!result}
            promptHistory={promptHistory}
            onPlanAction={handlePendingPlanAction}
            onExampleSelect={handleExampleSelection}
            onSaveCurrentWork={handleSaveCurrentWork}
            loadExampleSignal={loadExampleSignal}
          />
        </div>
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
        tabIndex={0}
        onMouseDown={() => {
          if (!isMobileViewport) setIsResizing(true);
        }}
        onKeyDown={(event) => {
          if (isMobileViewport) return;
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const delta = event.key === 'ArrowLeft' ? -16 : 16;
          setLeftPanelWidth((prev) => {
            const minWidth = 280;
            const maxWidth = Math.min(560, window.innerWidth - 480);
            return Math.max(minWidth, Math.min(maxWidth, prev + delta));
          });
        }}
        className={`hidden lg:block w-1.5 shrink-0 bg-transparent hover:bg-violet-200/70 active:bg-violet-300/80 transition-colors cursor-col-resize ${
          isResizing ? 'bg-violet-300/80' : ''
        }`}
      />

      {/* Right panel — output */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="shrink-0 min-h-[84px] border-b border-black/10 bg-white px-3 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col justify-center">
            <p className="text-base font-semibold leading-6 tracking-[-0.01em] text-[#0f172a]">Generator Workspace</p>
            <p className="mt-1 text-xs leading-5 text-[#64748b]">Preview and customize your generated components.</p>
          </div>
          <div className="flex w-full sm:w-auto items-center gap-2 max-w-full justify-start sm:justify-end">
            {result && (
              <div className="w-auto shrink-0">
                <Suspense fallback={<div className="text-xs text-[#717182] px-2">Loading actions...</div>}>
                  <DeployPanel
                    result={result}
                    componentName={componentName}
                    prompt={promptHistory[promptHistory.length - 1]?.prompt || ''}
                    componentType={currentType}
                    sfConnection={sfConnection}
                    onSaved={() => {}}
                    showLibraryActions={false}
                    showDeployActions
                    inline
                    compact
                  />
                </Suspense>
              </div>
            )}
            <div className="w-auto shrink-0">
              <Suspense fallback={<div className="text-xs text-[#717182] px-2">Loading Salesforce...</div>}>
                <SalesforceConnect
                  connection={sfConnection}
                  onConnect={setSfConnection}
                  onDisconnect={() => setSfConnection(null)}
                  compact
                />
              </Suspense>
            </div>
          </div>
        </div>

        {!isLoading && !error && (
          <div className="shrink-0 border-b border-black/10 bg-white px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1 rounded-2xl bg-[#ececf1] p-1 border border-black/5 w-full sm:w-auto">
              <button
                onClick={() => setWorkspaceTab('generator')}
                className={`inline-flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-xl transition-colors ${
                  workspaceTab === 'generator'
                    ? 'bg-white text-[#09090b] shadow-sm'
                    : 'bg-transparent text-[#52525b] hover:text-[#09090b]'
                }`}
              >
                <Code2 size={13} />
                Generator
              </button>
              <button
                onClick={() => setWorkspaceTab('salesforce')}
                className={`inline-flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-xl transition-colors ${
                  workspaceTab === 'salesforce'
                    ? 'bg-white text-[#09090b] shadow-sm'
                    : 'bg-transparent text-[#52525b] hover:text-[#09090b]'
                }`}
              >
                <Database size={13} />
                Salesforce Data
              </button>
            </div>
            {result && (
              <div className="ml-auto w-full sm:w-auto">
                <Suspense fallback={<div className="text-xs text-[#717182]">Loading actions...</div>}>
                  <DeployPanel
                    result={result}
                    componentName={componentName}
                    prompt={promptHistory[promptHistory.length - 1]?.prompt || ''}
                    componentType={currentType}
                    sfConnection={sfConnection}
                    onSaved={() => {}}
                    showLibraryActions
                    showDeployActions={false}
                    inline
                  />
                </Suspense>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 m-4 mb-0 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 shrink-0">
            <AlertCircle size={16} className="shrink-0" />
            {error}
          </div>
        )}

        {isLoading && (
          <div className="flex-1 flex items-center justify-center bg-white p-6">
            <div className="w-full max-w-xl rounded-3xl border border-[#d7dbe3] bg-[#f7f8fb] p-6 md:p-7 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
                  <Loader2 size={18} className="animate-spin text-violet-600" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-[#111827]">Work in progress</p>
                  <p className="text-sm text-[#64748b]">Generating {COMPONENT_TYPE_LABELS[currentType]}</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm text-[#475569] mb-2">
                <p>{partialUpdateStatusText || `${completedCount} of ${loadingPlan.length} completed`}</p>
                <p>~30 seconds</p>
              </div>

              <div className="h-2 rounded-full bg-[#e5e7eb] overflow-hidden mb-5">
                <div
                  className="h-full bg-[#5b4bf0] transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="rounded-xl border border-[#d8deea] bg-[#edf1fb] px-3.5 py-3 flex items-center gap-2.5 mb-5">
                <Loader2 size={14} className="animate-spin text-violet-600" />
                <p className="text-sm text-[#4338ca] font-medium">{activeLoadingStatusText}</p>
              </div>

              <div className="space-y-3">
                {loadingPlan.map((step, index) => {
                  const isDone = index < loadingStep;
                  const isActive = index === loadingStep;
                  const isLast = index === loadingPlan.length - 1;

                  return (
                    <div key={step} className="relative pl-9 min-h-[38px]">
                      {!isLast && (
                        <span className={`absolute left-[14px] top-7 h-[calc(100%-10px)] w-px ${isDone ? 'bg-violet-500' : 'bg-[#c8cfdd]'}`} />
                      )}
                      <span className={`absolute left-0 top-1.5 inline-flex items-center justify-center w-7 h-7 rounded-full border ${
                        isActive
                          ? 'border-violet-500 text-violet-500 bg-white'
                          : isDone
                          ? 'border-violet-500 text-white bg-violet-500'
                          : 'border-[#c8cfdd] text-[#94a3b8] bg-white'
                      }`}>
                        {isDone ? <CheckCircle2 size={14} className="text-white" /> : isActive ? <Loader2 size={13} className="animate-spin" /> : <span className="w-2 h-2 rounded-full bg-[#c8cfdd]" />}
                      </span>
                      <div className="flex items-center justify-between gap-3 pt-1">
                        <p className={`text-sm ${isActive ? 'text-[#312e81] font-medium' : isDone ? 'text-[#334155] font-medium' : 'text-[#64748b]'}`}>{step}</p>
                        {(isDone || isActive) && (
                          <span className={`text-xs px-2 py-0.5 rounded-md ${isDone ? 'bg-violet-100 text-violet-700' : 'bg-violet-100 text-violet-700'}`}>
                            {isDone ? 'Done' : 'In Progress'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {!isLoading && !result && !error && workspaceTab === 'generator' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-[#717182] gap-4 bg-[#f2f3f6] px-6">
            <div className="w-20 h-20 rounded-full bg-[#eadcf5] flex items-center justify-center shadow-sm">
              <Code2 size={34} className="text-violet-600" />
            </div>
            <p className="text-2xl leading-snug font-semibold text-[#0f172a]">Ready to Build Something Amazing?</p>
            <p className="text-sm text-[#334155] max-w-xl leading-relaxed">
              Select a Salesforce component type and describe what you need. SCG-AI will generate clean, deployment-ready artifacts in seconds.
            </p>
            <ul className="text-xs text-[#334155] space-y-1.5 mt-1">
              <li className="flex items-center justify-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-violet-500 inline-block" />Apex triggers, classes, LWCs, integrations, batch, and APIs</li>
              <li className="flex items-center justify-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-violet-500 inline-block" />Governor-limit-aware patterns and validation checks</li>
              <li className="flex items-center justify-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-violet-500 inline-block" />Follow-up refinements with real-time reasoning</li>
            </ul>
            <button
              onClick={() => {
                setWorkspaceTab('generator');
                setError('');
                setLoadExampleSignal((prev) => prev + 1);
              }}
              className="mt-3 px-5 py-2.5 text-xs rounded-xl text-white bg-gradient-to-r from-violet-500 to-blue-500 hover:opacity-90 transition-opacity shadow-md shadow-violet-500/25"
            >
              Try an Example
            </button>
          </div>
        )}

        {!isLoading && !error && workspaceTab === 'salesforce' && (
          <div className="flex-1 bg-[#f2f3f6] px-4 py-4 overflow-hidden">
            {!sfConnection ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-[#717182] gap-3 px-6">
                <div className="w-16 h-16 rounded-full bg-blue-100/70 flex items-center justify-center shadow-sm">
                  <Database size={30} className="text-blue-600" />
                </div>
                <p className="text-2xl font-semibold text-[#09090b]">Salesforce Data Workspace</p>
                <p className="text-sm text-[#717182] max-w-xl">
                  Connect your org from the top-right panel to browse metadata and improve generation accuracy.
                </p>
              </div>
            ) : (
              <div className="h-full grid grid-cols-1 md:grid-cols-[320px,1fr] gap-3 min-h-0 overflow-y-auto md:overflow-hidden pr-1">
                <div className="bg-white border border-black/10 rounded-xl p-3 flex flex-col min-h-0">
                  <p className="text-xs font-semibold text-[#0f172a] mb-2">Objects</p>
                  <input
                    value={metadataSearch}
                    onChange={(e) => setMetadataSearch(e.target.value)}
                    placeholder="Search object name or label"
                    className="w-full mb-2 bg-white border border-black/10 text-[#09090b] text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
                    {visibleMetadataObjects.length === 0 && (
                      <p className="text-xs text-[#717182] px-1 py-2">No objects found.</p>
                    )}
                    {visibleMetadataObjects.map((obj) => {
                      const isSelected = selectedObjectName === obj.name;
                      return (
                        <button
                          key={obj.name}
                          onClick={() => setSelectedObjectName(obj.name)}
                          className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors ${
                            isSelected
                              ? 'bg-violet-50 border-violet-200 text-violet-800'
                              : 'bg-white border-black/10 text-[#374151] hover:bg-[#f8fafc]'
                          }`}
                        >
                          <p className="text-xs font-semibold truncate">{obj.name}</p>
                          <p className="text-[11px] text-[#717182] truncate">{obj.label}</p>
                        </button>
                      );
                    })}
                    {visibleMetadataObjects.length < filteredMetadataObjects.length && (
                      <button
                        onClick={() => setMetadataPage((prev) => prev + 1)}
                        className="w-full mt-1 px-2.5 py-2 text-xs rounded-lg border border-black/10 text-[#475569] bg-[#f8fafc] hover:bg-[#f1f5f9] transition-colors"
                      >
                        Load more objects
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-black/10 rounded-xl p-3 flex flex-col min-h-0">
                  {!selectedObjectName ? (
                    <div className="h-full flex items-center justify-center text-[#717182] text-sm">
                      Select an object to view fields.
                    </div>
                  ) : (
                    <>
                      <div className="mb-2">
                        <p className="text-sm font-semibold text-[#0f172a]">{selectedObjectMeta?.label || selectedObjectName}</p>
                        <p className="text-xs text-[#64748b]">{selectedObjectName}</p>
                        <p className="text-[11px] text-[#717182] mt-1">
                          {selectedObjectMeta?.custom ? 'Custom object' : 'Standard object'}
                          {' · '}
                          {selectedObjectMeta?.queryable ? 'Queryable' : 'Not queryable'}
                        </p>
                      </div>

                      <div className="border-t border-black/10 pt-2 flex-1 min-h-0 overflow-y-auto">
                        {isFieldsLoading ? (
                          <p className="text-xs text-[#717182]">Loading fields...</p>
                        ) : selectedObjectFields.length === 0 ? (
                          <p className="text-xs text-[#717182]">No fields available for this object.</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {selectedObjectFields.map((fieldName) => (
                              <span
                                key={fieldName}
                                className="inline-flex items-center px-2 py-1 text-[11px] rounded-md border border-black/10 bg-[#f8fafc] text-[#334155]"
                              >
                                {fieldName}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {!isLoading && result && workspaceTab === 'generator' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {latestTraceLines.length > 0 && (
              <div className="px-4 py-2 border-b border-black/10 bg-white shrink-0">
                <button
                  onClick={() => setIsTraceOpen(prev => !prev)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#717182]">Generation Trace</p>
                  <span className="text-[11px] text-violet-600 underline">{isTraceOpen ? 'Hide trace' : 'Show trace'}</span>
                </button>
                {isTraceOpen && (
                  <ul className="space-y-1 mt-1">
                    {latestTraceLines.map((line, idx) => (
                      <li key={idx} className="text-[11px] text-[#52525b] flex gap-1.5">
                        <span className="text-violet-500 shrink-0">•</span>
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Code viewer */}
            <div className="flex-1 overflow-hidden">
              <Suspense fallback={<div className="h-full flex items-center justify-center text-sm text-[#717182]">Loading editor...</div>}>
                <CodeViewer
                  artifacts={result.components}
                  componentType={currentType}
                  summary={result.summary}
                  governorLimitNotes={result.governorLimitNotes}
                  deploymentSteps={result.deploymentSteps}
                  dependencies={result.dependencies}
                />
              </Suspense>
            </div>

            {/* Info tabs */}
            {(result.governorLimitNotes?.length > 0 || result.deploymentSteps?.length > 0 || result.dependencies?.length > 0) && (
              <div className="border-t border-black/10 bg-white shrink-0" style={{ maxHeight: isMobileViewport ? '220px' : '160px' }}>
                <div className="flex gap-1 px-3 pt-2 border-b border-black/10">
                  {([
                    ['notes', ShieldCheck, 'Gov. Limits'],
                    ['steps', ListChecks, 'Deploy Steps'],
                    ['deps', PackageOpen, 'Dependencies'],
                  ] as const).map(([tab, Icon, label]) => (
                    <button
                      key={tab}
                      onClick={() => setActiveInfoTab(tab)}
                      className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-t transition-colors ${
                        activeInfoTab === tab
                            ? 'text-violet-600 border-b-2 border-violet-500'
                            : 'text-[#717182] hover:text-[#09090b]'
                      }`}
                    >
                      <Icon size={11} />
                      {label}
                    </button>
                  ))}
                </div>
                <div className="px-3 py-2 overflow-y-auto" style={{ maxHeight: '110px' }}>
                  {activeInfoTab === 'notes' && (
                    <ul className="space-y-1">
                      {result.governorLimitNotes?.map((note, i) => (
                        <li key={i} className="text-[11px] text-[#52525b] flex gap-1.5">
                          <span className="text-amber-500 shrink-0">⚠</span>{note}
                        </li>
                      ))}
                    </ul>
                  )}
                  {activeInfoTab === 'steps' && (
                    <ol className="space-y-1 list-decimal list-inside">
                      {result.deploymentSteps?.map((step, i) => (
                        <li key={i} className="text-[11px] text-[#52525b]">{step}</li>
                      ))}
                    </ol>
                  )}
                  {activeInfoTab === 'deps' && (
                    <ul className="space-y-1">
                      {result.dependencies?.map((dep, i) => (
                        <li key={i} className="text-[11px] text-[#52525b] flex gap-1.5">
                          <span className="text-violet-500 shrink-0">•</span>{dep}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
