/**
 * Attachment & JSON-parsing tests for aiService.js
 * Tests the two critical functions that make image/doc input work:
 *   1. extractJSON  — parses AI responses in various formats
 *   2. buildUserContent — turns attachments into an OpenAI content payload
 *
 * Run:  npm test  (from server/ directory)
 *       node --test test/aiService.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractJSON, buildUserContent } from '../services/aiService.js';

const FAKE_BASE64 = Buffer.from('fake-image-bytes').toString('base64');

// ─────────────────────────────────────────────────────────────────────────────
// extractJSON
// ─────────────────────────────────────────────────────────────────────────────
describe('extractJSON', () => {
  const VALID = {
    components: [],
    summary: 'test component',
    governorLimitNotes: [],
    deploymentSteps: [],
    dependencies: [],
  };

  it('parses a plain JSON string', () => {
    const result = extractJSON(JSON.stringify(VALID));
    assert.equal(result.summary, 'test component');
  });

  it('parses JSON wrapped in ```json block (GPT sometimes adds this)', () => {
    const input = '```json\n' + JSON.stringify(VALID) + '\n```';
    const result = extractJSON(input);
    assert.equal(result.summary, 'test component');
  });

  it('parses JSON wrapped in a plain ``` block', () => {
    const input = '```\n' + JSON.stringify(VALID) + '\n```';
    const result = extractJSON(input);
    assert.equal(result.summary, 'test component');
  });

  it('extracts JSON embedded in surrounding prose', () => {
    const input = 'Sure, here is the result: ' + JSON.stringify({ summary: 'embedded' }) + ' Hope that helps!';
    const result = extractJSON(input);
    assert.equal(result.summary, 'embedded');
  });

  it('handles leading/trailing whitespace', () => {
    const result = extractJSON('   ' + JSON.stringify(VALID) + '   ');
    assert.equal(result.summary, 'test component');
  });

  it('throws a meaningful error on unparseable input', () => {
    assert.throws(
      () => extractJSON('this is definitely not json'),
      { message: /Could not parse/ },
    );
  });

  it('throws on empty string', () => {
    assert.throws(() => extractJSON(''), { message: /Could not parse/ });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildUserContent — no attachments
// ─────────────────────────────────────────────────────────────────────────────
describe('buildUserContent — no attachments', () => {
  it('returns the prompt as-is when there are no attachments', async () => {
    const content = await buildUserContent('Generate an apex trigger', []);
    assert.equal(typeof content, 'string');
    assert.equal(content, 'Generate an apex trigger');
  });

  it('vision flag is FALSE (string content → use response_format)', async () => {
    const content = await buildUserContent('prompt', []);
    assert.equal(Array.isArray(content), false); // hasImages = false → json_object mode
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildUserContent — text / markdown attachments
// ─────────────────────────────────────────────────────────────────────────────
describe('buildUserContent — text attachments', () => {
  it('prepends a text file as a labelled context block', async () => {
    const content = await buildUserContent('My prompt', [
      { kind: 'text', name: 'requirements.txt', content: 'Field: Participant Name\nField: Age' },
    ]);
    assert.equal(typeof content, 'string');
    assert.ok(content.includes('My prompt'), 'original prompt preserved');
    assert.ok(content.includes('ATTACHED DOCUMENT: requirements.txt'), 'document label present');
    assert.ok(content.includes('Participant Name'), 'document content included');
  });

  it('still returns a string (not array) — no vision overhead for text-only', async () => {
    const content = await buildUserContent('prompt', [
      { kind: 'text', name: 'notes.md', content: '# Notes\n- bullet' },
    ]);
    assert.equal(Array.isArray(content), false);
  });

  it('handles multiple text files', async () => {
    const content = await buildUserContent('prompt', [
      { kind: 'text', name: 'a.txt', content: 'first file' },
      { kind: 'text', name: 'b.txt', content: 'second file' },
    ]);
    assert.ok(content.includes('ATTACHED DOCUMENT: a.txt'));
    assert.ok(content.includes('ATTACHED DOCUMENT: b.txt'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildUserContent — image attachments (the main bug fix)
// ─────────────────────────────────────────────────────────────────────────────
describe('buildUserContent — image attachments', () => {
  it('returns an ARRAY when an image is attached (vision mode)', async () => {
    const content = await buildUserContent('prompt', [
      { kind: 'image', name: 'screenshot.png', mimeType: 'image/png', base64: FAKE_BASE64 },
    ]);
    assert.ok(Array.isArray(content), 'must return array so vision API is used');
  });

  it('first element is a text block containing the prompt', async () => {
    const content = await buildUserContent('create a volleyball form', [
      { kind: 'image', name: 'form.png', mimeType: 'image/png', base64: FAKE_BASE64 },
    ]);
    assert.equal(content[0].type, 'text');
    assert.ok(content[0].text.includes('create a volleyball form'));
  });

  it('second element is an image_url block', async () => {
    const content = await buildUserContent('prompt', [
      { kind: 'image', name: 'ui.png', mimeType: 'image/png', base64: FAKE_BASE64 },
    ]);
    assert.equal(content[1].type, 'image_url');
  });

  it('image_url is built from base64 (NOT from dataUrl field)', async () => {
    const content = await buildUserContent('prompt', [
      {
        kind: 'image',
        name: 'img.png',
        mimeType: 'image/png',
        base64: FAKE_BASE64,
        dataUrl: 'data:image/png;base64,SHOULD_NOT_APPEAR', // simulates what client sent before the fix
      },
    ]);
    assert.equal(content[1].image_url.url, `data:image/png;base64,${FAKE_BASE64}`);
    assert.ok(!content[1].image_url.url.includes('SHOULD_NOT_APPEAR'), 'dataUrl must be ignored');
  });

  it('image_url uses detail: high', async () => {
    const content = await buildUserContent('prompt', [
      { kind: 'image', name: 'x.png', mimeType: 'image/png', base64: FAKE_BASE64 },
    ]);
    assert.equal(content[1].image_url.detail, 'high');
  });

  it('vision flag is TRUE → response_format must NOT be set', async () => {
    const content = await buildUserContent('prompt', [
      { kind: 'image', name: 'x.png', mimeType: 'image/png', base64: FAKE_BASE64 },
    ]);
    const hasImages = Array.isArray(content);
    assert.equal(hasImages, true); // caller should omit response_format
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildUserContent — mixed (text doc + image)
// ─────────────────────────────────────────────────────────────────────────────
describe('buildUserContent — mixed text + image', () => {
  it('returns array when image is present alongside text attachment', async () => {
    const content = await buildUserContent('my prompt', [
      { kind: 'text', name: 'notes.txt', content: 'extra context' },
      { kind: 'image', name: 'ui.png', mimeType: 'image/png', base64: FAKE_BASE64 },
    ]);
    assert.ok(Array.isArray(content));
  });

  it('text context is included in the text block (not lost)', async () => {
    const content = await buildUserContent('prompt', [
      { kind: 'text', name: 'spec.txt', content: 'REQUIREMENT: Add a submit button' },
      { kind: 'image', name: 'ui.png', mimeType: 'image/png', base64: FAKE_BASE64 },
    ]);
    assert.ok(content[0].text.includes('REQUIREMENT: Add a submit button'));
  });

  it('has exactly 2 elements for 1 image + 1 text file', async () => {
    const content = await buildUserContent('prompt', [
      { kind: 'text', name: 'a.txt', content: 'text' },
      { kind: 'image', name: 'b.png', mimeType: 'image/png', base64: FAKE_BASE64 },
    ]);
    assert.equal(content.length, 2); // [text block, image_url block]
  });

  it('has 3 elements for 1 image + another image', async () => {
    const content = await buildUserContent('prompt', [
      { kind: 'image', name: 'a.png', mimeType: 'image/png', base64: FAKE_BASE64 },
      { kind: 'image', name: 'b.png', mimeType: 'image/jpeg', base64: FAKE_BASE64 },
    ]);
    assert.equal(content.length, 3); // [text, image_url, image_url]
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildUserContent — PDF attachments
// ─────────────────────────────────────────────────────────────────────────────
describe('buildUserContent — PDF attachments', () => {
  it('returns a string (not array) for PDF-only — no vision', async () => {
    // We pass a base64 that pdf-parse will fail to parse gracefully
    const dummyPdf = Buffer.from('not-a-real-pdf').toString('base64');
    const content = await buildUserContent('prompt', [
      { kind: 'pdf', name: 'spec.pdf', mimeType: 'application/pdf', base64: dummyPdf },
    ]);
    assert.equal(typeof content, 'string');
    assert.equal(Array.isArray(content), false);
  });

  it('includes a PDF label in the message even when text extraction fails', async () => {
    const dummyPdf = Buffer.from('not-a-real-pdf').toString('base64');
    const content = await buildUserContent('prompt', [
      { kind: 'pdf', name: 'requirements.pdf', base64: dummyPdf },
    ]);
    assert.ok(content.includes('requirements.pdf'), 'PDF filename should appear in message');
  });
});
