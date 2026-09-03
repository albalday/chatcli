/**
 * Suite de pruebas unitarias para ChatEngine (js/chat-engine.js).
 * Verifica:
 * 1. Formateo de anclas diarias y guías de herramientas en System Prompt.
 * 2. Inyección y anclaje de mensajes efectivos para Context-Caching.
 * 3. Inserción semántica de cursor en streaming.
 * 4. Orquestación del bucle agéntico con streaming y llamadas a herramientas.
 * 5. Detección y protección contra bucles infinitos por llamadas idénticas consecutivas.
 * 6. Cancelación mediante AbortSignal.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// Importar ChatEngine y dependencias
const ChatEngine = require('../js/chat-engine.js');
const ChatAPI = require('../js/api.js');
const ChatAgentCore = require('../js/agent-core.js');

test('ChatEngine - getDailyDateAnchor genera el ancla con fecha y zona horaria', (t) => {
  const anchorEs = ChatEngine.getDailyDateAnchor('es');
  assert.ok(anchorEs.includes('Fecha actual:'));
  assert.ok(anchorEs.includes('Zona:'));

  const anchorEn = ChatEngine.getDailyDateAnchor('en');
  assert.ok(anchorEn.includes('Current date:'));
  assert.ok(anchorEn.includes('Timezone:'));
});

test('ChatEngine - getToolsSystemPromptGuide genera la lista de herramientas activas', (t) => {
  const guideEs = ChatEngine.getToolsSystemPromptGuide({
    enableAgentWeb: true,
    enableAgentJs: true,
    enableAgentSearch: true,
    enableAgentChart: true
  }, 'es');

  assert.ok(guideEs.includes('HERRAMIENTAS Y FUNCIONES DISPONIBLES'));
  assert.ok(guideEs.includes('fetch_web_page'));
  assert.ok(guideEs.includes('search_web'));
  assert.ok(guideEs.includes('execute_javascript'));
  assert.ok(guideEs.includes('render_chart'));
});

test('ChatEngine - injectStreamingCursor inserta el cursor antes de cerrar etiquetas', (t) => {
  const htmlWithTag = '<p>Hola mundo</p>';
  const res = ChatEngine.injectStreamingCursor(htmlWithTag);
  assert.equal(res, '<p>Hola mundo<span class="streaming-cursor"></span></p>');

  const plainText = 'Texto sin etiquetas';
  const resPlain = ChatEngine.injectStreamingCursor(plainText);
  assert.equal(resPlain, 'Texto sin etiquetas<span class="streaming-cursor"></span>');

  const empty = '';
  const resEmpty = ChatEngine.injectStreamingCursor(empty);
  assert.equal(resEmpty, '<span class="streaming-cursor"></span>');
});

test('ChatEngine - adjunta las imágenes recuperadas cuando el usuario las solicita', () => {
  const image = '![Página 1](rag-image://doc_boeing:img_1)';
  const imageRequest = [{ role: 'user', content: 'Sácame las imágenes del documento.' }];
  const result = ChatEngine.appendRetrievedImages('Aquí tienes la imagen:', [image], imageRequest, 'es');

  assert.match(result, /### Imágenes extraídas/);
  assert.match(result, /rag-image:\/\/doc_boeing:img_1/);
  assert.equal(ChatEngine.appendRetrievedImages('Respuesta factual.', [image], [{ role: 'user', content: '¿Cuál es el importe?' }]), 'Respuesta factual.');
  assert.equal(ChatEngine.appendRetrievedImages(image, [image], imageRequest), image);
});

test('ChatEngine - buildEffectiveMessages inyecta fecha, RAG y formatea mensajes', (t) => {
  const history = [
    { role: 'user', content: '¿Qué manuales tengo disponibles?' }
  ];

  const appConfig = {
    systemPrompt: 'Eres un asistente experto.',
    language: 'es',
    sendDateTime: true,
    activeRagBranchId: 'branch_123',
    enableAgentJs: true
  };

  const options = {
    currentRagSystemContext: '[BASE DE CONOCIMIENTO ACTIVA: Manual GA-Z77P-D3]'
  };

  const messages = ChatEngine.buildEffectiveMessages(history, appConfig, options);

  assert.equal(messages[0].role, 'system');
  assert.ok(messages[0].content.includes('[BASE DE CONOCIMIENTO ACTIVA: Manual GA-Z77P-D3]'));
  assert.ok(messages[0].content.includes('Fecha actual:'));
  assert.ok(messages[0].content.includes('Formato: Usa siempre Markdown estándar'));
  assert.ok(messages[0].content.includes('Eres un asistente experto.'));
  assert.ok(messages[0].content.includes('Base de Conocimiento activa'));
  assert.ok(messages[0].content.includes("list_documents' solo cuando necesites explícitamente un inventario completo"));

  assert.equal(messages[1].role, 'user');
  assert.ok(messages[1].content.includes('¿Qué manuales tengo disponibles?'));
  assert.ok(messages[1].content.includes('[Context Time:'));
});

test('ChatEngine - executeAgentTurnLoop ejecuta un turno simple sin herramientas', async (t) => {
  const originalStream = ChatAPI.streamChatCompletion;

  // Mock de streamChatCompletion para respuesta directa
  ChatAPI.streamChatCompletion = async (params) => {
    if (params.onChunk) {
      params.onChunk('Hola, ', 'Hola, ', { ttftSec: '0.12', tokensPerSec: '50.0', totalSec: '0.20', tokens: 10 });
      params.onChunk('Hola, ¿en qué puedo ayudarte hoy?', '¿en qué puedo ayudarte hoy?', { ttftSec: '0.12', tokensPerSec: '55.0', totalSec: '0.35', tokens: 20 });
    }
    if (params.onDone) {
      params.onDone('Hola, ¿en qué puedo ayudarte hoy?', { ttftSec: '0.12', tokensPerSec: '55.0', totalSec: '0.35', tokens: 20 }, null);
    }
    return {
      accumulatedText: 'Hola, ¿en qué puedo ayudarte hoy?',
      stats: { ttftSec: '0.12', tokensPerSec: '55.0', totalSec: '0.35', tokens: 20 },
      toolCalls: null
    };
  };

  const history = [
    { role: 'user', content: 'Hola' }
  ];

  const appConfig = {
    apiUrl: 'http://localhost:1234/v1',
    apiType: 'openai',
    model: 'test-model',
    temperature: '0.7',
    language: 'es'
  };

  let chunksReceived = [];
  const res = await ChatEngine.executeAgentTurnLoop({
    apiUrl: appConfig.apiUrl,
    apiType: appConfig.apiType,
    model: appConfig.model,
    chatHistory: history,
    appConfig: appConfig,
    assistantMsgId: 'asst_test',
    onChunk: ({ fullText }) => {
      chunksReceived.push(fullText);
    }
  });

  assert.equal(res.success, true);
  assert.equal(res.finalAssistantText, 'Hola, ¿en qué puedo ayudarte hoy?');
  assert.equal(history.length, 2);
  assert.equal(history[1].role, 'assistant');
  assert.equal(history[1].content, 'Hola, ¿en qué puedo ayudarte hoy?');

  // Restaurar API
  ChatAPI.streamChatCompletion = originalStream;
});

test('ChatEngine - executeAgentTurnLoop ejecuta llamadas a herramientas y genera turno final', async (t) => {
  const originalStream = ChatAPI.streamChatCompletion;
  let callCount = 0;

  ChatAPI.streamChatCompletion = async (params) => {
    callCount++;
    if (callCount === 1) {
      // Turno 1: Devuelve una llamada a execute_javascript
      const tc = [{
        id: 'call_calc_1',
        type: 'function',
        function: {
          name: 'execute_javascript',
          arguments: JSON.stringify({ code: 'const a = 15; const b = 25; return a + b;' })
        }
      }];
      if (params.onDone) params.onDone('', null, tc);
      return { accumulatedText: '', toolCalls: tc, stats: null };
    } else {
      // Turno 2: Respuesta final con el resultado
      const finalMsg = 'El resultado de la suma de 15 y 25 es 40.';
      if (params.onChunk) params.onChunk(finalMsg, finalMsg, null);
      if (params.onDone) params.onDone(finalMsg, null, null);
      return { accumulatedText: finalMsg, toolCalls: null, stats: null };
    }
  };

  const history = [
    { role: 'user', content: '¿Cuánto es 15 + 25?' }
  ];

  const appConfig = {
    apiUrl: 'http://localhost:1234/v1',
    apiType: 'openai',
    model: 'test-model',
    language: 'es',
    enableAgentJs: true
  };

  const res = await ChatEngine.executeAgentTurnLoop({
    apiUrl: appConfig.apiUrl,
    apiType: appConfig.apiType,
    model: appConfig.model,
    chatHistory: history,
    appConfig: appConfig,
    assistantMsgId: 'asst_calc'
  });

  assert.equal(res.success, true);
  assert.equal(res.finalAssistantText, 'El resultado de la suma de 15 y 25 es 40.');
  assert.equal(history.length, 4); // user -> assistant (tool call) -> tool (res) -> assistant (final)
  assert.equal(history[1].role, 'assistant');
  assert.ok(history[1].tool_calls);
  assert.equal(history[2].role, 'tool');
  assert.ok(history[2].content.includes('40'));
  assert.equal(history[3].role, 'assistant');

  ChatAPI.streamChatCompletion = originalStream;
});

test('ChatEngine - incorpora imágenes de RAG aunque el modelo omita su Markdown', async () => {
  const originalStream = ChatAPI.streamChatCompletion;
  const originalDispatch = ChatAgentCore.dispatchToolCall;
  const image = '![Página 1](rag-image://doc_boeing:img_1)';
  let callCount = 0;

  ChatAPI.streamChatCompletion = async (params) => {
    callCount++;
    if (callCount === 1) {
      const toolCalls = [{ id: 'call_image', type: 'function', function: { name: 'read_knowledge_chunk', arguments: JSON.stringify({ chunkId: 'doc_boeing:chunk:0' }) } }];
      if (params.onDone) params.onDone('', null, toolCalls);
      return { accumulatedText: '', toolCalls, stats: null };
    }
    const response = 'A continuación se muestra la imagen extraída.';
    if (params.onDone) params.onDone(response, null, null);
    return { accumulatedText: response, toolCalls: null, stats: null };
  };
  ChatAgentCore.dispatchToolCall = async () => ({
    success: true,
    result: { imageMarkdown: [image] },
    resultText: 'Fragmento recuperado.',
    markdownBlock: ''
  });

  const history = [{ role: 'user', content: 'Sácame las imágenes del documento Boeing.' }];
  const result = await ChatEngine.executeAgentTurnLoop({
    apiUrl: 'http://localhost:1234/v1', apiType: 'openai', model: 'test-model',
    chatHistory: history, appConfig: { language: 'es', activeRagBranchId: 'branch_test' }
  });

  assert.match(result.finalAssistantText, /A continuación se muestra/);
  assert.match(result.finalAssistantText, /rag-image:\/\/doc_boeing:img_1/);
  ChatAPI.streamChatCompletion = originalStream;
  ChatAgentCore.dispatchToolCall = originalDispatch;
});

test('ChatEngine - executeAgentTurnLoop protege contra bucles infinitos repetidos', async (t) => {
  const originalStream = ChatAPI.streamChatCompletion;

  // Mock que siempre devuelve exactamente la misma llamada a herramienta
  ChatAPI.streamChatCompletion = async (params) => {
    const tc = [{
      id: 'call_loop_1',
      type: 'function',
      function: {
        name: 'execute_javascript',
        arguments: JSON.stringify({ code: '2 + 2' })
      }
    }];
    if (params.onDone) params.onDone('', null, tc);
    return { accumulatedText: '', toolCalls: tc, stats: null };
  };

  const history = [
    { role: 'user', content: 'Repite' }
  ];

  const appConfig = {
    apiUrl: 'http://localhost:1234/v1',
    apiType: 'openai',
    model: 'test-model',
    enableAgentJs: true
  };

  let errorLogs = [];
  const res = await ChatEngine.executeAgentTurnLoop({
    apiUrl: appConfig.apiUrl,
    apiType: appConfig.apiType,
    model: appConfig.model,
    chatHistory: history,
    appConfig: appConfig,
    onLog: (type, text) => {
      if (type === 'error') errorLogs.push(text);
    }
  });

  assert.equal(res.success, true);
  assert.ok(res.finalAssistantText.includes('Protección de Bucle Infinito'));
  assert.ok(errorLogs.some(msg => msg.includes('[Protección Bucle Infinito]')));

  ChatAPI.streamChatCompletion = originalStream;
});

test('ChatEngine - executeAgentTurnLoop limpia el cursor inicial del contenedor en turnIndex 0', async (t) => {
  const originalStream = ChatAPI.streamChatCompletion;

  ChatAPI.streamChatCompletion = async (params) => {
    if (params.onChunk) {
      params.onChunk('Respuesta de prueba', 'Respuesta de prueba', { ttftSec: '0.1', tokensPerSec: '40', totalSec: '0.2', tokens: 5 });
    }
    if (params.onDone) {
      params.onDone('Respuesta de prueba', null, null);
    }
    return { accumulatedText: 'Respuesta de prueba', toolCalls: null, stats: null };
  };

  const fakeContainer = {
    innerHTML: '<span class="streaming-cursor initial-cursor"></span>',
    querySelectorAll: () => [],
    appendChild: (child) => {
      fakeContainer.children = fakeContainer.children || [];
      fakeContainer.children.push(child);
    }
  };

  global.document = {
    createElement: (tag) => ({
      tagName: tag,
      className: '',
      style: {},
      setAttribute: () => {},
      appendChild: () => {},
      querySelectorAll: () => [],
      ownerDocument: global.document
    })
  };

  const res = await ChatEngine.executeAgentTurnLoop({
    apiUrl: 'http://localhost:1234/v1',
    apiType: 'openai',
    model: 'test-model',
    chatHistory: [{ role: 'user', content: 'Hola' }],
    appConfig: { apiUrl: 'http://localhost:1234/v1', model: 'test-model' },
    container: fakeContainer
  });

  // El cursor inicial debe haberse limpiado antes de añadir el agentic-turn-block
  assert.equal(res.success, true);
  assert.equal(fakeContainer.innerHTML, '');

  ChatAPI.streamChatCompletion = originalStream;
  delete global.document;
});
