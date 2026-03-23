import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const casesPath = path.join(__dirname, 'intent-eval-cases.json');
const docsDir = path.join(__dirname, '..', '..', 'docs');
const flatOutput = path.join(docsDir, 'intent-eval-cases.md');
const groupedOutput = path.join(docsDir, 'intent-eval-cases-grouped.md');

const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));

const esc = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();

function writeFlatReport() {
  const lines = [];
  lines.push('# Intent Eval Cases');
  lines.push('');
  lines.push('Source: client/scripts/intent-eval-cases.json');
  lines.push('');
  lines.push(`Total cases: ${cases.length}`);
  lines.push('');
  lines.push('| # | Name | Component Type | Refinement | Prior Result | Expected Intent | Expected Action | Expected Scope | Tone | Structure | Archetype | User State | Ack Prefix | Prompt |');
  lines.push('|---|------|----------------|------------|--------------|-----------------|-----------------|----------------|------|-----------|-----------|------------|------------|--------|');

  cases.forEach((c, i) => {
    lines.push(`| ${i + 1} | ${esc(c.name)} | ${esc(c.componentType)} | ${c.isRefinement ? 'yes' : 'no'} | ${c.hasPriorResult ? 'yes' : 'no'} | ${esc(c.expectedIntent)} | ${esc(c.expectedAction)} | ${esc(c.expectedRefinementScope || c.expectedScope || '')} | ${esc(c.expectedTone || '')} | ${esc(c.expectedStructure || '')} | ${esc(c.expectedArchetype || '')} | ${esc(c.expectedUserState || '')} | ${esc(c.expectedAcknowledgementPrefix || '')} | ${esc(c.prompt)} |`);
  });

  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- This file is generated from client/scripts/intent-eval-cases.json.');
  lines.push('- Update the JSON file first, then run npm run intent:docs --workspace=client.');

  fs.writeFileSync(flatOutput, lines.join('\n') + '\n', 'utf8');
}

function writeGroupedReport() {
  const grouped = new Map();
  for (const testCase of cases) {
    const key = String(testCase.expectedIntent || 'unknown');
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(testCase);
  }

  const orderedGroups = Array.from(grouped.keys()).sort();
  const lines = [];

  lines.push('# Intent Eval Cases (Grouped)');
  lines.push('');
  lines.push('Source: client/scripts/intent-eval-cases.json');
  lines.push('');
  lines.push(`Total cases: ${cases.length}`);
  lines.push(`Total groups: ${orderedGroups.length}`);
  lines.push('');

  for (const groupName of orderedGroups) {
    const entries = grouped.get(groupName);
    lines.push(`## ${groupName}`);
    lines.push('');
    lines.push(`Cases: ${entries.length}`);
    lines.push('');
    lines.push('| Name | Action | Mode | Scope | Tone | Structure | Archetype | User State | Ack Prefix | Component Type | Prompt |');
    lines.push('|------|--------|------|-------|------|-----------|-----------|------------|------------|----------------|--------|');
    for (const c of entries) {
      lines.push(`| ${esc(c.name)} | ${esc(c.expectedAction)} | ${esc(c.expectedMode || '')} | ${esc(c.expectedRefinementScope || c.expectedScope || '')} | ${esc(c.expectedTone || '')} | ${esc(c.expectedStructure || '')} | ${esc(c.expectedArchetype || '')} | ${esc(c.expectedUserState || '')} | ${esc(c.expectedAcknowledgementPrefix || '')} | ${esc(c.componentType)} | ${esc(c.prompt)} |`);
    }
    lines.push('');
  }

  lines.push('## Notes');
  lines.push('');
  lines.push('- This file is generated from client/scripts/intent-eval-cases.json.');
  lines.push('- Grouping key: expectedIntent.');

  fs.writeFileSync(groupedOutput, lines.join('\n') + '\n', 'utf8');
}

fs.mkdirSync(docsDir, { recursive: true });
writeFlatReport();
writeGroupedReport();

console.log(`Wrote ${flatOutput}`);
console.log(`Wrote ${groupedOutput}`);
console.log(`Processed ${cases.length} intent test cases.`);
