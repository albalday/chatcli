/**
 * Módulo de Núcleo Agéntico y Sistema Modular de Herramientas (ChatAgentCore) para ZeroChat.
 *
 * Arquitectura:
 * Model -> AgentCore -> ToolRegistry -> Tool -> ToolExecutor
 *
 * Preparado para MCP (Model Context Protocol) y herramientas extensibles.
 * Compatible con entornos file://, http:// y Node.js.
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatAgentCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Resolutores perezosos de dependencias del entorno
  function getSandbox() {
    if (typeof window !== 'undefined' && window.ChatSandbox) return window.ChatSandbox;
    if (typeof require !== 'undefined') {
      try { return require('./sandbox.js'); } catch (e) {}
    }
    return null;
  }

  function getWebSearch() {
    if (typeof window !== 'undefined' && window.ChatWebSearch) return window.ChatWebSearch;
    if (typeof require !== 'undefined') {
      try { return require('./web-search.js'); } catch (e) {}
    }
    return null;
  }

  function getWebBrowser() {
    if (typeof window !== 'undefined' && window.ChatWebBrowser) return window.ChatWebBrowser;
    if (typeof require !== 'undefined') {
      try { return require('./web-browser.js'); } catch (e) {}
    }
    return null;
  }

  function getCharts() {
    if (typeof window !== 'undefined' && window.ChatCharts) return window.ChatCharts;
    if (typeof require !== 'undefined') {
      try { return require('./charts.js'); } catch (e) {}
    }
    return null;
  }

  function getAPI() {
    if (typeof window !== 'undefined' && window.ChatAPI) return window.ChatAPI;
    if (typeof require !== 'undefined') {
      try { return require('./api.js'); } catch (e) {}
    }
    return null;
  }

  function getContextManager() {
    if (typeof window !== 'undefined' && window.ChatContextManager) return window.ChatContextManager;
    if (typeof require !== 'undefined') {
      try { return require('./context-manager.js'); } catch (e) {}
    }
    return null;
  }

  function getRagStorage() {
    if (typeof window !== 'undefined' && (window.ChatRagStorage || window.RagStorage)) {
      return window.ChatRagStorage || window.RagStorage;
    }
    if (typeof require !== 'undefined') {
      try { return require('./ragStorage.js'); } catch (e) {}
    }
    return null;
  }

  function getTreeRagService() {
    if (typeof window !== 'undefined' && (window.ChatTreeRagService || window.ChatService)) {
      return window.ChatTreeRagService || window.ChatService;
    }
    if (typeof require !== 'undefined') {
      try { return require('./chatService.js'); } catch (e) {}
    }
    return null;
  }

  /**
   * Representa una herramienta individual ejecutable (Tool).
   */
  class Tool {
    constructor(options = {}) {
      this.id = options.id || options.name || '';
      this.name = options.name || '';
      this.description = options.description || '';
      this.parameters = options.parameters || { type: 'object', properties: {} };
      this.aliases = Array.isArray(options.aliases) ? options.aliases : [];
      this.category = options.category || 'general';
      this.metadata = options.metadata || {};
      this.ui = {
        titleKey: options.ui?.titleKey || `agent_${this.name}_title`,
        titleFallback: options.ui?.titleFallback || options.metadata?.label || this.name,
        descKey: options.ui?.descKey || `agent_${this.name}_desc`,
        descFallback: options.ui?.descFallback || this.description,
        icon: options.ui?.icon || options.metadata?.icon || '⚙️',
        defaultEnabled: options.ui?.defaultEnabled !== false,
        showInSettings: options.ui?.showInSettings !== false
      };
      this.handler = options.handler || null;
      this.formatter = options.formatter || null;
      this.promptGuide = options.promptGuide || options.getSystemPromptGuide || null;
      this.isAvailable = typeof options.isAvailable === 'function' ? options.isAvailable : (() => true);
    }

    /**
     * Devuelve la definición en formato estándar Function Calling (OpenAI, Claude, Gemini).
     */
    getDefinition() {
      return {
        type: 'function',
        function: {
          name: this.name,
          description: this.description,
          parameters: this.parameters
        }
      };
    }

    /**
     * Devuelve la línea descriptiva de la herramienta para el System Prompt (guía de texto plano).
     */
    getSystemPromptGuide(lang = 'es') {
      if (typeof this.promptGuide === 'function') {
        return this.promptGuide(lang);
      }
      return `- \`${this.name}\`: ${this.description}`;
    }

    /**
     * Ejecuta la herramienta asíncronamente.
     */
    async execute(args, context = {}) {
      if (typeof this.handler === 'function') {
        return this.handler(args, context);
      }
      throw new Error(`La herramienta ${this.name} no tiene handler de ejecución implementado.`);
    }

    /**
     * Formatea el resultado en Markdown para su inserción en el historial o exportación.
     */
    formatMarkdownResult(args, result) {
      if (typeof this.formatter === 'function') {
        return this.formatter(args, result);
      }
      const output = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
      return `> ⚙️ **${this.name}**\n> \`\`\`json\n> ${output.split('\n').join('\n> ')}\n> \`\`\``;
    }
  }

  /**
   * Clase base para proveedores de herramientas (ToolProvider).
   */
  class BaseToolProvider {
    constructor(options = {}) {
      this.id = options.id || 'base';
      this.name = options.name || 'Base Tool Provider';
    }

    /**
     * Devuelve el array de instancias Tool provistas por este proveedor.
     */
    getTools() {
      return [];
    }
  }

  /**
   * Proveedor de herramientas nativas de ZeroChat (BuiltinToolProvider).
   * Provee: execute_javascript, search_web, fetch_web_page, download_pdf, render_chart.
   */
  class BuiltinToolProvider extends BaseToolProvider {
    constructor() {
      super({ id: 'builtin', name: 'ZeroChat Built-in Tools' });
    }

    getTools() {
      const tools = [];

      // 1. Herramienta execute_javascript
      tools.push(new Tool({
        id: 'execute_javascript',
        name: 'execute_javascript',
        description: 'Ejecuta código JavaScript localmente en un sandbox seguro en el navegador para cálculos matemáticos y procesamiento de datos.',
        parameters: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'Código JS ejecutable.' }
          },
          required: ['code']
        },
        aliases: ['executejs', 'execute_js', 'run_javascript', 'run_js', 'javascript', 'evaljs'],
        category: 'sandbox',
        metadata: { icon: '⚡', label: 'execute_javascript' },
        ui: {
          titleKey: 'agent_js_title',
          titleFallback: '⚡ Ejecución de JavaScript Local (Sandbox)',
          descKey: 'agent_js_desc',
          descFallback: 'Permite al modelo invocar execute_javascript para calcular, procesar datos o validar algoritmos en un entorno seguro en el navegador.',
          icon: '⚡',
          defaultEnabled: true,
          showInSettings: true
        },
        promptGuide: (lang) => lang === 'en'
          ? '- `execute_javascript(code="...")`: Executes JavaScript code locally in the browser for math calculations, algorithms, and data processing.'
          : '- `execute_javascript(code="...")`: Ejecuta código JavaScript localmente en el navegador para cálculos matemáticos, algoritmos y procesamiento de datos.',
        handler: async (args, context) => {
          const Sandbox = getSandbox();
          const code = args.code || args.javascript || args.js || args.script || args.input || (typeof args === 'string' ? args : '');
          if (!Sandbox || !Sandbox.execute) {
            return { success: false, error: 'Módulo Sandbox no disponible.' };
          }
          const timeoutMs = typeof context?.timeoutMs === 'number' ? context.timeoutMs : (typeof context?.options?.timeoutMs === 'number' ? context.options.timeoutMs : undefined);
          return Sandbox.execute(code, timeoutMs);
        },
        formatter: (args, result) => {
          const code = args.code || '';
          const output = result.success
            ? (result.result || (result.logs && result.logs.length > 0 ? result.logs.join('\n') : 'undefined'))
            : `Error: ${result.error}`;
          return `> ⚡ **execute_javascript**\n> \`\`\`javascript\n> ${code.split('\n').join('\n> ')}\n> \`\`\`\n> \`\`\`\n> ${String(output).split('\n').join('\n> ')}\n> \`\`\``;
        }
      }));

      // 2. Herramienta search_web
      tools.push(new Tool({
        id: 'search_web',
        name: 'search_web',
        description: 'Busca en internet en tiempo real información actualizada, noticias, artículos y enlaces web utilizando DuckDuckGo.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Términos o consulta de búsqueda (ej: "INE poblacion Ceuta padron", "DeepSeek R1").' }
          },
          required: ['query']
        },
        aliases: ['searchweb', 'web_search', 'duckduckgo_search', 'duckduckgo', 'search_internet', 'internet_search', 'search'],
        category: 'web',
        metadata: { icon: '🔍', label: 'search_web' },
        ui: {
          titleKey: 'agent_search_title',
          titleFallback: '🔍 Búsqueda en DuckDuckGo en Tiempo Real',
          descKey: 'agent_search_desc',
          descFallback: 'Permite al modelo invocar search_web para buscar información actualizada, definiciones, noticias y enlaces web mediante la API de DuckDuckGo.',
          icon: '🔍',
          defaultEnabled: true,
          showInSettings: true
        },
        promptGuide: (lang) => lang === 'en'
          ? '- `search_web(query="...")`: Searches up-to-date information, news, articles, and links on the internet using DuckDuckGo.'
          : '- `search_web(query="...")`: Busca información actualizada, noticias, artículos y enlaces en internet mediante DuckDuckGo.',
        handler: async (args, context) => {
          const WebSearch = getWebSearch();
          const query = args.query || args.q || args.search || args.keyword || args.term || args.input || (typeof args === 'string' ? args : '');
          if (!WebSearch || !WebSearch.search) {
            return { success: false, error: 'Módulo WebSearch no disponible.' };
          }
          return WebSearch.search(query, context.lang || 'es');
        },
        formatter: (args, result) => {
          return result.markdown || `> 🔍 **search_web**: ${args.query}`;
        }
      }));

      // 3. Herramienta fetch_web_page
      tools.push(new Tool({
        id: 'fetch_web_page',
        name: 'fetch_web_page',
        description: 'Descarga y lee el texto y contenido de una página web pública o artículo HTML a partir de su URL (ej: "https://es.wikipedia.org/wiki/Sol").',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL de la página web a consultar.' }
          },
          required: ['url']
        },
        aliases: ['fetchwebpage', 'fetch_web', 'fetch_url', 'get_web_page', 'read_web_page', 'web_fetch', 'browse_web', 'webpage'],
        category: 'web',
        metadata: { icon: '🌐', label: 'fetch_web_page' },
        ui: {
          titleKey: 'agent_web_title',
          titleFallback: '🌐 Navegación Web en Tiempo Real',
          descKey: 'agent_web_desc',
          descFallback: 'Permite al modelo invocar fetch_web_page para consultar páginas web públicas y extraer su contenido textual en tiempo real.',
          icon: '🌐',
          defaultEnabled: true,
          showInSettings: true
        },
        promptGuide: (lang) => lang === 'en'
          ? '- `fetch_web_page(url="...")`: Reads and extracts clean text content from public web pages or HTML articles.'
          : '- `fetch_web_page(url="...")`: Lee y extrae el texto de páginas web públicas o artículos HTML.',
        handler: async (args, context) => {
          const WebBrowser = getWebBrowser();
          const url = args.url || args.URL || args.uri || args.link || args.href || args.path || args.input || (typeof args === 'string' ? args : '');
          if (!WebBrowser || !WebBrowser.fetchPage) {
            return { success: false, error: 'Módulo WebBrowser no disponible.' };
          }
          return WebBrowser.fetchPage(url, context.options || {});
        },
        formatter: (args, result) => {
          const url = args.url || '';
          const preview = result.success ? (result.content || '(Página vacía)') : (result.error || 'Error al conectar');
          return `> 🌐 **fetch_web_page** (HTTP ${result.status || 200})\n> URL: ${url}\n> \`\`\`\n> ${preview.slice(0, 500).split('\n').join('\n> ')}\n> \`\`\``;
        }
      }));

      // 4. Herramienta download_pdf
      tools.push(new Tool({
        id: 'download_pdf',
        name: 'download_pdf',
        description: 'Descarga un archivo o documento PDF desde una URL web y extrae todo su texto legible para analizarlo e integrarlo en el contexto (ej: "https://arxiv.org/pdf/2310.06825.pdf").',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL directa del documento PDF a descargar y extraer.' }
          },
          required: ['url']
        },
        aliases: ['downloadpdf', 'fetch_pdf', 'download_pdf_document', 'fetch_pdf_document', 'download_file', 'getpdf', 'readpdf'],
        category: 'web',
        metadata: { icon: '📄', label: 'download_pdf' },
        ui: {
          titleKey: 'agent_pdf_title',
          titleFallback: '📄 Descarga y Lectura de Documentos PDF',
          descKey: 'agent_pdf_desc',
          descFallback: 'Permite al modelo descargar documentos PDF desde la web y extraer todo su texto al contexto en tiempo real.',
          icon: '📄',
          defaultEnabled: true,
          showInSettings: true
        },
        promptGuide: (lang) => lang === 'en'
          ? '- `download_pdf(url="...")`: Downloads a PDF file from a URL and extracts its readable text into the prompt context.'
          : '- `download_pdf(url="...")`: Descarga un documento PDF desde una URL y extrae todo su texto legible al contexto.',
        handler: async (args, context) => {
          const WebBrowser = getWebBrowser();
          const url = args.url || args.URL || args.uri || args.link || args.href || args.path || args.input || (typeof args === 'string' ? args : '');
          if (!WebBrowser || !WebBrowser.downloadPdf) {
            return { success: false, error: 'Módulo WebBrowser no disponible.' };
          }
          return WebBrowser.downloadPdf(url, context.options || {});
        },
        formatter: (args, result) => {
          const url = args.url || '';
          const preview = result.success ? (result.content || '(PDF vacío)') : (result.error || 'Error descargando PDF');
          return `> 📄 **download_pdf**\n> URL: ${url}\n> \`\`\`\n> ${preview.slice(0, 500).split('\n').join('\n> ')}\n> \`\`\``;
        }
      }));

      // 5. Herramienta render_chart
      tools.push(new Tool({
        id: 'render_chart',
        name: 'render_chart',
        description: 'Genera y visualiza un gráfico interactivo (barras, líneas, donut o sectores) a partir de datos numéricos o tablas.',
        parameters: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['bar', 'line', 'pie', 'doughnut'], description: 'Tipo de gráfico.' },
            title: { type: 'string', description: 'Título descriptivo del gráfico.' },
            description: { type: 'string', description: 'Breve explicación de los datos.' },
            labels: { type: 'array', items: { type: 'string' }, description: 'Etiquetas del eje X o categorías.' },
            datasets: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  data: { type: 'array', items: { type: 'number' } },
                  color: { type: 'string' }
                },
                required: ['label', 'data']
              },
              description: 'Series de datos numéricos.'
            }
          },
          required: ['type', 'title', 'labels', 'datasets']
        },
        aliases: ['renderchart', 'draw_chart', 'create_chart', 'plot_chart', 'generate_chart', 'show_chart', 'chart', 'grafico'],
        category: 'charts',
        metadata: { icon: '📊', label: 'render_chart' },
        ui: {
          titleKey: 'agent_chart_title',
          titleFallback: '📊 Visualización de Datos y Gráficos Nativos (SVG)',
          descKey: 'agent_chart_desc',
          descFallback: 'Permite al modelo invocar render_chart para generar y mostrar gráficos interactivos de barras, líneas o sectores sin librerías externas.',
          icon: '📊',
          defaultEnabled: true,
          showInSettings: true
        },
        promptGuide: (lang) => lang === 'en'
          ? '- `render_chart(type="...", title="...", labels=[...], datasets=[...])`: Generates and displays native interactive SVG charts (bar, line, pie, doughnut).'
          : '- `render_chart(type="...", title="...", labels=[...], datasets=[...])`: Genera y visualiza gráficos SVG nativos interactivos (barras, líneas, sectores, donut).',
        handler: async (args, context) => {
          const Charts = getCharts();
          if (!Charts || (!Charts.renderChartCard && !Charts.renderBarChart)) {
            return { success: false, error: 'Módulo Charts no disponible.' };
          }
          const svgHtml = Charts.renderChartCard ? Charts.renderChartCard(args) : (Charts.renderBarChart ? Charts.renderBarChart(args.labels, args.datasets) : '');
          return {
            success: true,
            svg: svgHtml,
            chartData: args,
            title: args.title || 'Gráfico'
          };
        },
        formatter: (args, result) => {
          return `> 📊 **render_chart**: ${args.title || 'Gráfico'} (${args.type || 'bar'})\n> [Gráfico interactivo generado correctamente]`;
        }
      }));

      // 6. Herramienta get_current_datetime
      tools.push(new Tool({
        id: 'get_current_datetime',
        name: 'get_current_datetime',
        description: 'Obtiene la fecha, hora, día de la semana y zona horaria actual en tiempo real en el cliente.',
        parameters: {
          type: 'object',
          properties: {
            timezone: { type: 'string', description: 'Zona horaria opcional (ej: "Europe/Madrid", "America/New_York", "UTC").' }
          }
        },
        aliases: ['get_current_time', 'get_datetime', 'current_time', 'current_date', 'get_date', 'now', 'fecha_actual', 'hora_actual'],
        category: 'system',
        metadata: { icon: '⏱️', label: 'get_current_datetime' },
        ui: { showInSettings: false },
        promptGuide: (lang) => lang === 'en'
          ? '- `get_current_datetime(timezone="...")`: Retrieves the current date, exact time, day of week and timezone in real-time.'
          : '- `get_current_datetime(timezone="...")`: Obtiene la fecha, hora exacta, día de la semana y zona horaria actual en tiempo real.',
        handler: async (args, context) => {
          const now = new Date();
          const tz = args.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
          return {
            success: true,
            iso: now.toISOString(),
            date: now.toLocaleDateString('es-ES', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
            time: now.toLocaleTimeString('es-ES', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            timestamp: now.getTime(),
            timezone: tz
          };
        },
        formatter: (args, result) => {
          return `> ⏱️ **get_current_datetime**: ${result.date} ${result.time} (${result.timezone})`;
        }
      }));

      // 7. Herramienta list_documents (RAG Jerárquico / Base de Conocimiento)
      tools.push(new Tool({
        id: 'list_documents',
        name: 'list_documents',
        description: 'Lista todos los documentos, manuales, resúmenes temáticos y la lista completa de capítulos indexados en la base de conocimiento local del usuario. Úsala para descubrir qué información existe o ante preguntas sobre el catálogo documental disponible.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        },
        aliases: ['listdocuments', 'list_knowledge_base', 'list_docs', 'get_documents', 'listar_documentos'],
        category: 'rag',
        metadata: { icon: '📖', label: 'list_documents' },
        ui: { showInSettings: false },
        isAvailable: (config = {}) => Boolean(config.activeRagBranchId || config.enableAgentRag),
        handler: async (args, context) => {
          const TreeRagService = getTreeRagService();
          if (!TreeRagService || !TreeRagService.resolveListDocumentsToolCall) {
            return { success: false, error: 'Servicio de RAG no disponible.' };
          }
          const branchId = context?.activeRagBranchId || context?.branchId || (typeof window !== 'undefined' && window.ChatStorage?.loadConfig?.()?.activeRagBranchId) || '';
          return TreeRagService.resolveListDocumentsToolCall(branchId);
        },
        formatter: (args, result) => {
          return `> 📖 **list_documents** (${result.count || 0} documentos disponibles)\n> \`\`\`\n> ${String(result.text || '').split('\n').join('\n> ')}\n> \`\`\``;
        }
      }));

      // 8. Herramienta search_knowledge_base (RAG Jerárquico / Búsqueda)
      tools.push(new Tool({
        id: 'search_knowledge_base',
        name: 'search_knowledge_base',
        description: 'Busca temas, palabras clave o preguntas técnicas en la base de conocimiento local del usuario. Devuelve resúmenes de documentos y capítulos coincidentes para identificar qué leer.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Término, tema o pregunta clave a buscar en la base de conocimiento.'
            }
          },
          required: ['query']
        },
        aliases: ['search_kb', 'searchknowledgebase', 'search_documents', 'search_knowledge', 'buscar_en_documentos'],
        category: 'rag',
        metadata: { icon: '🔍', label: 'search_knowledge_base' },
        ui: { showInSettings: false },
        isAvailable: (config = {}) => Boolean(config.activeRagBranchId || config.enableAgentRag),
        handler: async (args, context) => {
          const TreeRagService = getTreeRagService();
          if (!TreeRagService || !TreeRagService.resolveSearchKnowledgeBaseToolCall) {
            return { success: false, error: 'Servicio de RAG no disponible.' };
          }
          const branchId = context?.activeRagBranchId || context?.branchId || (typeof window !== 'undefined' && window.ChatStorage?.loadConfig?.()?.activeRagBranchId) || '';
          return TreeRagService.resolveSearchKnowledgeBaseToolCall(branchId, args);
        },
        formatter: (args, result) => {
          return `> 🔍 **search_knowledge_base** ("${args.query || ''}") [${result.matchesCount || 0} coincidencias]\n> \`\`\`\n> ${String(result.text || '').split('\n').join('\n> ')}\n> \`\`\``;
        }
      }));

      // 9. Herramienta read_chapter_content (RAG Jerárquico / Contenido Completo)
      tools.push(new Tool({
        id: 'read_chapter_content',
        name: 'read_chapter_content',
        description: 'Recupera el texto completo, instrucciones detalladas, código y diagramas de un capítulo específico de un documento (indicando docId y chapterId obtenidos previamente).',
        parameters: {
          type: 'object',
          properties: {
            docId: {
              type: 'string',
              description: 'El identificador único del documento (docId).'
            },
            chapterId: {
              type: 'number',
              description: 'El número de ID del capítulo a consultar.'
            }
          },
          required: ['docId', 'chapterId']
        },
        aliases: ['readchaptercontent', 'read_chapter', 'get_chapter', 'get_chapter_content', 'read_doc_chapter'],
        category: 'rag',
        metadata: { icon: '📖', label: 'read_chapter_content' },
        ui: { showInSettings: false },
        isAvailable: (config = {}) => Boolean(config.activeRagBranchId || config.enableAgentRag),
        handler: async (args, context) => {
          const TreeRagService = getTreeRagService();
          if (TreeRagService && TreeRagService.resolveChapterToolCall) {
            return TreeRagService.resolveChapterToolCall(args);
          }
          const RagStorage = getRagStorage();
          if (!RagStorage || !RagStorage.getChapterContent) {
            return { success: false, error: 'Módulo de almacenamiento RAG no disponible.' };
          }
          const docId = args.docId || args.doc_id || args.id || '';
          const chapterId = typeof args.chapterId === 'number' ? args.chapterId : parseInt(args.chapter_id || args.chapterId || args.chapter, 10);

          if (!docId || isNaN(chapterId)) {
            return { success: false, error: 'Parámetros inválidos: docId y chapterId numérico son requeridos.' };
          }

          const content = await RagStorage.getChapterContent(docId, chapterId);
          if (content !== null && typeof content === 'string') {
            return {
              success: true,
              docId,
              chapterId,
              charCount: content.length,
              content
            };
          }
          return {
            success: false,
            error: `No se encontró el capítulo ${chapterId} en el documento [${docId}].`
          };
        },
        formatter: (args, result) => {
          if (result.success) {
            return `> 📖 **read_chapter_content** (Doc: \`${result.docId}\`, Cap: \`${result.chapterId}\`)\n> \`\`\`text\n> ${String(result.content).split('\n').join('\n> ')}\n> \`\`\``;
          }
          return `> 📖 **read_chapter_content** (Doc: \`${args.docId}\`, Cap: \`${args.chapterId}\`)\n> ❌ ${result.error || 'Error al recuperar capítulo'}`;
        }
      }));

      return tools;
    }
  }

  /**
   * Registro central de herramientas y proveedores (ToolRegistry).
   */
  class ToolRegistry {
    constructor() {
      this.tools = new Map();
      this.aliasMap = new Map();
      this.providers = new Map();

      // Registrar proveedor de herramientas nativas por defecto
      this.registerProvider(new BuiltinToolProvider());
    }

    /**
     * Registra un proveedor de herramientas.
     */
    registerProvider(provider) {
      if (!provider || !provider.id) return;
      this.providers.set(provider.id, provider);
      const tools = provider.getTools();
      if (Array.isArray(tools)) {
        tools.forEach(tool => this.registerTool(tool));
      }
    }

    /**
     * Registra una herramienta individual.
     */
    registerTool(tool) {
      if (!tool || !tool.name) return;
      const canonicalName = tool.name.trim().toLowerCase();
      this.tools.set(canonicalName, tool);

      // Mapear nombre canónico normalizado sin guiones bajos
      this.aliasMap.set(canonicalName.replace(/_/g, ''), canonicalName);

      // Mapear alias declarados
      if (Array.isArray(tool.aliases)) {
        tool.aliases.forEach(alias => {
          const cleanAlias = String(alias).trim().toLowerCase();
          this.aliasMap.set(cleanAlias, canonicalName);
          this.aliasMap.set(cleanAlias.replace(/_/g, ''), canonicalName);
        });
      }
    }

    /**
     * Obtiene una herramienta por su nombre canónico o alias.
     */
    getTool(rawName) {
      if (!rawName) return null;
      const clean = String(rawName).trim().toLowerCase();
      if (this.tools.has(clean)) {
        return this.tools.get(clean);
      }
      const canonical = this.aliasMap.get(clean) || this.aliasMap.get(clean.replace(/_/g, ''));
      if (canonical && this.tools.has(canonical)) {
        return this.tools.get(canonical);
      }
      return null;
    }

    /**
     * Comprueba si una herramienta está registrada.
     */
    hasTool(name) {
      return !!this.getTool(name);
    }

    /**
     * Devuelve las herramientas visibles para la UI de Configuración.
     */
    listToolsForUI() {
      const list = [];
      for (const tool of this.tools.values()) {
        if (tool.ui && tool.ui.showInSettings !== false) {
          list.push({
            id: tool.id || tool.name,
            name: tool.name,
            category: tool.category,
            icon: tool.ui.icon,
            titleKey: tool.ui.titleKey,
            titleFallback: tool.ui.titleFallback,
            descKey: tool.ui.descKey,
            descFallback: tool.ui.descFallback,
            defaultEnabled: tool.ui.defaultEnabled !== false
          });
        }
      }
      return list;
    }

    /**
     * Resuelve las definiciones Function Calling de las herramientas activas según la configuración.
     */
    getActiveDefinitions(appConfig = {}) {
      const defs = [];
      const enabledTools = appConfig.enabledTools || {};

      for (const [name, tool] of this.tools.entries()) {
        // 1. Comprobar si la herramienta está disponible por su contexto (ej. RAG requiere rama activa)
        if (typeof tool.isAvailable === 'function' && !tool.isAvailable(appConfig)) {
          continue;
        }

        // 2. Si la herramienta se configura en la UI, verificar si está activada
        if (tool.ui && tool.ui.showInSettings !== false) {
          const toolId = tool.id || tool.name;
          const isEnabled = enabledTools[toolId] !== undefined
            ? enabledTools[toolId] !== false
            : (enabledTools[tool.name] !== undefined ? enabledTools[tool.name] !== false : tool.ui.defaultEnabled !== false);

          if (!isEnabled) {
            continue;
          }
        }

        defs.push(tool.getDefinition());
      }
      return defs;
    }

    /**
     * Alias compatible con versiones anteriores de getDefinitions.
     */
    getDefinitions(filterOptions = {}) {
      return this.getActiveDefinitions(filterOptions);
    }

    /**
     * Genera la guía textual de herramientas para el System Prompt.
     */
    getActivePromptGuide(appConfig = {}, lang = 'es') {
      const isEs = lang !== 'en';
      const enabledTools = appConfig.enabledTools || {};
      const guides = [];

      for (const tool of this.tools.values()) {
        if (typeof tool.isAvailable === 'function' && !tool.isAvailable(appConfig)) {
          continue;
        }

        if (tool.ui && tool.ui.showInSettings !== false) {
          const toolId = tool.id || tool.name;
          const isEnabled = enabledTools[toolId] !== undefined
            ? enabledTools[toolId] !== false
            : (enabledTools[tool.name] !== undefined ? enabledTools[tool.name] !== false : tool.ui.defaultEnabled !== false);

          if (!isEnabled) {
            continue;
          }
        }

        if (typeof tool.getSystemPromptGuide === 'function') {
          const guideStr = tool.getSystemPromptGuide(lang);
          if (guideStr && typeof guideStr === 'string') {
            guides.push(guideStr);
          }
        }
      }

      if (guides.length === 0) return '';

      return isEs
        ? `\n\n[HERRAMIENTAS Y FUNCIONES DISPONIBLES]:\nPuedes utilizar las siguientes herramientas cuando sea necesario para responder con precisión:\n${guides.join('\n')}\n*Instrucción de flujo:* Una vez recibidos los resultados de las herramientas en la conversación, sintetiza los hallazgos y redacta una respuesta final completa, bien estructurada y detallada para el usuario, citando las fuentes consultadas. No finalices la respuesta sin proporcionar el resumen completo.`
        : `\n\n[AVAILABLE TOOLS AND FUNCTIONS]:\nYou can use the following tools when needed to answer accurately:\n${guides.join('\n')}\n*Workflow instruction:* Once tool results are received, synthesize the findings and write a complete, well-structured, detailed final answer for the user, citing consulted sources. Do not end the response without providing the full summary.`;
    }

    /**
     * Lista todas las herramientas registradas con sus metadatos.
     */
    listTools() {
      return Array.from(this.tools.values());
    }
  }

  /**
   * Motor de ejecución seguro para llamadas a herramientas (ToolExecutor).
   */
  class ToolExecutor {
    constructor(registry) {
      this.registry = registry || new ToolRegistry();
    }

    /**
     * Parsea tolerante y seguramente los argumentos de una llamada a herramienta.
     */
    parseArguments(rawArgs) {
      if (!rawArgs) return {};
      if (typeof rawArgs === 'object' && rawArgs !== null) return rawArgs;

      const str = String(rawArgs).trim();
      try {
        return JSON.parse(str);
      } catch (e) {
        // Fallback tolerante para formato clave: valor o texto plano
        const urlMatch = str.match(/(?:url|link|href)\s*[:=]\s*["']?([^"'\s,}]+)/i);
        const queryMatch = str.match(/(?:query|q|search)\s*[:=]\s*["']?([^"'\r\n,}]+)/i);
        const codeMatch = str.match(/(?:code|js|javascript)\s*[:=]\s*["']?([^"'\r\n]+)/i);

        if (urlMatch) return { url: urlMatch[1] };
        if (queryMatch) return { query: queryMatch[1].trim() };
        if (codeMatch) return { code: codeMatch[1].trim().replace(/["']$/, '') };

        return { input: str };
      }
    }

    /**
     * Ejecuta una llamada a herramienta con control de tiempo, métricas y manejo de errores.
     */
    async executeToolCall(toolCall, context = {}) {
      const rawName = toolCall?.function?.name || '';
      const tool = this.registry.getTool(rawName);
      const parsedArgs = this.parseArguments(toolCall?.function?.arguments);

      if (!tool) {
        return {
          success: false,
          toolName: rawName,
          error: `Herramienta '${rawName}' no encontrada en el registro.`,
          executionTimeMs: 0,
          result: null
        };
      }

      const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

      try {
        if (context.signal && context.signal.aborted) {
          throw new Error('Ejecución de herramienta cancelada por el usuario.');
        }

        const execResult = await tool.execute(parsedArgs, context);
        const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const elapsed = parseFloat((endTime - startTime).toFixed(2));

        return {
          success: execResult?.success !== false,
          tool: tool,
          toolName: tool.name,
          args: parsedArgs,
          result: execResult,
          executionTimeMs: elapsed,
          error: execResult?.error
        };
      } catch (err) {
        const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const elapsed = parseFloat((endTime - startTime).toFixed(2));

        return {
          success: false,
          tool: tool,
          toolName: tool.name,
          args: parsedArgs,
          error: err.message || String(err),
          executionTimeMs: elapsed,
          result: null
        };
      }
    }

    /**
     * Despacha una llamada a herramienta gestionando el ciclo completo:
     * - Parseo seguro de argumentos
     * - Creación inicial e inserción de la tarjeta DOM en vivo
     * - Logging previo a consola de depuración
     * - Ejecución asíncrona a través de executeToolCall
     * - Actualización reactiva de la tarjeta DOM con los resultados
     * - Formateo de la respuesta textual para el historial del chat y markdown
     */
    async dispatchToolCall(toolCall, options = {}) {
      const {
        container,
        onLog,
        attachListeners,
        scrollToBottom,
        language = 'es'
      } = options;

      const rawFuncName = toolCall?.function?.name || '';
      const parsedArgs = this.parseArguments(toolCall?.function?.arguments);
      const ToolCards = (typeof window !== 'undefined' && window.ChatToolCards) ? window.ChatToolCards : null;
      const norm = (rawFuncName || '').toLowerCase().replace(/_/g, '');

      // 1. Crear e insertar la tarjeta DOM en vivo con estado de carga
      let cardEl = null;
      if (ToolCards && ToolCards.createLiveToolCard && container && typeof document !== 'undefined') {
        cardEl = ToolCards.createLiveToolCard(rawFuncName, parsedArgs);
        if (cardEl) {
          container.appendChild(cardEl);
          if (typeof attachListeners === 'function') attachListeners(cardEl);
          if (typeof scrollToBottom === 'function') scrollToBottom();
        }
      }

      // 2. Logging previo
      if (typeof onLog === 'function') {
        onLog('tool', `${rawFuncName}:\n${JSON.stringify(parsedArgs, null, 2)}`);
        onLog('raw', `>>> TOOL CALL ${rawFuncName}:\n${JSON.stringify(parsedArgs, null, 2)}`);
      }

      // 3. Ejecutar la herramienta a través de executeToolCall
      const execRes = await this.executeToolCall(toolCall, { lang: language, ...options });

      // 4. Actualizar la tarjeta DOM con el resultado
      if (ToolCards && ToolCards.updateLiveToolCard && cardEl) {
        ToolCards.updateLiveToolCard(cardEl, rawFuncName, parsedArgs, execRes.result || execRes, execRes.executionTimeMs);
        if (typeof attachListeners === 'function') attachListeners(cardEl);
        if (typeof scrollToBottom === 'function') scrollToBottom();
      }

      // 5. Formatear la salida para el mensaje 'tool' de chatHistory
      let resultText = '';
      if (norm === 'executejavascript') {
        const res = execRes.result;
        resultText = res?.success
          ? (res.result || (res.logs && res.logs.length > 0 ? res.logs.join('\n') : 'undefined'))
          : `Error: ${res?.error || execRes.error || 'Error de ejecución'}`;
      } else if (norm === 'searchweb') {
        resultText = execRes.result?.markdown || JSON.stringify(execRes.result || {});
      } else if (norm === 'fetchwebpage' || norm === 'downloadpdf') {
        resultText = JSON.stringify(execRes.result || {});
      } else if (norm === 'renderchart' || norm === 'generatechart') {
        resultText = JSON.stringify({
          success: execRes.success !== false,
          type: parsedArgs.type || 'bar',
          title: parsedArgs.title || 'Gráfico'
        });
      } else if (norm === 'listdocuments' || norm === 'listknowledgebase' || norm === 'getdocuments' || norm === 'listdocs' || norm === 'listardocumentos') {
        resultText = execRes.result?.text || JSON.stringify(execRes.result || {});
      } else if (norm === 'searchknowledgebase' || norm === 'searchkb' || norm === 'searchdocuments' || norm === 'searchknowledge' || norm === 'buscarendocumentos') {
        resultText = execRes.result?.text || JSON.stringify(execRes.result || {});
      } else if (norm === 'readchaptercontent' || norm === 'readchapter') {
        resultText = execRes.result?.content || JSON.stringify(execRes.result || {});
      } else {
        resultText = typeof execRes.result === 'object' ? JSON.stringify(execRes.result) : String(execRes.result ?? execRes.error ?? '');
      }

      // 6. Logging posterior
      if (typeof onLog === 'function') {
        onLog('tool', `${rawFuncName} output (${execRes.executionTimeMs || 0}ms):\n${String(resultText).substring(0, 300)}`);
        onLog('raw', `<<< TOOL RESULT ${rawFuncName} (${execRes.executionTimeMs || 0}ms):\n${resultText}`);
      }

      // 7. Formatear bloque markdown acumulado para el portapapeles/exportación
      let toolMd = '';
      if (norm === 'executejavascript') {
        const code = parsedArgs.code || parsedArgs.javascript || parsedArgs.js || parsedArgs.script || parsedArgs.input || '';
        toolMd = `> ⚡ **execute_javascript**\n> \`\`\`javascript\n> ${code.split('\n').join('\n> ')}\n> \`\`\`\n> \`\`\`\n> ${String(resultText).split('\n').join('\n> ')}\n> \`\`\``;
      } else if (norm === 'searchweb') {
        const count = execRes.result?.count || 0;
        toolMd = `> 🔍 **search_web** (${count} fuentes)\n> Query: "${parsedArgs.query || ''}"\n> \`\`\`markdown\n> ${(resultText || '').split('\n').join('\n> ')}\n> \`\`\``;
      } else if (norm === 'fetchwebpage' || norm === 'downloadpdf') {
        const isPdf = norm === 'downloadpdf';
        toolMd = `> ${isPdf ? '📄' : '🌐'} **${rawFuncName}**\n> URL: "${parsedArgs.url || ''}"\n\n`;
      } else if (norm === 'renderchart' || norm === 'generatechart') {
        toolMd = `> 📊 **render_chart** (${parsedArgs.type || 'bar'})\n> Título: "${parsedArgs.title || 'Gráfico'}"\n\n`;
      } else if (norm === 'listdocuments' || norm === 'listknowledgebase' || norm === 'getdocuments' || norm === 'listdocs' || norm === 'listardocumentos') {
        const count = execRes.result?.count || 0;
        toolMd = `> 📖 **list_documents** (${count} documentos indexados)\n\n`;
      } else if (norm === 'searchknowledgebase' || norm === 'searchkb' || norm === 'searchdocuments' || norm === 'searchknowledge' || norm === 'buscarendocumentos') {
        const matches = execRes.result?.matchesCount || 0;
        toolMd = `> 🔍 **search_knowledge_base** ("${parsedArgs.query || ''}") [${matches} coincidencias]\n\n`;
      } else if (norm === 'readchaptercontent' || norm === 'readchapter') {
        toolMd = `> 📖 **read_chapter_content** (Doc: "${parsedArgs.docId}", Cap: ${parsedArgs.chapterId})\n\n`;
      } else {
        toolMd = `> ⚙️ **${rawFuncName}**\n> \`\`\`\n> ${String(resultText).slice(0, 300)}\n> \`\`\``;
      }

      return {
        success: execRes.success !== false,
        result: execRes.result,
        resultText,
        markdownBlock: toolMd,
        cardElement: cardEl,
        executionTimeMs: execRes.executionTimeMs,
        error: execRes.error,
        toolName: rawFuncName,
        args: parsedArgs
      };
    }
  }

  /**
   * Entorno de ejecución agéntico avanzado (AgentRuntime).
   * Orquesta el ciclo de vida de razonamiento y acción (ReAct), múltiples pasos,
   * control de tiempo/timeout, reintentos de herramientas, cancelación,
   * detección de bucles infinitos, presupuestos de tokens y síntesis final.
   */
  class AgentRuntime {
    constructor(options = {}) {
      this.registry = options.registry || new ToolRegistry();
      this.executor = options.executor || new ToolExecutor(this.registry);
      this.maxSteps = options.maxSteps || options.maxTurns || 6;
      this.timeoutMs = options.timeoutMs || 0; // 0 = sin límite global de tiempo
      this.stepTimeoutMs = options.stepTimeoutMs || 60000; // 60s por paso
      this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : 1;
      this.loopThreshold = options.loopThreshold || 2;
      this.autoSynthesize = options.autoSynthesize !== false;
    }

    /**
     * Genera una huella única para la llamada a herramienta para detectar repeticiones cíclicas.
     */
    getToolCallFingerprint(toolCall) {
      if (!toolCall || !toolCall.function) return '';
      const name = toolCall.function.name || '';
      const args = typeof toolCall.function.arguments === 'object'
        ? JSON.stringify(toolCall.function.arguments)
        : String(toolCall.function.arguments || '').trim();
      return `${name}:${args}`;
    }

    /**
     * Ejecuta una llamada a herramienta con soporte de reintentos y captura de errores.
     */
    async executeToolWithRetries(toolCall, context = {}, maxRetries = 0, onRetry = null) {
      let attempts = 0;
      let lastResult = null;

      while (attempts <= maxRetries) {
        if (context.signal && context.signal.aborted) {
          return {
            success: false,
            toolName: toolCall?.function?.name || '',
            error: 'Ejecución cancelada por el usuario.',
            executionTimeMs: 0,
            cancelled: true
          };
        }

        lastResult = await this.executor.executeToolCall(toolCall, context);
        if (lastResult.success) {
          return lastResult;
        }

        attempts++;
        if (attempts <= maxRetries && !lastResult.cancelled) {
          if (typeof onRetry === 'function') {
            onRetry(toolCall, attempts, maxRetries, lastResult.error);
          }
          // Pausa corta antes de reintentar
          await new Promise(r => setTimeout(r, 50));
        }
      }

      return lastResult;
    }

    /**
     * Ejecuta el ciclo completo de ejecución agéntica multi-turno.
     */
    async execute(params = {}) {
      const {
        apiUrl,
        apiType,
        apiKey,
        model,
        messages = [],
        temperature = 0.7,
        reasoningEffort = 'none',
        enableTools = true,
        toolFilterOptions = {},
        enableContextCache = true,
        cacheInvalidated = false,
        cacheRevision = null,
        signal = null,
        maxSteps = this.maxSteps,
        timeoutMs = this.timeoutMs,
        stepTimeoutMs = this.stepTimeoutMs,
        maxRetries = this.maxRetries,
        loopThreshold = this.loopThreshold,
        autoSynthesize = this.autoSynthesize,
        api: customApi = null,
        callbacks = {}
      } = params;

      const API = customApi || getAPI();
      if (!API || !API.streamChatCompletion) {
        throw new Error('Módulo ChatAPI no disponible para ejecución agéntica.');
      }

      const ContextManager = getContextManager();
      const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

      // Configuración de cancelación y timeouts
      let isTimedOut = false;
      let isCancelled = false;
      const internalAbortController = new AbortController();
      let timeoutTimer = null;

      if (timeoutMs > 0) {
        timeoutTimer = setTimeout(() => {
          isTimedOut = true;
          internalAbortController.abort();
          if (callbacks.onTimeout) {
            callbacks.onTimeout(timeoutMs, stepIndex);
          }
        }, timeoutMs);
      }

      if (signal) {
        if (signal.aborted) {
          isCancelled = true;
          internalAbortController.abort();
        } else {
          signal.addEventListener('abort', () => {
            isCancelled = true;
            internalAbortController.abort();
            if (callbacks.onAbort) callbacks.onAbort();
          });
        }
      }

      const combinedSignal = internalAbortController.signal;

      let stepIndex = 0;
      let workingMessages = [...messages];
      let finalAccumulatedText = '';
      let finalReasoningText = '';
      let lastStats = null;
      const toolExecutions = [];
      const toolCallSignatures = [];
      let status = 'completed';
      let executionError = null;

      while (stepIndex < maxSteps) {
        if (combinedSignal.aborted) {
          status = isTimedOut ? 'timeout' : 'cancelled';
          executionError = new Error(isTimedOut ? 'Tiempo límite de ejecución agéntica excedido.' : 'Ejecución agéntica cancelada por el usuario.');
          break;
        }

        if (callbacks.onStepStart) {
          callbacks.onStepStart(stepIndex);
        }

        // 1. Optimización dinámica de presupuesto de contexto (Context Budget)
        let stepMessages = workingMessages;
        if (ContextManager && ContextManager.buildOptimizedContext) {
          try {
            const opt = ContextManager.buildOptimizedContext(workingMessages, {
              model,
              providerType: apiType
            });
            if (opt && opt.messages) {
              stepMessages = opt.messages;
            }
          } catch (e) {
            stepMessages = workingMessages;
          }
        }

        // 2. Definición de herramientas activas
        const activeToolDefs = enableTools
          ? this.registry.getDefinitions(toolFilterOptions)
          : [];

        let currentStepText = '';
        let currentStepReasoning = '';
        let stepToolCalls = null;
        let stepStats = null;
        let streamError = null;

        const isFirstStep = stepIndex === 0;
        const currentCacheInvalidated = isFirstStep && cacheInvalidated;

        try {
          const streamResult = await API.streamChatCompletion({
            apiUrl,
            apiType,
            apiKey,
            model,
            messages: stepMessages,
            temperature,
            reasoningEffort,
            enableTools: activeToolDefs.length > 0,
            enableAgentJs: toolFilterOptions.enableAgentJs !== false,
            enableAgentWeb: toolFilterOptions.enableAgentWeb !== false,
            enableAgentSearch: toolFilterOptions.enableAgentSearch !== false,
            enableAgentChart: toolFilterOptions.enableAgentChart !== false,
            enableContextCache,
            cacheInvalidated: currentCacheInvalidated,
            cacheRevision,
            signal: combinedSignal,

            onReasoningChunk: (chunk, accumulated) => {
              currentStepReasoning = accumulated;
              if (callbacks.onReasoningChunk) callbacks.onReasoningChunk(chunk, accumulated);
            },
            onLog: (logData) => {
              if (callbacks.onLog) callbacks.onLog(logData);
            },
            onChunk: (fullTextSoFar, delta, stats) => {
              currentStepText = fullTextSoFar;
              if (callbacks.onChunk) callbacks.onChunk(fullTextSoFar, delta, stats);
            },
            onDone: (finalText, stats, toolCalls, reasoning) => {
              currentStepText = finalText || currentStepText;
              currentStepReasoning = reasoning || currentStepReasoning;
              stepStats = stats;
              stepToolCalls = toolCalls;
            },
            onError: (error) => {
              streamError = error;
              if (callbacks.onError) callbacks.onError(error);
            }
          });

          if (streamError) {
            if (combinedSignal.aborted) {
              status = isTimedOut ? 'timeout' : 'cancelled';
              executionError = new Error(isTimedOut ? 'Tiempo límite de ejecución agéntica excedido.' : 'Ejecución agéntica cancelada por el usuario.');
            } else {
              status = 'error';
              executionError = streamError;
              if (callbacks.onError) callbacks.onError(streamError);
            }
            break;
          }

          if (streamResult) {
            currentStepText = streamResult.accumulatedText || currentStepText;
            currentStepReasoning = streamResult.accumulatedReasoning || currentStepReasoning;
            stepToolCalls = streamResult.toolCalls || stepToolCalls;
            stepStats = streamResult.stats || stepStats;
          }

          lastStats = stepStats || lastStats;
          if (currentStepReasoning) {
            finalReasoningText += (finalReasoningText ? '\n' : '') + currentStepReasoning;
          }

          // Extraer tool calls de texto si no llegaron estructuradas
          if ((!stepToolCalls || stepToolCalls.length === 0) && currentStepText) {
            if (API.extractToolCallsFromText) {
              const textCalls = API.extractToolCallsFromText(currentStepText);
              if (textCalls && textCalls.length > 0) {
                stepToolCalls = textCalls;
              }
            }
          }

          // Caso A: Sin llamadas a herramientas -> Turno final o necesidad de síntesis
          if (!stepToolCalls || stepToolCalls.length === 0) {
            // Si el texto devuelto está vacío y el paso previo fue una tool, forzar turno de síntesis
            if ((!currentStepText || currentStepText.trim() === '') && stepIndex > 0 && workingMessages.length > 0 && workingMessages[workingMessages.length - 1].role === 'tool' && autoSynthesize && !combinedSignal.aborted) {
              if (callbacks.onSynthesize) callbacks.onSynthesize(stepIndex);
              try {
                const synthMessages = [
                  ...workingMessages,
                  {
                    role: 'user',
                    content: 'Por favor, proporciona un resumen final completo, estructurado y detallado respondiendo a mi consulta a partir de toda la información obtenida por las herramientas.'
                  }
                ];
                const synthRes = await API.streamChatCompletion({
                  apiUrl,
                  apiType,
                  apiKey,
                  model,
                  messages: synthMessages,
                  temperature,
                  reasoningEffort,
                  enableTools: true,
                  toolChoice: 'none',
                  enableContextCache,
                  signal: combinedSignal,
                  onChunk: (fullTextSoFar, delta, stats) => {
                    currentStepText = fullTextSoFar;
                    if (callbacks.onChunk) callbacks.onChunk(fullTextSoFar, delta, stats);
                  },
                  onDone: (finalText, stats) => {
                    currentStepText = finalText || currentStepText;
                    lastStats = stats || lastStats;
                  }
                });
                if (synthRes && synthRes.accumulatedText) {
                  currentStepText = synthRes.accumulatedText;
                }
              } catch (synthErr) {
                if (callbacks.onLog) callbacks.onLog({ type: 'warn', text: `Auto-síntesis fallida: ${synthErr.message}` });
              }
            }

            // Si el modelo todavía no devolvió texto, recopilar los resultados de las herramientas
            if (!currentStepText || currentStepText.trim() === '') {
              const toolContents = workingMessages
                .filter(m => m.role === 'tool' && m.content)
                .map(m => m.content)
                .filter(Boolean);
              if (toolContents.length > 0) {
                currentStepText = '### Resumen de la Información Consultada\n\n' + toolContents.join('\n\n---\n\n');
              }
            }

            finalAccumulatedText = currentStepText;
            if (callbacks.onStepDone) {
              callbacks.onStepDone(stepIndex, {
                type: 'final_response',
                text: currentStepText,
                stats: lastStats
              });
            }
            status = 'completed';
            break;
          }

          // Caso B: Llamada a herramienta detectada
          const primaryCall = stepToolCalls[0];
          const callFingerprint = this.getToolCallFingerprint(primaryCall);
          const identicalCount = toolCallSignatures.filter(sig => sig === callFingerprint).length;

          // Detección y protección contra bucles infinitos
          if (identicalCount >= loopThreshold) {
            status = 'loop_detected';
            if (callbacks.onLoopDetected) {
              callbacks.onLoopDetected(primaryCall, identicalCount + 1, stepIndex);
            }
            const loopWarning = `\n\n> ⚠️ *[Protección de Bucle Infinito]*: La herramienta \`${primaryCall.function?.name}\` ha sido invocada repetidamente (${identicalCount + 1} veces) con los mismos parámetros. Deteniendo ciclo de ejecución.`;
            currentStepText = (currentStepText || '') + loopWarning;
            finalAccumulatedText = currentStepText;

            if (autoSynthesize && !combinedSignal.aborted) {
              if (callbacks.onSynthesize) callbacks.onSynthesize(stepIndex);
              try {
                const synthRes = await API.streamChatCompletion({
                  apiUrl,
                  apiType,
                  apiKey,
                  model,
                  messages: [
                    ...workingMessages,
                    { role: 'assistant', content: currentStepText }
                  ],
                  temperature,
                  reasoningEffort,
                  enableTools: false,
                  enableContextCache,
                  signal: combinedSignal,
                  onChunk: (fullTextSoFar, delta, stats) => {
                    finalAccumulatedText = fullTextSoFar;
                    if (callbacks.onChunk) callbacks.onChunk(fullTextSoFar, delta, stats);
                  },
                  onDone: (finalText, stats) => {
                    finalAccumulatedText = finalText || finalAccumulatedText;
                    lastStats = stats || lastStats;
                  }
                });
              } catch (e) {}
            }
            break;
          }
          toolCallSignatures.push(callFingerprint);

          // Iniciar ejecución de la herramienta con soporte de reintentos
          if (callbacks.onToolStart) {
            const toolInstance = this.registry.getTool(primaryCall.function?.name);
            callbacks.onToolStart(primaryCall, toolInstance, stepIndex);
          }

          const execResult = await this.executeToolWithRetries(
            primaryCall,
            { signal: combinedSignal, ...params },
            maxRetries,
            (tc, attempt, total, err) => {
              if (callbacks.onRetry) {
                callbacks.onRetry(tc, attempt, total, err, stepIndex);
              }
            }
          );

          let toolResponseContent = '';
          if (execResult.success && execResult.result !== undefined) {
            toolResponseContent = typeof execResult.result === 'object'
              ? JSON.stringify(execResult.result)
              : String(execResult.result);
          } else {
            toolResponseContent = JSON.stringify({
              success: false,
              error: execResult.error || 'Error desconocido ejecutando la herramienta.'
            });
            if (callbacks.onToolError) {
              callbacks.onToolError(primaryCall, execResult.error, stepIndex);
            }
          }

          if (callbacks.onToolComplete) {
            callbacks.onToolComplete(primaryCall, execResult, toolResponseContent, stepIndex);
          }

          toolExecutions.push({
            step: stepIndex,
            toolName: primaryCall.function?.name || 'tool',
            args: execResult.args || primaryCall.function?.arguments,
            result: execResult.result,
            success: execResult.success,
            executionTimeMs: execResult.executionTimeMs || 0,
            error: execResult.error || null
          });

          // Actualizar historial asegurando el emparejamiento estricto assistant(tool_calls) <-> tool(results)
          const assistantMsg = {
            id: `msg_turn_${stepIndex}_assistant`,
            role: 'assistant',
            content: currentStepText || null,
            tool_calls: [primaryCall]
          };

          const toolMsg = {
            id: `msg_turn_${stepIndex}_tool_${primaryCall.id || 'res'}`,
            role: 'tool',
            tool_call_id: primaryCall.id || `call_${Date.now()}`,
            name: primaryCall.function?.name || 'tool',
            content: toolResponseContent
          };

          workingMessages.push(assistantMsg);
          workingMessages.push(toolMsg);

          if (callbacks.onStepDone) {
            callbacks.onStepDone(stepIndex, {
              type: 'tool_execution',
              toolCall: primaryCall,
              execResult,
              assistantMsg,
              toolMsg
            });
          }

          stepIndex++;
        } catch (err) {
          if (combinedSignal.aborted) {
            status = isTimedOut ? 'timeout' : 'cancelled';
            executionError = new Error(isTimedOut ? 'Tiempo límite de ejecución agéntica excedido.' : 'Ejecución agéntica cancelada por el usuario.');
          } else {
            status = 'error';
            executionError = err;
            if (callbacks.onError) callbacks.onError(err);
          }
          break;
        }
      }

      // Si se alcanzó el límite máximo de iteraciones
      if (stepIndex >= maxSteps && status === 'completed') {
        status = 'max_steps';
        if (workingMessages.length > 0 && workingMessages[workingMessages.length - 1].role === 'tool' && autoSynthesize && !combinedSignal.aborted) {
          if (callbacks.onSynthesize) callbacks.onSynthesize(stepIndex);
          try {
            const synthMessages = [
              ...workingMessages,
              {
                role: 'user',
                content: 'Por favor, proporciona un resumen final completo, estructurado y detallado respondiendo a mi consulta a partir de toda la información obtenida por las herramientas.'
              }
            ];
            const synthRes = await API.streamChatCompletion({
              apiUrl,
              apiType,
              apiKey,
              model,
              messages: synthMessages,
              temperature,
              reasoningEffort,
              enableTools: true,
              toolChoice: 'none',
              enableContextCache,
              signal: combinedSignal,
              onChunk: (fullTextSoFar, delta, stats) => {
                finalAccumulatedText = fullTextSoFar;
                if (callbacks.onChunk) callbacks.onChunk(fullTextSoFar, delta, stats);
              },
              onDone: (finalText, stats) => {
                finalAccumulatedText = finalText || finalAccumulatedText;
                lastStats = stats || lastStats;
              }
            });
            if (synthRes && synthRes.accumulatedText) {
              finalAccumulatedText = synthRes.accumulatedText;
            }
          } catch (e) {}

          if (!finalAccumulatedText || finalAccumulatedText.trim() === '') {
            const toolContents = workingMessages
              .filter(m => m.role === 'tool' && m.content)
              .map(m => m.content)
              .filter(Boolean);
            if (toolContents.length > 0) {
              finalAccumulatedText = '### Resumen de la Información Consultada\n\n' + toolContents.join('\n\n---\n\n');
            }
          }
        }
      }

      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }

      const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const totalElapsedMs = Math.round(endTime - startTime);

      if (callbacks.onDone) {
        callbacks.onDone(finalAccumulatedText, lastStats, stepIndex);
      }

      return {
        success: status === 'completed' || status === 'max_steps' || status === 'loop_detected',
        status,
        finalText: finalAccumulatedText,
        reasoningText: finalReasoningText,
        stepsCount: stepIndex,
        maxStepsReached: status === 'max_steps',
        loopDetected: status === 'loop_detected',
        toolExecutions,
        history: workingMessages,
        stats: {
          totalTimeMs: totalElapsedMs,
          tokens: lastStats?.tokens || 0,
          tokensPerSec: lastStats?.tokensPerSec || 0,
          cachedTokens: lastStats?.cachedTokens || 0,
          ttftSec: lastStats?.ttftSec || 0
        },
        error: executionError
      };
    }
  }

  /**
   * Orquestador Agéntico del Ciclo de Vida de Conversación (AgentCore).
   * Mantiene compatibilidad total con la API previa extendiendo AgentRuntime.
   */
  class AgentCore extends AgentRuntime {
    constructor(options = {}) {
      super(options);
      this.maxTurns = this.maxSteps;
    }

    /**
     * Alias compatible con la firma previa runConversationLoop.
     */
    async runConversationLoop(params = {}) {
      return this.execute(params);
    }
  }

  const globalRegistry = new ToolRegistry();
  const globalExecutor = new ToolExecutor(globalRegistry);
  const globalRuntime = new AgentRuntime({ registry: globalRegistry, executor: globalExecutor });
  const globalAgent = new AgentCore({ registry: globalRegistry, executor: globalExecutor });

  return {
    Tool,
    BaseToolProvider,
    BuiltinToolProvider,
    ToolRegistry,
    ToolExecutor,
    AgentRuntime,
    AgentCore,
    registry: globalRegistry,
    executor: globalExecutor,
    runtime: globalRuntime,
    agent: globalAgent,
    dispatchToolCall: (toolCall, options) => globalExecutor.dispatchToolCall(toolCall, options),
    executeToolCall: (toolCall, context) => globalExecutor.executeToolCall(toolCall, context)
  };
});

