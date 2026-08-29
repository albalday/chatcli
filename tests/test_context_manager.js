const test = require('node:test');
const assert = require('node:assert');
const ChatContextManager = require('../js/context-manager.js');

test('ContextManager - Estimación de tokens para texto, código y multimodales', () => {
  const shortText = 'Hola, ¿cómo estás?';
  const tokens = ChatContextManager.estimateTextTokens(shortText);
  assert.ok(tokens > 0 && tokens < 10);

  const codeText = 'function calculate(x) { return x * 42; }';
  const codeTokens = ChatContextManager.estimateTextTokens(codeText);
  assert.ok(codeTokens > 0);

  const multimodalMsg = {
    role: 'user',
    content: [
      { type: 'text', text: 'Mira esta foto' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,123' } }
    ]
  };
  const multiTokens = ChatContextManager.estimateMessageTokens(multimodalMsg);
  assert.ok(multiTokens > 1000, 'Debe incluir la estimación de tokens para la imagen');
});

test('ContextManager - Conversaciones cortas que caben en el presupuesto', () => {
  const messages = [
    { role: 'system', content: 'Eres un asistente útil.' },
    { role: 'user', content: '¿Qué es JavaScript?' },
    { role: 'assistant', content: 'Es un lenguaje de programación.' },
    { role: 'user', content: '¿Y Python?' }
  ];

  const result = ChatContextManager.buildOptimizedContext(messages, {
    maxInputTokens: 4000,
    model: 'gpt-4o'
  });

  assert.equal(result.messages.length, 4);
  assert.equal(result.diagnostics.includedCount, 4);
  assert.equal(result.diagnostics.excludedCount, 0);
  assert.equal(result.diagnostics.strategy, 'full_history');
});

test('ContextManager - Preservación obligatoria de System Prompt y Último Mensaje con presupuesto pequeño', () => {
  const messages = [
    { role: 'system', content: 'INSTRUCCIÓN CRÍTICA DE SISTEMA' },
    { role: 'user', content: 'Mensaje antiguo 1' },
    { role: 'assistant', content: 'Respuesta antigua 1' },
    { role: 'user', content: 'Mensaje antiguo 2' },
    { role: 'assistant', content: 'Respuesta antigua 2' },
    { role: 'user', content: 'PREGUNTA ACTUAL DEL USUARIO' }
  ];

  // Presupuesto muy restrictivo (ej. solo 60 tokens)
  const result = ChatContextManager.buildOptimizedContext(messages, {
    maxInputTokens: 60
  });

  // Debe contener el System Prompt y la Pregunta Actual
  const roles = result.messages.map(m => m.role);
  assert.ok(roles.includes('system'), 'Debe preservar el System Prompt');
  assert.equal(result.messages[0].content, 'INSTRUCCIÓN CRÍTICA DE SISTEMA');
  assert.equal(result.messages[result.messages.length - 1].content, 'PREGUNTA ACTUAL DEL USUARIO');
  assert.ok(result.diagnostics.excludedCount > 0, 'Debe haber excluido mensajes antiguos');
  assert.equal(result.diagnostics.strategy, 'sliding_window_truncated');
});

test('ContextManager - Preservación de pares atómicos tool_calls <-> tool', () => {
  const messages = [
    { role: 'system', content: 'Sistema' },
    { role: 'user', content: 'Primer mensaje de usuario' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'call_abc', function: { name: 'search_web', arguments: '{"q":"test"}' } }]
    },
    { role: 'tool', tool_call_id: 'call_abc', name: 'search_web', content: 'Resultados de prueba' },
    { role: 'assistant', content: 'Aquí está tu respuesta basada en la búsqueda.' },
    { role: 'user', content: 'Segundo mensaje' }
  ];

  const result = ChatContextManager.buildOptimizedContext(messages, {
    maxInputTokens: 2000
  });

  // Verificar que el assistant con tool_calls y su tool respectivo permanecen juntos
  const toolIdx = result.messages.findIndex(m => m.role === 'tool');
  assert.ok(toolIdx > 0);
  assert.equal(result.messages[toolIdx - 1].role, 'assistant');
  assert.ok(result.messages[toolIdx - 1].tool_calls);
});

test('ContextManager - Truncamiento y Poda de resultados gigantescos de herramientas', () => {
  const hugeContent = 'A'.repeat(50000); // 50 KB de contenido

  const messages = [
    { role: 'system', content: 'Sistema' },
    { role: 'user', content: 'Descarga un PDF' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'call_pdf', function: { name: 'download_pdf', arguments: '{"url":"..."}' } }]
    },
    { role: 'tool', tool_call_id: 'call_pdf', name: 'download_pdf', content: hugeContent },
    { role: 'assistant', content: 'El PDF trata de X temas.' },
    { role: 'user', content: '¿Qué más dice?' }
  ];

  const result = ChatContextManager.buildOptimizedContext(messages, {
    maxInputTokens: 4000,
    maxHistoricalToolChars: 500
  });

  const toolMsg = result.messages.find(m => m.role === 'tool');
  assert.ok(toolMsg);
  assert.ok(toolMsg.content.length <= 1000, `El contenido de la tool histórica debe ser podado (actual: ${toolMsg.content.length})`);
  assert.ok(toolMsg.content.includes('Truncado por ChatContextManager'));
  assert.equal(result.diagnostics.prunedToolsCount, 1);
});

test('ContextManager - Diagnóstico y cálculo de presupuestos por modelo', () => {
  const limitOllama = ChatContextManager.getModelContextLimit('llama-3', 'ollama');
  assert.equal(limitOllama, 8192);

  const limitClaude = ChatContextManager.getModelContextLimit('claude-3-5-sonnet', 'claude');
  assert.equal(limitClaude, 200000);

  const budget = ChatContextManager.calculateInputBudget({
    model: 'gpt-4o',
    providerType: 'openai'
  });
  assert.ok(budget > 100000 && budget <= 128000);
});
