/**
 * Módulo de Adaptadores y Capacidades de Proveedores LLM (ChatProviders).
 * Separa la lógica específica de cada proveedor (OpenAI, Claude, Gemini, Ollama, OpenRouter, Custom)
 * de la capa común de transporte HTTP/SSE mediante un sistema declarativo de capacidades (Capabilities).
 * Compatible con file://, http:// y Node.js.
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatProviders = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Esquema estándar de capacidades soportadas por adaptadores de modelos LLM.
   */
  const DEFAULT_CAPABILITIES = {
    streaming: true,      // Soporte para streaming de respuestas vía SSE
    vision: true,         // Soporte para procesamiento de imágenes multimodales
    tools: true,          // Soporte para Function / Tool Calling
    reasoning: true,      // Soporte para control de razonamiento (thinking / reasoning_effort)
    jsonMode: true,       // Soporte para structured outputs / response_format: { type: "json_object" }
    promptCaching: true,  // Soporte para Context / Prompt Caching efímero o persistente
    embeddings: true,     // Soporte para endpoints de generación de embeddings
    modelListing: true    // Soporte para descubrimiento automático de modelos (/models, /api/tags)
  };

  /**
   * Adaptador Base genérico (compatible con OpenAI, LM Studio, vLLM, LocalAI, DeepSeek).
   */
  class BaseProviderAdapter {
    constructor(options = {}) {
      this.id = options.id || 'openai';
      this.label = options.label || 'OpenAI / LM Studio';
      this.description = options.description || 'Estándar OpenAI / LM Studio (reasoning_effort: none, low, medium, high, xhigh)';
      this.reasoningLevels = options.reasoningLevels || ['none', 'low', 'medium', 'high', 'xhigh'];
      this.capabilities = {
        ...DEFAULT_CAPABILITIES,
        ...(options.capabilities || {})
      };
    }

    /**
     * Obtiene el conjunto de capacidades del adaptador, permitiendo ajustes según el modelo.
     */
    getCapabilities(model) {
      return { ...this.capabilities };
    }

    /**
     * Normaliza la URL base al endpoint de chat del proveedor.
     */
    normalizeEndpoint(rawUrl) {
      let url = (rawUrl || 'http://localhost:1234/v1').trim();
      if (url.endsWith('/')) url = url.slice(0, -1);
      if (url.endsWith('/chat/completions')) return url;
      if (url.endsWith('/v1')) return `${url}/chat/completions`;
      return `${url}/v1/chat/completions`;
    }

    /**
     * Construye las cabeceras HTTP necesarias para la petición.
     */
    buildHeaders(apiKey) {
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey && apiKey.trim() !== '') {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      }
      return headers;
    }

    /**
     * Adapta y formatea la lista de mensajes (filtrando imágenes si vision está deshabilitado).
     */
    formatMessages(messages, capabilities) {
      const caps = capabilities || this.getCapabilities();
      if (caps.vision) {
        return messages;
      }
      // Si el proveedor no soporta visión, degradar imágenes a texto plano
      return messages.map(m => {
        if (Array.isArray(m.content)) {
          const textOnly = m.content
            .filter(part => part.type === 'text')
            .map(part => part.text)
            .join('\n');
          return { ...m, content: textOnly };
        }
        return m;
      });
    }

    /**
     * Aplica la configuración de razonamiento / pensamiento al payload.
     */
    applyReasoning(payload, effortLevel) {
      let effort = String(effortLevel || 'none').toLowerCase().trim();
      if (effort === 'off') effort = 'none';
      payload.reasoning_effort = effort;
    }

    /**
     * Aplica opciones de caché de contexto (Prompt / KV Caching).
     */
    applyContextCache(payload, options = {}) {
      payload.stream_options = { include_usage: true };
    }

    /**
     * Aplica el modo de respuesta estructurada en formato JSON.
     */
    applyJsonMode(payload) {
      payload.response_format = { type: 'json_object' };
    }

    /**
     * Inyecta las definiciones de herramientas agénticas.
     */
    applyTools(payload, toolsList) {
      if (toolsList && toolsList.length > 0) {
        payload.tools = toolsList;
        payload.tool_choice = 'auto';
      }
    }

    /**
     * Construye el payload completo para la petición POST respetando las capacidades declaradas.
     */
    buildPayload(params) {
      const {
        model = '',
        messages = [],
        temperature = 0.7,
        reasoningEffort = 'none',
        toolsList = [],
        enableContextCache = true,
        jsonMode = false,
        stream = true
      } = params;

      const capabilities = this.getCapabilities(model);
      const formattedMessages = this.formatMessages(messages, capabilities);

      const payload = {
        model: (model || '').trim(),
        messages: formattedMessages,
        temperature: parseFloat(temperature) || 0.7
      };

      if (capabilities.streaming && stream !== false) {
        payload.stream = true;
      }

      if (capabilities.reasoning) {
        this.applyReasoning(payload, reasoningEffort);
      }

      if (capabilities.tools && toolsList && toolsList.length > 0) {
        this.applyTools(payload, toolsList);
      }

      if (capabilities.promptCaching && enableContextCache) {
        this.applyContextCache(payload, { toolsList, messages: formattedMessages });
      }

      if (capabilities.jsonMode && jsonMode) {
        this.applyJsonMode(payload);
      }

      return payload;
    }

    /**
     * Parsea un evento SSE (data JSON) para extraer deltas de texto, pensamiento, tools y usage.
     */
    parseStreamChunk(parsed, state) {
      const result = {
        textChunk: '',
        reasoningChunk: '',
        toolCallDeltas: [],
        usage: null,
        cachedTokens: 0,
        cacheCreationTokens: 0
      };

      const choice = parsed.choices?.[0];
      const delta = choice?.delta;

      if (delta) {
        // Tokens de razonamiento específicos
        const rChunk = delta.reasoning_content || delta.reasoning || delta.thinking || delta.thought || '';
        if (rChunk) {
          result.reasoningChunk = rChunk;
        }

        // Contenido textual normal
        const text = delta.content || delta.text || '';
        if (text) {
          result.textChunk = text;
        }

        // Llamadas a herramientas
        if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
          result.toolCallDeltas = delta.tool_calls;
        }
      }

      // Usage / Context Caching
      const usage = parsed.usage || parsed.message?.usage;
      if (usage) {
        result.usage = usage;
        if (usage.prompt_tokens_details?.cached_tokens) {
          result.cachedTokens = usage.prompt_tokens_details.cached_tokens;
        }
        if (usage.cache_read_input_tokens) {
          result.cachedTokens = usage.cache_read_input_tokens;
        }
        if (usage.cache_creation_input_tokens) {
          result.cacheCreationTokens = usage.cache_creation_input_tokens;
        }
      }

      return result;
    }

    /**
     * Evalúa si un error HTTP 400 permite auto-recuperación (reintento sin params rechazados).
     */
    handleHttpError(status, serverErrorMsg, payload) {
      const errLower = (serverErrorMsg || '').toLowerCase();

      if (status === 400 && (payload.reasoning_effort || payload.thinking || payload.reasoning)) {
        if (errLower.includes('reasoning') || errLower.includes('thinking') || errLower.includes('unexpected') || errLower.includes('unrecognized') || errLower.includes('extra') || errLower.includes('unknown')) {
          delete payload.reasoning_effort;
          delete payload.thinking;
          delete payload.reasoning;
          return { retry: true, reason: 'reasoning_rejected' };
        }
      }

      if (status === 400 && payload.tools) {
        if (errLower.includes('tool') || errLower.includes('function') || errLower.includes('unexpected') || errLower.includes('unrecognized')) {
          delete payload.tools;
          delete payload.tool_choice;
          return { retry: true, reason: 'tools_rejected' };
        }
      }

      return { retry: false };
    }

    /**
     * Devuelve endpoints candidatos para consultar modelos disponibles.
     */
    getModelEndpoints(cleanUrl) {
      const v1Url = cleanUrl.endsWith('/v1') ? cleanUrl : `${cleanUrl}/v1`;
      const baseWithoutV1 = cleanUrl.replace(/\/v1$/, '');
      return [`${v1Url}/models`, `${baseWithoutV1}/api/v0/models`];
    }

    /**
     * Parsea la respuesta del endpoint de modelos.
     */
    parseModelsResponse(data) {
      if (data && Array.isArray(data.data)) {
        return data.data.map(item => {
          if (typeof item === 'string') return { id: item, name: item };
          return {
            id: item.id || item.name || '',
            name: item.id || item.name || '',
            owned_by: item.owned_by,
            details: item
          };
        }).filter(m => !!m.id);
      }
      if (Array.isArray(data)) {
        return data.map(item => {
          if (typeof item === 'string') return { id: item, name: item };
          return {
            id: item.id || item.name || '',
            name: item.id || item.name || '',
            details: item
          };
        }).filter(m => !!m.id);
      }
      return [];
    }

    /**
     * Devuelve metadatos para la configuración de razonamiento.
     */
    getReasoningConfig() {
      return {
        type: this.id,
        label: this.label,
        levels: this.reasoningLevels,
        description: this.description
      };
    }
  }

  /**
   * Adaptador para Anthropic Claude (/v1/messages).
   */
  class ClaudeProviderAdapter extends BaseProviderAdapter {
    constructor() {
      super({
        id: 'claude',
        label: 'Anthropic Claude',
        description: 'Estándar Claude (thinking budget: disabled, 1k, 2k, 4k, 8k tokens)',
        reasoningLevels: ['none', 'low', 'medium', 'high', 'xhigh'],
        capabilities: {
          streaming: true,
          vision: true,
          tools: true,
          reasoning: true,
          jsonMode: false,
          promptCaching: true,
          embeddings: false,
          modelListing: true
        }
      });
    }

    normalizeEndpoint(rawUrl) {
      let url = (rawUrl || 'https://api.anthropic.com/v1').trim();
      if (url.endsWith('/')) url = url.slice(0, -1);
      if (url.endsWith('/v1/messages') || url.endsWith('/messages') || url.endsWith('/chat/completions')) return url;
      if (url.endsWith('/v1')) return `${url}/messages`;
      return `${url}/v1/messages`;
    }

    formatMessages(messages, capabilities) {
      const caps = capabilities || this.getCapabilities();
      return messages.map(m => {
        if (Array.isArray(m.content)) {
          const claudeParts = m.content.map(part => {
            if (caps.vision && part.type === 'image_url' && part.image_url && part.image_url.url) {
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
          }).filter(part => caps.vision || part.type !== 'image');
          return { ...m, content: claudeParts };
        }
        return m;
      });
    }

    applyReasoning(payload, effortLevel) {
      let effort = String(effortLevel || 'none').toLowerCase().trim();
      if (effort === 'off') effort = 'none';

      if (effort !== 'none') {
        let budget = 2048;
        if (effort === 'low' || effort === 'minimal') budget = 1024;
        else if (effort === 'medium') budget = 2048;
        else if (effort === 'high') budget = 4096;
        else if (effort === 'xhigh') budget = 8192;

        payload.thinking = {
          type: 'enabled',
          budget_tokens: budget
        };
        payload.temperature = 1.0;
        payload.max_tokens = Math.max(4096, budget + 1024);
      } else {
        payload.thinking = { type: 'disabled' };
      }
    }

    applyContextCache(payload, options = {}) {
      const { toolsList = [], messages = [] } = options;

      if (toolsList.length > 0) {
        toolsList[toolsList.length - 1].cache_control = { type: 'ephemeral' };
      }

      payload.messages = messages.map((m, idx, arr) => {
        if (m.role === 'system') {
          if (typeof m.content === 'string') {
            return {
              ...m,
              content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }]
            };
          } else if (Array.isArray(m.content) && m.content.length > 0) {
            const updated = [...m.content];
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              cache_control: { type: 'ephemeral' }
            };
            return { ...m, content: updated };
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
            const updated = [...m.content];
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              cache_control: { type: 'ephemeral' }
            };
            return { ...m, content: updated };
          }
        }

        return m;
      });
    }

    parseStreamChunk(parsed, state) {
      const result = {
        textChunk: '',
        reasoningChunk: '',
        toolCallDeltas: [],
        usage: null,
        cachedTokens: 0,
        cacheCreationTokens: 0
      };

      if (parsed.type === 'message_start' && parsed.message?.usage) {
        result.usage = parsed.message.usage;
        if (parsed.message.usage.cache_read_input_tokens) {
          result.cachedTokens = parsed.message.usage.cache_read_input_tokens;
        }
        if (parsed.message.usage.cache_creation_input_tokens) {
          result.cacheCreationTokens = parsed.message.usage.cache_creation_input_tokens;
        }
      }

      if (parsed.type === 'content_block_delta') {
        if (parsed.delta?.type === 'thinking_delta' && parsed.delta?.thinking) {
          result.reasoningChunk = parsed.delta.thinking;
        } else if (parsed.delta?.type === 'text_delta' && parsed.delta?.text) {
          result.textChunk = parsed.delta.text;
        }
      }

      // Fallback a formato choices por si OpenRouter sirve Claude en formato OpenAI
      if (parsed.choices?.[0]) {
        const baseRes = super.parseStreamChunk(parsed, state);
        if (baseRes.textChunk) result.textChunk = baseRes.textChunk;
        if (baseRes.reasoningChunk) result.reasoningChunk = baseRes.reasoningChunk;
        if (baseRes.toolCallDeltas.length > 0) result.toolCallDeltas = baseRes.toolCallDeltas;
        if (baseRes.cachedTokens > 0) result.cachedTokens = baseRes.cachedTokens;
      }

      return result;
    }

    getModelEndpoints(cleanUrl) {
      const v1Url = cleanUrl.endsWith('/v1') ? cleanUrl : `${cleanUrl}/v1`;
      return [`${v1Url}/models`];
    }
  }

  /**
   * Adaptador para Google Gemini (Endpoint OpenAI compatible).
   */
  class GeminiProviderAdapter extends BaseProviderAdapter {
    constructor() {
      super({
        id: 'gemini',
        label: 'Google Gemini',
        description: 'Estándar Gemini (thinking: none, low, medium, high, xhigh)',
        reasoningLevels: ['none', 'low', 'medium', 'high', 'xhigh'],
        capabilities: {
          streaming: true,
          vision: true,
          tools: true,
          reasoning: true,
          jsonMode: true,
          promptCaching: true,
          embeddings: true,
          modelListing: true
        }
      });
    }

    normalizeEndpoint(rawUrl) {
      let url = (rawUrl || 'https://generativelanguage.googleapis.com/v1beta/openai').trim();
      if (url.endsWith('/')) url = url.slice(0, -1);
      if (url.endsWith('/chat/completions')) return url;
      if (url.endsWith('/v1')) return `${url}/chat/completions`;
      return `${url}/chat/completions`;
    }

    getModelEndpoints(cleanUrl) {
      const v1Url = cleanUrl.endsWith('/v1') ? cleanUrl : `${cleanUrl}/v1`;
      return [`${v1Url}/models`, `${cleanUrl}/models`];
    }
  }

  /**
   * Adaptador para Ollama (/api/chat, /api/tags).
   */
  class OllamaProviderAdapter extends BaseProviderAdapter {
    constructor() {
      super({
        id: 'ollama',
        label: 'Ollama',
        description: 'Estándar Ollama (reasoning_effort: none, low, medium, high, xhigh)',
        reasoningLevels: ['none', 'low', 'medium', 'high', 'xhigh'],
        capabilities: {
          streaming: true,
          vision: true,
          tools: true,
          reasoning: true,
          jsonMode: true,
          promptCaching: false,
          embeddings: true,
          modelListing: true
        }
      });
    }

    normalizeEndpoint(rawUrl) {
      let url = (rawUrl || 'http://localhost:11434').trim();
      if (url.endsWith('/')) url = url.slice(0, -1);
      if (url.endsWith('/api/chat') || url.endsWith('/chat/completions')) return url;
      if (url.endsWith('/v1')) return `${url}/chat/completions`;
      return `${url}/v1/chat/completions`;
    }

    getModelEndpoints(cleanUrl) {
      const baseWithoutV1 = cleanUrl.replace(/\/v1$/, '');
      const v1Url = cleanUrl.endsWith('/v1') ? cleanUrl : `${cleanUrl}/v1`;
      return [`${baseWithoutV1}/api/tags`, `${v1Url}/models`];
    }

    parseModelsResponse(data) {
      if (data && Array.isArray(data.models)) {
        return data.models.map(item => {
          if (typeof item === 'string') return { id: item, name: item };
          return {
            id: item.name || item.model || item.id || '',
            name: item.name || item.model || item.id || '',
            details: item
          };
        }).filter(m => !!m.id);
      }
      return super.parseModelsResponse(data);
    }
  }

  /**
   * Adaptador para OpenRouter (https://openrouter.ai/api/v1).
   */
  class OpenRouterProviderAdapter extends BaseProviderAdapter {
    constructor() {
      super({
        id: 'openrouter',
        label: 'OpenRouter',
        description: 'Estándar OpenRouter (reasoning.effort: none, low, medium, high, xhigh)',
        reasoningLevels: ['none', 'low', 'medium', 'high', 'xhigh'],
        capabilities: {
          streaming: true,
          vision: true,
          tools: true,
          reasoning: true,
          jsonMode: true,
          promptCaching: true,
          embeddings: false,
          modelListing: true
        }
      });
    }

    normalizeEndpoint(rawUrl) {
      let url = (rawUrl || 'https://openrouter.ai/api/v1').trim();
      if (url.endsWith('/')) url = url.slice(0, -1);
      if (url.endsWith('/chat/completions')) return url;
      if (url.endsWith('/v1')) return `${url}/chat/completions`;
      return `${url}/v1/chat/completions`;
    }

    applyReasoning(payload, effortLevel) {
      let effort = String(effortLevel || 'none').toLowerCase().trim();
      if (effort === 'off') effort = 'none';
      payload.reasoning = { effort: effort };
      payload.reasoning_effort = effort;
    }

    applyContextCache(payload, options = {}) {
      super.applyContextCache(payload, options);
      // Inyectar cache_control en mensajes si se envían modelos Claude a través de OpenRouter
      const { toolsList = [], messages = [] } = options;
      if (toolsList.length > 0) {
        toolsList[toolsList.length - 1].cache_control = { type: 'ephemeral' };
      }
      payload.messages = messages.map((m, idx, arr) => {
        if (m.role === 'system') {
          if (typeof m.content === 'string') {
            return {
              ...m,
              content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }]
            };
          }
        }
        const isLastUser = m.role === 'user' && !arr.slice(idx + 1).some(nextM => nextM.role === 'user');
        if (isLastUser && typeof m.content === 'string') {
          return {
            ...m,
            content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }]
          };
        }
        return m;
      });
    }

    getModelEndpoints(cleanUrl) {
      const v1Url = cleanUrl.endsWith('/v1') ? cleanUrl : `${cleanUrl}/v1`;
      return [`${v1Url}/models`];
    }
  }

  /**
   * Registro central de adaptadores de proveedor (ProviderRegistry).
   */
  class ProviderRegistry {
    constructor() {
      this.adapters = new Map();
      this.defaultAdapter = new BaseProviderAdapter();

      // Registro inicial de adaptadores oficiales
      this.register(new BaseProviderAdapter({ id: 'openai', label: 'OpenAI / LM Studio' }));
      this.register(new ClaudeProviderAdapter());
      this.register(new GeminiProviderAdapter());
      this.register(new OllamaProviderAdapter());
      this.register(new OpenRouterProviderAdapter());
      this.register(new BaseProviderAdapter({ id: 'custom', label: 'Personalizado' }));
    }

    /**
     * Registra un adaptador de proveedor.
     */
    register(adapter) {
      if (adapter && adapter.id) {
        this.adapters.set(adapter.id.toLowerCase(), adapter);
      }
    }

    /**
     * Obtiene un adaptador por su ID.
     */
    get(id) {
      if (!id) return this.defaultAdapter;
      return this.adapters.get(String(id).toLowerCase()) || this.defaultAdapter;
    }

    /**
     * Detecta el proveedor adecuado a partir de la URL del servidor o tipo explícito.
     */
    detect(rawUrl, explicitType) {
      if (explicitType && explicitType !== 'auto') {
        return String(explicitType).toLowerCase();
      }
      const url = (rawUrl || '').toLowerCase().trim();
      if (url.includes('11434') || url.includes('ollama')) return 'ollama';
      if (url.includes('openrouter.ai')) return 'openrouter';
      if (url.includes('anthropic.com')) return 'claude';
      if (url.includes('googleapis.com') || url.includes('gemini')) return 'gemini';
      return 'openai';
    }

    /**
     * Resuelve y devuelve la instancia del adaptador para una URL y tipo dados.
     */
    resolve(rawUrl, explicitType) {
      const type = this.detect(rawUrl, explicitType);
      return this.get(type);
    }

    /**
     * Obtiene las capacidades de un proveedor o modelo dado.
     */
    getCapabilities(rawUrlOrType, model, explicitType) {
      const adapter = this.resolve(rawUrlOrType, explicitType);
      return adapter.getCapabilities(model);
    }

    /**
     * Obtiene todos los modos de razonamiento registrados para la UI.
     */
    getReasoningModes() {
      const modes = {};
      for (const [id, adapter] of this.adapters.entries()) {
        modes[id] = adapter.getReasoningConfig();
      }
      return modes;
    }
  }

  const registry = new ProviderRegistry();

  return {
    DEFAULT_CAPABILITIES,
    BaseProviderAdapter,
    ClaudeProviderAdapter,
    GeminiProviderAdapter,
    OllamaProviderAdapter,
    OpenRouterProviderAdapter,
    ProviderRegistry,
    registry
  };
});
