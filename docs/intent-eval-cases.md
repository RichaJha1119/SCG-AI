# Intent Eval Cases

Source: client/scripts/intent-eval-cases.json

Total cases: 56

| # | Name | Component Type | Refinement | Prior Result | Expected Intent | Expected Action | Expected Scope | Tone | Structure | Archetype | User State | Ack Prefix | Prompt |
|---|------|----------------|------------|--------------|-----------------|-----------------|----------------|------|-----------|-----------|------------|------------|--------|
| 1 | Feedback should not generate | lwc | yes | yes | feedback | respond |  |  |  |  |  |  | looks good thanks |
| 2 | Review phrasing should answer | lwc | yes | yes | review | respond |  |  |  |  |  |  | can you verify if existing applications is still there |
| 3 | Question-like refinement should not regenerate | lwc | yes | yes | review | respond |  | reassuring | acknowledge_then_explain | acknowledge_explain | frustrated | You're right | so when i asked to add an extra field why you did the creation all together, it could be partial right |
| 4 | List number of created files should respond | apex-trigger | yes | yes | question | respond |  | collaborative | answer_only | answer_direct | neutral |  | can you list no of files craeted with file names |
| 5 | Explicit create command should generate | lwc | no | no | create | generate |  |  |  |  |  |  | Create a Lightning Web Component that shows account balance summary |
| 6 | Explicit refine command should generate partial | lwc | yes | yes | refine | generate | partial |  |  |  |  |  | please add an Area Code field to the contact section only |
| 7 | Ambiguous advisory should clarify | lwc | yes | yes | question | clarify |  |  |  |  |  |  | we should probably improve this |
| 8 | Why did you regenerate should review | lwc | yes | yes | review | respond |  |  |  |  |  |  | why did you regenerate everything instead of partial update |
| 9 | Question with add verb should clarify | lwc | yes | yes | question | clarify |  | collaborative | clarify_with_options | clarify_narrow_options | unsure | Good question | can we add area code only without changing anything else? |
| 10 | Could it be partial should clarify | lwc | yes | yes | question | respond |  |  |  |  |  |  | could it be a partial creation right |
| 11 | Review last version should respond | lwc | yes | yes | review | respond |  |  |  |  |  |  | review the last version and tell me if validation is intact |
| 12 | Explicit can you update should generate | lwc | yes | yes | refine | generate | partial |  |  |  |  |  | can you update the contact card with area code field |
| 13 | Please regenerate from scratch should full refine | lwc | yes | yes | refine | generate | full |  |  |  |  |  | please regenerate from scratch with cleaner layout |
| 14 | Lets build should create | rest-api | no | no | create | generate |  |  |  |  |  |  | let's build a rest endpoint for account and contacts |
| 15 | Need creation without command should clarify | apex-trigger | no | no | question | clarify |  |  |  |  |  |  | need a trigger for duplicate leads |
| 16 | Make this better ambiguous should clarify | lwc | yes | yes | refine | generate | partial |  |  |  |  |  | make this better |
| 17 | Thank you only should feedback | lwc | yes | yes | feedback | respond |  |  |  |  |  |  | thank you |
| 18 | Did you add should review | lwc | yes | yes | review | respond |  |  |  |  |  |  | did you add the area code field in v4 |
| 19 | How question no command should respond | integration | no | yes | question | respond |  |  |  |  |  |  | how does the retry logic work now |
| 20 | Could you explain should respond | lwc | yes | yes | question | respond |  | collaborative | acknowledge_then_answer | acknowledge_answer | neutral | Good question | could you explain why this changed |
| 21 | Frustration should be acknowledged | lwc | yes | yes | review | respond |  | reassuring | acknowledge_then_explain | acknowledge_explain | frustrated | You're right | why did you change the whole thing when i asked for one field |
| 22 | Minimal-change preference should be honored | apex-class | yes | yes | refine | generate | partial | direct | act_then_summarize | act_summarize | directive |  | just update the validation part, leave everything else as is |
| 23 | Uncertain request should sound consultative | lwc | yes | yes | question | clarify |  | collaborative | clarify_with_options | clarify_narrow_options | unsure | Good question | maybe clean this up a bit? |
| 24 | Can you fix command should generate | apex-class | yes | yes | refine | generate | partial |  |  |  |  |  | can you fix the deployment steps and update dependencies |
| 25 | Single cool token should feedback | lwc | yes | yes | feedback | respond |  |  |  |  |  |  | cool |
| 26 | Question with explicit please add should generate | lwc | yes | yes | refine | generate | partial |  |  |  |  |  | please add a secondary contact section? |
| 27 | What changed should review | lwc | yes | yes | review | respond |  |  |  |  |  |  | what changed from previous version |
| 28 | Can we refactor maybe should clarify | apex-class | yes | yes | question | clarify |  |  |  |  |  |  | can we refactor this maybe |
| 29 | Build imperative should create | batch | no | no | create | generate |  |  |  |  |  |  | build a batch job to archive old logs |
| 30 | Could you create should create | apex-trigger | no | no | create | generate |  |  |  |  |  |  | could you create an apex trigger on account |
| 31 | Works great should feedback | lwc | yes | yes | feedback | respond |  |  |  |  |  |  | works great |
| 32 | Should we deploy question should respond | rest-api | no | yes | question | respond |  |  |  |  |  |  | should we deploy this now |
| 33 | This is good should feedback | lwc | yes | yes | feedback | respond |  |  |  |  |  |  | this is good |
| 34 | Show other examples should respond | apex-trigger | yes | yes | question | respond |  |  |  |  |  |  | can you show other examples too |
| 35 | Other example phrase should respond | apex-trigger | yes | yes | question | respond |  |  |  |  |  |  | other example of apex trigger |
| 36 | Standalone example token should respond | apex-trigger | yes | yes | question | respond |  |  |  |  |  |  | example |
| 37 | Misspelled example token should respond | apex-trigger | yes | yes | question | respond |  |  |  |  |  |  | exampl |
| 38 | Multi-word typo example request should respond | apex-trigger | yes | yes | question | respond |  |  |  |  |  |  | creat exampl 2 |
| 39 | Options request should respond with examples flow | lwc | yes | yes | question | respond |  |  |  |  |  |  | sure, options ?? |
| 40 | Typo-heavy options request should respond | lwc | yes | yes | question | respond |  |  |  |  |  |  | shw optons plz |
| 41 | Generated files question with typo should respond | lwc | yes | yes | question | respond |  |  |  |  |  |  | what all files are geenrated |
| 42 | Undo last change should restore previous | lwc | yes | yes | undo | restore_previous | partial |  |  |  |  |  | revert the last update |
| 43 | Compare versions should respond | lwc | yes | yes | diff | respond | unknown |  |  |  |  |  | compare the current version with the previous one |
| 44 | Fix runtime error should debug generate | apex-class | yes | yes | debug | generate | partial |  |  |  |  |  | this throws a null pointer exception, fix it |
| 45 | Optimize query usage should generate partial | apex-class | yes | yes | optimize | generate | partial |  |  |  |  |  | optimize this to avoid too many SOQL queries |
| 46 | Alternative approach should generate and respond | apex-class | yes | yes | alternative | generate_and_respond | partial |  |  |  |  |  | show me another way to implement this |
| 47 | Generate end to end integration bundle | lwc | no | no | create | generate | full |  |  |  |  |  | build lwc apex controller and test class for account search |
| 48 | Refine without prior artifact should clarify | lwc | yes | no | refine | clarify | unknown |  |  |  |  |  | update the validation logic only |
| 49 | Ambiguous polish should clarify | lwc | yes | yes | question | clarify | partial |  |  |  |  |  | clean this up |
| 50 | Retry generation control should generate | lwc | yes | yes | control | generate | partial |  |  |  |  |  | try again but keep the same structure |
| 51 | Risky deletion request should clarify | lwc | yes | yes | dangerous | clarify | partial |  |  |  |  |  | remove all validation and delete the extra fields |
| 52 | Learning mode question should respond | integration | no | yes | learning | respond | unknown |  |  |  |  |  | teach me step by step how this retry logic works |
| 53 | Integrate systems request should generate | integration | no | no | integrate | generate | full |  |  |  |  |  | integrate this with salesforce and erp sync |
| 54 | Undo without context should clarify | lwc | yes | no | undo | clarify | partial |  |  |  |  |  | undo that change |
| 55 | Diff without context should clarify | lwc | yes | no | diff | clarify | unknown |  |  |  |  |  | show differences from previous version |
| 56 | Question create hybrid should respond first | apex-class | no | no | question | respond | unknown |  |  |  |  |  | what should we build for faster lead qualification |

## Notes

- This file is generated from client/scripts/intent-eval-cases.json.
- Update the JSON file first, then run npm run intent:docs --workspace=client.
