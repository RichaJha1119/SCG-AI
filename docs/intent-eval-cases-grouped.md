# Intent Eval Cases (Grouped)

Source: client/scripts/intent-eval-cases.json

Total cases: 56
Total groups: 14

## alternative

Cases: 1

| Name | Action | Mode | Scope | Tone | Structure | Archetype | User State | Ack Prefix | Component Type | Prompt |
|------|--------|------|-------|------|-----------|-----------|------------|------------|----------------|--------|
| Alternative approach should generate and respond | generate_and_respond | generate_and_respond | partial |  |  |  |  |  | apex-class | show me another way to implement this |

## control

Cases: 1

| Name | Action | Mode | Scope | Tone | Structure | Archetype | User State | Ack Prefix | Component Type | Prompt |
|------|--------|------|-------|------|-----------|-----------|------------|------------|----------------|--------|
| Retry generation control should generate | generate | generate | partial |  |  |  |  |  | lwc | try again but keep the same structure |

## create

Cases: 5

| Name | Action | Mode | Scope | Tone | Structure | Archetype | User State | Ack Prefix | Component Type | Prompt |
|------|--------|------|-------|------|-----------|-----------|------------|------------|----------------|--------|
| Explicit create command should generate | generate |  |  |  |  |  |  |  | lwc | Create a Lightning Web Component that shows account balance summary |
| Lets build should create | generate |  |  |  |  |  |  |  | rest-api | let's build a rest endpoint for account and contacts |
| Build imperative should create | generate |  |  |  |  |  |  |  | batch | build a batch job to archive old logs |
| Could you create should create | generate |  |  |  |  |  |  |  | apex-trigger | could you create an apex trigger on account |
| Generate end to end integration bundle | generate | generate | full |  |  |  |  |  | lwc | build lwc apex controller and test class for account search |

## dangerous

Cases: 1

| Name | Action | Mode | Scope | Tone | Structure | Archetype | User State | Ack Prefix | Component Type | Prompt |
|------|--------|------|-------|------|-----------|-----------|------------|------------|----------------|--------|
| Risky deletion request should clarify | clarify | clarify | partial |  |  |  |  |  | lwc | remove all validation and delete the extra fields |

## debug

Cases: 1

| Name | Action | Mode | Scope | Tone | Structure | Archetype | User State | Ack Prefix | Component Type | Prompt |
|------|--------|------|-------|------|-----------|-----------|------------|------------|----------------|--------|
| Fix runtime error should debug generate | generate | generate | partial |  |  |  |  |  | apex-class | this throws a null pointer exception, fix it |

## diff

Cases: 2

| Name | Action | Mode | Scope | Tone | Structure | Archetype | User State | Ack Prefix | Component Type | Prompt |
|------|--------|------|-------|------|-----------|-----------|------------|------------|----------------|--------|
| Compare versions should respond | respond | respond | unknown |  |  |  |  |  | lwc | compare the current version with the previous one |
| Diff without context should clarify | clarify | clarify | unknown |  |  |  |  |  | lwc | show differences from previous version |

## feedback

Cases: 5

| Name | Action | Mode | Scope | Tone | Structure | Archetype | User State | Ack Prefix | Component Type | Prompt |
|------|--------|------|-------|------|-----------|-----------|------------|------------|----------------|--------|
| Feedback should not generate | respond |  |  |  |  |  |  |  | lwc | looks good thanks |
| Thank you only should feedback | respond |  |  |  |  |  |  |  | lwc | thank you |
| Single cool token should feedback | respond |  |  |  |  |  |  |  | lwc | cool |
| Works great should feedback | respond |  |  |  |  |  |  |  | lwc | works great |
| This is good should feedback | respond |  |  |  |  |  |  |  | lwc | this is good |

## integrate

Cases: 1

| Name | Action | Mode | Scope | Tone | Structure | Archetype | User State | Ack Prefix | Component Type | Prompt |
|------|--------|------|-------|------|-----------|-----------|------------|------------|----------------|--------|
| Integrate systems request should generate | generate | generate | full |  |  |  |  |  | integration | integrate this with salesforce and erp sync |

## learning

Cases: 1

| Name | Action | Mode | Scope | Tone | Structure | Archetype | User State | Ack Prefix | Component Type | Prompt |
|------|--------|------|-------|------|-----------|-----------|------------|------------|----------------|--------|
| Learning mode question should respond | respond | respond | unknown |  |  |  |  |  | integration | teach me step by step how this retry logic works |

## optimize

Cases: 1

| Name | Action | Mode | Scope | Tone | Structure | Archetype | User State | Ack Prefix | Component Type | Prompt |
|------|--------|------|-------|------|-----------|-----------|------------|------------|----------------|--------|
| Optimize query usage should generate partial | generate | generate | partial |  |  |  |  |  | apex-class | optimize this to avoid too many SOQL queries |

## question

Cases: 20

