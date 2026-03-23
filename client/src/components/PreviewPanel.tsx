import { useMemo } from 'react';
import { Eye, FolderOpen, Rocket, ShieldCheck, Layers3 } from 'lucide-react';
import type { GeneratedArtifact, ComponentType } from '../types';
import { COMPONENT_TYPE_LABELS, COMPONENT_TYPE_COLORS } from '../types';

interface Props {
  artifacts: GeneratedArtifact[];
  componentType: ComponentType;
  summary: string;
  governorLimitNotes?: string[];
  deploymentSteps?: string[];
  dependencies?: string[];
}

const PREVIEW_STYLES = `
* { box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Salesforce Sans', Arial, sans-serif;
  font-size: 13px;
  background: #f3f2f2;
  margin: 0;
  padding: 10px;
  color: #3e3e3c;
}
.lwc-root { display: flex; flex-direction: column; gap: 0; width: 100%; max-width: none; margin: 0; }
.placeholder { color: #999; font-style: italic; background: #eee; padding: 0 3px; border-radius: 3px; }

/* SLDS Card */
.slds-card { background: #fff; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; }
.slds-card__header { padding: 12px 16px; border-bottom: 1px solid #e5e5e5; background: #fafaf9; }
.slds-card__header-title { font-size: 14px; font-weight: 700; color: #3e3e3c; margin: 0; }
.slds-card__body { padding: 16px; display: flex; flex-direction: column; gap: 0; }

/* SLDS Form */
.slds-form-element { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.slds-form-element:last-child { margin-bottom: 0; }
.slds-form-element__label { font-size: 12px; font-weight: 600; color: #3e3e3c; margin-bottom: 2px; }
.slds-form-element__control { width: 100%; }
.slds-input, .slds-textarea, .slds-select {
  width: 100%; padding: 8px 12px; border: 1px solid #c9c7c5; border-radius: 4px;
  font-size: 13px; background: #fff; color: #3e3e3c; outline: none; font-family: inherit;
  transition: border-color 0.15s; box-sizing: border-box; line-height: 1.4;
}
.slds-textarea { min-height: 80px; resize: vertical; }
.slds-input:focus, .slds-textarea:focus, .slds-select:focus {
  border-color: #1589ee;
  box-shadow: 0 0 0 2px rgba(21,137,238,0.2);
}
/* Ensure inputs in grid columns fill their column */
.slds-col .slds-form-element,
.slds-col .slds-input,
.slds-col .slds-form-element__control { width: 100%; }

/* SLDS Buttons */
.slds-button {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 8px 16px; border-radius: 4px; font-size: 13px; font-weight: 600;
  cursor: pointer; border: 1px solid; font-family: inherit; line-height: 1;
}
.slds-button_neutral { background: #fff; border-color: #c9c7c5; color: #0176d3; }
.slds-button_neutral:hover { background: #f3f2f2; }
.slds-button_brand { background: #0176d3; border-color: #0176d3; color: #fff; }
.slds-button_brand:hover { background: #014486; border-color: #014486; }
.slds-button_destructive { background: #ba0517; border-color: #ba0517; color: #fff; }
.slds-button_success { background: #2e844a; border-color: #2e844a; color: #fff; }
.slds-button-group { display: flex; gap: 8px; flex-wrap: wrap; }

/* SLDS Table */
.slds-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.slds-table th, .slds-table td { padding: 8px 12px; text-align: left; border: 1px solid #ddd; }
.slds-table thead tr { background: #f3f2f2; }
.slds-table thead th { font-weight: 600; }

/* SLDS Section / Fieldset */
.slds-section { border: 1px solid #e5e5e5; border-radius: 4px; padding: 12px; }
.slds-section-title { font-size: 13px; font-weight: 700; margin: 0 0 10px; }

/* Checkbox & Radio */
.slds-checkbox, .slds-radio { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; cursor: pointer; font-size: 13px; }
.slds-checkbox input, .slds-radio input { width: 14px; height: 14px; cursor: pointer; }

/* Spinner */
.slds-spinner_container { display: flex; justify-content: center; padding: 16px; }
.slds-spinner {
  width: 32px; height: 32px;
  border: 3px solid #0176d3;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Badge / Pill */
.slds-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; background: #e5e5e5; color: #3e3e3c; }

/* Required field asterisk */
.req { color: #c23934; font-size: 11px; }

/* Form shell — wraps the form surface without stomping SLDS utility classes */
.formShell {
  border: 1px solid #d8dde6;
  border-radius: 6px;
  padding: 1rem;
  background: #ffffff;
  width: 100%;
  max-width: none;
  margin: 0;
}

/* SLDS Grid (lightning-layout / lightning-layout-item / native slds divs)
   Uses proportional flex (flex: N) instead of percentage flex-basis so that
   the gap between columns doesn't cause items to overflow and wrap.
   Two items with flex:6 each → each gets (width - gap) / 2 → side-by-side. */
.slds-grid { display: flex; flex-wrap: wrap; gap: 12px; width: 100%; align-items: flex-start; }
.slds-gutters { gap: 12px; }
.slds-wrap { flex-wrap: wrap; }
.slds-col { flex: 1; min-width: 0; width: 0; }
.slds-grid > * { min-width: 0; }
.slds-grid > .slds-form-element { flex: 1; margin-bottom: 0; }
/* Proportional N-of-12 size classes — flex:N distributes space after gap */
.slds-size_1-of-12                     { flex: 1;  min-width: 0; width: 0; }
.slds-size_2-of-12                     { flex: 2;  min-width: 0; width: 0; }
.slds-size_3-of-12, .slds-size_1-of-4  { flex: 3;  min-width: 0; width: 0; }
.slds-size_4-of-12, .slds-size_1-of-3  { flex: 4;  min-width: 0; width: 0; }
.slds-size_5-of-12                     { flex: 5;  min-width: 0; width: 0; }
.slds-size_6-of-12, .slds-size_1-of-2  { flex: 6;  min-width: 0; width: 0; }
.slds-size_7-of-12                     { flex: 7;  min-width: 0; width: 0; }
.slds-size_8-of-12, .slds-size_2-of-3  { flex: 8;  min-width: 0; width: 0; }
.slds-size_9-of-12, .slds-size_3-of-4  { flex: 9;  min-width: 0; width: 0; }
.slds-size_10-of-12                    { flex: 10; min-width: 0; width: 0; }
.slds-size_11-of-12                    { flex: 11; min-width: 0; width: 0; }
.slds-size_12-of-12                    { flex: 12; min-width: 0; width: 0; }
/* SLDS Text headings */
.slds-text-heading_large  { font-size: 20px; font-weight: 700; color: #3e3e3c; line-height: 1.3; margin: 0; }
.slds-text-heading_medium { font-size: 16px; font-weight: 700; color: #3e3e3c; line-height: 1.4; margin: 0; }
.slds-text-heading_small  { font-size: 13px; font-weight: 700; color: #3e3e3c; line-height: 1.4; margin: 0; }
.slds-text-title          { font-size: 13px; font-weight: 600; color: #3e3e3c; margin: 0; }
.slds-text-body_regular   { font-size: 13px; color: #3e3e3c; }
.slds-text-body_small     { font-size: 12px; color: #706e6b; }

/* SLDS spacing utilities — vertical margin */
.slds-m-bottom_x-small, .slds-var-m-bottom_x-small { margin-bottom: 4px; }
.slds-m-bottom_small,   .slds-var-m-bottom_small   { margin-bottom: 8px; }
.slds-m-bottom_medium,  .slds-var-m-bottom_medium  { margin-bottom: 12px; }
.slds-m-bottom_large,   .slds-var-m-bottom_large   { margin-bottom: 24px; }
.slds-m-top_x-small,    .slds-var-m-top_x-small    { margin-top: 4px; }
.slds-m-top_small,      .slds-var-m-top_small      { margin-top: 8px; }
.slds-m-top_medium,     .slds-var-m-top_medium     { margin-top: 12px; }
.slds-m-top_large,      .slds-var-m-top_large      { margin-top: 24px; }
/* SLDS spacing utilities — padding */
.slds-var-m-around_medium, .slds-m-around_medium { padding: 12px; }
.slds-var-m-around_small,  .slds-m-around_small  { padding: 8px; }
.slds-var-m-around_large,  .slds-m-around_large  { padding: 24px; }
.slds-var-p-around_medium, .slds-p-around_medium { padding: 12px; }
.slds-var-p-around_small,  .slds-p-around_small  { padding: 8px; }
.preview-two-col-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
  align-items: start;
  margin-bottom: 12px;
}
@media (max-width: 900px) {
  .preview-two-col-row { grid-template-columns: 1fr; }
}
`;

