/**
 * Módulo para interactuar con la API compatible de OpenAI, Claude, Gemini, Ollama y OpenRouter (ChatAPI).
 * Actúa como orquestador común de transporte HTTP/SSE delegando las particularidades en los adaptadores (ChatProviders).
 * Compatible con file://, http:// y Node.js.
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatAPI = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const Sandbox = typeof window !== 'undefined' ? (window.ChatSandbox || {}) : {};
  const WebBrowser = typeof window !== 'undefined' ? (window.ChatWebBrowser || {}) : {};
  const WebSearch = typeof window !== 'undefined' ? (window.ChatWebSearch || {}) : {};
  const ProvidersModule = typeof window !== 'undefined' ? (window.ChatProviders || {}) : (typeof require !== 'undefined' ? (() => { try { return require('./providers.js'); } catch(e) { return {}; } })() : {});
  const registry = ProvidersModule.registry || (ProvidersModule.ProviderRegistry ? new ProvidersModule.ProviderRegistry() : null);

  /**
   * Normaliza los nombres de las herramientas admitiendo variaciones con y sin guiones bajos.
   */
  function normalizeToolName(rawName) {
    if (!rawName) return '';
    const clean = String(rawName).trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const noUnderscore = clean.replace(/_/g, '');

    // 1. Descarga y extracción de PDF
    if (
      clean === 'download_pdf' ||
      clean === 'fetch_pdf' ||
      clean === 'download_pdf_document' ||
      clean === 'fetch_pdf_document' ||
      clean === 'download_file' ||
      noUnderscore === 'downloadpdf' ||
      noUnderscore === 'fetchpdf' ||
      noUnderscore === 'downloadpdfdocument' ||
      noUnderscore === 'fetchpdfdocument' ||
      noUnderscore === 'downloadfile' ||
      noUnderscore === 'getpdf' ||
      noUnderscore === 'readpdf'
    ) {
      return 'download_pdf';
    }

    // 2. Navegación / Consulta de página web
    if (
      clean === 'fetch_web_page' ||
      clean === 'fetch_web' ||
      clean === 'fetch_url' ||
      clean === 'get_web_page' ||
      clean === 'read_web_page' ||
      clean === 'web_fetch' ||
      clean === 'browse_web' ||
      noUnderscore === 'fetchwebpage' ||
      noUnderscore === 'fetchweb' ||
      noUnderscore === 'fetchurl' ||
      noUnderscore === 'getwebpage' ||
      noUnderscore === 'readwebpage' ||
      noUnderscore === 'webpage' ||
      noUnderscore === 'browse'
    ) {
      return 'fetch_web_page';
    }

    // 3. Búsqueda en internet
    if (
      clean === 'search_web' ||
      clean === 'web_search' ||
      clean === 'duckduckgo_search' ||
      clean === 'duckduckgo' ||
      clean === 'search_internet' ||
      clean === 'internet_search' ||
      noUnderscore === 'searchweb' ||
      noUnderscore === 'websearch' ||
      noUnderscore === 'duckduckgosearch' ||
      noUnderscore === 'searchinternet' ||
      noUnderscore === 'internetsearch' ||
      noUnderscore === 'search'
    ) {
      return 'search_web';
    }

    // 4. Ejecución de JavaScript
    if (
      clean === 'execute_javascript' ||
      clean === 'execute_js' ||
      clean === 'run_javascript' ||
      clean === 'run_js' ||
      noUnderscore === 'executejavascript' ||
      noUnderscore === 'executejs' ||
      noUnderscore === 'runjavascript' ||
      noUnderscore === 'runjs' ||
      noUnderscore === 'javascript' ||
      noUnderscore === 'evaljs' ||
      noUnderscore === 'evaljavascript'
    ) {
      return 'execute_javascript';
    }

    // 5. Renderizado de Gráficos (render_chart)
    if (
      clean === 'render_chart' ||
      clean === 'draw_chart' ||
      clean === 'create_chart' ||
      clean === 'plot_chart' ||
      clean === 'generate_chart' ||
      clean === 'show_chart' ||
      noUnderscore === 'renderchart' ||
      noUnderscore === 'drawchart' ||
      noUnderscore === 'createchart' ||
      noUnderscore === 'plotchart' ||
      noUnderscore === 'chart' ||
      noUnderscore === 'grafico'
    ) {
      return 'render_chart';
    }

    // 6. Base de Conocimiento RAG (read_chapter_content)
    if (
      clean === 'read_chapter_content' ||
      clean === 'read_chapter' ||
      clean === 'get_chapter' ||
      clean === 'get_chapter_content' ||
      clean === 'read_doc_chapter' ||
      noUnderscore === 'readchaptercontent' ||
      noUnderscore === 'readchapter' ||
      noUnderscore === 'getchapter' ||
      noUnderscore === 'getchaptercontent' ||
      noUnderscore === 'readdocchapter'
    ) {
      return 'read_chapter_content';
    }

    return clean;
  }

  /**
   * Extrae llamadas a herramientas cuando el modelo las emite como texto en el cuerpo del mensaje
   * (tokens especiales de Llama 3/Hermes <|toolcall>call:func{...}<toolcall|>, XML, markdown o JSON).
   */
  function extractToolCallsFromText(text) {
    if (!text || typeof text !== 'string') return null;
    const trimmed = text.trim();

    // 1. Limpieza y soporte de sintaxis especial de Llama 3 / Hermes / Mistral / Command-R
    const cleaned = trimmed
      .replace(/<\|"\|>/g, '"')
      .replace(/<\|/g, '')
      .replace(/\|>/g, '')
      .replace(/<\/?tool_?calls?\|?>/gi, '')
      .replace(/\[\/?TOOL_?CALLS?\]/gi, '')
      .trim();

    // 2. Sintaxis directa call:function_name{...}
    const callMatch = cleaned.match(/call:([a-zA-Z0-9_-]+)\s*(\{[\s\S]*?\})/i);
    if (callMatch) {
      const rawName = callMatch[1];
      const normName = normalizeToolName(rawName);
      let rawJson = callMatch[2].replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, (m, p1, p2) => p1 + '"' + p2 + '":');
      try {
        const parsed = JSON.parse(rawJson);
        return [{
          id: `call_${Date.now()}_llama`,
          type: 'function',
          function: {
            name: normName,
            arguments: JSON.stringify(parsed)
          }
        }];
      } catch (e) {
        const urlMatch = rawJson.match(/(?:url|link|href)\s*[:=]\s*["']?([^"'\s,}]+)/i);
        const queryMatch = rawJson.match(/(?:query|q|search)\s*[:=]\s*["']?([^"'\s,}]+)/i);
        const codeMatch = rawJson.match(/(?:code|js|javascript)\s*[:=]\s*["']?([^"'\s,}]+)/i);
        let argObj = {};
        if (urlMatch) argObj.url = urlMatch[1];
        else if (queryMatch) argObj.query = queryMatch[1];
        else if (codeMatch) argObj.code = codeMatch[1];

        return [{
          id: `call_${Date.now()}_llama`,
          type: 'function',
          function: {
            name: normName,
            arguments: JSON.stringify(argObj)
          }
        }];
      }
    }

    // 3. Bloque XML: <tool_call>...</tool_call> o <function_call>...</function_call>
    const xmlMatch = trimmed.match(/<(?:tool_call|function_call|tool_calls)>(.*?)<\/(?:tool_call|function_call|tool_calls)>/s);
    if (xmlMatch) {
      try {
        const parsed = JSON.parse(xmlMatch[1].trim());
        const normName = normalizeToolName(parsed.name || parsed.function?.name || parsed.tool);
        if (normName) {
          const rawArgs = parsed.arguments !== undefined ? parsed.arguments : (parsed.parameters !== undefined ? parsed.parameters : (parsed.input !== undefined ? parsed.input : parsed));
          return [{
            id: `call_${Date.now()}_xml`,
            type: 'function',
            function: {
              name: normName,
              arguments: typeof rawArgs === 'object' ? JSON.stringify(rawArgs) : String(rawArgs || '{}')
            }
          }];
        }
      } catch (e) {}
    }

    // 4. Bloque de código Markdown: ```json { "name": ... } ```
    const codeMatch = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?"name"[\s\S]*?\})\s*```/);
    if (codeMatch) {
      try {
        const parsed = JSON.parse(codeMatch[1].trim());
        const normName = normalizeToolName(parsed.name || parsed.function?.name || parsed.tool);
        if (normName) {
          const rawArgs = parsed.arguments !== undefined ? parsed.arguments : (parsed.parameters !== undefined ? parsed.parameters : (parsed.input !== undefined ? parsed.input : parsed));
          return [{
            id: `call_${Date.now()}_code`,
            type: 'function',
            function: {
              name: normName,
              arguments: typeof rawArgs === 'object' ? JSON.stringify(rawArgs) : String(rawArgs || '{}')
            }
          }];
        }
      } catch (e) {}
    }

    // 5. Objeto JSON crudo que contiene "name" y coincide con alguna herramienta
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        const normName = normalizeToolName(parsed.name || parsed.function?.name || parsed.tool);
        if (normName && (normName === 'download_pdf' || normName === 'fetch_web_page' || normName === 'search_web' || normName === 'execute_javascript' || normName === 'render_chart')) {
          const rawArgs = parsed.arguments !== undefined ? parsed.arguments : (parsed.parameters !== undefined ? parsed.parameters : (parsed.input !== undefined ? parsed.input : parsed));
          return [{
            id: `call_${Date.now()}_json`,
            type: 'function',
            function: {
              name: normName,
              arguments: typeof rawArgs === 'object' ? JSON.stringify(rawArgs) : String(rawArgs || '{}')
            }
          }];
        }
      } catch (e) {}
    }

    // 6. Sintaxis directa: download_pdf("url") o search_web("query") o execute_javascript("code")
    const fnMatch = trimmed.match(/^(download_pdf|downloadpdf|fetch_pdf|fetch_web_page|fetchwebpage|fetch_web|search_web|searchweb|execute_javascript|executejs|execute_js)\s*\(\s*(?:(?:url|query|code)\s*=\s*)?["'`]([\s\S]*?)["'`]\s*\)$/i);
    if (fnMatch) {
      const normName = normalizeToolName(fnMatch[1]);
      const val = fnMatch[2];
      let argObj = {};
      if (normName === 'execute_javascript') argObj = { code: val };
      else if (normName === 'search_web') argObj = { query: val };
      else argObj = { url: val };

      return [{
        id: `call_${Date.now()}_fn`,
        type: 'function',
        function: {
          name: normName,
          arguments: JSON.stringify(argObj)
        }
      }];
    }

    return null;
  }

  /**
   * Detecta el tipo de API adecuado según la URL o tipo explícito.
   */
  function detectApiType(rawUrl, explicitType) {
    if (registry) {
      return registry.detect(rawUrl, explicitType);
    }
    if (explicitType && explicitType !== 'auto') return explicitType;
    const url = (rawUrl || '').toLowerCase().trim();
    if (url.includes('11434') || url.includes('ollama')) return 'ollama';
    if (url.includes('openrouter.ai')) return 'openrouter';
    if (url.includes('anthropic.com')) return 'claude';
    if (url.includes('googleapis.com') || url.includes('gemini')) return 'gemini';
    return 'openai';
  }

  /**
   * Normaliza la URL base al endpoint de chat del proveedor resuelto.
   */
  function normalizeApiUrl(rawUrl, explicitType) {
    if (registry) {
      const adapter = registry.resolve(rawUrl, explicitType);
      return adapter.normalizeEndpoint(rawUrl);
    }
    let url = (rawUrl || 'http://localhost:1234/v1').trim();
    if (url.endsWith('/')) url = url.slice(0, -1);
    const type = detectApiType(url, explicitType);
    if (type === 'ollama') {
      if (url.endsWith('/api/chat') || url.endsWith('/chat/completions')) return url;
      if (url.endsWith('/v1')) return `${url}/chat/completions`;
      return `${url}/v1/chat/completions`;
    }
    if (type === 'claude') {
      if (url.endsWith('/v1/messages') || url.endsWith('/messages') || url.endsWith('/chat/completions')) return url;
      if (url.endsWith('/v1')) return `${url}/messages`;
      return `${url}/v1/messages`;
    }
    if (url.endsWith('/chat/completions')) return url;
    if (url.endsWith('/v1')) return `${url}/chat/completions`;
    return `${url}/v1/chat/completions`;
  }

  /**
   * Estimación aproximada de tokens para textos.
   */
  function estimateTokens(text, chunkCount) {
    if (!text) return 0;
    if (chunkCount && chunkCount > 0) {
      return Math.max(chunkCount, Math.ceil(text.length / 3.8));
    }
    return Math.ceil(text.length / 3.8);
  }

  /**
   * Modos de razonamiento estándar organizados por proveedor.
   */
  const STANDARD_REASONING_MODES = registry ? registry.getReasoningModes() : {
    openai: { type: 'openai', label: 'OpenAI / LM Studio', levels: ['none', 'low', 'medium', 'high', 'xhigh'], description: 'Estándar OpenAI / LM Studio' },
    ollama: { type: 'ollama', label: 'Ollama', levels: ['none', 'low', 'medium', 'high', 'xhigh'], description: 'Estándar Ollama' },
    openrouter: { type: 'openrouter', label: 'OpenRouter', levels: ['none', 'low', 'medium', 'high', 'xhigh'], description: 'Estándar OpenRouter' },
    claude: { type: 'claude', label: 'Anthropic Claude', levels: ['none', 'low', 'medium', 'high', 'xhigh'], description: 'Estándar Claude' },
    gemini: { type: 'gemini', label: 'Google Gemini', levels: ['none', 'low', 'medium', 'high', 'xhigh'], description: 'Estándar Gemini' },
    custom: { type: 'custom', label: 'Personalizado', levels: ['none', 'low', 'medium', 'high', 'xhigh'], description: 'Personalizado' }
  };

  function getStandardReasoningOptions(explicitType, rawUrl) {
    if (registry) {
      const adapter = registry.resolve(rawUrl, explicitType);
      return adapter.getReasoningConfig();
    }
    const type = detectApiType(rawUrl, explicitType);
    return STANDARD_REASONING_MODES[type] || STANDARD_REASONING_MODES.openai;
  }

  /**
   * Consulta los modelos disponibles en el servidor delegando en el adaptador.
   */
  async function fetchServerModels(rawUrl, apiKey, explicitType) {
    let cleanUrl = (rawUrl || 'http://localhost:1234/v1').trim();
    if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
    if (cleanUrl.endsWith('/chat/completions')) cleanUrl = cleanUrl.replace(/\/chat\/completions$/, '');

    const adapter = registry ? registry.resolve(cleanUrl, explicitType) : null;
    if (adapter) {
      const caps = adapter.getCapabilities();
      if (caps && caps.modelListing === false) {
        return {
          success: false,
          error: 'El proveedor configurado no admite descubrimiento automático de modelos.'
        };
      }
    }
    const candidateEndpoints = adapter ? adapter.getModelEndpoints(cleanUrl) : [`${cleanUrl}/v1/models`];

    const headers = { 'Accept': 'application/json' };
    if (apiKey && apiKey.trim() !== '') {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }

    let lastError = null;

    for (const endpoint of candidateEndpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(endpoint, {
          method: 'GET',
          headers: headers,
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
          continue;
        }

        const data = await response.json();
        const extractedModels = adapter ? adapter.parseModelsResponse(data) : (Array.isArray(data.data) ? data.data : []);

        if (extractedModels && extractedModels.length > 0) {
          extractedModels.sort((a, b) => a.id.localeCompare(b.id));
          return {
            success: true,
            endpoint: endpoint,
            models: extractedModels,
            count: extractedModels.length,
            raw: data
          };
        }
      } catch (err) {
        lastError = err;
      }
    }

    return {
      success: false,
      error: lastError ? (lastError.message || String(lastError)) : 'No se pudo obtener la lista de modelos desde los endpoints consultados.'
    };
  }

  /**
   * Orquestador común de streaming HTTP/SSE.
   */
  async function streamChatCompletion(params) {
    const {
      apiUrl,
      apiType,
      apiKey,
      model,
      messages,
      temperature = 0.7,
      reasoningEffort = 'none',
      enableTools = false,
      toolChoice = 'auto',
      enableAgentJs = false,
      enableAgentWeb = false,
      enableAgentSearch = false,
      enableAgentChart = false,
      enableAgentRag = false,
      activeRagBranchId = '',
      enableContextCache = true,
      cacheInvalidated = false,
      cacheRevision = null,
      signal,
      onBeforeRequest,
      onChunk,
      onReasoningChunk,
      onToolCallDelta,
      onLog,
      onDone,
      onError
    } = params;

    const adapter = registry ? registry.resolve(apiUrl, apiType) : null;
    const endpoint = adapter ? adapter.normalizeEndpoint(apiUrl) : normalizeApiUrl(apiUrl, apiType);
    const detectedType = adapter ? adapter.id : detectApiType(apiUrl, apiType);
    const headers = adapter ? adapter.buildHeaders(apiKey) : { 'Content-Type': 'application/json' };

    // Inyectar herramientas agénticas activadas si están disponibles
    let toolsList = [];
    const AgentCore = typeof window !== 'undefined' ? window.ChatAgentCore : (typeof require !== 'undefined' ? (() => { try { return require('./agent-core.js'); } catch(e){ return null; } })() : null);
    const isRagActive = Boolean(enableAgentRag || activeRagBranchId);

    if (enableTools || toolChoice === 'none') {
      if (AgentCore && AgentCore.registry) {
        toolsList = AgentCore.registry.getDefinitions({
          enableAgentJs,
          enableAgentWeb,
          enableAgentSearch,
          enableAgentChart,
          enableAgentRag: isRagActive,
          activeRagBranchId: isRagActive ? activeRagBranchId : ''
        });
      } else {
        const jsTool = Sandbox.JAVASCRIPT_TOOL_DEFINITION || (typeof window !== 'undefined' && window.ChatSandbox && window.ChatSandbox.JAVASCRIPT_TOOL_DEFINITION);
        const webTool = WebBrowser.WEB_TOOL_DEFINITION || (typeof window !== 'undefined' && window.ChatWebBrowser && window.ChatWebBrowser.WEB_TOOL_DEFINITION);
        const pdfTool = WebBrowser.PDF_TOOL_DEFINITION || (typeof window !== 'undefined' && window.ChatWebBrowser && window.ChatWebBrowser.PDF_TOOL_DEFINITION);
        const searchTool = WebSearch.SEARCH_TOOL_DEFINITION || (typeof window !== 'undefined' && window.ChatWebSearch && window.ChatWebSearch.SEARCH_TOOL_DEFINITION);
        const chartTool = (typeof window !== 'undefined' && window.ChatCharts && window.ChatCharts.CHART_TOOL_DEFINITION) || (typeof require !== 'undefined' ? (() => { try { return require('./charts.js').CHART_TOOL_DEFINITION; } catch(e){ return null; } })() : null);

        if (enableAgentJs && jsTool) toolsList.push(jsTool);
        if (enableAgentWeb && webTool) toolsList.push(webTool);
        if (enableAgentWeb && pdfTool) toolsList.push(pdfTool);
        if (enableAgentSearch && searchTool) toolsList.push(searchTool);
        if (enableAgentChart && chartTool) toolsList.push(chartTool);
        if (isRagActive) {
          const ragService = typeof window !== 'undefined' ? window.ChatTreeRagService : (typeof require !== 'undefined' ? (() => { try { return require('./chatService.js'); } catch(e){ return null; } })() : null);
          if (ragService && ragService.READ_CHAPTER_TOOL_DEFINITION) {
            toolsList.push(ragService.READ_CHAPTER_TOOL_DEFINITION);
          }
        }
      }
    }

    // Construcción del payload mediante el adaptador
    const payload = adapter ? adapter.buildPayload({
      model,
      messages,
      temperature,
      reasoningEffort,
      toolsList,
      toolChoice: toolChoice || 'auto',
      enableContextCache: enableContextCache && !cacheInvalidated
    }) : {
      model: (model || '').trim(),
      messages,
      stream: true,
      temperature: parseFloat(temperature) || 0.7
    };

    if (onBeforeRequest) {
      try {
        const debugResult = await onBeforeRequest({ endpoint, headers, payload });
        if (debugResult && debugResult.cancel) {
          if (onLog) {
            onLog({
              type: 'info',
              text: '🛑 Envío de petición cancelado por el usuario en el depurador de mensajes.'
            });
          }
          if (onError) {
            onError('Envío cancelado en depurador de mensajes.');
          }
          return {
            aborted: true,
            cancelled: true,
            text: '',
            toolCalls: null,
            stats: null
          };
        }
        if (debugResult && debugResult.modifiedPayload) {
          Object.keys(payload).forEach(k => delete payload[k]);
          Object.assign(payload, debugResult.modifiedPayload);
        }
      } catch (err) {
        console.warn('ChatAPI: Error en callback onBeforeRequest:', err);
      }
    }

    if (enableContextCache && cacheInvalidated && onLog) {
      onLog({
        type: 'info',
        text: '🔄 Caché de contexto invalidada tras el borrado de mensajes. Se reconstruye un contexto limpio en el servidor.'
      });
    }

    if (onLog) {
      onLog({
        type: 'network',
        text: `POST ${endpoint} [${detectedType.toUpperCase()}] | Modelo: ${model || '(no especificado)'} | Razonamiento: ${reasoningEffort || 'off'} | Temp: ${payload.temperature}${enableContextCache ? (cacheInvalidated ? ' | ContextCache: [INVALIDADA]' : ' | ContextCache: [ACTIVA]') : ''}`
      });
      onLog({
        type: 'raw',
        subtype: 'outgoing',
        text: `>>> OUTGOING POST ${endpoint}\n${JSON.stringify(payload, null, 2)}`
      });
    }

    let accumulatedText = '';
    let accumulatedReasoning = '';
    let accumulatedToolCalls = {};
    let chunkCount = 0;
    let activeReasoningTag = null;
    let serverCachedTokens = 0;
    let serverCacheCreationTokens = 0;
    const requestStartTime = performance.now();
    let firstTokenTime = null;

    function getStats() {
      const now = performance.now();
      const totalElapsedSec = ((now - requestStartTime) / 1000).toFixed(2);
      const tokens = estimateTokens(accumulatedText + accumulatedReasoning, chunkCount);

      if (firstTokenTime) {
        const ttftSec = ((firstTokenTime - requestStartTime) / 1000).toFixed(2);
        const generationElapsedMs = Math.max(now - firstTokenTime, 10);
        const generationElapsedSec = generationElapsedMs / 1000;
        const tokensPerSec = tokens > 0 ? (tokens / generationElapsedSec).toFixed(1) : '0.0';

        return {
          ttftSec: ttftSec,
          generationSec: generationElapsedSec.toFixed(2),
          totalSec: totalElapsedSec,
          tokens: tokens,
          tokensPerSec: tokensPerSec,
          cachedTokens: serverCachedTokens,
          cacheCreationTokens: serverCacheCreationTokens
        };
      } else {
        return {
          ttftSec: totalElapsedSec,
          generationSec: '0.00',
          totalSec: totalElapsedSec,
          tokens: 0,
          tokensPerSec: '0.0',
          cachedTokens: serverCachedTokens,
          cacheCreationTokens: serverCacheCreationTokens
        };
      }
    }

    function getFinalToolCalls() {
      const callIndices = Object.keys(accumulatedToolCalls);
      if (callIndices.length > 0) {
        return callIndices.map(idx => {
          const item = accumulatedToolCalls[idx];
          if (item?.function?.name) {
            item.function.name = normalizeToolName(item.function.name) || item.function.name;
          }
          return item;
        });
      }
      if (accumulatedText) {
        const textToolCalls = extractToolCallsFromText(accumulatedText);
        if (textToolCalls && textToolCalls.length > 0) {
          return textToolCalls;
        }
      }
      return null;
    }

    try {
      let response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
        signal: signal
      });

      if (!response.ok) {
        let serverErrorMsg = '';
        try {
          const rawError = await response.text();
          try {
            const errorJson = JSON.parse(rawError);
            serverErrorMsg = (errorJson && (errorJson.error?.message || errorJson.message || errorJson.error)) || rawError;
          } catch (jsonErr) {
            serverErrorMsg = rawError;
          }
        } catch (readErr) {
          serverErrorMsg = response.statusText;
        }

        // Auto-recuperación delegando en el adaptador
        if (adapter) {
          const recovery = adapter.handleHttpError(response.status, serverErrorMsg, payload);
          if (recovery && recovery.retry) {
            if (onLog) {
              onLog({
                type: 'error',
                text: `HTTP 400: Servidor rechazó parámetro (${recovery.reason || 'parámetro incompatible'}). Reintentando sin él...`
              });
            }
            response = await fetch(endpoint, {
              method: 'POST',
              headers: headers,
              body: JSON.stringify(payload),
              signal: signal
            });
          }
        }

        if (!response.ok) {
          let errorMessage = serverErrorMsg || `Error HTTP ${response.status}: ${response.statusText}`;
          if (response.status === 401) {
            errorMessage = 'Clave de API inválida o no autorizada (401). Verifica tu API Key en la Configuración.';
          } else if (response.status === 404) {
            errorMessage = `Endpoint no encontrado (404). Verifica la URL del servidor: ${endpoint}`;
          }
          if (onLog) {
            onLog({ type: 'error', text: errorMessage });
            onLog({ type: 'raw', subtype: 'incoming', text: `<<< INCOMING HTTP ${response.status} ${response.statusText}\n${serverErrorMsg || errorMessage}` });
          }
          throw new Error(errorMessage);
        }
      }

      if (!response.body) {
        throw new Error('La respuesta del servidor no soporta streaming.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (let i = 0; i < lines.length; i++) {
          const rawLine = lines[i];
          const trimmedLine = rawLine.trim();
          if (!trimmedLine) continue;

          if (onLog) {
            onLog({
              type: 'raw',
              subtype: 'incoming',
              text: rawLine
            });
          }

          if (trimmedLine.startsWith(':')) continue;

          if (trimmedLine.startsWith('data: ')) {
            const dataStr = trimmedLine.substring(6).trim();

            if (dataStr === '[DONE]') {
              const stats = getStats();
              const toolCalls = getFinalToolCalls();
              if (onLog) {
                const cacheInfo = stats.cachedTokens > 0 ? ` | ⚡ Cache: ${stats.cachedTokens} tok` : '';
                onLog({
                  type: 'stats',
                  text: `Streaming finalizado [DONE] | Total: ${stats.tokens} tokens | ${stats.tokensPerSec} t/s | TTFT: ${stats.ttftSec}s${cacheInfo}`
                });
              }
              if (onDone) await onDone(accumulatedText, stats, toolCalls, accumulatedReasoning);
              return { accumulatedText, accumulatedReasoning, stats, toolCalls };
            }

            try {
              const parsed = JSON.parse(dataStr);
              const chunkData = adapter ? adapter.parseStreamChunk(parsed, { firstTokenTime, accumulatedReasoning, accumulatedText }) : { textChunk: parsed.choices?.[0]?.delta?.content || '' };

              if (chunkData.cachedTokens > 0) serverCachedTokens = chunkData.cachedTokens;
              if (chunkData.cacheCreationTokens > 0) serverCacheCreationTokens = chunkData.cacheCreationTokens;

              // Tokens de razonamiento específicos
              if (chunkData.reasoningChunk) {
                if (!firstTokenTime) firstTokenTime = performance.now();
                accumulatedReasoning += chunkData.reasoningChunk;
                if (onReasoningChunk) onReasoningChunk(chunkData.reasoningChunk, accumulatedReasoning);
                if (onLog) onLog({ type: 'thinking', text: chunkData.reasoningChunk });
              }

              // Contenido textual con soporte de etiquetas <think>, <thought>, <reasoning>
              const textChunk = chunkData.textChunk;
              if (textChunk) {
                if (!firstTokenTime) firstTokenTime = performance.now();

                let remaining = textChunk;
                while (remaining.length > 0) {
                  if (!activeReasoningTag) {
                    const openMatch = remaining.match(/<(think|thought|reasoning)>/i);
                    if (openMatch) {
                      const preText = remaining.slice(0, openMatch.index);
                      if (preText) {
                        accumulatedText += preText;
                        chunkCount++;
                        if (onChunk) onChunk(accumulatedText, preText, getStats());
                      }
                      activeReasoningTag = openMatch[1].toLowerCase();
                      remaining = remaining.slice(openMatch.index + openMatch[0].length);
                    } else {
                      accumulatedText += remaining;
                      chunkCount++;
                      if (onChunk) onChunk(accumulatedText, remaining, getStats());
                      remaining = '';
                    }
                  } else {
                    const closeRegex = new RegExp(`<\/${activeReasoningTag}>`, 'i');
                    const closeMatch = remaining.match(closeRegex);
                    if (closeMatch) {
                      const rText = remaining.slice(0, closeMatch.index);
                      if (rText) {
                        accumulatedReasoning += rText;
                        if (onReasoningChunk) onReasoningChunk(rText, accumulatedReasoning);
                        if (onLog) onLog({ type: 'thinking', text: rText });
                      }
                      activeReasoningTag = null;
                      remaining = remaining.slice(closeMatch.index + closeMatch[0].length);
                    } else {
                      accumulatedReasoning += remaining;
                      if (onReasoningChunk) onReasoningChunk(remaining, accumulatedReasoning);
                      if (onLog) onLog({ type: 'thinking', text: remaining });
                      remaining = '';
                    }
                  }
                }
              }

              // Tool Call Deltas
              if (chunkData.toolCallDeltas && chunkData.toolCallDeltas.length > 0) {
                if (!firstTokenTime) firstTokenTime = performance.now();
                chunkData.toolCallDeltas.forEach(tc => {
                  const idx = tc.index ?? 0;
                  if (!accumulatedToolCalls[idx]) {
                    accumulatedToolCalls[idx] = {
                      id: tc.id || `call_${Date.now()}_${idx}`,
                      type: 'function',
                      function: {
                        name: tc.function?.name || '',
                        arguments: ''
                      }
                    };
                  }
                  if (tc.id) accumulatedToolCalls[idx].id = tc.id;
                  if (tc.function?.name) accumulatedToolCalls[idx].function.name = tc.function.name;
                  if (tc.function?.arguments) accumulatedToolCalls[idx].function.arguments += tc.function.arguments;
                  if (tc.thought_signature) accumulatedToolCalls[idx].thought_signature = tc.thought_signature;
                  if (tc.extra_content) accumulatedToolCalls[idx].extra_content = tc.extra_content;
                  if (tc.provider_specific_fields) accumulatedToolCalls[idx].provider_specific_fields = tc.provider_specific_fields;
                  if (chunkData.thoughtSignature && !accumulatedToolCalls[idx].thought_signature) {
                    accumulatedToolCalls[idx].thought_signature = chunkData.thoughtSignature;
                  }

                  if (onToolCallDelta) onToolCallDelta(accumulatedToolCalls[idx]);
                });
              }

              // Usage logging si viene en el chunk
              if (chunkData.usage && onLog) {
                const streamUsage = chunkData.usage;
                const rTokens = streamUsage.completion_tokens_details?.reasoning_tokens;
                const cTokens = serverCachedTokens > 0 ? ` (⚡ Cache: ${serverCachedTokens} tok)` : '';
                onLog({
                  type: 'stats',
                  text: `Uso de tokens: Prompt=${streamUsage.prompt_tokens || 0}, Respuesta=${streamUsage.completion_tokens || 0}, Total=${streamUsage.total_tokens || 0}${rTokens ? ` (Razonamiento: ${rTokens})` : ''}${cTokens}`
                });
              }

            } catch (jsonErr) {}
          }
        }
      }

      // Vaciar buffer residual de TextDecoder si quedaron bytes en streaming
      try {
        const flushText = decoder.decode();
        if (flushText && onLog) {
          onLog({ type: 'raw', subtype: 'incoming', text: flushText });
        }
      } catch (e) {}

      const finalStats = getStats();
      const finalToolCalls = getFinalToolCalls();
      if (onDone) await onDone(accumulatedText, finalStats, finalToolCalls, accumulatedReasoning);
      return { accumulatedText, accumulatedReasoning, stats: finalStats, toolCalls: finalToolCalls };

    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Petición cancelada por el usuario.');
        const finalStats = getStats();
        const finalToolCalls = getFinalToolCalls();
        if (onDone) await onDone(accumulatedText || '(Generación detenida)', finalStats, finalToolCalls);
        return;
      }

      console.error('Error en streamChatCompletion:', err);
      if (onError) onError(err);
    }
  }

  /**
   * Obtiene las capacidades del proveedor resuelto para una URL o tipo de API.
   */
  function getProviderCapabilities(rawUrl, explicitType, model) {
    if (registry) {
      return registry.getCapabilities(rawUrl, model, explicitType);
    }
    return {
      streaming: true,
      vision: true,
      tools: true,
      reasoning: true,
      jsonMode: true,
      promptCaching: true,
      embeddings: true,
      modelListing: true
    };
  }

  /**
   * Diagnostica el endpoint del proveedor y analiza sus capacidades declaradas, inferidas y comprobadas.
   */
  async function inspectProvider(config = {}, options = {}) {
    const { apiUrl, apiType, apiKey, model } = config;
    if (registry && registry.inspect) {
      return registry.inspect(apiUrl, apiKey, model, apiType, options);
    }
    const adapter = registry ? registry.resolve(apiUrl, apiType) : null;
    if (adapter && adapter.inspect) {
      return adapter.inspect({ apiUrl, apiKey, model, ...options });
    }
    return {
      success: false,
      error: 'No se pudo inicializar el inspector de proveedores.'
    };
  }

  return {
    detectApiType,
    normalizeApiUrl,
    fetchServerModels,
    getStandardReasoningOptions,
    STANDARD_REASONING_MODES,
    streamChatCompletion,
    estimateTokens,
    normalizeToolName,
    extractToolCallsFromText,
    getProviderCapabilities,
    inspectProvider,
    registry
  };
});
