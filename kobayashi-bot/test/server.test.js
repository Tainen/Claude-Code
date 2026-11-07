const test = require('node:test');
const assert = require('node:assert');
process.env.ANTHROPIC_API_KEY ||= 'test-key';
const { toApiMessages } = require('../server');
const { buildSystemPrompt, MODES } = require('../lib/prompt');

test('テキストと添付を API 形式に変換する', () => {
  const out = toApiMessages([
    { role: 'user', text: '見て', files: [
      { kind: 'text', name: 'a.txt', data: '本文' },
      { kind: 'binary', name: 'b.pdf', mediaType: 'application/pdf', data: 'QUJD' },
      { kind: 'binary', name: 'c.png', mediaType: 'image/png', data: 'QUJD' },
      { kind: 'binary', name: 'd.exe', mediaType: 'application/x-msdownload', data: 'QUJD' },
    ] },
    { role: 'assistant', text: '指摘です' },
  ]);
  assert.strictEqual(out.length, 2);
  assert.deepStrictEqual(out[0].content.map((c) => c.type), ['text', 'document', 'image', 'text']);
  assert.deepStrictEqual(out[1], { role: 'assistant', content: [{ type: 'text', text: '指摘です' }] });
});

test('最初が assistant / 空配列はエラー', () => {
  assert.throws(() => toApiMessages([]));
  assert.throws(() => toApiMessages([{ role: 'assistant', text: 'x' }]));
});

test('system プロンプトに知識ファイルが含まれ、モードが揃っている', () => {
  const s = buildSystemPrompt();
  assert.ok(s.includes('小林'));
  assert.deepStrictEqual(Object.keys(MODES), ['review', 'consult', 'final']);
});
