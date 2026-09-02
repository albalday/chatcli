/**
 * Motor Agéntico de Mensajería y Streaming (ChatEngine) para ZeroChat.
 * Responsable de:
 * - Construcción y anclaje de mensajes efectivos (System Prompt, Context-Caching, RAG context).
 * - Orquestación del bucle agéntico multi-turno (turnos asistentes, llamadas a herramientas y síntesis forzada).
 * - Streaming de tokens, reasoning/thinking chunks y cálculo de métricas en tiempo real.
 * - Prevención de bucles infinitos por llamadas idénticas consecutivas.
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function getAPI() {
    return (typeof window !== 'undefined' && window.ChatAPI)
      ? window.ChatAPI
      : (typeof require !== 'undefined' ? (() => { try { return require('./api.js'); } catch (e) { return {}; } })() : {});
  }

  function getAgentCore() {
    return (typeof window !== 'undefined' && window.ChatAgentCore)
      ? window.ChatAgentCore
      : (typeof require !== 'undefined' ? (() => { try { return require('./agent-core.js'); } catch (e) { return {}; } })() : {});
  }

  function getMarkdown() {
    return (typeof window !== 'undefined' && window.ChatMarkdown)
      ? window.ChatMarkdown
      : (typeof require !== 'undefined' ? (() => { try { return require('./markdown.js'); } catch (e) { return {}; } })() : {});
  }

  function getContextManager() {
    return (typeof window !== 'undefined' && window.ChatContextManager)
      ? window.ChatContextManager
      : (typeof require !== 'undefined' ? (() => { try { return require('./context-manager.js'); } catch (e) { return {}; } })() : {});
  }

  function getI18n() {
    return (typeof window !== 'undefined' && window.ChatI18n)
      ? window.ChatI18n
      : (typeof require !== 'undefined' ? (() => { try { return require('./i18n.js'); } catch (e) { return {}; } })() : {});
  }

  function tr(key, fallback, params) {
    const I18n = getI18n();
    if (I18n && I18n.t) {
      return I18n.t(key, params);
    }
    return fallback || key;
  }

  /**
   * Genera el ancla de fecha diaria para maximizar la autoridad del contexto y 100% de aciertos en Context-Cache.
   * @param {string} [lang='es'] - Código de idioma ('es' o 'en').
   * @returns {string} - Texto formateado del ancla diaria.
   */
  function getDailyDateAnchor(lang = 'es') {
    const now = new Date();
    const isoDate = now.toISOString().slice(0, 10);
    const tz = (typeof Intl !== 'undefined' && Intl.DateTimeFormat)
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      : 'UTC';
    const dayName = now.toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', { weekday: 'long' });

    if (lang === 'en') {
      return `[Current date: ${isoDate} (${dayName}), Timezone: ${tz}. Treat as present.]`;
    }

    return `[Fecha actual: ${isoDate} (${dayName}), Zona: ${tz}. Trátala como presente.]`;
  }

  /**
   * Genera la guía de herramientas en texto plano / XML para modelos que no soportan Function Calling nativo en JSON.
   * @param {Object} [appConfig={}] - Configuración activa de herramientas.
   * @param {string} [lang='es'] - Idioma ('es' o 'en').
   * @returns {string} - Guía formateada para el System Prompt.
   */
  function getToolsSystemPromptGuide(appConfig = {}, lang = 'es') {
    const AgentCore = getAgentCore();
    if (AgentCore && AgentCore.registry && typeof AgentCore.registry.getActivePromptGuide === 'function') {
      return AgentCore.registry.getActivePromptGuide(appConfig, lang);
    }
    return '';
  }

  /**
   * Inyecta el cursor de streaming dentro del HTML de forma semánticamente correcta.
   * @param {string} html - HTML renderizado del turno en curso.
   * @returns {string} - HTML con el cursor parpadeante integrado.
   */
  function injectStreamingCursor(html) {
    if (!html || html.trim() === '') {
      return '<span class="streaming-cursor"></span>';
    }
    const trimmed = html.trimEnd();
    const match = trimmed.match(/(<\/(?:p|li|h[1-6]|span|code|strong|em|td|blockquote)>)$/i);
    if (match) {
      const closingTag = match[1];
      return trimmed.slice(0, -closingTag.length) + '<span class="streaming-cursor"></span>' + closingTag;
    }
    return trimmed + '<span class="streaming-cursor"></span>';
  }

  /**
   * Construye el array de mensajes normalizado y enriquecido para la API de inferencia.
   * @param {Array} chatHistory - Historial de mensajes de la conversación.
   * @param {Object} appConfig - Configuración activa de la aplicación.
   * @param {Object} [options={}] - Opciones de contexto (ej: currentRagSystemContext, forceSystemPromptGuide).
   * @returns {Array} - Array de mensajes listo para streamChatCompletion.
   */
  function buildEffectiveMessages(chatHistory = [], appConfig = {}, options = {}) {
    const rawMessages = (chatHistory || []).filter(m => m && m.role);
    const messages = [];

    rawMessages.forEach(m => {
      if (m.role === 'user') {
        if (m.images && Array.isArray(m.images) && m.images.length > 0) {
          const contentParts = [];
          if (m.content) {
            contentParts.push({ type: 'text', text: m.content });
          }
          m.images.forEach(img => {
            if (img && img.dataUrl) {
              contentParts.push({
                type: 'image_url',
                image_url: {
                  url: img.dataUrl
                }
              });
            }
          });
          messages.push({ role: 'user', content: contentParts });
        } else {
          messages.push({ role: 'user', content: m.content || '' });
        }
      } else if (m.role === 'assistant') {
        const item = { role: 'assistant', content: m.content !== undefined ? m.content : '' };
        if (m.tool_calls && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
          item.tool_calls = m.tool_calls;
        }
        messages.push(item);
      } else if (m.role === 'tool') {
        const toolCallId = m.tool_call_id || `call_${Date.now()}`;
        const toolName = m.name || 'tool';
        const toolContent = typeof m.content === 'object' ? JSON.stringify(m.content) : String(m.content !== undefined ? m.content : '');

        // Validar que el mensaje previo sea un assistant con el tool_call correspondiente
        const prevMsg = messages.length > 0 ? messages[messages.length - 1] : null;
        const hasMatchingToolCall = prevMsg && prevMsg.role === 'assistant' && Array.isArray(prevMsg.tool_calls) &&
          prevMsg.tool_calls.some(tc => tc.id === toolCallId || (tc.function && tc.function.name === toolName));

        if (!hasMatchingToolCall) {
          messages.push({
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: toolCallId,
              type: 'function',
              function: {
                name: toolName,
                arguments: '{}'
              }
            }]
          });
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCallId,
          name: toolName,
          content: toolContent
        });
      } else if (m.role === 'system') {
        messages.push({ role: 'system', content: m.content || '' });
      }
    });

    let activePrompt = (appConfig.systemPrompt && appConfig.systemPrompt.trim() !== '')
      ? appConfig.systemPrompt.trim()
      : '';

    // Inyección de Base de Conocimiento (RAG Jerárquico por Ramas) para Context-Caching
    const ragContext = options.currentRagSystemContext || appConfig.currentRagSystemContext || '';
    if (ragContext) {
      activePrompt = activePrompt ? `${ragContext}\n\n${activePrompt}` : ragContext;
    }

    // Ancla de fecha diaria para máxima autoridad en System Prompt y 100% de aciertos en Context-Cache
    const lang = appConfig.language || 'es';
    if (appConfig.sendDateTime !== false) {
      const dateAnchor = getDailyDateAnchor(lang);
      activePrompt = activePrompt ? (dateAnchor + '\n\n' + activePrompt) : dateAnchor;
    }

    const formatDirective = (lang === 'en')
      ? '[Format: Standard Markdown. Do not use LaTeX commands (avoid \\left, \\right, \\begin, \\,); write math and numbers plainly with standard symbols (+, -, ×, /, =).]'
      : '[Formato: Markdown estándar. No uses comandos LaTeX (evita \\left, \\right, \\begin, \\,); escribe matemáticas y números directamente con símbolos estándar (+, -, ×, /, =).]';
    activePrompt = activePrompt ? (activePrompt + '\n\n' + formatDirective) : formatDirective;

    const isToolsEnabled = options.enableTools !== undefined
      ? Boolean(options.enableTools)
      : (appConfig.enableAgentJs !== false || appConfig.enableAgentWeb !== false || appConfig.enableAgentSearch !== false || appConfig.enableAgentChart !== false || Boolean(appConfig.activeRagBranchId));

    // Consultar si el modelo soporta llamadas a herramientas nativas
    const API = getAPI();
    let isNativeToolsSupported = true;
    if (API && API.getProviderCapabilities) {
      const caps = API.getProviderCapabilities(appConfig.apiUrl, appConfig.apiType, appConfig.model);
      isNativeToolsSupported = caps ? (caps.tools !== false) : true;
    }

    // Instrucción de flujo para herramientas
    let toolsGuide = '';
    if (isToolsEnabled) {
      if (!isNativeToolsSupported || options.forceSystemPromptGuide) {
        toolsGuide = getToolsSystemPromptGuide(appConfig, lang);
      } else {
        toolsGuide = (lang === 'en')
          ? `*Workflow instruction:* Once you receive tool results in the conversation, synthesize the findings and write a comprehensive, well-structured final answer to the user, citing sources. Do not stop without providing a complete summary.`
          : `*Instrucción de flujo:* Una vez recibidos los resultados de las herramientas en la conversación, sintetiza los hallazgos y redacta una respuesta final completa, bien estructurada y detallada para el usuario, citando las fuentes consultadas. No finalices la respuesta sin proporcionar el resumen completo.`;
      }
    }

    // Directiva proactiva de Base de Conocimiento activa
    const activeBranchId = options.activeRagBranchId ||
      (typeof window !== 'undefined' && window.ChatTreeRagUI && window.ChatTreeRagUI.getActiveChatBranchId ? window.ChatTreeRagUI.getActiveChatBranchId() : '') ||
      (appConfig.activeRagBranchId || '');

    if (activeBranchId) {
      const ragInstruction = (lang === 'en')
        ? `*Knowledge Base active:* You have access to the user's private local knowledge base via 'list_documents', 'search_knowledge_base', and 'read_chapter_content'. When the user asks about available manuals, documentation, guides, or technical information, proactively consult these tools before concluding.`
        : `*Base de Conocimiento activa:* Tienes acceso a la base de conocimiento local y manuales privados del usuario mediante las herramientas 'list_documents', 'search_knowledge_base' y 'read_chapter_content'. Ante preguntas sobre documentación disponible, manuales, procedimientos técnicos o normativas, consulta proactivamente los documentos indexados utilizando estas herramientas antes de responder.`;
      toolsGuide = toolsGuide ? `${toolsGuide}\n\n${ragInstruction}` : ragInstruction;
    }

    let fullSystemPrompt = activePrompt;
    if (toolsGuide) {
      fullSystemPrompt = fullSystemPrompt ? (fullSystemPrompt + '\n\n' + toolsGuide) : toolsGuide;
    }

    if (messages.length > 0 && messages[0].role === 'system') {
      if (fullSystemPrompt) {
        messages[0].content = fullSystemPrompt;
      } else {
        messages.shift();
      }
    } else if (fullSystemPrompt) {
      messages.unshift({
        role: 'system',
        content: fullSystemPrompt
      });
    }

    // Inyectar marca temporal en el último mensaje de usuario si está configurado
    if (appConfig.sendDateTime !== false && messages.length > 0) {
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
      if (lastUserMsg && typeof lastUserMsg.content === 'string') {
        const now = new Date();
        const isoDate = now.toISOString().slice(0, 10);
        const dayName = now.toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', { weekday: 'long' });
        const timeStr = now.toLocaleTimeString(lang === 'en' ? 'en-US' : 'es-ES', { hour: '2-digit', minute: '2-digit' });
        const timeMarker = `\n\n[Context Time: ${timeStr}, Date: ${isoDate} (${dayName})]`;
        if (!lastUserMsg.content.includes('[Context Time:')) {
          lastUserMsg.content += timeMarker;
        }
      }
    }

    // Asegurar que la conversación comience con un turno de usuario válido tras el mensaje del sistema
    const firstNonSysIdx = messages.findIndex(m => m.role !== 'system');
    if (firstNonSysIdx !== -1 && messages[firstNonSysIdx].role === 'assistant') {
      messages.splice(firstNonSysIdx, 0, {
        role: 'user',
        content: 'Continuar'
      });
    }

    // Optimización dinámica de contexto, presupuesto de tokens y ventana deslizante
    const ContextManager = getContextManager();
    if (ContextManager && ContextManager.buildOptimizedContext) {
      const optimization = ContextManager.buildOptimizedContext(messages, {
        model: appConfig.model,
        providerType: appConfig.apiType,
        ...options
      });
      return optimization.messages;
    }

    return messages;
  }

  /**
   * Ejecuta el bucle agéntico multi-turno de inferencia, streaming y herramientas.
   * @param {Object} params - Parámetros de ejecución.
   * @returns {Promise<{ success: boolean, finalAssistantText: string, accumulatedMarkdown: string, stats: Object, cancelled?: boolean, error?: any }>}
   */
  async function executeAgentTurnLoop(params = {}) {
    const {
      apiUrl,
      apiType,
      apiKey,
      model,
      temperature,
      reasoningEffort,
      chatHistory = [],
      appConfig = {},
      assistantMsgId = `asst_${Date.now()}`,
      activeRagBranchId = '',
      currentRagSystemContext = '',
      sessionCacheInvalidated = false,
      sessionCacheRevision = Date.now(),
      signal,
      container,
      onTurnStart,
      onChunk,
      onReasoningChunk,
      onLog,
      onStats,
      onBeforeRequest,
      onToolCallStart,
      onToolCallEnd,
      scrollToBottom,
      attachListeners
    } = params;

    const API = getAPI();
    const AgentCore = getAgentCore();
    const Markdown = getMarkdown();
    const parseMd = Markdown.parseMarkdown || function (txt) { return txt; };
    const attachEvts = attachListeners || Markdown.attachCopyCodeListeners || function () {};
    const scrollFn = scrollToBottom || function () {};

    if (!API || !API.streamChatCompletion) {
      const err = new Error('El módulo ChatAPI no está disponible.');
      if (typeof onLog === 'function') onLog('error', err.message);
      return { success: false, error: err };
    }

    if (!model || model.trim() === '') {
      const err = new Error('No se ha seleccionado ningún modelo de inferencia.');
      if (typeof onLog === 'function') onLog('error', err.message);
      return { success: false, error: err };
    }

    const maxAgentTurns = params.maxAgentTurns || 8;
    const toolCallSignatures = [];
    let turnIndex = 0;
    let accumulatedConversationMarkdown = '';
    let finalAssistantText = '';
    let finalStats = null;
    let isCancelled = false;

    while (turnIndex < maxAgentTurns) {
      if (signal && signal.aborted) {
        isCancelled = true;
        break;
      }

      let turnBlock = null;
      if (container && typeof document !== 'undefined') {
        if (turnIndex === 0) {
          container.innerHTML = '';
        }
        turnBlock = document.createElement('div');
        turnBlock.className = 'agentic-turn-block';
        container.appendChild(turnBlock);
      }

      if (typeof onTurnStart === 'function') {
        onTurnStart({ turnIndex, turnBlock });
      }

      let currentTurnText = '';
      let turnToolCalls = null;
      let turnFinalStats = null;
      let streamError = null;

      const isFirstTurn = turnIndex === 0;
      const currentCacheInvalidated = isFirstTurn && sessionCacheInvalidated;

      const effectiveMessages = buildEffectiveMessages(chatHistory, appConfig, {
        currentRagSystemContext,
        activeRagBranchId
      });

      const AgentCore = getAgentCore();
      const activeToolDefs = (AgentCore && AgentCore.registry && typeof AgentCore.registry.getActiveDefinitions === 'function')
        ? AgentCore.registry.getActiveDefinitions({ ...appConfig, activeRagBranchId })
        : [];

      const streamResult = await API.streamChatCompletion({
        apiUrl: apiUrl || appConfig.apiUrl,
        apiType: apiType || appConfig.apiType,
        apiKey: apiKey || appConfig.apiKey,
        model: model || appConfig.model,
        messages: effectiveMessages,
        temperature: temperature !== undefined ? temperature : appConfig.temperature,
        reasoningEffort: reasoningEffort || appConfig.reasoningEffort || 'none',
        tools: activeToolDefs,
        enableTools: activeToolDefs.length > 0,
        activeRagBranchId: activeRagBranchId || '',
        enableContextCache: appConfig.enableContextCache !== false,
        cacheInvalidated: currentCacheInvalidated,
        cacheRevision: sessionCacheRevision,
        signal: signal,

        onBeforeRequest: onBeforeRequest,

        onReasoningChunk: function (chunk) {
          if (typeof onReasoningChunk === 'function') onReasoningChunk(chunk);
          if (typeof onLog === 'function') onLog('thinking', chunk);
        },

        onLog: function (logData) {
          if (typeof onLog === 'function' && logData && logData.type !== 'thinking') {
            onLog(logData.type, logData.text);
          }
        },

        onChunk: function (fullTextSoFar, delta, stats) {
          currentTurnText = fullTextSoFar;
          if (turnBlock) {
            turnBlock.innerHTML = injectStreamingCursor(parseMd(currentTurnText));
            attachEvts(turnBlock);
          }
          if (stats && typeof onStats === 'function') onStats(stats);
          if (typeof onChunk === 'function') onChunk({ turnIndex, fullText: currentTurnText, delta, stats });
          scrollFn();
        },

        onDone: function (finalText, stats, toolCalls) {
          currentTurnText = finalText || currentTurnText;
          turnFinalStats = stats;
          turnToolCalls = toolCalls;
        },

        onError: function (error) {
          streamError = error;
        }
      });

      if (streamResult && streamResult.cancelled) {
        if (turnBlock && !currentTurnText && turnBlock.parentNode) {
          turnBlock.parentNode.removeChild(turnBlock);
        }
        return { success: false, cancelled: true };
      }

      if (streamError) {
        if (signal && signal.aborted) {
          return { success: false, cancelled: true };
        }
        if (typeof onLog === 'function') onLog('error', streamError.message || String(streamError));
        return { success: false, error: streamError, currentTurnText };
      }

      if (streamResult) {
        currentTurnText = streamResult.accumulatedText || currentTurnText;
        turnToolCalls = streamResult.toolCalls || turnToolCalls;
        turnFinalStats = streamResult.stats || turnFinalStats;
      }

      // Extraer tool calls de texto si no llegaron en estructura JSON nativa
      if ((!turnToolCalls || turnToolCalls.length === 0) && currentTurnText && API.extractToolCallsFromText) {
        const textCalls = API.extractToolCallsFromText(currentTurnText);
        if (textCalls && textCalls.length > 0) {
          turnToolCalls = textCalls;
        }
      }

      // CASO A: Si no hay llamadas a herramientas, turno final o síntesis forzada
      if (!turnToolCalls || turnToolCalls.length === 0) {
        // Síntesis forzada si el modelo devolvió texto vacío tras turnos de herramientas
        if ((!currentTurnText || currentTurnText.trim() === '') && turnIndex > 0 && chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'tool' && !(signal && signal.aborted)) {
          if (typeof onLog === 'function') onLog('info', 'El modelo finalizó el turno de herramientas sin texto. Solicitando síntesis final obligatoria...');

          let synthText = '';
          let synthStats = null;
          const isEn = appConfig.language === 'en';
          const synthMessages = buildEffectiveMessages(chatHistory, appConfig, {
            currentRagSystemContext,
            activeRagBranchId,
            forceSystemPromptGuide: true
          });

          synthMessages.push({
            role: 'user',
            content: isEn
              ? 'Based on all the information gathered from the tools above, please write a comprehensive, detailed, and well-structured final answer to my initial question, organizing the findings clearly and citing sources.'
              : 'A partir de toda la información obtenida por las herramientas anteriores, redacta ahora una respuesta final completa, detallada y bien estructurada para mi consulta inicial, organizando los hallazgos con claridad y citando las fuentes consultadas.'
          });

          await API.streamChatCompletion({
            apiUrl: apiUrl || appConfig.apiUrl,
            apiType: apiType || appConfig.apiType,
            apiKey: apiKey || appConfig.apiKey,
            model: model || appConfig.model,
            messages: synthMessages,
            temperature: temperature !== undefined ? temperature : appConfig.temperature,
            reasoningEffort: reasoningEffort || appConfig.reasoningEffort || 'none',
            enableTools: true,
            toolChoice: 'none',
            enableAgentJs: appConfig.enableAgentJs !== false,
            enableAgentWeb: appConfig.enableAgentWeb !== false,
            enableAgentSearch: appConfig.enableAgentSearch !== false,
            enableAgentChart: appConfig.enableAgentChart !== false,
            enableAgentRag: Boolean(activeRagBranchId),
            activeRagBranchId: activeRagBranchId || '',
            enableContextCache: appConfig.enableContextCache !== false,
            signal: signal,

            onReasoningChunk: function (chunk) {
              if (typeof onReasoningChunk === 'function') onReasoningChunk(chunk);
              if (typeof onLog === 'function') onLog('thinking', chunk);
            },
            onLog: function (logData) {
              if (typeof onLog === 'function' && logData && logData.type !== 'thinking') onLog(logData.type, logData.text);
            },
            onChunk: function (fullTextSoFar, delta, stats) {
              synthText = fullTextSoFar;
              if (turnBlock) {
                turnBlock.innerHTML = injectStreamingCursor(parseMd(synthText));
                attachEvts(turnBlock);
              }
              if (stats && typeof onStats === 'function') onStats(stats);
              scrollFn();
            },
            onDone: function (finalText, stats) {
              synthText = finalText || synthText;
              synthStats = stats;
            }
          });

          if (synthText && synthText.trim() !== '') {
            currentTurnText = synthText;
            if (synthStats) turnFinalStats = synthStats;
          }
        }

        // Si aún no hay texto tras síntesis forzada, compilar resultados de herramientas
        if (!currentTurnText || currentTurnText.trim() === '') {
          const toolResults = chatHistory
            .filter(m => m.role === 'tool' && m.content)
            .map(m => m.content)
            .filter(Boolean);

          if (toolResults.length > 0) {
            const isEn = appConfig.language === 'en';
            currentTurnText = isEn
              ? '### Summary of Search Results\n\n' + toolResults.join('\n\n---\n\n')
              : '### Resumen de la Información Consultada\n\n' + toolResults.join('\n\n---\n\n');
          }
        }

        if (turnBlock) {
          turnBlock.innerHTML = parseMd(currentTurnText || tr('empty_response', 'Respuesta vacía'));
          attachEvts(turnBlock);
        }

        chatHistory.push({
          id: `${assistantMsgId}_final`,
          role: 'assistant',
          content: currentTurnText
        });

        finalAssistantText = currentTurnText;
        finalStats = turnFinalStats;
        if (finalStats && typeof onStats === 'function') onStats(finalStats);

        return {
          success: true,
          finalAssistantText,
          accumulatedMarkdown: (accumulatedConversationMarkdown ? accumulatedConversationMarkdown : '') + currentTurnText,
          stats: finalStats,
          chatHistory
        };
      }

      // CASO B: Procesar llamada a herramienta
      const tc = turnToolCalls[0];
      const rawFuncName = tc.function?.name || '';
      const normName = API.normalizeToolName ? API.normalizeToolName(rawFuncName) : rawFuncName.toLowerCase().replace(/_/g, '');

      // Protección contra Bucles Infinitos (repetición idéntica de llamada)
      const callFingerprint = `${normName}:${typeof tc.function.arguments === 'object' ? JSON.stringify(tc.function.arguments) : String(tc.function.arguments || '').trim()}`;
      const identicalCount = toolCallSignatures.filter(sig => sig === callFingerprint).length;
      if (identicalCount >= 2) {
        if (typeof onLog === 'function') {
          onLog('error', `[Protección Bucle Infinito]: Herramienta '${normName}' invocada repetidamente con los mismos argumentos. Interrumpiendo ciclo agéntico.`);
        }
        const loopWarning = `\n\n> ⚠️ *[Protección de Bucle Infinito]*: La herramienta \`${normName}\` fue invocada repetidamente con los mismos parámetros sin progreso. Se finaliza la iteración.`;
        currentTurnText = (currentTurnText || '') + loopWarning;
        if (turnBlock) {
          turnBlock.innerHTML = parseMd(currentTurnText);
          attachEvts(turnBlock);
        }

        chatHistory.push({
          id: `${assistantMsgId}_final`,
          role: 'assistant',
          content: currentTurnText
        });

        finalAssistantText = currentTurnText;
        finalStats = turnFinalStats;
        if (finalStats && typeof onStats === 'function') onStats(finalStats);

        return {
          success: true,
          finalAssistantText,
          accumulatedMarkdown: accumulatedConversationMarkdown + currentTurnText,
          stats: finalStats,
          chatHistory
        };
      }
      toolCallSignatures.push(callFingerprint);

      // Limpiar llamadas a herramientas emitidas accidentalmente como texto crudo
      const trimmedAcc = (currentTurnText || '').trim();
      if (
        trimmedAcc.startsWith('<|') ||
        trimmedAcc.startsWith('<tool_call') ||
        trimmedAcc.startsWith('<function_call') ||
        trimmedAcc.startsWith('call:') ||
        trimmedAcc.startsWith('{"name"') ||
        trimmedAcc.startsWith('```json\n{"name"') ||
        trimmedAcc.startsWith('download_pdf(') ||
        trimmedAcc.startsWith('downloadpdf(') ||
        trimmedAcc.startsWith('fetch_web_page(') ||
        trimmedAcc.startsWith('fetchwebpage(') ||
        trimmedAcc.startsWith('search_web(') ||
        trimmedAcc.startsWith('searchweb(') ||
        trimmedAcc.startsWith('execute_javascript(') ||
        trimmedAcc.startsWith('executejs(')
      ) {
        currentTurnText = '';
      }

      if (currentTurnText && turnBlock) {
        turnBlock.innerHTML = parseMd(currentTurnText);
        attachEvts(turnBlock);
      } else if (turnBlock) {
        turnBlock.remove();
      }

      if (typeof onToolCallStart === 'function') {
        onToolCallStart({ turnIndex, toolCall: tc });
      }

      // Ejecución de la herramienta mediante ChatAgentCore.dispatchToolCall
      let toolExecRes = null;
      if (AgentCore && AgentCore.dispatchToolCall) {
        toolExecRes = await AgentCore.dispatchToolCall(tc, {
          container: container,
          onLog: onLog,
          attachListeners: attachEvts,
          scrollToBottom: scrollFn,
          language: appConfig.language || 'es',
          signal: signal,
          activeRagBranchId: activeRagBranchId
        });
      } else {
        toolExecRes = {
          success: false,
          resultText: 'Error: Módulo de ejecución de herramientas no disponible.',
          markdownBlock: `> ❌ **${rawFuncName}**: Módulo de ejecución no disponible.`
        };
      }

      if (typeof onToolCallEnd === 'function') {
        onToolCallEnd({ turnIndex, toolCall: tc, result: toolExecRes });
      }

      if (turnFinalStats && typeof onStats === 'function') onStats(turnFinalStats);
      scrollFn();

      // Guardar turno del asistente y turno de la herramienta
      chatHistory.push({
        id: `${assistantMsgId}_turn_${turnIndex}_assistant`,
        role: 'assistant',
        content: currentTurnText || null,
        tool_calls: [tc]
      });

      chatHistory.push({
        id: `${assistantMsgId}_turn_${turnIndex}_tool_${tc.id || 'res'}`,
        role: 'tool',
        tool_call_id: tc.id || `call_${Date.now()}`,
        name: rawFuncName,
        content: toolExecRes.resultText
      });

      accumulatedConversationMarkdown += (currentTurnText ? currentTurnText + '\n\n' : '') + (toolExecRes.markdownBlock || '') + '\n\n';

      turnIndex++;
    }

    // CASO C: Si se agotaron los turnos máximos tras una herramienta, síntesis final obligatoria
    if (turnIndex >= maxAgentTurns && chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'tool' && !(signal && signal.aborted)) {
      let finalSynthBlock = null;
      if (container && typeof document !== 'undefined') {
        finalSynthBlock = document.createElement('div');
        finalSynthBlock.className = 'agentic-turn-block';
        container.appendChild(finalSynthBlock);
      }

      let finalSynthText = '';
      let finalSynthStats = null;
      const isEn = appConfig.language === 'en';
      const synthMessages = buildEffectiveMessages(chatHistory, appConfig, {
        currentRagSystemContext,
        activeRagBranchId,
        forceSystemPromptGuide: true
      });

      synthMessages.push({
        role: 'user',
        content: isEn
          ? 'Based on all the information gathered from the tools above, please write a comprehensive, detailed, and well-structured final answer to my initial question, organizing the findings clearly and citing sources.'
          : 'A partir de toda la información obtenida por las herramientas anteriores, redacta ahora una respuesta final completa, detallada y bien estructurada para mi consulta inicial, organizando los hallazgos con claridad y citando las fuentes consultadas.'
      });

      await API.streamChatCompletion({
        apiUrl: apiUrl || appConfig.apiUrl,
        apiType: apiType || appConfig.apiType,
        apiKey: apiKey || appConfig.apiKey,
        model: model || appConfig.model,
        messages: synthMessages,
        temperature: temperature !== undefined ? temperature : appConfig.temperature,
        reasoningEffort: reasoningEffort || appConfig.reasoningEffort || 'none',
        tools: activeToolDefs,
        enableTools: true,
        toolChoice: 'none',
        activeRagBranchId: activeRagBranchId || '',
        enableContextCache: appConfig.enableContextCache !== false,
        signal: signal,

        onReasoningChunk: function (chunk) {
          if (typeof onReasoningChunk === 'function') onReasoningChunk(chunk);
          if (typeof onLog === 'function') onLog('thinking', chunk);
        },
        onLog: function (logData) {
          if (typeof onLog === 'function' && logData && logData.type !== 'thinking') onLog(logData.type, logData.text);
        },
        onChunk: function (fullTextSoFar, delta, stats) {
          finalSynthText = fullTextSoFar;
          if (finalSynthBlock) {
            finalSynthBlock.innerHTML = injectStreamingCursor(parseMd(finalSynthText));
            attachEvts(finalSynthBlock);
          }
          if (stats && typeof onStats === 'function') onStats(stats);
          scrollFn();
        },
        onDone: function (finalText, stats) {
          finalSynthText = finalText || finalSynthText;
          finalSynthStats = stats;
        }
      });

      if (!finalSynthText || finalSynthText.trim() === '') {
        const toolResults = chatHistory
          .filter(m => m.role === 'tool' && m.content)
          .map(m => m.content)
          .filter(Boolean);

        if (toolResults.length > 0) {
          finalSynthText = isEn
            ? '### Summary of Search Results\n\n' + toolResults.join('\n\n---\n\n')
            : '### Resumen de la Información Consultada\n\n' + toolResults.join('\n\n---\n\n');
        }
      }

      if (finalSynthText && finalSynthBlock) {
        finalSynthBlock.innerHTML = parseMd(finalSynthText);
        attachEvts(finalSynthBlock);
        chatHistory.push({
          id: `${assistantMsgId}_final`,
          role: 'assistant',
          content: finalSynthText
        });
      }

      finalAssistantText = finalSynthText;
      finalStats = finalSynthStats;
      if (finalStats && typeof onStats === 'function') onStats(finalStats);
    }

    return {
      success: true,
      finalAssistantText,
      accumulatedMarkdown: (accumulatedConversationMarkdown ? accumulatedConversationMarkdown : '') + finalAssistantText,
      stats: finalStats,
      chatHistory
    };
  }

  return {
    getDailyDateAnchor,
    getToolsSystemPromptGuide,
    injectStreamingCursor,
    buildEffectiveMessages,
    executeAgentTurnLoop
  };
});