function transformLwcHtml(html: string): string {
  let result = html.trim();

  const getAttr = (attrs: string, name: string): string => {
    const match = attrs.match(new RegExp(`\\b${name}="([^"]+)"`, 'i'));
    return match?.[1] || '';
  };

  const mergeClasses = (...parts: Array<string | undefined>): string =>
    parts
      .flatMap(part => (part || '').split(/\s+/))
      .map(token => token.trim())
      .filter(Boolean)
      .join(' ');

  // ── STEP 1: Transform <template> tags ──────────────────────────
  // Conditional templates → hidden div (static preview can't evaluate conditions;
  // hides error messages, loading states, empty-state banners, etc.)
  result = result.replace(/<template\b[^>]*\bif:(?:true|false)=\{[^}]+\}[^>]*>/gi, '<div style="display:none">');
  // For:each templates → plain div (shows one sample row)
  result = result.replace(/<template\b[^>]*\bfor:each=\{[^}]+\}[^>]*>/gi, '<div>');
  // Root template → main container; any other remaining templates → plain div
  let _isRootTemplate = true;
  result = result.replace(/<template\b[^>]*>/gi, () => {
    if (_isRootTemplate) { _isRootTemplate = false; return '<div class="lwc-root">'; }
    return '<div>';
  });
  result = result.replace(/<\/template>/gi, '</div>');

  // ── STEP 2: Strip LWC-only directive attributes ────────────────
  // Must happen before the generic attr={binding} strip below.
  result = result.replace(/\bfor:each=\{[^}]+\}\s*/g, '');
  result = result.replace(/\bfor:item="[^"]+"\s*/g, '');
  result = result.replace(/\bfor:index="[^"]+"\s*/g, '');
  result = result.replace(/\biterator:\w+=\{[^}]+\}\s*/g, '');
  result = result.replace(/\bkey=\{[^}]+\}\s*/g, '');
  result = result.replace(/\blwc:\w+(?:=(?:\{[^}]+\}|"[^"]*"))?\s*/g, '');

  // ── STEP 3: Strip event handler attributes ─────────────────────
  result = result.replace(/\s+on\w+=(?:\{[^}]+\}|"[^"]*")/g, '');

  // ── STEP 4: Strip ALL remaining attr={binding} patterns ────────
  // ⚠ CRITICAL: must run BEFORE lightning-* transforms AND before
  //   text {binding} replacement. Without this, attrs like
  //   value={accountName} become value=<span>…</span> which breaks
  //   the regex matching inside the lightning-* handlers below.
  result = result.replace(/\s+[\w:@.-]+=\{[^}]+\}/g, '');

  // ── STEP 5: Transform lightning-* components ───────────────────
  // Attrs are clean strings at this point (no {binding} left in them).

  // lightning-card
  result = result.replace(/<lightning-card([^>]*)>/gi, (_m, attrs) => {
    const title = (attrs.match(/title="([^"]+)"/i) || [])[1] || 'Card';
    return `<div class="slds-card"><div class="slds-card__header"><h2 class="slds-card__header-title">${title}</h2></div><div class="slds-card__body">`;
  });
  result = result.replace(/<\/lightning-card>/gi, '</div></div>');

  // lightning-input
  result = result.replace(/<lightning-input([^>]*)\/?>/gi, (_m, attrs) => {
    const label = getAttr(attrs, 'label');
    const rawType = getAttr(attrs, 'type') || 'text';
    const placeholder = getAttr(attrs, 'placeholder');
    const variant = getAttr(attrs, 'variant');
    const passthroughClass = getAttr(attrs, 'class');
    const required = /\brequired\b/i.test(attrs);
    const hideLabel = variant.toLowerCase() === 'label-hidden';
    // Map LWC-specific types to valid HTML input types
    const htmlType = rawType === 'currency' || rawType === 'percent' ? 'number'
      : rawType === 'datetime' ? 'datetime-local'
      : ['text','number','email','tel','date','password','search','url','time','checkbox'].includes(rawType)
        ? rawType : 'text';
    if (htmlType === 'checkbox') {
      return `<label class="${mergeClasses('slds-checkbox', passthroughClass)}"><input type="checkbox" />${label}</label>`;
    }
    const labelHtml = label && !hideLabel
      ? `<label class="slds-form-element__label">${label}${required ? ' <span class="req">*</span>' : ''}</label>`
      : '';
    const aria = hideLabel && label ? ` aria-label="${label}"` : '';
    return `<div class="${mergeClasses('slds-form-element', passthroughClass)}">${labelHtml}<div class="slds-form-element__control"><input type="${htmlType}" class="slds-input" placeholder="${placeholder}"${aria} /></div></div>`;
  });
  result = result.replace(/<\/lightning-input>/gi, '');

  // lightning-textarea
  result = result.replace(/<lightning-textarea([^>]*)\/?>/gi, (_m, attrs) => {
    const label = getAttr(attrs, 'label') || 'Textarea';
    const placeholder = getAttr(attrs, 'placeholder');
    const variant = getAttr(attrs, 'variant');
    const passthroughClass = getAttr(attrs, 'class');
    const hideLabel = variant.toLowerCase() === 'label-hidden';
    const labelHtml = hideLabel ? '' : `<label class="slds-form-element__label">${label}</label>`;
    const aria = hideLabel && label ? ` aria-label="${label}"` : '';
    return `<div class="${mergeClasses('slds-form-element', passthroughClass)}">${labelHtml}<div class="slds-form-element__control"><textarea class="slds-textarea" placeholder="${placeholder}"${aria}></textarea></div></div>`;
  });
  result = result.replace(/<\/lightning-textarea>/gi, '');

  // lightning-combobox
  result = result.replace(/<lightning-combobox([^>]*)\/?>/gi, (_m, attrs) => {
    const label = getAttr(attrs, 'label') || 'Select';
    const placeholder = getAttr(attrs, 'placeholder') || '-- Select an option --';
    const variant = getAttr(attrs, 'variant');
    const passthroughClass = getAttr(attrs, 'class');
    const hideLabel = variant.toLowerCase() === 'label-hidden';
    const labelHtml = hideLabel ? '' : `<label class="slds-form-element__label">${label}</label>`;
    const aria = hideLabel && label ? ` aria-label="${label}"` : '';
    return `<div class="${mergeClasses('slds-form-element', passthroughClass)}">${labelHtml}<div class="slds-form-element__control"><select class="slds-select"${aria}><option>${placeholder}</option></select></div></div>`;
  });
  result = result.replace(/<\/lightning-combobox>/gi, '');

  // lightning-select
  result = result.replace(/<lightning-select([^>]*)\/?>/gi, (_m, attrs) => {
    const label = getAttr(attrs, 'label') || 'Select';
    const variant = getAttr(attrs, 'variant');
    const passthroughClass = getAttr(attrs, 'class');
    const hideLabel = variant.toLowerCase() === 'label-hidden';
    const labelHtml = hideLabel ? '' : `<label class="slds-form-element__label">${label}</label>`;
    const aria = hideLabel && label ? ` aria-label="${label}"` : '';
    return `<div class="${mergeClasses('slds-form-element', passthroughClass)}">${labelHtml}<div class="slds-form-element__control"><select class="slds-select"${aria}><option>-- Select an option --</option></select></div></div>`;
  });
  result = result.replace(/<\/lightning-select>/gi, '');

  // lightning-button
  result = result.replace(/<lightning-button([^>]*)\/?>/gi, (_m, attrs) => {
    const label = getAttr(attrs, 'label') || 'Button';
    const variant = getAttr(attrs, 'variant') || 'neutral';
    const passthroughClass = getAttr(attrs, 'class');
    const cls = variant === 'brand' ? 'slds-button slds-button_brand'
      : variant === 'destructive' ? 'slds-button slds-button_destructive'
      : variant === 'success' ? 'slds-button slds-button_success'
      : 'slds-button slds-button_neutral';
    return `<button class="${mergeClasses(cls, passthroughClass)}">${label}</button>`;
  });
  result = result.replace(/<\/lightning-button>/gi, '');

  // lightning-button-group
  result = result.replace(/<lightning-button-group([^>]*)>/gi, '<div class="slds-button-group">');
  result = result.replace(/<\/lightning-button-group>/gi, '</div>');

  // lightning-datatable
  result = result.replace(/<lightning-datatable([^>]*)\/?>/gi, () =>
    `<table class="slds-table"><thead><tr><th>Column 1</th><th>Column 2</th><th>Column 3</th></tr></thead><tbody><tr><td>Sample</td><td>Data</td><td>Row 1</td></tr><tr><td>Sample</td><td>Data</td><td>Row 2</td></tr></tbody></table>`
  );
  result = result.replace(/<\/lightning-datatable>/gi, '');

  // lightning-spinner — hidden in static preview (it's a loading state indicator)
  result = result.replace(/<lightning-spinner([^>]*)\/?>/gi, () =>
    `<div class="slds-spinner_container" style="display:none"><div class="slds-spinner"></div></div>`
  );
  result = result.replace(/<\/lightning-spinner>/gi, '');

  // lightning-badge
  result = result.replace(/<lightning-badge([^>]*)\/?>/gi, (_m, attrs) => {
    const label = (attrs.match(/label="([^"]+)"/i) || [])[1] || 'Badge';
    return `<span class="slds-badge">${label}</span>`;
  });
  result = result.replace(/<\/lightning-badge>/gi, '');

  // lightning-radio-group
  result = result.replace(/<lightning-radio-group([^>]*)\/?>/gi, (_m, attrs) => {
    const label = (attrs.match(/label="([^"]+)"/i) || [])[1] || 'Options';
    return `<div class="slds-form-element"><label class="slds-form-element__label">${label}</label><div style="display:flex;flex-direction:column;gap:4px;margin-top:4px"><label class="slds-radio"><input type="radio" name="rg_${label}" /> Option 1</label><label class="slds-radio"><input type="radio" name="rg_${label}" /> Option 2</label></div></div>`;
  });
  result = result.replace(/<\/lightning-radio-group>/gi, '');

  // lightning-checkbox-group
  result = result.replace(/<lightning-checkbox-group([^>]*)\/?>/gi, (_m, attrs) => {
    const label = (attrs.match(/label="([^"]+)"/i) || [])[1] || 'Options';
    return `<div class="slds-form-element"><label class="slds-form-element__label">${label}</label><div style="display:flex;flex-direction:column;gap:4px;margin-top:4px"><label class="slds-checkbox"><input type="checkbox" /> Option 1</label><label class="slds-checkbox"><input type="checkbox" /> Option 2</label></div></div>`;
  });
  result = result.replace(/<\/lightning-checkbox-group>/gi, '');

  // lightning-layout (grid container)
  // Preserve any extra class="" value from the original (e.g. slds-gutters)
  result = result.replace(/<lightning-layout([^>]*)>/gi, (_m, attrs) => {
    const multipleRows = /\bmultiple-rows\b/i.test(attrs);
    const extraClass = (attrs.match(/\bclass="([^"]+)"/i) || [])[1] || '';
    const classes = ['slds-grid'];
    if (multipleRows) classes.push('slds-wrap');
    if (extraClass) classes.push(...extraClass.split(/\s+/).filter(Boolean));
    return `<div class="${classes.join(' ')}">`;
  });
  result = result.replace(/<\/lightning-layout>/gi, '</div>');

  // lightning-layout-item (grid cell)
  // Proportional flex: N so columns share space correctly regardless of gap.
  // Also handles padding="around-small|medium|large" to apply gutter padding inside items.
  result = result.replace(/<lightning-layout-item([^>]*)>/gi, (_m, attrs) => {
    const sizeStr = (attrs.match(/\bsize="([^"]+)"/i) || [])[1] || '';
    const size = parseInt(sizeStr, 10);
    const paddingVal = (attrs.match(/\bpadding="([^"]+)"/i) || [])[1] || '';
    const passthroughClass = (attrs.match(/\bclass="([^"]+)"/i) || [])[1] || '';
    const styles: string[] = ['min-width: 0', 'width: 0', 'box-sizing: border-box'];
    if (size > 0 && size <= 12) styles.unshift(`flex: ${size}`);
    if (paddingVal.includes('x-small'))  styles.push('padding: 4px');
    else if (paddingVal.includes('small'))  styles.push('padding: 8px');
    else if (paddingVal.includes('medium')) styles.push('padding: 12px');
    else if (paddingVal.includes('large'))  styles.push('padding: 16px');
    return `<div class="${mergeClasses('slds-col', passthroughClass)}" style="${styles.join('; ')}">`;
  });
  result = result.replace(/<\/lightning-layout-item>/gi, '</div>');

  // <slot>
  result = result.replace(/<slot\b[^>]*\/?>/gi, '');
  result = result.replace(/<\/slot>/gi, '');

  // Any remaining lightning-* tags
  result = result.replace(/<(lightning-[\w-]+)([^>]*)>/gi, '<div data-lwc="$1">');
  result = result.replace(/<\/(lightning-[\w-]+)>/gi, '</div>');

  // ── STEP 6: Replace {binding} in text content ──────────────────
  // All attr={binding} have already been stripped above, so this
  // only touches actual text nodes now — no more broken HTML.
  result = result.replace(/\{([^}]+)\}/g, (_, key) => {
    const label = key.trim().split('.').pop() || key.trim();
    return `<span class="placeholder">${label}</span>`;
  });

  return result;
}

