const test = require('node:test');
const assert = require('node:assert/strict');

const AgentCore = require('../js/agent-core.js');
const RenderChartTool = require('../js/tools/builtin/render-chart.tool.js');
const DateTimeTool = require('../js/tools/builtin/get-current-datetime.tool.js');
const ListDocumentsTool = require('../js/tools/builtin/list-documents.tool.js');
const SearchKnowledgeBaseTool = require('../js/tools/builtin/search-knowledge-base.tool.js');
const ReadChapterContentTool = require('../js/tools/builtin/read-chapter-content.tool.js');
const ToolManifest = require('../js/tools/tool-manifest.js');

const MODULES = [RenderChartTool, DateTimeTool, ListDocumentsTool, SearchKnowledgeBaseTool, ReadChapterContentTool];

test('Remaining builtin tool modules - cumplen contrato y se registran en el manifiesto', () => {
  for (const toolModule of MODULES) {
    const tool = toolModule.createTool(AgentCore.Tool);
    const validation = AgentCore.validateToolContract(tool);
    assert.equal(validation.valid, true, `${toolModule.id}: ${validation.errors.join(' ')}`);
    assert.equal(tool.view.id, toolModule.id);
    assert.equal(ToolManifest.builtin.get(toolModule.id), toolModule);
  }
});

test('render_chart - su vista delegada reconstruye el SVG sin el renderer legacy', () => {
  const tool = RenderChartTool.createTool(AgentCore.Tool);
  const fakeDocument = {
    createElement: () => ({ className: '', innerHTML: '' })
  };
  const viewContext = {
    document: fakeDocument,
    charts: { renderChartCard: (args) => `<svg data-chart="${args.title}"></svg>` },
    markdown: { escapeHtml: (value) => String(value) }
  };
  const historical = tool.view.renderHistoricalCard({ title: 'Evolución' }, {}, viewContext);
  const live = { innerHTML: '' };
  tool.view.updateLiveCard(live, { title: 'Evolución' }, {}, 2, viewContext);

  assert.match(historical.innerHTML, /data-chart="Evolución"/);
  assert.match(live.innerHTML, /data-chart="Evolución"/);
});

test('render_chart y get_current_datetime - ejecutan de forma autocontenida', async () => {
  const chartTool = RenderChartTool.createTool(AgentCore.Tool);
  const chartResult = await chartTool.execute({ type: 'bar', title: 'Ventas', labels: ['Enero'], datasets: [{ label: '2026', data: [10] }] }, {
    services: { charts: { renderChartCard: (args) => `<svg data-title="${args.title}"></svg>` } }
  });
  const dateResult = await DateTimeTool.createTool(AgentCore.Tool).execute({ timezone: 'UTC' });

  assert.equal(chartResult.success, true);
  assert.match(chartResult.svg, /Ventas/);
  assert.equal(chartTool.serializeResultForModel({ type: 'bar', title: 'Ventas' }, chartResult), '{"success":true,"type":"bar","title":"Ventas"}');
  assert.equal(dateResult.success, true);
  assert.equal(dateResult.timezone, 'UTC');
  assert.ok(Number.isFinite(dateResult.timestamp));
});

test('RAG tools - consumen el servicio inyectado y propagan la rama activa', async () => {
  const calls = [];
  const treeRagService = {
    resolveListDocumentsToolCall: async (branchId) => {
      calls.push({ name: 'list', branchId });
      return { success: true, count: 1, text: 'Documento' };
    },
    resolveSearchKnowledgeBaseToolCall: async (branchId, args) => {
      calls.push({ name: 'search', branchId, args });
      return { success: true, matchesCount: 1, text: 'Coincidencia' };
    },
    resolveChapterToolCall: async (args) => {
      calls.push({ name: 'read', args });
      return { success: true, docId: args.docId, chapterId: args.chapterId, content: 'Contenido', charCount: 9 };
    }
  };
  const context = { config: { activeRagBranchId: 'branch-1' }, services: { treeRagService } };

  const listResult = await ListDocumentsTool.createTool(AgentCore.Tool).execute({}, context);
  const searchResult = await SearchKnowledgeBaseTool.createTool(AgentCore.Tool).execute({ query: 'seguridad' }, context);
  const readResult = await ReadChapterContentTool.createTool(AgentCore.Tool).execute({ docId: 'doc-1', chapterId: 2 }, context);

  assert.equal(listResult.text, 'Documento');
  assert.equal(searchResult.text, 'Coincidencia');
  assert.equal(readResult.content, 'Contenido');
  assert.deepEqual(calls, [
    { name: 'list', branchId: 'branch-1' },
    { name: 'search', branchId: 'branch-1', args: { query: 'seguridad' } },
    { name: 'read', args: { docId: 'doc-1', chapterId: 2 } }
  ]);
});
