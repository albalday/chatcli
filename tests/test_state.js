const test = require('node:test');
const assert = require('node:assert');
const ChatState = require('../js/state.js');

test('ChatState - Inicialización con valores por defecto', () => {
  const store = ChatState.createStore();
  const state = store.getState();

  assert.ok(state.config);
  assert.equal(state.config.apiUrl, 'http://localhost:1234/v1');
  assert.equal(state.config.temperature, '0.7');
  assert.equal(state.streaming.isGenerating, false);
  assert.equal(state.streaming.status, 'idle');
  assert.ok(Array.isArray(state.messages));
  assert.equal(state.messages.length, 0);
  assert.ok(state.sessions.activeId);
});

test('ChatState - Actualizaciones parciales y atómicas', () => {
  const store = ChatState.createStore();

  // Actualizar slice con store.set()
  store.set('streaming', { isGenerating: true, status: 'streaming' });
  const s1 = store.get('streaming');
  assert.equal(s1.isGenerating, true);
  assert.equal(s1.status, 'streaming');
  assert.equal(s1.error, null); // Debe preservar el resto del slice

  // Actualizar varios slices con store.setState()
  store.setState({
    config: { model: 'llama-3.3' },
    ui: { sidebarOpen: true }
  });

  const full = store.getState();
  assert.equal(full.config.model, 'llama-3.3');
  assert.equal(full.config.apiUrl, 'http://localhost:1234/v1'); // Preservado
  assert.equal(full.ui.sidebarOpen, true);
  assert.equal(full.ui.reasoningMenuOpen, false); // Preservado
});

test('ChatState - Actualización funcional con prevState', () => {
  const store = ChatState.createStore();

  store.set('messages', (prevMessages) => [
    ...prevMessages,
    { id: 'm1', role: 'user', content: 'Hola' }
  ]);

  assert.equal(store.get('messages').length, 1);
  assert.equal(store.get('messages')[0].content, 'Hola');
});

test('ChatState - Aislamiento e inmutabilidad del estado interno', () => {
  const store = ChatState.createStore();

  const state1 = store.getState();
  // Mutación externa maliciosa o accidental
  state1.config.apiUrl = 'http://hacked.com';
  state1.messages.push({ role: 'fake' });

  // El store interno debe permanecer intacto
  const state2 = store.getState();
  assert.equal(state2.config.apiUrl, 'http://localhost:1234/v1');
  assert.equal(state2.messages.length, 0);
});

test('ChatState - Suscripciones globales, por slice y por selector', () => {
  const store = ChatState.createStore();
  let globalCalls = 0;
  let sliceCalls = 0;
  let selectorCalls = 0;
  let lastIsGenerating = null;

  // 1. Suscriptor global
  const unsubGlobal = store.subscribe((newState, prevState) => {
    globalCalls++;
    assert.ok(newState);
    assert.ok(prevState);
  });

  // 2. Suscriptor por clave de slice ('streaming')
  const unsubSlice = store.subscribe('streaming', (newStreaming, prevStreaming) => {
    sliceCalls++;
    assert.equal(typeof newStreaming.isGenerating, 'boolean');
  });

  // 3. Suscriptor por selector derivado
  const unsubSelector = store.subscribe(
    state => state.streaming.isGenerating,
    (isGen, prevIsGen) => {
      selectorCalls++;
      lastIsGenerating = isGen;
      assert.notEqual(isGen, prevIsGen);
    }
  );

  // Primer cambio relevante
  store.set('streaming', { isGenerating: true, status: 'streaming' });
  assert.equal(globalCalls, 1);
  assert.equal(sliceCalls, 1);
  assert.equal(selectorCalls, 1);
  assert.equal(lastIsGenerating, true);

  // Cambio en otro slice (no afecta al selector de isGenerating)
  store.set('ui', { sidebarOpen: true });
  assert.equal(globalCalls, 2);
  assert.equal(sliceCalls, 1); // No debe llamarse
  assert.equal(selectorCalls, 1); // No debe llamarse

  // Cancelar suscripción
  unsubGlobal();
  unsubSlice();
  unsubSelector();

  store.set('streaming', { isGenerating: false, status: 'idle' });
  assert.equal(globalCalls, 2);
  assert.equal(sliceCalls, 1);
  assert.equal(selectorCalls, 1);
});

test('ChatState - Prevención de notificaciones innecesarias (Shallow Equality Check)', () => {
  const store = ChatState.createStore();
  let callCount = 0;

  store.subscribe(() => {
    callCount++;
  });

  // Aplicar mismo valor existente en config
  store.setState({
    config: { apiUrl: 'http://localhost:1234/v1' }
  });

  // No debe haber emitido eventos porque el valor es idéntico
  assert.equal(callCount, 0);
});

test('ChatState - Reset del estado', () => {
  const store = ChatState.createStore();
  store.set('config', { model: 'gpt-4o' });
  store.set('streaming', { isGenerating: true });

  store.reset();
  const state = store.getState();
  assert.equal(state.config.model, '');
  assert.equal(state.streaming.isGenerating, false);
});
