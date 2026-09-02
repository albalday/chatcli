const test = require('node:test');
const assert = require('node:assert/strict');

const AgentCore = require('../js/agent-core.js');
const SearchWebTool = require('../js/tools/builtin/search-web.tool.js');
const FetchWebPageTool = require('../js/tools/builtin/fetch-web-page.tool.js');
const DownloadPdfTool = require('../js/tools/builtin/download-pdf.tool.js');
const ToolManifest = require('../js/tools/tool-manifest.js');

const MODULES = [SearchWebTool, FetchWebPageTool, DownloadPdfTool];

test('Web tool modules - cumplen el contrato unificado y se registran en el manifiesto', () => {
  for (const toolModule of MODULES) {
    const tool = toolModule.createTool(AgentCore.Tool);
    const validation = AgentCore.validateToolContract(tool);

    assert.equal(validation.valid, true, `${tool.name}: ${validation.errors.join(' ')}`);
    assert.equal(tool.getDefinition().function.name, toolModule.id);
    assert.equal(tool.view.id, toolModule.id);
    assert.equal(ToolManifest.builtin.get(toolModule.id), toolModule);
  }
});

test('search_web - ejecuta contra el servicio inyectado y conserva la serialización', async () => {
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

test('fetch_web_page y download_pdf - usan WebBrowser inyectado con sus opciones', async () => {
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
