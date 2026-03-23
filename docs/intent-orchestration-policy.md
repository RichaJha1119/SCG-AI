# Intent Orchestration Policy (Production)

## Primary Intents

- create
- refine
- review
- question
- feedback
- debug
- optimize
- alternative
- undo
- diff
- integrate
- control
- dangerous
- learning

## Secondary Attributes

- scope: partial | full | unknown
- mode: generate | respond | clarify | restore_previous | generate_and_respond
- artifactState: no_prior | prior_exists | ambiguous
- confidence: high | medium | low
- riskLevel: low | medium | high
- requiresContext: boolean
- shouldAutoExecute: boolean

## Response Planner (V2)

Stage 1 (router) decides intent and action.
Stage 2 (response planner) decides conversational behavior before text is generated.

- actionDecision: act | explain | clarify | compare | reassure | acknowledge
- tone: direct | collaborative | reassuring | concise | teacher-like
- structure:
  - answer_only
  - acknowledge_then_answer
  - acknowledge_then_explain
  - acknowledge_then_explain_then_offer_action
  - explain_then_act
  - answer_with_options
  - clarify_with_options
  - act_then_summarize
  - review_then_verdict
- userState: frustrated | unsure | directive | exploratory | neutral | satisfied
- needsReassurance: boolean
- needsExplanation: boolean
- shouldExplainReasoning: boolean
- shouldOfferNextStep: boolean
- shouldActImmediately: boolean
- hiddenPreferences:
  - preserveStructure
  - minimizeChange
  - avoidFullRewrite

### Deterministic Archetypes

- acknowledge_explain
- explain_then_act
- act_summarize
- clarify_narrow_options
- review_verdict
- acknowledge_answer
- answer_direct
- teach_stepwise

The planner maps structure and tone into one archetype so response style remains consistent across equivalent prompts.

## Routing Order

1. feedback
2. dangerous
3. control (including undo)
4. diff/compare
5. review/verification
6. learning (respond-only)
7. example/options request
8. debug/optimize/alternative/integrate
9. explicit generation command
10. question-like
11. weak creation signal
12. advisory clarify fallback

## Core Policies

- Feedback never generates.
- Review/question about prior work responds and does not regenerate.
- Explicit modification with clear target generates (usually partial for refine).
- Refine without prior artifact clarifies.
- Destructive actions require clarification (no auto execution).
- Undo/diff require prior context; otherwise clarify.

## JSON Eval Schema (Extended)

```json
{
  "name": "Explicit partial refine",
  "prompt": "please add an Area Code field to the contact section only",
  "componentType": "lwc",
  "isRefinement": true,
  "hasPriorResult": true,
  "expectedIntent": "refine",
  "secondaryIntent": null,
  "expectedAction": "generate",
  "expectedMode": "generate",
  "expectedScope": "partial",
  "expectedRefinementScope": "partial",
  "expectedConfidence": "high",
  "riskLevel": "low",
  "requiresContext": true,
  "shouldAutoExecute": true,
  "expectedTone": "direct",
  "expectedStructure": "act_then_summarize",
  "expectedUserState": "directive",
  "shouldExplainReasoning": false,
  "shouldOfferNextStep": false
}
```

## Notes

- The policy is implemented in client/src/orchestration/intentPolicy.js.
- Type declarations are in client/src/orchestration/intentPolicy.d.ts.
- Regression runner supports extended fields in client/scripts/intent-eval.mjs.
- Test cases live in client/scripts/intent-eval-cases.json.
