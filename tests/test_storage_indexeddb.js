const { test } = require('node:test');
const assert = require('node:assert/strict');
const Storage = require('../js/cookies.js');

test('Storage IndexedDB - Creación y recuperación de conversación y mensajes', async () => {
  const sessionId = 'test_session_001';
  const sessionMeta = {
    id: sessionId,
    title: 'Conversación de prueba',
    createdAt: Date.now() - 10000,
    updatedAt: Date.now() - 5000,
    model: 'test-model',
    summary: 'Resumen de prueba'
  };

  const messages = [
    { id: 'msg_1', role: 'user', content: '¿Cuánto es 2+2?' },
    { id: 'msg_2', role: 'assistant', content: '4' }
  ];

  const saved = await Storage.saveConversation(sessionMeta, messages);
  assert.equal(saved, true, 'Debe guardar la conversación exitosamente');

  const loaded = await Storage.getConversation(sessionId);
  assert.ok(loaded, 'Debe recuperar la conversación guardada');
  assert.equal(loaded.id, sessionId);
  assert.equal(loaded.title, 'Conversación de prueba');
  assert.equal(loaded.messageCount, 2);
  assert.equal(loaded.history.length, 2);
  assert.equal(loaded.history[0].content, '¿Cuánto es 2+2?');
  assert.equal(loaded.history[1].content, '4');
});

test('Storage IndexedDB - Listado y filtrado de conversaciones', async () => {
  await Storage.deleteAllConversations();

  const conv1 = { id: 'conv_1', title: 'Receta de cocina', updatedAt: 1000 };
  const conv2 = { id: 'conv_2', title: 'Cálculo de matrices', updatedAt: 3000 };
  const conv3 = { id: 'conv_3', title: 'Análisis de datos', updatedAt: 2000 };

  await Storage.saveConversation(conv1, [{ id: 'm1', role: 'user', content: 'Hola' }]);
  await Storage.saveConversation(conv2, [{ id: 'm2', role: 'user', content: 'Hola' }]);
  await Storage.saveConversation(conv3, [{ id: 'm3', role: 'user', content: 'Hola' }]);

  // Listar todas (debe estar ordenado por updatedAt desc: conv_2, conv_3, conv_1)
  const list = await Storage.getConversationsList();
  assert.equal(list.length, 3);
  assert.equal(list[0].id, 'conv_2');
  assert.equal(list[1].id, 'conv_3');
  assert.equal(list[2].id, 'conv_1');

  // Filtrar por término
  const filtered = await Storage.getConversationsList('matrices');
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'conv_2');
});

test('Storage IndexedDB - Renombrar conversación', async () => {
  const sessionId = 'conv_rename_test';
  await Storage.saveConversation({ id: sessionId, title: 'Título Original' }, [{ id: 'm1', content: 'A' }]);

  const renamed = await Storage.renameConversation(sessionId, 'Título Actualizado');
  assert.equal(renamed, true);

  const conv = await Storage.getConversation(sessionId);
  assert.equal(conv.title, 'Título Actualizado');
});

test('Storage IndexedDB - Borrado individual y borrado total', async () => {
  const s1 = 'conv_delete_1';
  const s2 = 'conv_delete_2';

  await Storage.saveConversation({ id: s1, title: 'Chat 1' }, [{ id: 'm1', content: '1' }]);
  await Storage.saveConversation({ id: s2, title: 'Chat 2' }, [{ id: 'm2', content: '2' }]);

  // Borrar s1
  const del1 = await Storage.deleteConversation(s1);
  assert.equal(del1, true);

  const check1 = await Storage.getConversation(s1);
  assert.equal(check1, null);

  const check2 = await Storage.getConversation(s2);
  assert.ok(check2);

  // Borrar todo
  await Storage.deleteAllConversations();
  const emptyList = await Storage.getConversationsList();
  assert.equal(emptyList.length, 0);
});

