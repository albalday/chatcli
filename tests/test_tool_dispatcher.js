const test = require('node:test');
const assert = require('node:assert/strict');

// Cargar módulos
const AgentCore = require('../js/agent-core.js');
const ToolCards = require('../js/tool-cards.js');

test('ToolDispatcher - dispatchToolCall ejecuta JavaScript de forma resiliente', async () => {
  const toolCall = {
    id: 'call_js_1',
    type: 'function',
    function: {
      name: 'execute_javascript',
      arguments: JSON.stringify({ code: 'const a = 10; const b = 20; return a + b;' })
    }
  };

  const logs = [];
  const res = await AgentCore.dispatchToolCall(toolCall, {
    onLog: (type, text) => logs.push({ type, text })
  });

  assert.ok(res.success);
  assert.equal(res.resultText, '30');
  assert.ok(res.markdownBlock.includes('execute_javascript'));
  assert.ok(logs.length >= 2);
  assert.equal(logs[0].type, 'tool');
});

test('ToolDispatcher - dispatchToolCall maneja JSON corrupto o texto plano en argumentos', async () => {
  const toolCall = {
    id: 'call_js_raw',
    type: 'function',
    function: {
      name: 'execute_javascript',
      arguments: 'code: return 5 * 5;'
    }
  };

  const res = await AgentCore.dispatchToolCall(toolCall);
  assert.ok(res.success);
  assert.equal(res.resultText, '25');
});

test('ToolDispatcher - dispatchToolCall ejecuta search_web con alias searchweb', async () => {
  const toolCall = {
    id: 'call_search_1',
    type: 'function',
    function: {
      name: 'searchweb',
      arguments: JSON.stringify({ query: 'DeepSeek R1' })
    }
  };

  const res = await AgentCore.dispatchToolCall(toolCall);
  assert.ok(res.success);
  assert.ok(typeof res.resultText === 'string');
});

test('ToolDispatcher - dispatchToolCall ejecuta render_chart y genera salida estructurada', async () => {
  const toolCall = {
    id: 'call_chart_1',
    type: 'function',
    function: {
      name: 'render_chart',
      arguments: JSON.stringify({
        type: 'bar',
        title: 'Ventas Mensuales',
        labels: ['Ene', 'Feb'],
        datasets: [{ label: '2026', data: [100, 200] }]
      })
    }
  };

  const res = await AgentCore.dispatchToolCall(toolCall);
  assert.ok(res.success);
  const parsedRes = JSON.parse(res.resultText);
  assert.equal(parsedRes.type, 'bar');
  assert.equal(parsedRes.title, 'Ventas Mensuales');
});

test('ToolDispatcher - dispatchToolCall maneja herramienta inexistente de forma segura', async () => {
  const toolCall = {
    id: 'call_unknown',
    type: 'function',
    function: {
      name: 'non_existent_tool_xyz',
      arguments: '{}'
    }
  };

  const res = await AgentCore.dispatchToolCall(toolCall);
  assert.equal(res.success, false);
  assert.ok(res.error.includes('no encontrada'));
});

test('ToolCards - updateLiveToolCard actualiza elementos del DOM sin lanzar errores', () => {
  assert.equal(typeof ToolCards.updateLiveToolCard, 'function');
  assert.equal(typeof ToolCards.createLiveToolCard, 'function');
  assert.equal(typeof ToolCards.renderHistoricalToolCard, 'function');
});

test('ToolDispatcher - getDefinitions excluye read_chapter_content si RAG no está activo', () => {
  const defsWithoutRag = AgentCore.registry.getDefinitions({
    enableAgentJs: true,
    enableAgentWeb: true,
    enableAgentSearch: true,
    enableAgentChart: true,
    enableAgentRag: false,
    activeRagBranchId: ''
  });

  const ragTool = defsWithoutRag.find(d => d.function?.name === 'read_chapter_content');
  assert.equal(ragTool, undefined, 'read_chapter_content NO debe enviarse si RAG está parado');

  const defsWithRag = AgentCore.registry.getDefinitions({
    enableAgentJs: true,
    enableAgentWeb: true,
    enableAgentSearch: true,
    enableAgentChart: true,
    enableAgentRag: true,
    activeRagBranchId: 'branch_123'
  });

  const ragToolActive = defsWithRag.find(d => d.function?.name === 'read_chapter_content');
  assert.ok(ragToolActive, 'read_chapter_content DEBE enviarse cuando RAG tiene rama activa');
});
