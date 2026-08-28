const { test } = require('node:test');
const assert = require('node:assert/strict');
const Api = require('../js/api.js');

test('Api - Detección automática de tipo de proveedor', () => {
  assert.equal(Api.detectApiType('http://localhost:11434'), 'ollama');
  assert.equal(Api.detectApiType('https://api.anthropic.com/v1'), 'claude');
  assert.equal(Api.detectApiType('https://openrouter.ai/api/v1'), 'openrouter');
  assert.equal(Api.detectApiType('https://generativelanguage.googleapis.com/v1beta/openai'), 'gemini');
  assert.equal(Api.detectApiType('http://localhost:1234/v1'), 'openai');
});

test('Api - Normalización de nombres de herramientas', () => {
  assert.equal(Api.normalizeToolName('search_web'), 'search_web');
  assert.equal(Api.normalizeToolName('duckduckgo'), 'search_web');
  assert.equal(Api.normalizeToolName('eval_javascript'), 'execute_javascript');
  assert.equal(Api.normalizeToolName('downloadpdf'), 'download_pdf');
  assert.equal(Api.normalizeToolName('render_chart'), 'render_chart');
});

test('Api - Extracción de Tool Calls emitidas como texto', () => {
  // Llama 3 / Hermes syntax
  const llamaText = 'Voy a calcular: call:execute_javascript{"code":"2+2"}';
  const llamaCalls = Api.extractToolCallsFromText(llamaText);
  assert.ok(llamaCalls && llamaCalls.length === 1);
  assert.equal(llamaCalls[0].function.name, 'execute_javascript');

  // XML syntax
  const xmlText = '<tool_call>{"name":"search_web","arguments":{"query":"noticias"}}</tool_call>';
  const xmlCalls = Api.extractToolCallsFromText(xmlText);
  assert.ok(xmlCalls && xmlCalls.length === 1);
  assert.equal(xmlCalls[0].function.name, 'search_web');
});

test('Api - Estimación aproximada de tokens', () => {
  const shortText = 'Hola mundo';
  const count = Api.estimateTokens(shortText);
  assert.ok(count > 0 && count < 10);
});
