export function normalizePromptText(prompt) {
  return String(prompt || '').replace(/\s+/g, ' ').trim();
}

function tokenizePrompt(prompt) {
  return normalizePromptText(prompt)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[a.length][b.length];
}

function isApproxTokenMatch(token, keyword) {
  if (!token || !keyword) return false;
  if (token === keyword) return true;
  if (Math.abs(token.length - keyword.length) > 2) return false;
  const threshold = keyword.length <= 4 ? 1 : 2;
  return editDistance(token, keyword) <= threshold;
}

function hasApproxKeyword(prompt, keywords) {
  const tokens = tokenizePrompt(prompt);
  return tokens.some((token) => keywords.some((keyword) => isApproxTokenMatch(token, keyword)));
}

function hasAnyApproxKeyword(prompt, keywordGroups) {
  return keywordGroups.some((group) => hasApproxKeyword(prompt, group));
}

function detectArtifactState(request) {
  if (request.hasPriorResult) return 'prior_exists';
  if (request.isRefinement) return 'ambiguous';
  return 'no_prior';
}

function buildDecision({
  intent,
  secondaryIntent = null,
  confidence,
  reason,
  mode,
  scope = 'unknown',
  riskLevel = 'low',
  artifactState = 'ambiguous',
  requiresContext = false,
  shouldAutoExecute = false,
}) {
  const decision = {
    intent,
    secondaryIntent,
    confidence,
    reason,
    action: mode,
    scope,
    mode,
    artifactState,
    riskLevel,
    requiresContext,
    shouldAutoExecute,
  };

  if (scope === 'partial' || scope === 'full') {
    decision.refinementScope = scope;
  }

  return decision;
}

export function buildRequestContract(
  prompt,
  componentType,
  isRefinement,
  attachments,
  strictImageMatch,
  hasPriorResult
) {
  return {
    promptRaw: String(prompt || ''),
    promptNormalized: normalizePromptText(prompt),
    componentType,
    isRefinement,
    attachmentCount: attachments.length,
    hasPriorResult,
    strictImageMatch,
  };
}

export function isQuestionPrompt(prompt) {
  const text = String(prompt || '').trim();
  if (!text) return false;
  const starters = ['what', 'why', 'how', 'when', 'where', 'who', 'can', 'could', 'would', 'should', 'is', 'are', 'do', 'does', 'did'];
  const firstToken = tokenizePrompt(text)[0] || '';
  return /\?$/.test(text) || starters.some((starter) => isApproxTokenMatch(firstToken, starter));
}

