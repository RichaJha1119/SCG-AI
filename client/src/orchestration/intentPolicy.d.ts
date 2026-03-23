import type { ComponentType } from '../types';
import type { Attachment } from '../components/PromptPanel';

export type OrchestrationIntent = 'feedback' | 'question' | 'review' | 'create' | 'refine';
export type OrchestrationIntentV2 =
  | 'create'
  | 'refine'
  | 'review'
  | 'question'
  | 'feedback'
  | 'debug'
  | 'optimize'
  | 'alternative'
  | 'undo'
  | 'diff'
  | 'integrate'
  | 'control'
  | 'dangerous'
  | 'learning';

export type OrchestrationScope = 'partial' | 'full' | 'unknown';
export type OrchestrationMode = 'generate' | 'respond' | 'clarify' | 'restore_previous' | 'generate_and_respond';
export type OrchestrationArtifactState = 'no_prior' | 'prior_exists' | 'ambiguous';
export type OrchestrationRiskLevel = 'low' | 'medium' | 'high';
export type ResponseActionDecision = 'act' | 'explain' | 'clarify' | 'compare' | 'reassure' | 'acknowledge';
export type ResponseTone = 'direct' | 'collaborative' | 'reassuring' | 'concise' | 'teacher-like';
export type ResponseStructure =
  | 'answer_only'
  | 'acknowledge_then_answer'
  | 'acknowledge_then_explain'
  | 'acknowledge_then_explain_then_offer_action'
  | 'explain_then_act'
  | 'answer_with_options'
  | 'clarify_with_options'
  | 'act_then_summarize'
  | 'review_then_verdict';
export type ResponseUserState = 'frustrated' | 'unsure' | 'directive' | 'exploratory' | 'neutral' | 'satisfied';
export type ResponseArchetype =
  | 'acknowledge_explain'
  | 'explain_then_act'
  | 'act_summarize'
  | 'clarify_narrow_options'
  | 'review_verdict'
  | 'acknowledge_answer'
  | 'answer_direct'
  | 'teach_stepwise';

export interface RequestContract {
  promptRaw: string;
  promptNormalized: string;
  componentType: ComponentType;
  isRefinement: boolean;
  attachmentCount: number;
  hasPriorResult: boolean;
  strictImageMatch: boolean;
}

export interface IntentDecision {
  intent: OrchestrationIntentV2;
  secondaryIntent?: OrchestrationIntentV2 | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  action: OrchestrationMode;
  scope: OrchestrationScope;
  mode: OrchestrationMode;
  artifactState: OrchestrationArtifactState;
  riskLevel: OrchestrationRiskLevel;
  requiresContext: boolean;
  shouldAutoExecute: boolean;
  // Backward-compatibility field currently used by Generator.tsx
  refinementScope?: 'partial' | 'full';
}

export interface ResponsePlan {
  userGoal: string;
  interactionStyle: 'directive' | 'collaborative';
  emotion: 'mild frustration' | 'uncertain' | 'positive' | 'neutral';
  userState: ResponseUserState;
  actionDecision: ResponseActionDecision;
  tone: ResponseTone;
  structure: ResponseStructure;
  archetype: ResponseArchetype;
  needsReassurance: boolean;
  needsExplanation: boolean;
  shouldExplainReasoning: boolean;
  shouldOfferNextStep: boolean;
  shouldActImmediately: boolean;
  responseStyle: ResponseStructure;
  acknowledgementPrefix: string;
  directives: {
    acknowledgeFirst: boolean;
    keepAnswerConcise: boolean;
    useNarrowOptions: boolean;
    emphasizeMinimalChange: boolean;
  };
  hiddenPreferences: {
    preserveStructure: boolean;
    minimizeChange: boolean;
    avoidFullRewrite: boolean;
  };
}

export function normalizePromptText(prompt: string): string;

export function buildRequestContract(
  prompt: string,
  componentType: ComponentType,
  isRefinement: boolean,
  attachments: Attachment[],
  strictImageMatch: boolean,
  hasPriorResult: boolean
): RequestContract;

export function isQuestionPrompt(prompt: string): boolean;
export function isQuestionLikePrompt(prompt: string): boolean;
export function isReviewOrVerificationPrompt(prompt: string): boolean;
export function hasCreationIntent(prompt: string): boolean;
export function hasExplicitGenerationCommand(prompt: string): boolean;
export function isFeedbackOrChitChatPrompt(prompt: string): boolean;
export function isExampleRequestPrompt(prompt: string): boolean;
export function classifyIntentDecision(request: RequestContract): IntentDecision;
export function buildResponsePlan(request: RequestContract, decision: IntentDecision): ResponsePlan;
