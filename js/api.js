/**
 * Módulo para interactuar con la API compatible de OpenAI (ChatAPI).
 * Compatible con file:// y http://.
 * Incluye:
 * - Soporte para Tool Calling agentico (execute_javascript).
 * - Soporte para nivel de razonamiento (reasoning_effort: low, medium, high).
 * - Streaming en tiempo real vía Server-Sent Events (SSE).
 * - Medición precisa de TTFT y velocidad desde el primer token.
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

  /**
   * Normaliza los nombres de las herramientas admitiendo variaciones con y sin guiones bajos
   * (ej. 'downloadpdf', 'download_pdf', 'fetchwebpage', 'fetch_web_page', 'searchweb', etc.).
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
    // Ejemplos:
    // <|toolcall>call:fetchwebpage{url:<|"|>https://samplelib.com/pdf/sample-scanned.pdf<|"|>}<toolcall|>
    // <|tool_call|>call:download_pdf{url:"..."}<|tool_call|>
    // [TOOL_CALLS] call:search_web{query:"..."}
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
        if (normName && (normName === 'download_pdf' || normName === 'fetch_web_page' || normName === 'search_web' || normName === 'execute_javascript')) {
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

    // 6. Sintaxis directa: download_pdf("url") o download_pdf(url="...") o fetch_web_page("url")
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

  function detectApiType(rawUrl, explicitType) {
    if (explicitType && explicitType !== 'auto') {
      return explicitType;
    }
    const url = (rawUrl || '').toLowerCase().trim();
    if (url.includes('11434') || url.includes('ollama')) return 'ollama';
    if (url.includes('openrouter.ai')) return 'openrouter';
    if (url.includes('anthropic.com')) return 'claude';
    if (url.includes('googleapis.com') || url.includes('gemini')) return 'gemini';
    return 'openai';
  }

  function normalizeApiUrl(rawUrl, explicitType) {
    let url = (rawUrl || 'http://localhost:1234/v1').trim();
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }

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

    // Default: OpenAI, LM Studio, OpenRouter, Gemini
    if (url.endsWith('/chat/completions')) {
      return url;
    }
    if (url.endsWith('/v1')) {
      return `${url}/chat/completions`;
    }
    return `${url}/v1/chat/completions`;
  }

  function estimateTokens(text, chunkCount) {
    if (!text) return 0;
    if (chunkCount && chunkCount > 0) {
      return Math.max(chunkCount, Math.ceil(text.length / 3.8));
    }
    return Math.ceil(text.length / 3.8);
  }

  /**
   * Consulta los modelos disponibles en el servidor según el tipo de interfaz configurado.
   */
  async function fetchServerModels(rawUrl, apiKey, explicitType) {
    let cleanUrl = (rawUrl || 'http://localhost:1234/v1').trim();
    if (cleanUrl.endsWith('/')) {
      cleanUrl = cleanUrl.slice(0, -1);
    }
    if (cleanUrl.endsWith('/chat/completions')) {
      cleanUrl = cleanUrl.replace(/\/chat\/completions$/, '');
    }

    const type = detectApiType(cleanUrl, explicitType);
    const candidateEndpoints = [];

    if (type === 'ollama') {
      const baseWithoutV1 = cleanUrl.replace(/\/v1$/, '');
      candidateEndpoints.push(`${baseWithoutV1}/api/tags`);
      const v1Url = cleanUrl.endsWith('/v1') ? cleanUrl : `${cleanUrl}/v1`;
      candidateEndpoints.push(`${v1Url}/models`);
    } else if (type === 'openrouter') {
      const v1Url = cleanUrl.endsWith('/v1') ? cleanUrl : `${cleanUrl}/v1`;
      candidateEndpoints.push(`${v1Url}/models`);
    } else if (type === 'claude') {
      const v1Url = cleanUrl.endsWith('/v1') ? cleanUrl : `${cleanUrl}/v1`;
      candidateEndpoints.push(`${v1Url}/models`);
    } else {
      // OpenAI / LM Studio / LocalAI / vLLM
      // En LM Studio y OpenAI el endpoint estándar de modelos es /v1/models o /api/v0/models
      const v1Url = cleanUrl.endsWith('/v1') ? cleanUrl : `${cleanUrl}/v1`;
      const baseWithoutV1 = cleanUrl.replace(/\/v1$/, '');

      candidateEndpoints.push(`${v1Url}/models`);
      candidateEndpoints.push(`${baseWithoutV1}/api/v0/models`);
    }

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
        let extractedModels = [];

        // 1. Formato estándar OpenAI / LM Studio / vLLM / OpenRouter: { object: 'list', data: [...] }
        if (data && Array.isArray(data.data)) {
          extractedModels = data.data.map(item => {
            if (typeof item === 'string') return { id: item, name: item };
            return {
              id: item.id || item.name || '',
              name: item.id || item.name || '',
              owned_by: item.owned_by,
              details: item
            };
          }).filter(m => !!m.id);
        }
        // 2. Formato Ollama (/api/tags): { models: [ { name: 'llama3:latest', ... } ] }
        else if (data && Array.isArray(data.models)) {
          extractedModels = data.models.map(item => {
            if (typeof item === 'string') return { id: item, name: item };
            return {
              id: item.name || item.model || item.id || '',
              name: item.name || item.model || item.id || '',
              details: item
            };
          }).filter(m => !!m.id);
        }
        // 3. Array directo de modelos: [ { id: '...' } ] o [ 'model1', 'model2' ]
        else if (Array.isArray(data)) {
          extractedModels = data.map(item => {
            if (typeof item === 'string') return { id: item, name: item };
            return {
              id: item.id || item.name || '',
              name: item.id || item.name || '',
              details: item
            };
          }).filter(m => !!m.id);
        }

        if (extractedModels.length > 0) {
          // Ordenar alfabéticamente
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

  const STANDARD_REASONING_MODES = {
    openai: {
      type: 'openai',
      label: 'OpenAI / LM Studio',
      levels: ['none', 'low', 'medium', 'high', 'xhigh'],
      description: 'Estándar OpenAI / LM Studio (reasoning_effort: none, low, medium, high, xhigh)'
    },
    ollama: {
      type: 'ollama',
      label: 'Ollama',
      levels: ['none', 'low', 'medium', 'high', 'xhigh'],
      description: 'Estándar Ollama (reasoning_effort: none, low, medium, high, xhigh)'
    },
    openrouter: {
      type: 'openrouter',
      label: 'OpenRouter',
      levels: ['none', 'low', 'medium', 'high', 'xhigh'],
      description: 'Estándar OpenRouter (reasoning.effort: none, low, medium, high, xhigh)'
    },
    claude: {
      type: 'claude',
      label: 'Anthropic Claude',
      levels: ['none', 'low', 'medium', 'high', 'xhigh'],
      description: 'Estándar Claude (thinking budget: disabled, 1k, 2k, 4k, 8k tokens)'
    },
    gemini: {
      type: 'gemini',
      label: 'Google Gemini',
      levels: ['none', 'low', 'medium', 'high', 'xhigh'],
      description: 'Estándar Gemini (thinking: none, low, medium, high, xhigh)'
    },
    custom: {
      type: 'custom',
      label: 'Personalizado',
      levels: ['none', 'low', 'medium', 'high', 'xhigh'],
      description: 'Modos de razonamiento: none, low, medium, high, xhigh'
    }
  };

  function getStandardReasoningOptions(explicitType, rawUrl) {
    const type = detectApiType(rawUrl, explicitType);
    return STANDARD_REASONING_MODES[type] || STANDARD_REASONING_MODES.openai;
  }

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
      enableAgentJs = false,
      enableAgentWeb = false,
      enableAgentSearch = false,
      enableAgentChart = false,
      enableContextCache = true,
      cacheInvalidated = false,
      cacheRevision = null,
      signal,
      onChunk,
      onReasoningChunk,
      onToolCallDelta,
      onLog,
      onDone,
      onError
    } = params;

    const endpoint = normalizeApiUrl(apiUrl, apiType);
    const detectedType = detectApiType(apiUrl, apiType);

    const headers = {
      'Content-Type': 'application/json'
    };

    if (apiKey && apiKey.trim() !== '') {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }

    // Formateo de mensajes multimodales (OpenAI image_url vs Claude image source)
    let formattedMessages = messages;
    if (detectedType === 'claude') {
      formattedMessages = messages.map(m => {
        if (Array.isArray(m.content)) {
          const claudeParts = m.content.map(part => {
            if (part.type === 'image_url' && part.image_url && part.image_url.url) {
              const match = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
              if (match) {
                return {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: match[1],
                    data: match[2]
                  }
                };
              }
            }
            return part;
          });
          return { ...m, content: claudeParts };
        }
        return m;
      });
    }

    const payload = {
      model: (model || '').trim(),
      messages: formattedMessages,
      stream: true,
      temperature: parseFloat(temperature) || 0.7
    };

    // Configuración del JSON y razonamiento según el tipo de endpoint (usa 'none' para desactivado)
    let effortLower = String(reasoningEffort || 'none').toLowerCase().trim();
    if (effortLower === 'off') effortLower = 'none';

    if (detectedType === 'claude') {
      if (effortLower !== 'none') {
        // Anthropic Claude Thinking Budget (tokens)
        let budget = 2048;
        if (effortLower === 'low' || effortLower === 'minimal') budget = 1024;
        else if (effortLower === 'medium') budget = 2048;
        else if (effortLower === 'high') budget = 4096;
        else if (effortLower === 'xhigh') budget = 8192;

        payload.thinking = {
          type: 'enabled',
          budget_tokens: budget
        };
        // En Claude con thinking habilitado la temperatura debe ser 1.0
        payload.temperature = 1.0;
        payload.max_tokens = Math.max(4096, budget + 1024);
      } else {
        // En Claude cuando está desactivado se envía thinking: { type: 'disabled' }
        payload.thinking = {
          type: 'disabled'
        };
      }
    } else if (detectedType === 'openrouter') {
      // OpenRouter admite reasoning.effort y reasoning_effort ('none', 'low', 'medium', 'high')
      payload.reasoning = {
        effort: effortLower
      };
      payload.reasoning_effort = effortLower;
    } else {
      // OpenAI / LM Studio / Ollama / Gemini / Custom (estándar reasoning_effort: 'none', 'low', 'medium', 'high')
      payload.reasoning_effort = effortLower;
    }

    // Inyectar herramientas agénticas activadas (JS / Web / PDF / Search / Charts) si están disponibles
    const toolsList = [];
    const jsTool = Sandbox.JAVASCRIPT_TOOL_DEFINITION || (typeof window !== 'undefined' && window.ChatSandbox && window.ChatSandbox.JAVASCRIPT_TOOL_DEFINITION);
    const webTool = WebBrowser.WEB_TOOL_DEFINITION || (typeof window !== 'undefined' && window.ChatWebBrowser && window.ChatWebBrowser.WEB_TOOL_DEFINITION);
    const pdfTool = WebBrowser.PDF_TOOL_DEFINITION || (typeof window !== 'undefined' && window.ChatWebBrowser && window.ChatWebBrowser.PDF_TOOL_DEFINITION);
    const searchTool = WebSearch.SEARCH_TOOL_DEFINITION || (typeof window !== 'undefined' && window.ChatWebSearch && window.ChatWebSearch.SEARCH_TOOL_DEFINITION);
    const chartTool = (typeof window !== 'undefined' && window.ChatCharts && window.ChatCharts.CHART_TOOL_DEFINITION) || (typeof require !== 'undefined' ? (() => { try { return require('./charts.js').CHART_TOOL_DEFINITION; } catch(e){ return null; } })() : null);

    if (enableTools && enableAgentJs && jsTool) toolsList.push(jsTool);
    if (enableTools && enableAgentWeb && webTool) toolsList.push(webTool);
    if (enableTools && enableAgentWeb && pdfTool) toolsList.push(pdfTool);
    if (enableTools && enableAgentSearch && searchTool) toolsList.push(searchTool);
    if (enableTools && enableAgentChart && chartTool) toolsList.push(chartTool);

    if (toolsList.length > 0) {
      payload.tools = toolsList;
      payload.tool_choice = 'auto';
    }

    // Configuración y gestión de Context Caching / Prompt Caching
    if (enableContextCache) {
      if (cacheInvalidated) {
        if (onLog) {
          onLog({
            type: 'info',
            text: '🔄 Caché de contexto invalidada tras el borrado de mensajes. Se reconstruye un contexto limpio en el servidor.'
          });
        }
      } else {
        // Habilitar stream_options.include_usage para capturar prompt_tokens_details.cached_tokens (OpenAI / LM Studio / OpenRouter / DeepSeek)
        payload.stream_options = { include_usage: true };

        // Para Anthropic Claude y OpenRouter con Claude: inyectar cache_control en el mensaje de sistema y el último turno de usuario
        if (detectedType === 'claude' || detectedType === 'openrouter') {
          // A) Cache control en el último tool
          if (toolsList.length > 0) {
            toolsList[toolsList.length - 1].cache_control = { type: 'ephemeral' };
          }

          // B) Cache control en mensajes (system y último user)
          formattedMessages = formattedMessages.map((m, idx, arr) => {
            if (m.role === 'system') {
              if (typeof m.content === 'string') {
                return {
                  ...m,
                  content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }]
                };
              } else if (Array.isArray(m.content) && m.content.length > 0) {
                const updatedContent = [...m.content];
                updatedContent[updatedContent.length - 1] = {
                  ...updatedContent[updatedContent.length - 1],
                  cache_control: { type: 'ephemeral' }
                };
                return { ...m, content: updatedContent };
              }
            }

            const isLastUser = m.role === 'user' && !arr.slice(idx + 1).some(nextM => nextM.role === 'user');
            if (isLastUser) {
              if (typeof m.content === 'string') {
                return {
                  ...m,
                  content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }]
                };
              } else if (Array.isArray(m.content) && m.content.length > 0) {
                const updatedContent = [...m.content];
                updatedContent[updatedContent.length - 1] = {
                  ...updatedContent[updatedContent.length - 1],
                  cache_control: { type: 'ephemeral' }
                };
                return { ...m, content: updatedContent };
              }
            }

            return m;
          });

          payload.messages = formattedMessages;
        }
      }
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

      // Si la respuesta no es OK (ej. 400 Bad Request por parámetro no soportado por un modelo específico)
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

        const errLower = serverErrorMsg.toLowerCase();

        // 1. Auto-recuperación si el servidor rechaza específicamente el parámetro de razonamiento
        if (response.status === 400 && (payload.reasoning_effort || payload.thinking || payload.reasoning)) {
          if (errLower.includes('reasoning') || errLower.includes('thinking') || errLower.includes('unexpected') || errLower.includes('unrecognized') || errLower.includes('extra') || errLower.includes('unknown')) {
            if (onLog) onLog({ type: 'error', text: `HTTP 400: Servidor rechazó parámetro de razonamiento (${serverErrorMsg}). Reintentando sin él...` });
            delete payload.reasoning_effort;
            delete payload.thinking;
            delete payload.reasoning;

            response = await fetch(endpoint, {
              method: 'POST',
              headers: headers,
              body: JSON.stringify(payload),
              signal: signal
            });
          }
        }

        // 2. Auto-recuperación de tools si no son soportadas
        if (!response.ok && response.status === 400 && payload.tools) {
          if (errLower.includes('tool') || errLower.includes('function') || errLower.includes('unexpected') || errLower.includes('unrecognized')) {
            if (onLog) onLog({ type: 'error', text: `HTTP 400: Servidor no admite herramientas agénticas. Reintentando sin tools...` });
            delete payload.tools;
            delete payload.tool_choice;
            response = await fetch(endpoint, {
              method: 'POST',
              headers: headers,
              body: JSON.stringify(payload),
              signal: signal
            });
          }
        }

        // Si después de reintentos aún no es OK, lanzar el error formateado
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

              // 1. Formato Claude Anthropic
              if (parsed.type === 'message_start' && parsed.message?.usage) {
                if (parsed.message.usage.cache_read_input_tokens) {
                  serverCachedTokens = parsed.message.usage.cache_read_input_tokens;
                }
                if (parsed.message.usage.cache_creation_input_tokens) {
                  serverCacheCreationTokens = parsed.message.usage.cache_creation_input_tokens;
                }
              }

              if (parsed.type === 'content_block_delta') {
                if (!firstTokenTime) firstTokenTime = performance.now();
                if (parsed.delta?.type === 'thinking_delta' && parsed.delta?.thinking) {
                  const rChunk = parsed.delta.thinking;
                  accumulatedReasoning += rChunk;
                  if (onReasoningChunk) onReasoningChunk(rChunk, accumulatedReasoning);
                  if (onLog) onLog({ type: 'thinking', text: rChunk });
                } else if (parsed.delta?.type === 'text_delta' && parsed.delta?.text) {
                  const tChunk = parsed.delta.text;
                  accumulatedText += tChunk;
                  chunkCount++;
                  const stats = getStats();
                  if (onChunk) onChunk(accumulatedText, tChunk, stats);
                }
              }

              // 2. Formato OpenAI / LM Studio / Ollama / OpenRouter
              const choice = parsed.choices?.[0];
              const delta = choice?.delta;

              if (delta) {
                // A) Tokens de razonamiento específicos
                const rChunk = delta.reasoning_content || delta.reasoning || delta.thinking || delta.thought || '';
                if (rChunk) {
                  if (!firstTokenTime) firstTokenTime = performance.now();
                  accumulatedReasoning += rChunk;
                  if (onReasoningChunk) onReasoningChunk(rChunk, accumulatedReasoning);
                  if (onLog) onLog({ type: 'thinking', text: rChunk });
                }

                // B) Contenido textual normal (con soporte de etiquetas de pensamiento: <think>, <thought>, <reasoning>)
                const textChunk = delta.content || delta.text || '';
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

                // C) Tool calls
                if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
                  if (!firstTokenTime) firstTokenTime = performance.now();
                  delta.tool_calls.forEach(tc => {
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

                    if (onToolCallDelta) onToolCallDelta(accumulatedToolCalls[idx]);
                  });
                }
              }

              // D) Token usage y Context Caching si viene en el stream
              const streamUsage = parsed.usage || parsed.message?.usage;
              if (streamUsage) {
                if (streamUsage.prompt_tokens_details?.cached_tokens) {
                  serverCachedTokens = streamUsage.prompt_tokens_details.cached_tokens;
                }
                if (streamUsage.cache_read_input_tokens) {
                  serverCachedTokens = streamUsage.cache_read_input_tokens;
                }
                if (streamUsage.cache_creation_input_tokens) {
                  serverCacheCreationTokens = streamUsage.cache_creation_input_tokens;
                }

                if (onLog) {
                  const rTokens = streamUsage.completion_tokens_details?.reasoning_tokens;
                  const cTokens = serverCachedTokens > 0 ? ` (⚡ Cache: ${serverCachedTokens} tok)` : '';
                  onLog({
                    type: 'stats',
                    text: `Uso de tokens: Prompt=${streamUsage.prompt_tokens || 0}, Respuesta=${streamUsage.completion_tokens || 0}, Total=${streamUsage.total_tokens || 0}${rTokens ? ` (Razonamiento: ${rTokens})` : ''}${cTokens}`
                  });
                }
              }
            } catch (jsonErr) {}
          }
        }
      }

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

  return {
    detectApiType,
    normalizeApiUrl,
    fetchServerModels,
    getStandardReasoningOptions,
    STANDARD_REASONING_MODES,
    streamChatCompletion,
    estimateTokens,
    normalizeToolName,
    extractToolCallsFromText
  };
});
