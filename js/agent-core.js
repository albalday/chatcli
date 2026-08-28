/**
 * Módulo de Núcleo Agéntico y Sistema Modular de Herramientas (ChatAgentCore) para ChatCLI.
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

  /**
   * Representa una herramienta individual ejecutable (Tool).
   */
  class Tool {
    constructor(options = {}) {
      this.name = options.name || '';
      this.description = options.description || '';
      this.parameters = options.parameters || { type: 'object', properties: {} };
      this.aliases = Array.isArray(options.aliases) ? options.aliases : [];
      this.category = options.category || 'general';
      this.metadata = options.metadata || {};
      this.handler = options.handler || null;
      this.formatter = options.formatter || null;
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
   * Proveedor de herramientas nativas de ChatCLI (BuiltinToolProvider).
   * Provee: execute_javascript, search_web, fetch_web_page, download_pdf, render_chart.
   */
  class BuiltinToolProvider extends BaseToolProvider {
    constructor() {
      super({ id: 'builtin', name: 'ChatCLI Built-in Tools' });
    }

    getTools() {
      const tools = [];

      // 1. Herramienta execute_javascript
      tools.push(new Tool({
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
        handler: async (args, context) => {
          const Sandbox = getSandbox();
          const code = args.code || args.javascript || args.js || args.script || args.input || (typeof args === 'string' ? args : '');
          if (!Sandbox || !Sandbox.execute) {
            return { success: false, error: 'Módulo Sandbox no disponible.' };
          }
          return Sandbox.execute(code, context.options || {});
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
        handler: async (args, context) => {
          const Charts = getCharts();
          if (!Charts || !Charts.renderChart) {
            return { success: false, error: 'Módulo Charts no disponible.' };
          }
          const svgHtml = Charts.renderChart(args);
          return {
            success: !!svgHtml,
            svg: svgHtml,
            chartData: args,
            title: args.title || 'Gráfico'
          };
        },
        formatter: (args, result) => {
          return `> 📊 **render_chart**: ${args.title || 'Gráfico'} (${args.type || 'bar'})\n> [Gráfico interactivo generado correctamente]`;
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
     * Devuelve las definiciones Function Calling de las herramientas filtradas.
     */
    getDefinitions(filterOptions = {}) {
      const defs = [];
      for (const [name, tool] of this.tools.entries()) {
        // Filtrar por categorías o habilitaciones booleanas
        if (filterOptions.category && tool.category !== filterOptions.category) continue;
        if (filterOptions.enabledCategories && !filterOptions.enabledCategories.includes(tool.category)) continue;

        // Filtros específicos por herramienta
        if (name === 'execute_javascript' && filterOptions.enableAgentJs === false) continue;
        if ((name === 'fetch_web_page' || name === 'download_pdf') && filterOptions.enableAgentWeb === false) continue;
        if (name === 'search_web' && filterOptions.enableAgentSearch === false) continue;
        if (name === 'render_chart' && filterOptions.enableAgentChart === false) continue;

        defs.push(tool.getDefinition());
      }
      return defs;
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
        const queryMatch = str.match(/(?:query|q|search)\s*[:=]\s*["']?([^"'\s,}]+)/i);
        const codeMatch = str.match(/(?:code|js|javascript)\s*[:=]\s*["']?([^"'\s,}]+)/i);

        if (urlMatch) return { url: urlMatch[1] };
        if (queryMatch) return { query: queryMatch[1] };
        if (codeMatch) return { code: codeMatch[1] };

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
  }

  /**
   * Orquestador Agéntico del Ciclo de Vida de Conversación (AgentCore).
   * Gestiona el bucle agéntico multi-turno, protección de bucles infinitos, cancelación y contexto.
   */
  class AgentCore {
    constructor(options = {}) {
      this.registry = options.registry || new ToolRegistry();
      this.executor = options.executor || new ToolExecutor(this.registry);
      this.maxTurns = options.maxTurns || 5;
    }

    /**
     * Genera una huella única para la llamada a herramienta para detectar bucles infinitos.
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
     * Ejecuta el ciclo de vida conversacional completo de un turno del asistente.
     */
    async runConversationLoop(params = {}) {
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
        callbacks = {}
      } = params;

      const API = getAPI();
      if (!API || !API.streamChatCompletion) {
        throw new Error('Módulo ChatAPI no disponible.');
      }

      let turnIndex = 0;
      let workingMessages = [...messages];
      let finalAccumulatedText = '';
      let lastStats = null;
      const executedTurnHistory = [];
      const toolCallSignatures = [];

      while (turnIndex < this.maxTurns) {
        if (signal && signal.aborted) {
          if (callbacks.onAbort) callbacks.onAbort();
          break;
        }

        if (callbacks.onTurnStart) {
          callbacks.onTurnStart(turnIndex);
        }

        // Obtener lista de herramientas habilitadas según el filtro
        const activeToolDefs = enableTools
          ? this.registry.getDefinitions(toolFilterOptions)
          : [];

        let currentTurnText = '';
        let turnToolCalls = null;
        let turnStats = null;
        let streamError = null;

        const isFirstTurn = turnIndex === 0;
        const currentCacheInvalidated = isFirstTurn && cacheInvalidated;

        const streamResult = await API.streamChatCompletion({
          apiUrl,
          apiType,
          apiKey,
          model,
          messages: workingMessages,
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
          signal,

          onReasoningChunk: (chunk, accumulated) => {
            if (callbacks.onReasoningChunk) callbacks.onReasoningChunk(chunk, accumulated);
          },
          onLog: (logData) => {
            if (callbacks.onLog) callbacks.onLog(logData);
          },
          onChunk: (fullTextSoFar, delta, stats) => {
            currentTurnText = fullTextSoFar;
            if (callbacks.onChunk) callbacks.onChunk(fullTextSoFar, delta, stats);
          },
          onDone: (finalText, stats, toolCalls) => {
            currentTurnText = finalText || currentTurnText;
            turnStats = stats;
            turnToolCalls = toolCalls;
          },
          onError: (error) => {
            streamError = error;
            if (callbacks.onError) callbacks.onError(error);
          }
        });

        if (streamError) {
          return {
            success: false,
            error: streamError,
            turnIndex,
            history: workingMessages
          };
        }

        if (streamResult) {
          currentTurnText = streamResult.accumulatedText || currentTurnText;
          turnToolCalls = streamResult.toolCalls || turnToolCalls;
          turnStats = streamResult.stats || turnStats;
        }

        lastStats = turnStats || lastStats;

        // Extraer tool calls de texto si no llegaron estructuradas
        if ((!turnToolCalls || turnToolCalls.length === 0) && currentTurnText) {
          if (API.extractToolCallsFromText) {
            const textCalls = API.extractToolCallsFromText(currentTurnText);
            if (textCalls && textCalls.length > 0) {
              turnToolCalls = textCalls;
            }
          }
        }

        // Si no hay tool calls generadas, es la respuesta final -> finalizar el bucle
        if (!turnToolCalls || turnToolCalls.length === 0) {
          finalAccumulatedText = currentTurnText;
          if (callbacks.onDone) {
            callbacks.onDone(currentTurnText, lastStats, turnIndex);
          }
          return {
            success: true,
            finalText: currentTurnText,
            turnsCount: turnIndex + 1,
            stats: lastStats,
            history: workingMessages
          };
        }

        // Protección contra Bucles Infinitos: Analizar repetición de llamadas
        const primaryCall = turnToolCalls[0];
        const callFingerprint = this.getToolCallFingerprint(primaryCall);
        const identicalCount = toolCallSignatures.filter(sig => sig === callFingerprint).length;

        if (identicalCount >= 2) {
          const loopWarning = `\n\n> ⚠️ *[Protección de Bucle Infinito]*: La herramienta \`${primaryCall.function.name}\` ha sido invocada 3 veces con los mismos parámetros. Se detiene la iteración automática.`;
          currentTurnText = (currentTurnText || '') + loopWarning;
          finalAccumulatedText = currentTurnText;

          if (callbacks.onDone) {
            callbacks.onDone(currentTurnText, lastStats, turnIndex);
          }
          return {
            success: true,
            finalText: currentTurnText,
            turnsCount: turnIndex + 1,
            stats: lastStats,
            loopDetected: true,
            history: workingMessages
          };
        }
        toolCallSignatures.push(callFingerprint);

        // Procesar la llamada a la herramienta con ToolExecutor
        if (callbacks.onToolStart) {
          const toolInstance = this.registry.getTool(primaryCall.function?.name);
          callbacks.onToolStart(primaryCall, toolInstance, turnIndex);
        }

        const execResult = await this.executor.executeToolCall(primaryCall, { signal, ...params });

        // Preparar contenido serializado para el mensaje de respuesta de la herramienta (role: 'tool')
        let toolResponseContent = '';
        if (execResult.success && execResult.result) {
          toolResponseContent = typeof execResult.result === 'object'
            ? JSON.stringify(execResult.result)
            : String(execResult.result);
        } else {
          toolResponseContent = JSON.stringify({
            success: false,
            error: execResult.error || 'Error desconocido ejecutando la herramienta.'
          });
        }

        if (callbacks.onToolComplete) {
          callbacks.onToolComplete(primaryCall, execResult, toolResponseContent, turnIndex);
        }

        // Actualizar workingMessages emparejando estrictamente assistant tool_calls con tool result
        const assistantTurnMsg = {
          id: `msg_turn_${turnIndex}_assistant`,
          role: 'assistant',
          content: currentTurnText || null,
          tool_calls: [primaryCall]
        };

        const toolResultMsg = {
          id: `msg_turn_${turnIndex}_tool_${primaryCall.id || 'res'}`,
          role: 'tool',
          tool_call_id: primaryCall.id || `call_${Date.now()}`,
          name: primaryCall.function?.name || 'tool',
          content: toolResponseContent
        };

        workingMessages.push(assistantTurnMsg);
        workingMessages.push(toolResultMsg);

        executedTurnHistory.push({
          turnIndex,
          assistantMsg: assistantTurnMsg,
          toolMsg: toolResultMsg,
          execResult
        });

        turnIndex++;
      }

      // Si se alcanzó el límite máximo de iteraciones
      if (callbacks.onDone) {
        callbacks.onDone(finalAccumulatedText, lastStats, turnIndex);
      }

      return {
        success: true,
        finalText: finalAccumulatedText,
        turnsCount: turnIndex,
        maxTurnsReached: true,
        stats: lastStats,
        history: workingMessages
      };
    }
  }

  const globalRegistry = new ToolRegistry();
  const globalExecutor = new ToolExecutor(globalRegistry);
  const globalAgent = new AgentCore({ registry: globalRegistry, executor: globalExecutor });

  return {
    Tool,
    BaseToolProvider,
    BuiltinToolProvider,
    ToolRegistry,
    ToolExecutor,
    AgentCore,
    registry: globalRegistry,
    executor: globalExecutor,
    agent: globalAgent
  };
});