export function isQuestionLikePrompt(prompt) {
  const text = String(prompt || '').trim();
  const lowered = text.toLowerCase();
  if (!text) return false;

  if (isQuestionPrompt(text)) return true;

  if (/\b(can\s+we|could\s+we|should\s+we|could\s+it|should\s+it|right\??|isn'?t\s+it|why\s+(did|you))\b/.test(lowered)) {
    return true;
  }

  return hasApproxKeyword(text, ['why', 'how', 'what', 'when', 'where', 'who', 'can', 'could', 'should']);
}

export function isReviewOrVerificationPrompt(prompt) {
  const text = String(prompt || '').toLowerCase().trim();
  if (!text) return false;

  const hasReviewVerb = /\b(check|verify|review|confirm|validate|inspect|see if|look at|look into|audit|compare|diff)\b/.test(text)
    || hasApproxKeyword(text, ['check', 'verify', 'review', 'confirm', 'validate', 'inspect', 'compare', 'diff']);
  const referencesPriorWork = /\b(last version|previous version|existing version|from my last|from previous|already added|was added|did you|what changed|why did|why you did|current version)\b/.test(text);

  return hasReviewVerb || referencesPriorWork;
}

export function hasCreationIntent(prompt) {
  const keywords = ['create', 'build', 'generate', 'regenerate', 'implement', 'write', 'add', 'update', 'modify', 'fix', 'refactor', 'convert', 'design', 'draft', 'deploy', 'make', 'rewrite', 'rebuild', 'optimize', 'debug', 'improve', 'integrate'];
  const text = String(prompt || '').toLowerCase();
  return /\b(create|build|generate|regenerate|implement|write|add|update|modify|fix|refactor|convert|design|draft|deploy|make|rewrite|rebuild|optimize|debug|improve|integrate)\b/.test(text)
    || hasApproxKeyword(text, keywords);
}

export function hasExplicitGenerationCommand(prompt) {
  const text = String(prompt || '').toLowerCase().trim();
  if (!text) return false;

  const tokens = tokenizePrompt(text);
  const commandKeywords = ['create', 'build', 'generate', 'regenerate', 'implement', 'write', 'add', 'update', 'modify', 'fix', 'refactor', 'convert', 'design', 'draft', 'deploy', 'make', 'rewrite', 'rebuild'];
  const first = tokens[0] || '';
  const second = tokens[1] || '';
  const third = tokens[2] || '';
  const fourth = tokens[3] || '';

  const directImperative =
    (isApproxTokenMatch(first, 'please') && commandKeywords.some((k) => isApproxTokenMatch(second, k)))
    || commandKeywords.some((k) => isApproxTokenMatch(first, k));
  const questionImperative =
    ((isApproxTokenMatch(first, 'can') || isApproxTokenMatch(first, 'could') || isApproxTokenMatch(first, 'would'))
      && isApproxTokenMatch(second, 'you')
      && (
        commandKeywords.some((k) => isApproxTokenMatch(third, k))
        || (isApproxTokenMatch(third, 'please') && commandKeywords.some((k) => isApproxTokenMatch(fourth, k)))
      ));
  const letsImperative = (isApproxTokenMatch(first, 'lets') || isApproxTokenMatch(first, 'let'))
    && commandKeywords.some((k) => isApproxTokenMatch(second, k));

  if (directImperative || questionImperative || letsImperative) return true;

  return /^(please\s+)?(create|build|generate|regenerate|implement|write|add|update|modify|fix|refactor|convert|design|draft|deploy|make|rewrite|rebuild)\b/.test(text)
    || /^(can|could|would)\s+you\s+(please\s+)?(create|build|generate|regenerate|implement|write|add|update|modify|fix|refactor|convert|design|draft|deploy|make|rewrite|rebuild)\b/.test(text)
    || /^let'?s\s+(create|build|generate|regenerate|implement|write|add|update|modify|fix|refactor|convert|design|draft|deploy|make|rewrite|rebuild)\b/.test(text);
}

export function isFeedbackOrChitChatPrompt(prompt) {
  const text = String(prompt || '').toLowerCase().trim();
  if (!text) return false;

  return /^(ok|okay|k|cool|nice|great|awesome|perfect|thanks|thank you|looks good|this is good|all good|done|works|working|got it|sounds good)([!.\s].*)?$/.test(text);
}

function isControlPrompt(prompt) {
  const text = String(prompt || '').toLowerCase().trim();
  if (!text) return false;
  // Control should be command-like, not general discussion of retry/regenerate.
  return /^(stop|pause|continue|resume|retry|try again|cancel|regenerate|run again)\b/.test(text)
    || /^(undo|revert|rollback|restore)\b/.test(text);
}

function isDangerousPrompt(prompt) {
  const text = String(prompt || '').toLowerCase().trim();
  if (!text) return false;
  return hasAnyApproxKeyword(text, [
    ['delete', 'drop', 'remove', 'disable', 'bypass', 'truncate'],
    ['all', 'everything', 'entire', 'records', 'validation', 'auth'],
  ]) && /\b(delete|drop|remove|disable|bypass)\b/.test(text);
}

function isUndoPrompt(prompt) {
  const text = String(prompt || '').toLowerCase().trim();
  return /\b(undo|revert|rollback|restore)\b/.test(text);
}

function isDiffPrompt(prompt) {
  const text = String(prompt || '').toLowerCase().trim();
  return /\b(compare|diff|difference|differences)\b/.test(text);
}

function isAmbiguousPolishPrompt(prompt) {
  const text = String(prompt || '').toLowerCase().trim();
  if (!text) return false;
  return /\b(clean this up|clean up|improve this|polish this|make this cleaner|tidy this)\b/.test(text);
}

function isDebugPrompt(prompt) {
  const text = String(prompt || '').toLowerCase();
  return /\b(debug|error|exception|bug|broken|fails?|failing|null pointer|nullreference)\b/.test(text);
}

function isOptimizePrompt(prompt) {
  const text = String(prompt || '').toLowerCase();
  return /\b(optimi[sz]e|performance|efficient|soql|governor|maintainability|readability)\b/.test(text);
}

function isAlternativePrompt(prompt) {
  const text = String(prompt || '').toLowerCase();
  return hasAnyApproxKeyword(text, [['alternative', 'another', 'different', 'other way', 'another way']]);
}

function isIntegratePrompt(prompt) {
  const text = String(prompt || '').toLowerCase();
  // Keep this strict to avoid false positives with words like contact/connect.
  return /\b(integrate|integration|connect\s+(to|with)|combine\s+with|wire\s+up|hook\s+up)\b/.test(text);
}

function isLearningPrompt(prompt) {
  const text = String(prompt || '').toLowerCase();
  return /\b(learn|tutorial|teach|walk\s*through|step\s*by\s*step)\b/.test(text);
}

function isArtifactInventoryQuestion(prompt) {
  const text = String(prompt || '').toLowerCase().trim();
  if (!text) return false;

  const asksFiles = /\b(file|files|artifact|artifacts)\b/.test(text);
  const asksInventory = /\b(list|show|tell|give|share|count|number|no\.?|how many|which|what)\b/.test(text)
    || hasApproxKeyword(text, ['list', 'count', 'number']);
  const asksNames = /\b(name|names|filename|filenames)\b/.test(text);
  const referencesGeneratedOutput = /\b(generated|generate|created|create|craeted|built|produced|output)\b/.test(text)
    || hasApproxKeyword(text, ['generated', 'created', 'output']);

  return asksFiles && (asksInventory || asksNames) && referencesGeneratedOutput;
}

function inferUserState(prompt) {
  const text = String(prompt || '').toLowerCase();
  if (!text) return 'neutral';

  if (/\b(why did you|why you did|whole thing|all together|regenerate everything|frustrat|annoy|wrong|again\?)\b/.test(text)) {
    return 'frustrated';
  }
  if (/\b(maybe|perhaps|not sure|could it|can we|right\??|i think|unsure)\b/.test(text)) {
    return 'unsure';
  }
  if (/\b(only|just|leave everything else|without changing|keep the same|do this|update|fix|add)\b/.test(text)) {
    return 'directive';
  }
  if (/\b(what if|options|alternative|another way|could we explore|ideas?)\b/.test(text)) {
    return 'exploratory';
  }
  if (isFeedbackOrChitChatPrompt(text)) {
    return 'satisfied';
  }

  return 'neutral';
}

function inferHiddenPreferences(prompt) {
  const text = String(prompt || '').toLowerCase();
  return {
    preserveStructure: /\b(keep (the )?same structure|preserve|dont change structure|don't change structure)\b/.test(text),
    minimizeChange: /\b(only|just|without changing anything else|leave everything else|minimal|minimal change|partial)\b/.test(text),
    avoidFullRewrite: /\b(not full|dont regenerate|don't regenerate|avoid full|not from scratch|not whole)\b/.test(text),
  };
}

function inferActionDecision(decision, prompt) {
  const text = String(prompt || '').toLowerCase();

  if (decision.mode === 'clarify') return 'clarify';
  if (decision.intent === 'diff') return 'compare';
  if (decision.intent === 'review') return 'explain';
  if (decision.intent === 'feedback') return 'acknowledge';
  if (decision.mode === 'generate' || decision.mode === 'generate_and_respond' || decision.mode === 'restore_previous') {
    return 'act';
  }
  if (/\b(why|how|explain|reason)\b/.test(text)) return 'explain';
  if (/\b(right\??|is that okay|worried|concern)\b/.test(text)) return 'reassure';

  return 'acknowledge';
}

function inferTone(decision, userState) {
  if (decision.intent === 'learning') return 'teacher-like';
  if (userState === 'frustrated' || decision.intent === 'review') return 'reassuring';
  if (decision.mode === 'clarify') return 'collaborative';
  if (decision.intent === 'feedback') return 'concise';
  if (userState === 'directive' && decision.mode === 'generate') return 'direct';
  return 'collaborative';
}

function inferNeedsExplanation(prompt, decision, userState) {
  const text = String(prompt || '').toLowerCase();
  if (decision.intent === 'review' || decision.intent === 'learning') return true;
  if (decision.mode === 'clarify') return false;
  if (userState === 'frustrated' || userState === 'unsure') return true;
  return /\b(why|how|explain|reason|because)\b/.test(text);
}

function inferStructure(decision, userState, needsExplanation) {
  if (decision.mode === 'clarify') return 'clarify_with_options';
  if (decision.mode === 'generate' || decision.mode === 'restore_previous') return 'act_then_summarize';
  if (decision.mode === 'generate_and_respond') return 'explain_then_act';
  if (decision.intent === 'review') {
    return userState === 'frustrated' || needsExplanation ? 'acknowledge_then_explain' : 'review_then_verdict';
  }
  if (needsExplanation && userState === 'frustrated') return 'acknowledge_then_explain_then_offer_action';
  if (needsExplanation) return 'acknowledge_then_answer';
  return 'answer_only';
}

function inferResponseArchetype(structure, tone) {
  if (tone === 'teacher-like') return 'teach_stepwise';
  if (structure === 'clarify_with_options') return 'clarify_narrow_options';
  if (structure === 'act_then_summarize') return 'act_summarize';
  if (structure === 'review_then_verdict') return 'review_verdict';
  if (structure === 'acknowledge_then_explain' || structure === 'acknowledge_then_explain_then_offer_action') {
    return 'acknowledge_explain';
  }
  if (structure === 'explain_then_act') return 'explain_then_act';
  if (structure === 'acknowledge_then_answer') return 'acknowledge_answer';
  return 'answer_direct';
}

function inferResponseDirectives(archetype, hiddenPreferences) {
  return {
    acknowledgeFirst: archetype === 'acknowledge_explain' || archetype === 'acknowledge_answer',
    keepAnswerConcise: archetype === 'answer_direct',
    useNarrowOptions: archetype === 'clarify_narrow_options',
    emphasizeMinimalChange: hiddenPreferences.minimizeChange || hiddenPreferences.preserveStructure || hiddenPreferences.avoidFullRewrite,
  };
}

function inferAcknowledgementPrefix(archetype, userState, tone) {
  if (archetype === 'acknowledge_explain') return "You're right to flag that.";
  if (archetype === 'acknowledge_answer') return 'Good question.';
  if (userState === 'frustrated') return "You're right to call that out.";
  if (userState === 'unsure') return 'Good question.';
  if (tone === 'reassuring') return 'That makes sense.';
  return '';
}

function inferUserGoal(decision) {
  if (decision.mode === 'generate' || decision.mode === 'generate_and_respond') return 'modify existing code';
  if (decision.mode === 'restore_previous') return 'restore prior result';
  if (decision.mode === 'clarify') return 'disambiguate request';
  if (decision.intent === 'review') return 'verify prior output';
  return 'understand current result';
}

function inferEmotion(userState) {
  if (userState === 'frustrated') return 'mild frustration';
  if (userState === 'unsure') return 'uncertain';
  if (userState === 'satisfied') return 'positive';
  return 'neutral';
}

function inferShouldOfferNextStep(decision, userState) {
  if (decision.mode === 'clarify') return true;
  if (decision.intent === 'feedback') return false;
  if (decision.intent === 'review' || userState === 'frustrated' || userState === 'unsure') return true;
  return decision.mode === 'respond';
}

export function buildResponsePlan(request, decision) {
  const prompt = request?.promptNormalized || request?.promptRaw || '';
  const userState = inferUserState(prompt);
  const hiddenPreferences = inferHiddenPreferences(prompt);
  const needsExplanation = inferNeedsExplanation(prompt, decision, userState);
  const needsReassurance = userState === 'frustrated' || userState === 'unsure';
  const actionDecision = inferActionDecision(decision, prompt);
  const tone = inferTone(decision, userState);
  const structure = inferStructure(decision, userState, needsExplanation);
  const archetype = inferResponseArchetype(structure, tone);
  const shouldOfferNextStep = inferShouldOfferNextStep(decision, userState);
  const shouldActImmediately = actionDecision === 'act' && decision.shouldAutoExecute && !needsExplanation;
  const directives = inferResponseDirectives(archetype, hiddenPreferences);
  const acknowledgementPrefix = inferAcknowledgementPrefix(archetype, userState, tone);

  return {
    userGoal: inferUserGoal(decision),
    interactionStyle: tone === 'direct' ? 'directive' : 'collaborative',
    emotion: inferEmotion(userState),
    userState,
    actionDecision,
    tone,
    structure,
    archetype,
    needsReassurance,
    needsExplanation,
    shouldExplainReasoning: needsExplanation,
    shouldOfferNextStep,
    shouldActImmediately,
    responseStyle: structure,
    acknowledgementPrefix,
    directives,
    hiddenPreferences,
  };
}

export function isExampleRequestPrompt(prompt) {
  const text = String(prompt || '').toLowerCase().trim();
  if (!text) return false;
  if (isControlPrompt(text)) return false;

  const asksExample = /\b(example|examples|exampl|exmaple|exampls|sample|samples|sampl|template|templates|templat)\b/.test(text);
  const asksMore = hasApproxKeyword(text, ['show', 'give', 'share', 'another', 'other', 'more', 'new']);
  const asksCreateLike = hasApproxKeyword(text, ['create', 'generate', 'build', 'make', 'do']);
  const referencesOption = /\b[1-9]\b|\b(option\s*[1-9])\b/.test(text);
  const asksOptions = hasApproxKeyword(text, ['option', 'options', 'choice', 'choices', 'idea', 'ideas']);
  const tokens = tokenizePrompt(text);
  const isStandaloneExampleAsk =
    tokens.length > 0
    && tokens.length <= 3
    && tokens.some((token) => isApproxTokenMatch(token, 'example') || isApproxTokenMatch(token, 'sample') || isApproxTokenMatch(token, 'template'));

  if (asksOptions) return true;
  return asksExample && (asksMore || asksCreateLike || referencesOption || isStandaloneExampleAsk);
}

export function classifyIntentDecision(request) {
  const text = request.promptNormalized;
  const lowered = text.toLowerCase();
  const artifactState = detectArtifactState(request);
  const hasPrior = request.hasPriorResult;
  const refineRequested = request.isRefinement;
  const scope = inferRefinementScope(text);

  if (!text) {
    return buildDecision({
      intent: 'question',
      confidence: 'low',
      reason: 'Empty prompt; clarification required.',
      mode: 'clarify',
      scope: 'unknown',
      artifactState,
      requiresContext: true,
      shouldAutoExecute: false,
    });
  }

  if (isFeedbackOrChitChatPrompt(text)) {
    return buildDecision({
      intent: 'feedback',
      confidence: 'high',
      reason: 'Feedback/chit-chat detected.',
      mode: 'respond',
      scope: 'unknown',
      artifactState,
      riskLevel: 'low',
      requiresContext: false,
      shouldAutoExecute: false,
    });
  }

  if (isDangerousPrompt(text)) {
    return buildDecision({
      intent: 'dangerous',
      confidence: 'high',
      reason: 'Potentially destructive operation detected; explicit confirmation required.',
      mode: 'clarify',
      scope: scope,
      artifactState,
      riskLevel: 'high',
      requiresContext: true,
      shouldAutoExecute: false,
    });
  }

  if (isUndoPrompt(text)) {
    return buildDecision({
      intent: 'undo',
      confidence: 'high',
      reason: 'Undo/revert request detected.',
      mode: hasPrior ? 'restore_previous' : 'clarify',
      scope: 'partial',
      artifactState,
      riskLevel: 'medium',
      requiresContext: true,
      shouldAutoExecute: hasPrior,
    });
  }

  if (isDiffPrompt(text)) {
    return buildDecision({
      intent: 'diff',
      confidence: 'high',
      reason: 'Comparison request detected.',
      mode: hasPrior ? 'respond' : 'clarify',
      scope: 'unknown',
      artifactState,
      riskLevel: 'low',
      requiresContext: true,
      shouldAutoExecute: false,
    });
  }

  if (isReviewOrVerificationPrompt(text)) {
    return buildDecision({
      intent: 'review',
      confidence: 'high',
      reason: 'Review/verification phrasing detected.',
      mode: 'respond',
      scope: 'unknown',
      artifactState,
      riskLevel: 'low',
      requiresContext: true,
      shouldAutoExecute: false,
    });
  }

  if (isLearningPrompt(text) && !hasCreationIntent(text)) {
    return buildDecision({
      intent: 'learning',
      confidence: 'high',
      reason: 'Educational/tutorial request detected.',
      mode: 'respond',
      scope: 'unknown',
      artifactState,
      riskLevel: 'low',
      requiresContext: false,
      shouldAutoExecute: false,
    });
  }

  if (isExampleRequestPrompt(text)) {
    return buildDecision({
      intent: 'question',
      secondaryIntent: 'create',
      confidence: 'high',
      reason: 'Example request detected; responding with additional examples.',
      mode: 'respond',
      scope: 'unknown',
      artifactState,
      riskLevel: 'low',
      requiresContext: false,
      shouldAutoExecute: false,
    });
  }

  if (isControlPrompt(text)) {
    return buildDecision({
      intent: 'control',
      confidence: 'high',
      reason: 'Execution control command detected.',
      mode: 'generate',
      scope: scope,
      artifactState,
      riskLevel: 'low',
      requiresContext: true,
      shouldAutoExecute: hasPrior,
    });
  }

  if (isDebugPrompt(text)) {
    return buildDecision({
      intent: 'debug',
      confidence: hasPrior ? 'high' : 'medium',
      reason: 'Debug/fix signal detected.',
      mode: hasPrior || !refineRequested ? 'generate' : 'clarify',
      scope: 'partial',
      artifactState,
      riskLevel: 'medium',
      requiresContext: true,
      shouldAutoExecute: hasPrior || !refineRequested,
    });
  }

  if (isOptimizePrompt(text)) {
    return buildDecision({
      intent: 'optimize',
      confidence: hasPrior ? 'high' : 'medium',
      reason: 'Optimization intent detected.',
      mode: hasPrior || !refineRequested ? 'generate' : 'clarify',
      scope: 'partial',
      artifactState,
      riskLevel: 'low',
      requiresContext: true,
      shouldAutoExecute: hasPrior || !refineRequested,
    });
  }

  if (isAlternativePrompt(text) && hasCreationIntent(text)) {
    return buildDecision({
      intent: 'alternative',
      secondaryIntent: refineRequested ? 'refine' : 'create',
      confidence: hasPrior ? 'high' : 'medium',
      reason: 'Alternative implementation requested.',
      mode: hasPrior ? 'generate_and_respond' : 'clarify',
      scope: 'partial',
      artifactState,
      riskLevel: 'low',
      requiresContext: true,
      shouldAutoExecute: hasPrior,
    });
  }

  if (isIntegratePrompt(text) && hasCreationIntent(text)) {
    return buildDecision({
      intent: 'integrate',
      confidence: 'high',
      reason: 'Integration request detected.',
      mode: 'generate',
      scope: request.isRefinement ? scope : 'full',
      artifactState,
      riskLevel: 'medium',
      requiresContext: false,
      shouldAutoExecute: true,
    });
  }

  if (hasExplicitGenerationCommand(text)) {
    const isRefine = request.isRefinement && request.hasPriorResult;
    const missingContextRefine = request.isRefinement && !request.hasPriorResult;
    if (missingContextRefine) {
      return buildDecision({
        intent: 'refine',
        confidence: 'high',
        reason: 'Refinement requested but no prior artifact context exists.',
        mode: 'clarify',
        scope: 'unknown',
        artifactState,
        riskLevel: 'low',
        requiresContext: true,
        shouldAutoExecute: false,
      });
    }

    return buildDecision({
      intent: isRefine ? 'refine' : 'create',
      confidence: 'high',
      reason: 'Explicit generation command detected.',
      mode: 'generate',
      scope: isRefine ? inferRefinementScope(text) : 'full',
      artifactState,
      riskLevel: 'low',
      requiresContext: isRefine,
      shouldAutoExecute: true,
    });
  }

  if (request.isRefinement && request.hasPriorResult && isQuestionLikePrompt(text)) {
    if (isAmbiguousPolishPrompt(text)) {
      return buildDecision({
        intent: 'question',
        confidence: 'medium',
        reason: 'Question-like but ambiguous polish request; clarification required before editing.',
        mode: 'clarify',
        scope: 'partial',
        artifactState,
        riskLevel: 'low',
        requiresContext: true,
        shouldAutoExecute: false,
      });
    }

    if (isArtifactInventoryQuestion(text)) {
      return buildDecision({
        intent: 'question',
        confidence: 'high',
        reason: 'Generated artifact inventory question detected; answer directly.',
        mode: 'respond',
        scope: 'unknown',
        artifactState,
        riskLevel: 'low',
        requiresContext: true,
        shouldAutoExecute: false,
      });
    }

    if (hasCreationIntent(text)) {
      return buildDecision({
        intent: 'question',
        secondaryIntent: 'refine',
        confidence: 'medium',
        reason: 'Question-like refinement with change verb detected; asking for clarification before generation.',
        mode: 'clarify',
        scope: scope,
        artifactState,
        riskLevel: 'low',
        requiresContext: true,
        shouldAutoExecute: false,
      });
    }

    return buildDecision({
      intent: 'question',
      confidence: 'high',
      reason: 'Question-like refinement detected; answering before any generation.',
      mode: 'respond',
      scope: 'unknown',
      artifactState,
      riskLevel: 'low',
      requiresContext: true,
      shouldAutoExecute: false,
    });
  }

  if (isQuestionLikePrompt(text) && !hasExplicitGenerationCommand(text)) {
    if (request.isRefinement && request.hasPriorResult && hasCreationIntent(text)) {
      return buildDecision({
        intent: 'question',
        secondaryIntent: 'refine',
        confidence: 'medium',
        reason: 'Question phrasing with weak creation signal; clarifying before generation.',
        mode: 'clarify',
        scope: scope,
        artifactState,
        riskLevel: 'low',
        requiresContext: true,
        shouldAutoExecute: false,
      });
    }

    return buildDecision({
      intent: 'question',
      confidence: 'high',
      reason: 'Question phrasing without explicit generation command.',
      mode: 'respond',
      scope: 'unknown',
      artifactState,
      riskLevel: 'low',
      requiresContext: false,
      shouldAutoExecute: false,
    });
  }

  if (isAmbiguousPolishPrompt(text)) {
    return buildDecision({
      intent: 'question',
      confidence: 'medium',
      reason: 'Ambiguous polish request detected; clarification required before editing.',
      mode: 'clarify',
      scope: request.hasPriorResult ? 'partial' : 'unknown',
      artifactState,
      riskLevel: 'low',
      requiresContext: request.hasPriorResult,
      shouldAutoExecute: false,
    });
  }

  if (hasCreationIntent(text)) {
    const missingContextRefine = request.isRefinement && !request.hasPriorResult;
    if (missingContextRefine) {
      return buildDecision({
        intent: 'refine',
        confidence: 'medium',
        reason: 'Creation/modification language detected but no prior artifact exists for refinement.',
        mode: 'clarify',
        scope: 'unknown',
        artifactState,
        riskLevel: 'low',
        requiresContext: true,
        shouldAutoExecute: false,
      });
    }

    const isRefine = request.isRefinement && request.hasPriorResult;
    return buildDecision({
      intent: isRefine ? 'refine' : 'create',
      confidence: 'medium',
      reason: 'Creation signal detected without explicit command framing.',
      mode: 'generate',
      scope: isRefine ? inferRefinementScope(text) : 'full',
      artifactState,
      riskLevel: 'low',
      requiresContext: isRefine,
      shouldAutoExecute: !missingContextRefine,
    });
  }

  if (/\b(need|want|should|could you)\b/.test(lowered)) {
    return buildDecision({
      intent: 'question',
      confidence: 'medium',
      reason: 'Advisory request inferred; generation not explicit.',
      mode: 'clarify',
      scope: 'unknown',
      artifactState,
      riskLevel: 'low',
      requiresContext: false,
      shouldAutoExecute: false,
    });
  }

  if (hasApproxKeyword(text, ['need', 'want', 'should'])) {
    return buildDecision({
      intent: 'question',
      confidence: 'medium',
      reason: 'Advisory request inferred from typo-tolerant NLP matching.',
      mode: 'clarify',
      scope: 'unknown',
      artifactState,
      riskLevel: 'low',
      requiresContext: false,
      shouldAutoExecute: false,
    });
  }

  return buildDecision({
    intent: 'question',
    confidence: 'low',
    reason: 'Ambiguous request; defaulting to clarification.',
    mode: 'clarify',
    scope: 'unknown',
    artifactState,
    riskLevel: 'low',
    requiresContext: false,
    shouldAutoExecute: false,
  });
}

function inferRefinementScope(text) {
  const lowered = text.toLowerCase();
  if (/\b(regenerate|rewrite|redo all|start over|from scratch|rebuild everything|entire|whole|all files|all components)\b/.test(lowered)) {
    return 'full';
  }
  if (/\b(only|just|partial|specific|targeted|single file|one file|this section|this component)\b/.test(lowered)) {
    return 'partial';
  }
  return 'partial';
}
