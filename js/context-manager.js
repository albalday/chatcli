/**
 * Módulo de Gestión Inteligente del Contexto (ChatContextManager) para ChatCLI.
 * Gestiona el presupuesto de tokens, estimación adaptable por modelo,
 * ventana deslizante segura con preservación de pares agénticos y control de resultados de herramientas.
 */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatContextManager = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ==========================================================================
  // 1. Presupuestos y Ventanas de Contexto por Proveedor y Modelo
  // ==========================================================================

  const DEFAULT_MODEL_CONTEXT_LIMITS = {
    // Modelos locales y ligeros
    'llama-3': 8192,
    'llama-3.1': 128000,
    'llama-3.2': 128000,
    'llama-3.3': 128000,
    'qwen2.5': 32768,
    'mistral': 32768,
    'phi-3': 128000,
    'phi-4': 16384,
    'gemma-2': 8192,

    // OpenAI
    'gpt-4o': 128000,
    'gpt-4o-mini': 128000,
    'gpt-4-turbo': 128000,
    'gpt-3.5-turbo': 16384,
    'o1': 128000,
    'o1-mini': 128000,
    'o3-mini': 128000,

    // Anthropic Claude
    'claude-3-5-sonnet': 200000,
    'claude-3-5-haiku': 200000,
    'claude-3-opus': 200000,

    // Google Gemini
    'gemini-1.5-pro': 1000000,
    'gemini-1.5-flash': 1000000,
    'gemini-2.0-flash': 1000000,
    'gemini-2.0-pro': 1000000
  };

  const DEFAULT_PROVIDER_FALLBACK_LIMITS = {
    ollama: 8192,
    openai: 128000,
    claude: 200000,
    gemini: 1000000,
    openrouter: 64000,
    custom: 32768
  };

  /**
   * Obtiene el límite máximo de contexto del modelo/proveedor.
   */
  function getModelContextLimit(model = '', providerType = 'openai') {
    const cleanModel = String(model || '').toLowerCase().trim();
    for (const [key, limit] of Object.entries(DEFAULT_MODEL_CONTEXT_LIMITS)) {
      if (cleanModel.includes(key)) {
        return limit;
      }
    }
    const cleanType = String(providerType || 'openai').toLowerCase().trim();
    return DEFAULT_PROVIDER_FALLBACK_LIMITS[cleanType] || 32768;
  }

  /**
   * Calcula el presupuesto de entrada disponible deduciendo salida máxima y margen de seguridad.
   */
  function calculateInputBudget(options = {}) {
    if (options.maxInputTokens && options.maxInputTokens > 0) {
      return options.maxInputTokens;
    }

    const totalLimit = options.totalContextLimit || getModelContextLimit(options.model, options.providerType);
    const maxOutput = options.maxOutputTokens || 4096;
    const safetyMargin = Math.ceil(totalLimit * (options.safetyMarginRatio || 0.10));

    const inputBudget = Math.max(1024, totalLimit - maxOutput - safetyMargin);
    return inputBudget;
  }

  // ==========================================================================
  // 2. Abstracción de Estimación de Tokens (Token Estimator)
  // ==========================================================================

  const customEstimators = new Map();

  function registerEstimator(pattern, estimatorFn) {
    if (typeof estimatorFn === 'function') {
      customEstimators.set(String(pattern).toLowerCase(), estimatorFn);
    }
  }

  /**
   * Estimador genérico y tolerante para cadenas de texto.
   * Aplica coeficientes según naturaleza del contenido (texto vs código/JSON).
   */
  function estimateTextTokens(text = '') {
    if (!text || typeof text !== 'string') return 0;
    const len = text.length;
    if (len === 0) return 0;

    // Código o JSON (densidad de caracteres de puntuación alta)
    const isCodeOrJson = text.includes('{') || text.includes('function') || text.includes('const ') || text.includes('```');
    const ratio = isCodeOrJson ? 2.9 : 3.6;

    return Math.max(1, Math.ceil(len / ratio));
  }

  /**
   * Estima los tokens de un único mensaje (incluyendo multimodales, tool_calls y tool results).
   */
  function estimateMessageTokens(message, model = '') {
    if (!message || typeof message !== 'object') return 0;

    // Comprobar si existe un estimador específico registrado para este modelo
    const cleanModel = String(model || '').toLowerCase();
    for (const [pattern, estimatorFn] of customEstimators.entries()) {
      if (cleanModel.includes(pattern)) {
        try {
          return estimatorFn(message);
        } catch (e) {
          // Fallback silencioso
        }
      }
    }

    let tokens = 4; // Overhead por mensaje (role, estructura)

    // Contenido textual o array multimodal
    if (typeof message.content === 'string') {
      tokens += estimateTextTokens(message.content);
    } else if (Array.isArray(message.content)) {
      message.content.forEach(part => {
        if (!part) return;
        if (part.type === 'text' && part.text) {
          tokens += estimateTextTokens(part.text);
        } else if (part.type === 'image_url' || part.type === 'image') {
          // Estimación estándar para imágenes (alta resolución ~1200 tokens)
          tokens += 1200;
        }
      });
    }

    // Tool calls emitidas por el asistente
    if (Array.isArray(message.tool_calls)) {
      message.tool_calls.forEach(tc => {
        tokens += 10; // Overhead de tool call
        if (tc.function) {
          tokens += estimateTextTokens(tc.function.name || '');
          const args = typeof tc.function.arguments === 'object'
            ? JSON.stringify(tc.function.arguments)
            : String(tc.function.arguments || '');
          tokens += estimateTextTokens(args);
        }
      });
    }

    return tokens;
  }

  /**
   * Estima los tokens totales de una lista de mensajes.
   */
  function estimateHistoryTokens(messages = [], model = '') {
    if (!Array.isArray(messages)) return 0;
    return messages.reduce((acc, m) => acc + estimateMessageTokens(m, model), 0);
  }

  // ==========================================================================
  // 3. Control y Poda de Resultados de Herramientas (Tool Results)
  // ==========================================================================

  const DEFAULT_MAX_ACTIVE_TOOL_CHARS = 30000;      // ~7.500 tokens para la herramienta del turno actual
  const DEFAULT_MAX_HISTORICAL_TOOL_CHARS = 1200;   // ~300 tokens para herramientas de turnos pasados

  /**
   * Trunca de forma segura el contenido de un resultado de herramienta.
   */
  function truncateToolContent(content, maxChars = DEFAULT_MAX_ACTIVE_TOOL_CHARS, toolName = 'tool') {
    const str = typeof content === 'object' ? JSON.stringify(content) : String(content !== undefined ? content : '');
    if (str.length <= maxChars) {
      return str;
    }

    const head = str.slice(0, Math.floor(maxChars * 0.7));
    const tail = str.slice(-Math.floor(maxChars * 0.2));
    return `${head}\n\n[... Truncado por ChatContextManager: ${str.length - maxChars} caracteres omitidos de la salida de ${toolName} ...]\n\n${tail}`;
  }

  /**
   * Compacta y poda los resultados de herramientas de turnos pasados completados.
   */
  function pruneHistoricalToolMessage(m, maxHistoricalChars = DEFAULT_MAX_HISTORICAL_TOOL_CHARS) {
    if (!m || m.role !== 'tool') return m;
    const contentStr = typeof m.content === 'object' ? JSON.stringify(m.content) : String(m.content !== undefined ? m.content : '');

    if (contentStr.length <= maxHistoricalChars) {
      return m;
    }

    const truncated = truncateToolContent(contentStr, maxHistoricalChars, m.name || 'tool');
    return {
      ...m,
      content: truncated,
      _prunedByContextManager: true
    };
  }

  // ==========================================================================
  // 4. Ventana Deslizante con Preservación de Pares Agénticos (Pair-Safe Sliding Window)
  // ==========================================================================

  /**
   * Agrupa los mensajes en bloques atómicos indivisibles para no romper sintaxis de Function Calling.
   * Un bloque puede ser:
   * - Un mensaje regular de usuario o asistente.
   * - Un par asistente (con tool_calls) + sus correspondientes mensajes tool (role: 'tool').
   */
  function groupIntoAtomicBlocks(messages = []) {
    const blocks = [];
    let i = 0;

    while (i < messages.length) {
      const current = messages[i];

      // Caso 1: Asistente con llamadas a herramientas
      if (current.role === 'assistant' && Array.isArray(current.tool_calls) && current.tool_calls.length > 0) {
        const block = [current];
        i++;
        // Recoger todos los mensajes 'tool' consecutivos que responden a este assistant
        while (i < messages.length && messages[i].role === 'tool') {
          block.push(messages[i]);
          i++;
        }
        blocks.push(block);
        continue;
      }

      // Caso 2: Mensaje tool huérfano (se protege en un bloque individual)
      if (current.role === 'tool') {
        blocks.push([current]);
        i++;
        continue;
      }

      // Caso 3: Mensaje regular de usuario, asistente o sistema
      blocks.push([current]);
      i++;
    }

    return blocks;
  }

  /**
   * Construye el contexto optimizado aplicando presupuesto, poda y ventana deslizante.
   */
  function buildOptimizedContext(rawMessages = [], options = {}) {
    const model = options.model || '';
    const providerType = options.providerType || 'openai';
    const inputBudget = calculateInputBudget(options);
    const maxHistoricalToolChars = options.maxHistoricalToolChars || DEFAULT_MAX_HISTORICAL_TOOL_CHARS;
    const maxActiveToolChars = options.maxActiveToolChars || DEFAULT_MAX_ACTIVE_TOOL_CHARS;

    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      return {
        messages: [],
        diagnostics: {
          budget: inputBudget,
          totalTokens: 0,
          includedCount: 0,
          excludedCount: 0,
          prunedToolsCount: 0
        }
      };
    }

    // 1. Separar mensajes del Sistema (Header crítico)
    const systemMessages = [];
    const conversationMessages = [];

    rawMessages.forEach(m => {
      if (m && m.role === 'system') {
        systemMessages.push(m);
      } else if (m && m.role) {
        conversationMessages.push(m);
      }
    });

    // 2. Si no hay conversación, retornar solo el sistema
    if (conversationMessages.length === 0) {
      const systemTokens = estimateHistoryTokens(systemMessages, model);
      return {
        messages: systemMessages,
        diagnostics: {
          budget: inputBudget,
          totalTokens: systemTokens,
          systemTokens,
          includedCount: systemMessages.length,
          excludedCount: 0,
          prunedToolsCount: 0
        }
      };
    }

    // 3. Separar el Último Turno (Footer crítico que jamás se elimina)
    // El último turno incluye el último bloque atómico (ej: último user prompt o tool en curso)
    const atomicBlocks = groupIntoAtomicBlocks(conversationMessages);
    const lastBlock = atomicBlocks.pop(); // Último bloque indispensable

    // Aplicar límite al bloque activo si contiene herramientas
    const processedLastBlock = lastBlock.map(m => {
      if (m.role === 'tool') {
        return {
          ...m,
          content: truncateToolContent(m.content, maxActiveToolChars, m.name)
        };
      }
      return m;
    });

    const systemTokens = estimateHistoryTokens(systemMessages, model);
    const lastBlockTokens = estimateHistoryTokens(processedLastBlock, model);

    let currentTokens = systemTokens + lastBlockTokens;
    const remainingBudget = Math.max(0, inputBudget - currentTokens);

    // 4. Poda de herramientas pasadas en los bloques históricos
    let prunedToolsCount = 0;
    const processedHistoricalBlocks = atomicBlocks.map(block => {
      return block.map(m => {
        if (m.role === 'tool') {
          const pruned = pruneHistoricalToolMessage(m, maxHistoricalToolChars);
          if (pruned._prunedByContextManager) prunedToolsCount++;
          return pruned;
        }
        return m;
      });
    });

    // 5. Ventana deslizante hacia atrás (de más reciente a más antiguo)
    const includedHistoricalBlocks = [];
    let excludedMessagesCount = 0;

    for (let bIdx = processedHistoricalBlocks.length - 1; bIdx >= 0; bIdx--) {
      const block = processedHistoricalBlocks[bIdx];
      const blockTokens = estimateHistoryTokens(block, model);

      if (currentTokens + blockTokens <= inputBudget) {
        includedHistoricalBlocks.unshift(block);
        currentTokens += blockTokens;
      } else {
        // Bloque no cabe en el presupuesto: se excluye completo
        excludedMessagesCount += block.length;
      }
    }

    // 6. Ensamblado final de la lista de mensajes
    const finalMessages = [
      ...systemMessages,
      ...includedHistoricalBlocks.flat(),
      ...processedLastBlock
    ];

    const totalFinalTokens = estimateHistoryTokens(finalMessages, model);

    return {
      messages: finalMessages,
      diagnostics: {
        budget: inputBudget,
        totalTokens: totalFinalTokens,
        systemTokens: systemTokens,
        includedCount: finalMessages.length,
        excludedCount: excludedMessagesCount,
        prunedToolsCount: prunedToolsCount,
        strategy: excludedMessagesCount > 0 ? 'sliding_window_truncated' : 'full_history'
      }
    };
  }

  return {
    getModelContextLimit,
    calculateInputBudget,
    estimateTextTokens,
    estimateMessageTokens,
    estimateHistoryTokens,
    registerEstimator,
    truncateToolContent,
    pruneHistoricalToolMessage,
    buildOptimizedContext
  };
}));
