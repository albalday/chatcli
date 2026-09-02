const test = require('node:test');
const assert = require('node:assert/strict');

const AgentCore = require('../js/agent-core.js');
const ToolManifest = require('../js/tools/tool-manifest.js');

const ExecuteJavascriptTool = require('../js/tools/builtin/execute-javascript.tool.js');
const SearchWebTool = require('../js/tools/builtin/search-web.tool.js');
const FetchWebPageTool = require('../js/tools/builtin/fetch-web-page.tool.js');
const DownloadPdfTool = require('../js/tools/builtin/download-pdf.tool.js');
const RenderChartTool = require('../js/tools/builtin/render-chart.tool.js');
const DateTimeTool = require('../js/tools/builtin/get-current-datetime.tool.js');
const ListDocumentsTool = require('../js/tools/builtin/list-documents.tool.js');
const SearchKnowledgeBaseTool = require('../js/tools/builtin/search-knowledge-base.tool.js');
const ReadChapterContentTool = require('../js/tools/builtin/read-chapter-content.tool.js');

const ALL_BUILTIN_MODULES = [
  ExecuteJavascriptTool,
  SearchWebTool,
  FetchWebPageTool,
  DownloadPdfTool,
  RenderChartTool,
  DateTimeTool,
  ListDocumentsTool,
  SearchKnowledgeBaseTool,
  ReadChapterContentTool
];

test('Builtin Tools - Todos los módulos cumplen el contrato declarativo y se registran en el manifiesto', () => {
  for (const toolModule of ALL_BUILTIN_MODULES) {
    const tool = toolModule.createTool(AgentCore.Tool);
    const validation = AgentCore.validateToolContract(tool);

    assert.equal(validation.valid, true, `${toolModule.id}: ${validation.errors.join(' ')}`);
    assert.equal(tool.name, toolModule.id);
    assert.equal(tool.getDefinition().function.name, toolModule.id);
    assert.equal(tool.view.id, toolModule.id);
    assert.equal(ToolManifest.builtin.get(toolModule.id), toolModule);
  }
});

test('Builtin Tools - execute_javascript ejecuta con sandbox inyectado y conserva formatos', async () => {
  const tool = ExecuteJavascriptTool.createTool(AgentCore.Tool);
  let receivedCode = '';
  let receivedTimeout = null;
  const result = await tool.execute({ javascript: 'return 21 * 2;' }, {
    timeoutMs: 123,
    services: {
      sandbox: {
        execute: async (code, timeout) => {
          receivedCode = code;
          receivedTimeout = timeout;
          return { success: true, result: '42' };
        }
      }
    }
  });

  assert.equal(receivedCode, 'return 21 * 2;');
  assert.equal(receivedTimeout, 123);
  assert.equal(tool.serializeResultForModel({}, result), '42');
  assert.match(tool.formatDispatchMarkdown({ code: 'return 21 * 2;' }, result), /execute_javascript/);
  assert.ok(tool.aliases.includes('executejs'));
});

test('Builtin Tools - search_web ejecuta contra servicio inyectado y preserva serialización', async () => {
  const tool = SearchWebTool.createTool(AgentCore.Tool);
  const calls = [];
  const result = await tool.execute({ q: 'ZeroChat refactor' }, {
    language: 'en',
    services: {
      webSearch: {
        search: async (query, language) => {
          calls.push({ query, language });
          return { success: true, count: 1, markdown: '## Result' };
        }
      }
    }
  });

  assert.deepEqual(calls, [{ query: 'ZeroChat refactor', language: 'en' }]);
  assert.equal(tool.serializeResultForModel({}, result), '## Result');
  assert.match(tool.formatDispatchMarkdown({ query: 'ZeroChat refactor' }, result), /1 fuentes/);
  assert.equal(SearchWebTool.getQuery({ keyword: 'alternativa' }), 'alternativa');
});

test('Builtin Tools - fetch_web_page y download_pdf usan WebBrowser inyectado', async () => {
  const fetchTool = FetchWebPageTool.createTool(AgentCore.Tool);
  const pdfTool = DownloadPdfTool.createTool(AgentCore.Tool);
  const calls = [];
  const services = {
    webBrowser: {
      fetchPage: async (url, options) => {
        calls.push({ operation: 'fetch', url, options });
        return { success: true, content: 'Página' };
      },
      downloadPdf: async (url, options) => {
        calls.push({ operation: 'pdf', url, options });
        return { success: true, text: 'PDF' };
      }
    }
  };

  const pageResult = await fetchTool.execute({ href: 'https://example.com/article' }, {
    options: { maxLength: 100 }, services
  });
  const pdfResult = await pdfTool.execute({ URL: 'https://example.com/document.pdf' }, {
    options: { extract: true }, services
  });

  assert.deepEqual(calls, [
    { operation: 'fetch', url: 'https://example.com/article', options: { maxLength: 100 } },
    { operation: 'pdf', url: 'https://example.com/document.pdf', options: { extract: true } }
  ]);
  assert.equal(fetchTool.serializeResultForModel({}, pageResult), JSON.stringify(pageResult));
  assert.equal(pdfTool.serializeResultForModel({}, pdfResult), JSON.stringify(pdfResult));
  assert.match(fetchTool.formatDispatchMarkdown({ url: 'https://example.com/article' }, pageResult), /fetch_web_page/);
  assert.match(pdfTool.formatDispatchMarkdown({ url: 'https://example.com/document.pdf' }, pdfResult), /download_pdf/);
});

test('Builtin Tools - render_chart y get_current_datetime ejecutan de forma autocontenida', async () => {
  const chartTool = RenderChartTool.createTool(AgentCore.Tool);
  const chartResult = await chartTool.execute({ type: 'bar', title: 'Ventas', labels: ['Enero'], datasets: [{ label: '2026', data: [10] }] }, {
    services: { charts: { renderChartCard: (args) => `<svg data-title="${args.title}"></svg>` } }
  });
  const dateResult = await DateTimeTool.createTool(AgentCore.Tool).execute();

  assert.equal(chartResult.success, true);
  assert.match(chartResult.svg, /Ventas/);
  assert.equal(chartTool.serializeResultForModel({ type: 'bar', title: 'Ventas' }, chartResult), '{"success":true,"type":"bar","title":"Ventas"}');
  assert.equal(dateResult.success, true);
  assert.ok(typeof dateResult.iso === 'string');

  // Vista delegada de render_chart
  const fakeDocument = { createElement: () => ({ className: '', innerHTML: '' }) };
  const viewContext = {
    document: fakeDocument,
    charts: { renderChartCard: (args) => `<svg data-chart="${args.title}"></svg>` },
    markdown: { escapeHtml: (value) => String(value) }
  };
  const historical = chartTool.view.renderHistoricalCard({ title: 'Evolución' }, {}, viewContext);
  const live = { innerHTML: '' };
  chartTool.view.updateLiveCard(live, { title: 'Evolución' }, {}, 2, viewContext);

  assert.match(historical.innerHTML, /data-chart="Evolución"/);
  assert.match(live.innerHTML, /data-chart="Evolución"/);
});

test('Builtin Tools - RAG tools consumen el servicio inyectado y propagan rama activa', async () => {
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