export default function PreviewPanel({
  artifacts,
  componentType,
  summary,
  governorLimitNotes = [],
  deploymentSteps = [],
  dependencies = [],
}: Props) {
  const isLwc = componentType === 'lwc';
  const layoutAssistScript = useMemo(
    () =>
      `(function () {
  var normalize = function (value) {
    return (value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  };

  var findHeading = function (text) {
    var selector = 'h1,h2,h3,h4,h5,h6,legend,.slds-section-title,.slds-text-heading_large,.slds-text-heading_medium,.slds-text-heading_small,.slds-text-title';
    var nodes = Array.prototype.slice.call(document.querySelectorAll(selector));
    return nodes.find(function (node) {
      return normalize(node.textContent) === text;
    }) || null;
  };

  var findSectionBlock = function (heading) {
    var current = heading;
    while (current && current !== document.body) {
      if (current.classList && (current.classList.contains('slds-section') || current.classList.contains('slds-card') || current.classList.contains('slds-col'))) {
        return current;
      }
      current = current.parentElement;
    }
    return heading.parentElement;
  };

  var companyHeading = findHeading('company information');
  var loanHeading = findHeading('loan request details');
  if (!companyHeading || !loanHeading) return;

  var companyBlock = findSectionBlock(companyHeading);
  var loanBlock = findSectionBlock(loanHeading);
  if (!companyBlock || !loanBlock || companyBlock === loanBlock) return;
  if (companyBlock.contains(loanBlock) || loanBlock.contains(companyBlock)) return;

  var root = companyBlock.parentElement;
  if (!root || root !== loanBlock.parentElement) return;

  var row = document.createElement('div');
  row.className = 'preview-two-col-row';
  root.insertBefore(row, companyBlock);
  row.appendChild(companyBlock);
  row.appendChild(loanBlock);
})();`,
    []
  );

  const srcdoc = useMemo(() => {
    if (!isLwc) return '';
    const htmlArtifacts = artifacts.filter(a => a.type === 'LWC_HTML');
    const parentHtmlArtifact = htmlArtifacts.find(a => /<c-[a-z0-9-]+\b/i.test(a.content || ''));
    const htmlArtifact = parentHtmlArtifact || htmlArtifacts[0];
    const cssArtifact = artifacts.find(
      a => a.type === 'LWC_CSS' && htmlArtifact && (a.name === htmlArtifact.name || (a as { bundle?: string }).bundle === (htmlArtifact as { bundle?: string }).bundle)
    ) || artifacts.find(a => a.type === 'LWC_CSS');
    if (!htmlArtifact) return '';

    const transformedHtml = transformLwcHtml(htmlArtifact.content);
    const componentCss = cssArtifact?.content || '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${PREVIEW_STYLES}
${componentCss}
  </style>
</head>
<body>${transformedHtml}<script>${layoutAssistScript}</script></body>
</html>`;
  }, [artifacts, isLwc, layoutAssistScript]);

  if (isLwc) {
    const hasHtml = artifacts.some(a => a.type === 'LWC_HTML');
    if (!hasHtml) {
      return (
        <div className="h-full flex items-center justify-center text-slate-500 gap-2">
          <Eye size={20} />
          <span className="text-sm">No HTML template found for preview</span>
        </div>
      );
    }
    return (
      <div className="h-full overflow-hidden bg-[#f3f2f2]">
        <iframe
          srcDoc={srcdoc}
          sandbox="allow-scripts"
          className="w-full h-full border-0"
          title="LWC Component Preview"
        />
      </div>
    );
  }

  // Non-LWC: structured summary card
  return (
    <div className="h-full overflow-y-auto scrollbar-hidden p-4 [font-family:'Aptos',-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif] bg-slate-50">
      <div className="space-y-4">
        <div className="rounded-2xl border border-[#2f3b63] bg-[#1f2742] p-4">
          <span className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-full mb-3 ${COMPONENT_TYPE_COLORS[componentType]}`}>
            {COMPONENT_TYPE_LABELS[componentType]}
          </span>
          <p className="text-xs text-[#eef2ff] leading-relaxed">{summary}</p>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-[#2f3b63] bg-[#1f2742] p-4">
              <h3 className="text-[15px] font-semibold text-[#f3f6ff] mb-3 flex items-center gap-2.5">
                <FolderOpen size={18} className="text-[#a7b6ff]" /> Generated Files
            </h3>
            <ul className="space-y-2.5">
              {artifacts.map((a, i) => (
                <li key={i} className="flex items-center gap-2.5 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/90 shrink-0" />
                  <span className="text-[#edf2ff] font-mono">{a.name}{a.extension}</span>
                  <span className="text-[#b7c2ea] ml-auto">{a.type}</span>
                </li>
              ))}
            </ul>
          </div>

          {deploymentSteps.length > 0 && (
            <div className="rounded-2xl border border-[#2f3b63] bg-[#1f2742] p-4">
              <h3 className="text-[15px] font-semibold text-[#f3f6ff] mb-3 flex items-center gap-2.5">
                <Rocket size={18} className="text-[#c3a5ff]" /> Deployment Steps
              </h3>
              <ol className="space-y-2.5 list-none">
                {deploymentSteps.map((step, i) => (
                  <li key={i} className="text-xs text-[#eef2ff] flex gap-2.5">
                    <span className="text-[#b785ff] shrink-0">›</span>
                    <span>Step {i + 1}: {step.replace(/^step\s*\d+:?\s*/i, '')}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {governorLimitNotes.length > 0 && (
            <div className="rounded-2xl border border-[#4e4560] bg-[#1f2742] p-4">
              <h3 className="text-[15px] font-semibold text-[#f3f6ff] mb-3 flex items-center gap-2.5">
                <ShieldCheck size={18} className="text-[#ffb454]" /> Governor Limits Notes
              </h3>
              <ul className="space-y-2.5">
                {governorLimitNotes.map((note, i) => (
                  <li key={i} className="text-xs text-[#eef2ff] flex gap-2.5">
                    <span className="text-[#ffb454] shrink-0">›</span>
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {dependencies.length > 0 && (
            <div className="rounded-2xl border border-[#2f3b63] bg-[#1f2742] p-4">
              <h3 className="text-[15px] font-semibold text-[#f3f6ff] mb-3 flex items-center gap-2.5">
                <Layers3 size={18} className="text-[#7aa2ff]" /> Dependencies
              </h3>
              <ul className="space-y-2">
                {dependencies.map((dep, i) => (
                  <li key={i} className="text-xs text-[#eef2ff] flex gap-2.5">
                    <span className="text-[#7aa2ff] shrink-0">›</span>
                    {dep}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