| Name | Action | Mode | Scope | Tone | Structure | Archetype | User State | Ack Prefix | Component Type | Prompt |
|------|--------|------|-------|------|-----------|-----------|------------|------------|----------------|--------|
| List number of created files should respond | respond |  |  | collaborative | answer_only | answer_direct | neutral |  | apex-trigger | can you list no of files craeted with file names |
| Ambiguous advisory should clarify | clarify |  |  |  |  |  |  |  | lwc | we should probably improve this |
| Question with add verb should clarify | clarify |  |  | collaborative | clarify_with_options | clarify_narrow_options | unsure | Good question | lwc | can we add area code only without changing anything else? |
| Could it be partial should clarify | respond |  |  |  |  |  |  |  | lwc | could it be a partial creation right |
| Need creation without command should clarify | clarify |  |  |  |  |  |  |  | apex-trigger | need a trigger for duplicate leads |
| How question no command should respond | respond |  |  |  |  |  |  |  | integration | how does the retry logic work now |
| Could you explain should respond | respond |  |  | collaborative | acknowledge_then_answer | acknowledge_answer | neutral | Good question | lwc | could you explain why this changed |
| Uncertain request should sound consultative | clarify |  |  | collaborative | clarify_with_options | clarify_narrow_options | unsure | Good question | lwc | maybe clean this up a bit? |
| Can we refactor maybe should clarify | clarify |  |  |  |  |  |  |  | apex-class | can we refactor this maybe |
| Should we deploy question should respond | respond |  |  |  |  |  |  |  | rest-api | should we deploy this now |
| Show other examples should respond | respond |  |  |  |  |  |  |  | apex-trigger | can you show other examples too |
| Other example phrase should respond | respond |  |  |  |  |  |  |  | apex-trigger | other example of apex trigger |
| Standalone example token should respond | respond |  |  |  |  |  |  |  | apex-trigger | example |
| Misspelled example token should respond | respond |  |  |  |  |  |  |  | apex-trigger | exampl |
| Multi-word typo example request should respond | respond |  |  |  |  |  |  |  | apex-trigger | creat exampl 2 |
| Options request should respond with examples flow | respond |  |  |  |  |  |  |  | lwc | sure, options ?? |
| Typo-heavy options request should respond | respond |  |  |  |  |  |  |  | lwc | shw optons plz |
| Generated files question with typo should respond | respond |  |  |  |  |  |  |  | lwc | what all files are geenrated |
| Ambiguous polish should clarify | clarify | clarify | partial |  |  |  |  |  | lwc | clean this up |
| Question create hybrid should respond first | respond | respond | unknown |  |  |  |  |  | apex-class | what should we build for faster lead qualification |

## refine

Cases: 8

| Name | Action | Mode | Scope | Tone | Structure | Archetype | User State | Ack Prefix | Component Type | Prompt |
|------|--------|------|-------|------|-----------|-----------|------------|------------|----------------|--------|
| Explicit refine command should generate partial | generate |  | partial |  |  |  |  |  | lwc | please add an Area Code field to the contact section only |
| Explicit can you update should generate | generate |  | partial |  |  |  |  |  | lwc | can you update the contact card with area code field |
| Please regenerate from scratch should full refine | generate |  | full |  |  |  |  |  | lwc | please regenerate from scratch with cleaner layout |
| Make this better ambiguous should clarify | generate |  | partial |  |  |  |  |  | lwc | make this better |
| Minimal-change preference should be honored | generate |  | partial | direct | act_then_summarize | act_summarize | directive |  | apex-class | just update the validation part, leave everything else as is |
| Can you fix command should generate | generate |  | partial |  |  |  |  |  | apex-class | can you fix the deployment steps and update dependencies |
| Question with explicit please add should generate | generate |  | partial |  |  |  |  |  | lwc | please add a secondary contact section? |
| Refine without prior artifact should clarify | clarify | clarify | unknown |  |  |  |  |  | lwc | update the validation logic only |

## review

Cases: 7

| Name | Action | Mode | Scope | Tone | Structure | Archetype | User State | Ack Prefix | Component Type | Prompt |
|------|--------|------|-------|------|-----------|-----------|------------|------------|----------------|--------|
| Review phrasing should answer | respond |  |  |  |  |  |  |  | lwc | can you verify if existing applications is still there |
| Question-like refinement should not regenerate | respond |  |  | reassuring | acknowledge_then_explain | acknowledge_explain | frustrated | You're right | lwc | so when i asked to add an extra field why you did the creation all together, it could be partial right |
| Why did you regenerate should review | respond |  |  |  |  |  |  |  | lwc | why did you regenerate everything instead of partial update |
| Review last version should respond | respond |  |  |  |  |  |  |  | lwc | review the last version and tell me if validation is intact |
| Did you add should review | respond |  |  |  |  |  |  |  | lwc | did you add the area code field in v4 |
| Frustration should be acknowledged | respond |  |  | reassuring | acknowledge_then_explain | acknowledge_explain | frustrated | You're right | lwc | why did you change the whole thing when i asked for one field |
| What changed should review | respond |  |  |  |  |  |  |  | lwc | what changed from previous version |

## undo

Cases: 2

| Name | Action | Mode | Scope | Tone | Structure | Archetype | User State | Ack Prefix | Component Type | Prompt |
|------|--------|------|-------|------|-----------|-----------|------------|------------|----------------|--------|
| Undo last change should restore previous | restore_previous | restore_previous | partial |  |  |  |  |  | lwc | revert the last update |
| Undo without context should clarify | clarify | clarify | partial |  |  |  |  |  | lwc | undo that change |

## Notes

- This file is generated from client/scripts/intent-eval-cases.json.
- Grouping key: expectedIntent.