test('Storage IndexedDB - Migración automática desde localStorage (formato legacy)', async () => {
  await Storage.deleteAllConversations();

  // Simular sesiones legacy en formato JSON de chat_sessions
  const legacySessions = [
    {
      id: 'legacy_sess_1',
      title: 'Conversación Antigua 1',
      createdAt: 1700000000000,
      updatedAt: 1700000005000,
      history: [
        { id: 'leg_m1', role: 'user', content: 'Pregunta legacy' },
        { id: 'leg_m2', role: 'assistant', content: 'Respuesta legacy' }
      ]
    },
    {
      id: 'legacy_sess_2',
      title: 'Conversación Antigua 2',
      createdAt: 1700000010000,
      updatedAt: 1700000020000,
      history: [
        { id: 'leg_m3', role: 'user', content: 'Otra pregunta' }
      ]
    }
  ];

  Storage.setStorageItem('chat_sessions', JSON.stringify(legacySessions));
  assert.ok(Storage.getStorageItem('chat_sessions'), 'La clave legacy debe existir antes de la migración');

  // Ejecutar migración
  await Storage.migrateFromLocalStorage();

  // Verificar que se hayan restaurado en el storage
  const list = await Storage.getConversationsList();
  assert.equal(list.length, 2);

  const conv1 = await Storage.getConversation('legacy_sess_1');
  assert.ok(conv1);
  assert.equal(conv1.title, 'Conversación Antigua 1');
  assert.equal(conv1.history.length, 2);
  assert.equal(conv1.history[0].content, 'Pregunta legacy');

  // Verificar que la clave legacy fue limpiada para evitar re-migraciones
  assert.equal(Storage.getStorageItem('chat_sessions'), null);
});

test('Storage IndexedDB - Preservación íntegra de turnos del asistente y herramientas', async () => {
  const sessionId = 'test_agentic_turn_session';
  const sessionMeta = { id: sessionId, title: 'Chat con herramientas' };

  const history = [
    { id: 'u1', role: 'user', content: 'Grafica esto' },
    {
      id: 'a1_turn_0_assistant',
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'call_123', type: 'function', function: { name: 'render_chart', arguments: '{"type":"bar"}' } }]
    },
    {
      id: 'a1_turn_0_tool_call_123',
      role: 'tool',
      tool_call_id: 'call_123',
      name: 'render_chart',
      content: '{"success":true}'
    },
    {
      id: 'a1_final',
      role: 'assistant',
      content: 'Aquí tienes el gráfico generado.'
    }
  ];

  await Storage.saveConversation(sessionMeta, history);
  const loaded = await Storage.getConversation(sessionId);

  assert.ok(loaded);
  assert.equal(loaded.history.length, 4, 'No debe sobreescribir ningún mensaje de turno');
  assert.equal(loaded.history[0].role, 'user');
  assert.equal(loaded.history[1].role, 'assistant');
  assert.ok(Array.isArray(loaded.history[1].tool_calls));
  assert.equal(loaded.history[2].role, 'tool');
  assert.equal(loaded.history[3].role, 'assistant');
  assert.equal(loaded.history[3].content, 'Aquí tienes el gráfico generado.');
});

test('Storage IndexedDB - Preservación de turnos iniciales de fecha/hora para caché de contexto', async () => {
  const sessionId = 'session_test_datetime_' + Date.now();
  const sessionMeta = { id: sessionId, title: 'Consulta temporal' };

  const history = [
    { id: 'msg_dt_user', role: 'user', content: 'La fecha y hora actual es: 29/8/2026, 03:50:00.' },
    { id: 'msg_dt_ast', role: 'assistant', content: 'OK' },
    { id: 'msg_user_q', role: 'user', content: '¿Qué eventos ocurrieron hoy?' },
    { id: 'msg_ast_a', role: 'assistant', content: 'Hoy es 29 de agosto...' }
  ];

  await Storage.saveConversation(sessionMeta, history);
  const loaded = await Storage.getConversation(sessionId);

  assert.ok(loaded);
  assert.equal(loaded.history.length, 4);
  assert.equal(loaded.history[0].content, 'La fecha y hora actual es: 29/8/2026, 03:50:00.');
  assert.equal(loaded.history[1].content, 'OK');
  assert.equal(loaded.history[2].content, '¿Qué eventos ocurrieron hoy?');
});

