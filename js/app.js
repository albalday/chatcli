/**
 * Aplicación principal del cliente de chat Web (ChatCLI v4.0).
 * Incluye:
 * - Soporte Multi-idioma (Castellano / Inglés) con autodetección por navegador y persistencia.
 * - Selector de nivel de razonamiento (Thinking/CoT) con detección automática de capacidades del modelo.
 * - Nuevo chat abriendo en una nueva pestaña.
 * - Estadísticas y acciones agrupadas en la misma línea debajo de la respuesta.
 * - Borrado de preguntas y respuestas individuales.
 * - Copia de respuesta completa al portapapeles.
 * - Estadísticas en tiempo real (tokens, tiempo, tokens/segundo).
 * - Adjuntar archivos de texto y código con vista previa y arrastrar/soltar.
 * - Compatibilidad total con file:// y http://.
 */

(function () {
  'use strict';

  // Módulos globales
  const Storage = window.ChatStorage || {};
  const Markdown = window.ChatMarkdown || {};
  const API = window.ChatAPI || {};
  const FileParser = window.ChatFileParser || {};
  const Sandbox = window.ChatSandbox || {};
  const Charts = window.ChatCharts || {};
  const WebBrowser = window.ChatWebBrowser || {};
  const WebSearch = window.ChatWebSearch || {};
  const I18n = window.ChatI18n || {};
  const Debug = window.ChatDebug || {};
  const ToolCards = window.ChatToolCards || {};
  const Attachments = window.ChatAttachments || {};
  const Export = window.ChatExport || {};
  const State = window.ChatState || {};
  const ContextManager = window.ChatContextManager || {};

  function t(key, params) {
    if (I18n.t) return I18n.t(key, params);
    return key;
  }

  // Estado de la aplicación
  let appConfig = Storage.loadConfig ? Storage.loadConfig() : {
    apiUrl: 'http://localhost:1234/v1',
    apiType: 'openai',
    apiKey: '',
    model: '',
    systemPrompt: '',
    temperature: '0.7',
    reasoningEffort: 'none',
    theme: 'light',
    language: 'es',
    enableAgentJs: true,
    enableAgentWeb: true,
    enableAgentSearch: true,
    enableAgentChart: true,
    enableContextCache: true,
    enableRawLogs: false,
    enableDebugMessages: false,
    sendDateTime: true,
    activeRagBranchId: ''
  };

  if (typeof window !== 'undefined') {
    window.appConfig = appConfig;
  }

  let currentRagSystemContext = '';
  let chatHistory = [];
  let currentAbortController = null;
  let isGenerating = false;
  let attachedFiles = [];

  // Estado de sesiones múltiples (Sidebar)
  let currentSessionId = 'session_' + Date.now();
  let savedSessions = [];

  // Estado y control de Context Caching (Prompt Caching)
  let sessionCacheInvalidated = false;
  let sessionCacheRevision = Date.now();

  // Referencias al DOM
  let elements = {};

  function cacheDomElements() {
    elements = {
      // Barra lateral de chats
      chatSidebar: document.getElementById('chat-sidebar'),
      btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
      btnCloseSidebar: document.getElementById('btn-close-sidebar'),
      btnSidebarNewChat: document.getElementById('btn-sidebar-new-chat'),
      sidebarSearchInput: document.getElementById('sidebar-search-input'),
      sidebarChatsList: document.getElementById('sidebar-chats-list'),
      btnImportChatFile: document.getElementById('btn-import-chat-file'),
      importJsonInput: document.getElementById('import-json-input'),
      btnOpenExportModal: document.getElementById('btn-open-export-modal'),
      btnDeleteAllChats: document.getElementById('btn-delete-all-chats'),
      btnQuickExport: document.getElementById('btn-quick-export'),

      // Modal de exportación
      exportModal: document.getElementById('export-modal'),
      btnCloseExport: document.getElementById('btn-close-export'),
      btnCancelExport: document.getElementById('btn-cancel-export'),
      btnExportMarkdown: document.getElementById('btn-export-markdown'),
      btnExportJson: document.getElementById('btn-export-json'),
      btnExportPrint: document.getElementById('btn-export-print'),

      badgeServer: document.getElementById('badge-server'),
      currentServerUrl: document.getElementById('current-server-url'),
      badgeModel: document.getElementById('badge-model'),
      currentModelName: document.getElementById('current-model-name'),
      btnClearChat: document.getElementById('btn-clear-chat'),
      btnOpenSettings: document.getElementById('btn-open-settings'),
      btnLangQuick: document.getElementById('btn-lang-quick'),
      currentLangLabel: document.getElementById('current-lang-label'),
      messagesList: document.getElementById('messages-list'),
      welcomeBanner: document.getElementById('welcome-banner'),
      chatForm: document.getElementById('chat-form'),
      userInput: document.getElementById('user-input'),
      btnSend: document.getElementById('btn-send'),
      btnStopStream: document.getElementById('btn-stop-stream'),

      // Sugerencias
      sugCardExplain: document.getElementById('sug-card-explain'),
      sugCardCode: document.getElementById('sug-card-code'),
      sugCardIdeas: document.getElementById('sug-card-ideas'),

      // Razonamiento (Thinking)
      btnReasoning: document.getElementById('btn-reasoning'),
      reasoningLabel: document.getElementById('reasoning-label'),
      reasoningMenu: document.getElementById('reasoning-menu'),
      reasoningOptionsContainer: document.getElementById('reasoning-options-container'),
      reasoningModelBadge: document.getElementById('reasoning-model-badge'),

      // Panel de Debug & Logs
      btnToggleDebug: document.getElementById('btn-toggle-debug'),
      debugPanel: document.getElementById('debug-panel'),
      debugStatusIndicator: document.getElementById('debug-status-indicator'),
      btnCopyDebug: document.getElementById('btn-copy-debug'),
      btnClearDebug: document.getElementById('btn-clear-debug'),
      btnToggleAutoscroll: document.getElementById('btn-toggle-autoscroll'),
      btnCloseDebug: document.getElementById('btn-close-debug'),
      debugLogContent: document.getElementById('debug-log-content'),
      debugTabs: document.querySelectorAll('.debug-tab'),
      chkEnableDebugMessages: document.getElementById('chk-enable-debug-messages'),
      debugMessagesStatusBadge: document.getElementById('debug-messages-status-badge'),
      debugRawBar: document.getElementById('debug-raw-bar'),
      chkEnableRaw: document.getElementById('chk-enable-raw'),
      rawStatusBadge: document.getElementById('raw-status-badge'),

      // Modal de Depuración de Mensajes Salientes (Interceptor)
      debugInterceptorDialog: document.getElementById('debug-interceptor-dialog'),
      btnMaximizeDebugModal: document.getElementById('btn-maximize-debug-modal'),
      btnCloseDebugModal: document.getElementById('btn-close-debug-modal'),
      debugModalEndpointBadge: document.getElementById('debug-modal-endpoint-badge'),
      btnFormatDebugJson: document.getElementById('btn-format-debug-json'),
      btnCopyDebugJson: document.getElementById('btn-copy-debug-json'),
      txtDebugPayload: document.getElementById('txt-debug-payload'),
      debugJsonError: document.getElementById('debug-json-error'),
      btnDebugCancel: document.getElementById('btn-debug-cancel'),
      btnDebugSendDisable: document.getElementById('btn-debug-send-disable'),
      btnDebugSend: document.getElementById('btn-debug-send'),

      // Adjuntos
      btnAttachFile: document.getElementById('btn-attach-file'),
      fileInput: document.getElementById('file-input'),
      attachmentsContainer: document.getElementById('attachments-container'),

      // Modal de Configuración
      settingsDialog: document.getElementById('settings-dialog'),
      settingsForm: document.getElementById('settings-form'),
      btnCloseSettings: document.getElementById('btn-close-settings'),
      btnCancelSettings: document.getElementById('btn-cancel-settings'),
      btnResetSettings: document.getElementById('btn-reset-settings'),
      btnClearAllData: document.getElementById('btn-clear-all-data'),
      btnToggleKey: document.getElementById('btn-toggle-key'),
      settingApiType: document.getElementById('setting-api-type'),
      settingApiUrl: document.getElementById('setting-api-url'),
      btnQueryServer: document.getElementById('btn-query-server'),
      serverQueryStatus: document.getElementById('server-query-status'),
      settingApiKey: document.getElementById('setting-api-key'),
      settingModel: document.getElementById('setting-model'),
      modelDatalist: document.getElementById('model-datalist'),
      modelSelectHelper: document.getElementById('model-select-helper'),
      settingSystemPrompt: document.getElementById('setting-system-prompt'),
      settingTemperature: document.getElementById('setting-temperature'),
      temperatureVal: document.getElementById('temperature-val'),
      themeButtons: document.querySelectorAll('.btn-theme-toggle'),
      langButtons: document.querySelectorAll('.btn-lang-toggle'),
      modalTabs: document.querySelectorAll('.modal-tab-btn'),
      modalPanes: document.querySelectorAll('.modal-tab-pane'),
      btnRunInspector: document.getElementById('btn-run-inspector'),
      inspectorResults: document.getElementById('inspector-results'),
      settingEnableAgentJs: document.getElementById('setting-enable-agent-js'),
      settingEnableAgentWeb: document.getElementById('setting-enable-agent-web'),
      settingEnableAgentSearch: document.getElementById('setting-enable-agent-search'),
      settingEnableAgentChart: document.getElementById('setting-enable-agent-chart'),
      settingEnableContextCache: document.getElementById('setting-enable-context-cache'),
      settingEnableRawLogs: document.getElementById('setting-enable-raw-logs'),
      settingSendDateTime: document.getElementById('setting-send-datetime'),
    };
  }

  function getFormattedDateTime() {
    const lang = appConfig.language || (I18n.getLanguage ? I18n.getLanguage() : 'es');
    if (I18n.getFormattedDateTime) {
      return I18n.getFormattedDateTime(new Date(), lang);
    }
    const now = new Date();
    const locale = (lang === 'en') ? 'en-US' : 'es-ES';
    return now.toLocaleDateString(locale, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getDailyDateAnchor() {
    const now = new Date();
    const isoDate = now.toISOString().slice(0, 10);
    const lang = appConfig.language || (I18n.getLanguage ? I18n.getLanguage() : 'es');
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const dayName = now.toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', { weekday: 'long' });
    return lang === 'en'
      ? `[System Context: Current Date is ${isoDate} (${dayName}), Timezone: ${tz}]`
      : `[Contexto del Sistema: La fecha actual es ${isoDate} (${dayName}), Zona Horaria: ${tz}]`;
  }

  function getToolsSystemPromptGuide() {
    const lang = appConfig.language || (I18n.getLanguage ? I18n.getLanguage() : 'es');
    const isEs = lang !== 'en';
    const tools = [];

    if (appConfig.enableAgentWeb !== false) {
      if (isEs) {
        tools.push(`- \`download_pdf(url="...")\`: Descarga y extrae el texto completo de un documento PDF desde una URL web para analizar su contenido (ej: "https://arxiv.org/pdf/2310.06825.pdf" o "https://samplelib.com/pdf/sample-scanned.pdf").`);
        tools.push(`- \`fetch_web_page(url="...")\`: Descarga y lee el texto de una página web pública o artículo HTML a partir de su URL (ej: "https://es.wikipedia.org/wiki/Sol").`);
      } else {
        tools.push(`- \`download_pdf(url="...")\`: Downloads and extracts all text from a PDF document given its web URL (e.g. "https://arxiv.org/pdf/2310.06825.pdf" or "https://samplelib.com/pdf/sample-scanned.pdf").`);
        tools.push(`- \`fetch_web_page(url="...")\`: Retrieves and reads the clean text of a public web page or HTML article from its URL (e.g. "https://en.wikipedia.org/wiki/Sun").`);
      }
    }

    if (appConfig.enableAgentSearch !== false) {
      if (isEs) {
        tools.push(`- \`search_web(query="...")\`: Busca información actualizada, noticias, artículos y enlaces en internet mediante DuckDuckGo.`);
      } else {
        tools.push(`- \`search_web(query="...")\`: Searches up-to-date information, news, articles, and links on the internet using DuckDuckGo.`);
      }
    }

    if (appConfig.enableAgentJs !== false) {
      if (isEs) {
        tools.push(`- \`execute_javascript(code="...")\`: Ejecuta código JavaScript localmente en un sandbox seguro en el navegador para cálculos matemáticos y procesamiento de datos.`);
      } else {
        tools.push(`- \`execute_javascript(code="...")\`: Executes JavaScript code safely in a local browser sandbox for math calculations and data processing.`);
      }
    }

    // Herramienta de Gráficos Nativos
    if (appConfig.enableAgentChart !== false) {
      if (isEs) {
        tools.push(`- \`render_chart(type="bar"|"line"|"doughnut"|"pie", title="...", labels=["..."], datasets=[{"label":"...", "data":[...]}])\`: Genera y visualiza un gráfico interactivo (barras, líneas, donut o sectores) a partir de datos numéricos o tablas.`);
      } else {
        tools.push(`- \`render_chart(type="bar"|"line"|"doughnut"|"pie", title="...", labels=["..."], datasets=[{"label":"...", "data":[...]}])\`: Generates and renders an interactive chart (bar, line, doughnut or pie) from numerical data or tables.`);
      }
    }

    // Herramienta de Fecha y Hora en tiempo real
    if (isEs) {
      tools.push(`- \`get_current_datetime(timezone="...")\`: Obtiene la fecha, hora exacta, día de la semana y zona horaria actual en tiempo real.`);
    } else {
      tools.push(`- \`get_current_datetime(timezone="...")\`: Retrieves current date, exact time, day of week and timezone in real-time.`);
    }

    if (tools.length === 0) return '';

    if (isEs) {
      return `[HERRAMIENTAS Y FUNCIONES DISPONIBLES]:\nTienes disponibles las siguientes herramientas. Si necesitas consultar URLs, buscar en la web, leer documentos PDF o calcular, invoca la herramienta adecuada con sus parámetros obligatorios:\n${tools.join('\n')}\n*Instrucción de flujo:* Cuando obtengas el resultado de una herramienta, utilízalo para responder al usuario con una síntesis o resumen completo y estructurado, citando las fuentes consultadas. No invoques herramientas adicionales si la información obtenida ya es suficiente para responder.`;
    } else {
      return `[AVAILABLE TOOLS AND FUNCTIONS]:\nYou have the following tools available. If you need to fetch URLs, search the web, read PDF documents, or calculate, call the appropriate tool with its required parameters:\n${tools.join('\n')}\n*Workflow instruction:* Once you receive a tool's output, use it to answer the user with a comprehensive and well-structured summary, citing sources. Do not invoke further tools if the gathered information is already sufficient to answer.`;
    }
  }

  function buildEffectiveMessages(options = {}) {
    const rawMessages = chatHistory.filter(m => m && m.role);
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

    // Inyección de Base de Conocimiento (RAG Jerárquico por Ramas)
    if (currentRagSystemContext) {
      activePrompt = activePrompt ? `${currentRagSystemContext}\n\n${activePrompt}` : currentRagSystemContext;
    }

    // Ancla de fecha diaria para máxima autoridad en System Prompt y 100% de aciertos en Context-Cache
    if (appConfig.sendDateTime !== false) {
      const dateAnchor = getDailyDateAnchor();
      activePrompt = activePrompt ? (dateAnchor + '\n\n' + activePrompt) : dateAnchor;
    }

    const isToolsEnabled = options.enableTools !== undefined
      ? Boolean(options.enableTools)
      : (appConfig.enableAgentJs !== false || appConfig.enableAgentWeb !== false || appConfig.enableAgentSearch !== false || appConfig.enableAgentChart !== false);

    // Consultar dinámicamente si el proveedor y modelo soportan Function Calling nativo en JSON
    let isNativeToolsSupported = true;
    if (API.getProviderCapabilities) {
      const caps = API.getProviderCapabilities(appConfig.apiUrl, appConfig.apiType, appConfig.model);
      isNativeToolsSupported = caps ? (caps.tools !== false) : true;
    }

    // Instrucción de flujo para herramientas
    let toolsGuide = '';
    if (isToolsEnabled) {
      if (!isNativeToolsSupported || options.forceSystemPromptGuide) {
        toolsGuide = getToolsSystemPromptGuide();
      } else {
        const lang = appConfig.language || 'es';
        toolsGuide = (lang === 'en')
          ? `*Workflow instruction:* Once you receive tool results in the conversation, synthesize the findings and write a comprehensive, well-structured final answer to the user, citing sources. Do not stop without providing a complete summary.`
          : `*Instrucción de flujo:* Una vez recibidos los resultados de las herramientas en la conversación, sintetiza los hallazgos y redacta una respuesta final completa, bien estructurada y detallada para el usuario, citando las fuentes consultadas. No finalices la respuesta sin proporcionar el resumen completo.`;
      }
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

    // Inyectar marca temporal exacta en el último mensaje de usuario (fuera del prefijo de caché histórica)
    if (appConfig.sendDateTime !== false && messages.length > 0) {
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
      if (lastUserMsg) {
        const lang = appConfig.language || 'es';
        const nowTimeStr = new Date().toLocaleTimeString(lang === 'en' ? 'en-US' : 'es-ES', { hour: '2-digit', minute: '2-digit' });
        if (typeof lastUserMsg.content === 'string' && !lastUserMsg.content.includes('[Context Time:')) {
          lastUserMsg.content += `\n\n[Context Time: ${nowTimeStr}]`;
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
    if (ContextManager.buildOptimizedContext) {
      const optimization = ContextManager.buildOptimizedContext(messages, {
        model: appConfig.model,
        providerType: appConfig.apiType,
        ...options
      });
      const diag = optimization.diagnostics;
      if (diag && (diag.excludedCount > 0 || diag.prunedToolsCount > 0) && typeof addDebugLog === 'function') {
        addDebugLog('stats', `[ContextManager]: ${diag.totalTokens} tokens estimados | Presupuesto: ${diag.budget} | ${diag.includedCount} incluidos, ${diag.excludedCount} excluidos, ${diag.prunedToolsCount} tools podadas.`);
      }
      return optimization.messages;
    }

    return messages;
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    const effective = (theme === 'dark') ? 'dark' : 'light';
    appConfig.theme = effective;

    if (effective === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
    }

    if (elements.themeButtons && elements.themeButtons.length > 0) {
      elements.themeButtons.forEach(btn => {
        if (btn.getAttribute('data-theme') === effective) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }
  }

  function applyLanguage(lang) {
    const target = (lang === 'en') ? 'en' : 'es';
    appConfig.language = target;

    if (I18n.setLanguage) {
      I18n.setLanguage(target, true);
    }
    if (Storage.saveConfig) {
      Storage.saveConfig({ language: target });
    }

    // Actualizar indicador en toolbar
    if (elements.currentLangLabel) {
      elements.currentLangLabel.textContent = target.toUpperCase();
    }

    // Actualizar botones de idioma en el modal
    if (elements.langButtons && elements.langButtons.length > 0) {
      elements.langButtons.forEach(btn => {
        if (btn.getAttribute('data-lang') === target) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    // Actualizar data-prompt en tarjetas de sugerencia
    if (elements.sugCardExplain) elements.sugCardExplain.setAttribute('data-prompt', t('sug_explain_prompt'));
    if (elements.sugCardCode) elements.sugCardCode.setAttribute('data-prompt', t('sug_code_prompt'));
    if (elements.sugCardIdeas) elements.sugCardIdeas.setAttribute('data-prompt', t('sug_ideas_prompt'));

    // Actualizar modelo y servidor en badges
    if (elements.currentModelName) {
      elements.currentModelName.textContent = appConfig.model ? appConfig.model : t('no_model');
    }

    // Actualizar UI de razonamiento
    updateReasoningUI(appConfig.reasoningEffort);

    // Actualizar placeholder de prompt del sistema si está vacío
    if (elements.settingSystemPrompt) {
      elements.settingSystemPrompt.setAttribute('placeholder', t('field_system_prompt_placeholder'));
    }
  }

  function isDateTimeInitialTurn(m) {
    if (!m || m.role !== 'user') return false;
    const content = typeof m.content === 'string' ? m.content : (m.content?.[0]?.text || '');
    return content.startsWith('La fecha y hora actual es:') ||
           content.startsWith('Fecha y hora actual:') ||
           content.startsWith('The current date and time is:') ||
           content.startsWith('Current date and time:');
  }

  function createInitialChatHistory() {
    return [
      { id: 'system_root', role: 'system', content: appConfig.systemPrompt || '' }
    ];
  }

  function resetConversation() {
    if (isGenerating && currentAbortController) {
      currentAbortController.abort();
    }

    // Limpiar sesión vacía previa y generar nuevo ID de sesión limpia
    if (Array.isArray(savedSessions)) {
      savedSessions = savedSessions.filter(s => s.id !== currentSessionId);
    }
    if (Storage.deleteConversation) {
      Storage.deleteConversation(currentSessionId);
    }
    currentSessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    chatHistory = createInitialChatHistory();
    renderSessionMessages(chatHistory);
    renderSidebarChats();

    clearAttachedFiles();
    if (elements.userInput) {
      elements.userInput.value = '';
      autoResizeTextarea();
      elements.userInput.focus();
    }
  }

  // ==========================================================================
  // Modelos y Consulta al Servidor (API Query & Combobox)
  // ==========================================================================

  let discoveredModels = [];

  function loadCachedModels() {
    try {
      const cached = Storage.getStorageItem ? Storage.getStorageItem('cached_models') : null;
      if (cached) {
        discoveredModels = JSON.parse(cached);
        if (Array.isArray(discoveredModels) && discoveredModels.length > 0) {
          populateModelList(discoveredModels, false);
        }
      }
    } catch (e) {
      console.warn('No se pudieron cargar modelos de caché:', e);
    }
  }

  function saveCachedModels(models) {
    discoveredModels = models || [];
    try {
      if (Storage.setStorageItem) {
        Storage.setStorageItem('cached_models', JSON.stringify(discoveredModels));
      }
    } catch (e) {}
  }

  function populateModelList(models, selectFirstIfEmpty = false) {
    if (!models || !Array.isArray(models) || models.length === 0) return;

    if (elements.modelDatalist) {
      elements.modelDatalist.innerHTML = '';
      models.forEach(m => {
        const id = (typeof m === 'string' ? m : (m.id || m.name || '')).trim();
        if (id) {
          const opt = document.createElement('option');
          opt.value = id;
          elements.modelDatalist.appendChild(opt);
        }
      });
    }

    if (elements.modelSelectHelper) {
      elements.modelSelectHelper.innerHTML = '';
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.disabled = true;
      defaultOpt.selected = true;
      defaultOpt.textContent = t('model_select_count', { count: models.length });
      elements.modelSelectHelper.appendChild(defaultOpt);

      const currentVal = elements.settingModel ? elements.settingModel.value.trim() : (appConfig.model || '');

      models.forEach(m => {
        const id = (typeof m === 'string' ? m : (m.id || m.name || '')).trim();
        if (id) {
          const opt = document.createElement('option');
          opt.value = id;
          opt.textContent = id;
          if (currentVal && currentVal === id) {
            opt.selected = true;
            defaultOpt.selected = false;
          }
          elements.modelSelectHelper.appendChild(opt);
        }
      });
    }

    if (selectFirstIfEmpty && elements.settingModel) {
      const currentVal = elements.settingModel.value.trim();
      const firstId = (typeof models[0] === 'string' ? models[0] : (models[0].id || models[0].name || '')).trim();
      if (!currentVal && firstId) {
        elements.settingModel.value = firstId;
        if (elements.modelSelectHelper) elements.modelSelectHelper.value = firstId;
      }
    }
  }

  async function handleQueryServer() {
    if (!elements.btnQueryServer) return;

    const apiUrl = (elements.settingApiUrl ? elements.settingApiUrl.value : appConfig.apiUrl || '').trim();
    const apiKey = (elements.settingApiKey ? elements.settingApiKey.value : appConfig.apiKey || '').trim();
    const apiType = (elements.settingApiType ? elements.settingApiType.value : appConfig.apiType || 'openai').trim();

    if (!apiUrl) {
      if (elements.serverQueryStatus) {
        elements.serverQueryStatus.style.display = 'block';
        elements.serverQueryStatus.className = 'server-query-status status-error';
        elements.serverQueryStatus.textContent = t('err_invalid_url');
      }
      return;
    }

    elements.btnQueryServer.disabled = true;
    elements.btnQueryServer.classList.add('loading');
    const queryText = elements.btnQueryServer.querySelector('.query-btn-text');
    if (queryText) queryText.textContent = t('btn_querying_text');

    if (elements.serverQueryStatus) {
      elements.serverQueryStatus.style.display = 'block';
      elements.serverQueryStatus.className = 'server-query-status status-loading';
      elements.serverQueryStatus.textContent = t('err_connecting_models', { url: apiUrl });
    }

    try {
      if (!API.fetchServerModels) {
        throw new Error('API query function not available.');
      }

      addDebugLog('network', `Consultando modelos en ${apiUrl} [${apiType}]`);
      addDebugLog('raw', `>>> OUTGOING GET/POST ${apiUrl} (fetchServerModels)`);
      const res = await API.fetchServerModels(apiUrl, apiKey, apiType);
      addDebugLog('raw', `<<< INCOMING (fetchServerModels):\n${JSON.stringify(res, null, 2)}`);

      if (res.success && res.models && res.models.length > 0) {
        saveCachedModels(res.models);
        populateModelList(res.models, true);

        if (elements.serverQueryStatus) {
          elements.serverQueryStatus.className = 'server-query-status status-success';
          elements.serverQueryStatus.innerHTML = t('msg_models_success', { count: res.count, endpoint: res.endpoint });
        }
      } else {
        throw new Error(res.error || 'Server did not return a valid models list.');
      }
    } catch (err) {
      console.error('Error querying server models:', err);
      if (elements.serverQueryStatus) {
        const esc = Markdown.escapeHtml || function(s) { return s; };
        elements.serverQueryStatus.className = 'server-query-status status-error';
        elements.serverQueryStatus.innerHTML = t('err_api_connect', { err: esc(err.message || String(err)) });
      }
    } finally {
      elements.btnQueryServer.disabled = false;
      elements.btnQueryServer.classList.remove('loading');
      if (queryText) queryText.textContent = t('btn_query_text');
    }
  }

  // ==========================================================================
  // Provider Inspector (Diagnóstico de Capacidades)
  // ==========================================================================

  async function handleRunInspector() {
    if (!elements.btnRunInspector || !elements.inspectorResults) return;

    const apiUrl = elements.settingApiUrl ? elements.settingApiUrl.value.trim() : appConfig.apiUrl;
    const apiType = elements.settingApiType ? elements.settingApiType.value : appConfig.apiType;
    const apiKey = elements.settingApiKey ? elements.settingApiKey.value.trim() : appConfig.apiKey;
    const model = elements.settingModel ? elements.settingModel.value.trim() : appConfig.model;

    if (!apiUrl) {
      alert(t('err_api_connect', { err: 'Por favor, introduce una URL de servidor válida.' }));
      return;
    }

    elements.btnRunInspector.disabled = true;
    const btnText = elements.btnRunInspector.querySelector('.inspector-btn-text');
    const originalText = btnText ? btnText.textContent : '';
    if (btnText) btnText.textContent = t('btn_running_inspector');

    elements.inspectorResults.style.display = 'block';
    elements.inspectorResults.innerHTML = `
      <div style="padding: 1.5rem; text-align: center; color: var(--text-muted);">
        <span class="query-icon" style="display:inline-block; font-size: 1.5rem; animation: spin 1s linear infinite;">⏳</span>
        <p style="margin-top: 0.5rem; font-size: 0.85rem;">${t('btn_running_inspector')}</p>
      </div>
    `;

    try {
      if (!API.inspectProvider) {
        throw new Error('Módulo de inspección no disponible.');
      }

      addDebugLog('network', `Ejecutando Provider Inspector en ${apiUrl} [${apiType}]`);
      const report = await API.inspectProvider({ apiUrl, apiType, apiKey, model });

      renderInspectorReport(report);
    } catch (err) {
      console.error('Error in Provider Inspector:', err);
      elements.inspectorResults.innerHTML = `
        <div class="server-query-status status-error" style="display: block;">
          ${Markdown.escapeHtml ? Markdown.escapeHtml(err.message || String(err)) : String(err)}
        </div>
      `;
    } finally {
      elements.btnRunInspector.disabled = false;
      if (btnText) btnText.textContent = originalText;
    }
  }

  function renderInspectorReport(report) {
    if (!elements.inspectorResults || !report) return;

    const esc = (Markdown && Markdown.escapeHtml) ? Markdown.escapeHtml : function(s) { return String(s || '').replace(/[&<>"']/g, ''); };
    const p = report.provider || {};
    const ep = report.endpoint || {};
    const m = report.model || {};
    const caps = report.capabilities || {};

    function getBadgeClass(status) {
      switch (status) {
        case 'confirmed': return 'cap-badge cap-badge-confirmed';
        case 'inferred': return 'cap-badge cap-badge-inferred';
        case 'declared': return 'cap-badge cap-badge-declared';
        case 'unsupported': return 'cap-badge cap-badge-unsupported';
        default: return 'cap-badge cap-badge-unknown';
      }
    }

    function getBadgeIcon(status) {
      switch (status) {
        case 'confirmed': return '✓';
        case 'inferred': return '✦';
        case 'declared': return 'ℹ';
        case 'unsupported': return '✕';
        default: return '?';
      }
    }

    function getStatusLabel(status) {
      switch (status) {
        case 'confirmed': return t('inspector_status_confirmed');
        case 'inferred': return t('inspector_status_inferred');
        case 'declared': return t('inspector_status_declared');
        case 'unsupported': return t('inspector_status_unsupported');
        default: return t('inspector_status_unknown');
      }
    }

    const capKeys = [
      { key: 'streaming', title: t('inspector_cap_streaming'), icon: '📡' },
      { key: 'tools', title: t('inspector_cap_tools'), icon: '⚙️' },
      { key: 'vision', title: t('inspector_cap_vision'), icon: '👁️' },
      { key: 'reasoning', title: t('inspector_cap_reasoning'), icon: '🧠' },
      { key: 'jsonMode', title: t('inspector_cap_jsonMode'), icon: '📋' },
      { key: 'promptCaching', title: t('inspector_cap_promptCaching'), icon: '💾' },
      { key: 'embeddings', title: t('inspector_cap_embeddings'), icon: '🔢' },
      { key: 'modelListing', title: t('inspector_cap_modelListing'), icon: '🤖' }
    ];

    let cardsHtml = '';
    capKeys.forEach(item => {
      const c = caps[item.key] || { status: 'unknown', detail: '' };
      const badgeCls = getBadgeClass(c.status);
      const badgeIcon = getBadgeIcon(c.status);
      const statusLabel = getStatusLabel(c.status);

      cardsHtml += `
        <div class="inspector-cap-card">
          <div class="cap-card-header">
            <span class="cap-card-title">${item.icon} ${item.title}</span>
            <span class="${badgeCls}">${badgeIcon} ${statusLabel}</span>
          </div>
          <div class="cap-card-detail">${esc(c.detail || '')}</div>
        </div>
      `;
    });

    const modelInfoText = m.totalDiscovered > 0
      ? `${m.totalDiscovered} modelo(s) descubierto(s)`
      : (m.selected ? `Modelo: ${esc(m.selected)}` : 'Sin modelos listados');

    elements.inspectorResults.innerHTML = `
      <div class="inspector-header-meta">
        <div class="inspector-meta-item">
          <span class="meta-label">Proveedor</span>
          <span class="meta-value">${esc(p.label || p.id || 'Desconocido')}</span>
        </div>
        <div class="inspector-meta-item">
          <span class="meta-label">Endpoint Chat</span>
          <span class="meta-value" style="font-family: monospace; font-size: 0.775rem;">${esc(ep.normalized || ep.raw || '')}</span>
        </div>
        <div class="inspector-meta-item">
          <span class="meta-label">Modelos</span>
          <span class="meta-value">${esc(modelInfoText)}</span>
        </div>
        <div class="inspector-meta-item">
          <span class="meta-label">Latencia Diagnóstico</span>
          <span class="meta-value">${report.inspectionTimeMs || 0} ms</span>
        </div>
      </div>

      <div class="inspector-cap-grid">
        ${cardsHtml}
      </div>
    `;
  }

  // ==========================================================================
  // Control Dinámico de Nivel de Razonamiento (Thinking / CoT)
  // ==========================================================================

  function getReasoningLevelLabel(lvl) {
    const lower = String(lvl).toLowerCase().trim();
    switch (lower) {
      case 'off':
      case 'none':
        return { icon: '⚪', label: t('reasoning_level_none'), desc: t('reasoning_desc_none') };
      case 'on':
        return { icon: '🧠', label: t('reasoning_level_on'), desc: t('reasoning_desc_on') };
      case 'minimal':
        return { icon: '🟢', label: t('reasoning_level_minimal'), desc: t('reasoning_desc_minimal') };
      case 'low':
        return { icon: '🟢', label: t('reasoning_level_low'), desc: t('reasoning_desc_low') };
      case 'medium':
        return { icon: '🟡', label: t('reasoning_level_medium'), desc: t('reasoning_desc_medium') };
      case 'high':
        return { icon: '🔴', label: t('reasoning_level_high'), desc: t('reasoning_desc_high') };
      case 'xhigh':
        return { icon: '🔥', label: t('reasoning_level_xhigh'), desc: t('reasoning_desc_xhigh') };
      default:
        return { icon: '⚙️', label: lvl.charAt(0).toUpperCase() + lvl.slice(1), desc: '' };
    }
  }

  function renderReasoningMenuOptions(reasoningInfo, activeLevel) {
    if (!elements.reasoningOptionsContainer) return;

    elements.reasoningOptionsContainer.innerHTML = '';
    const levels = (reasoningInfo && Array.isArray(reasoningInfo.levels)) ? reasoningInfo.levels : ['off', 'low', 'medium', 'high'];

    levels.forEach(lvl => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'reasoning-option';
      btn.setAttribute('data-level', lvl);

      const info = getReasoningLevelLabel(lvl);
      const lower = String(lvl).toLowerCase().trim();
      const activeLower = String(activeLevel || 'off').toLowerCase().trim();

      if (lower === activeLower || (activeLower === 'off' && lower === 'none') || (activeLower === 'none' && lower === 'off')) {
        btn.classList.add('active');
      }

      btn.innerHTML = `
        <span class="option-icon">${info.icon}</span>
        <div class="option-text">
          <strong>${info.label}</strong>
          ${info.desc ? `<small>${info.desc}</small>` : ''}
        </div>
      `;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectReasoningLevel(lvl);
      });

      elements.reasoningOptionsContainer.appendChild(btn);
    });
  }

  function positionReasoningMenu() {
    if (!elements.reasoningMenu || !elements.btnReasoning) return;
    if (elements.reasoningMenu.style.display === 'none') return;

    const btnRect = elements.btnReasoning.getBoundingClientRect();
    const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const viewportWidth = window.innerWidth;

    const spaceAbove = btnRect.top;
    const menuWidth = Math.min(290, viewportWidth - 16);

    let leftPos = btnRect.left;
    if (leftPos + menuWidth > viewportWidth - 8) {
      leftPos = viewportWidth - menuWidth - 8;
    }
    if (leftPos < 8) {
      leftPos = 8;
    }

    elements.reasoningMenu.style.position = 'fixed';
    elements.reasoningMenu.style.left = `${Math.round(leftPos)}px`;
    elements.reasoningMenu.style.width = `${Math.round(menuWidth)}px`;

    // Posicionamiento estricto por encima del botón
    const bottomPos = Math.max(8, viewportHeight - btnRect.top + 8);
    const maxHeight = Math.max(140, Math.min(380, spaceAbove - 16));

    elements.reasoningMenu.style.bottom = `${Math.round(bottomPos)}px`;
    elements.reasoningMenu.style.top = 'auto';
    elements.reasoningMenu.style.maxHeight = `${Math.round(maxHeight)}px`;
  }

  function toggleReasoningMenu() {
    if (!elements.reasoningMenu) return;
    const isVisible = elements.reasoningMenu.style.display === 'flex' || elements.reasoningMenu.style.display === 'block';
    if (isVisible) {
      closeReasoningMenu();
    } else {
      openReasoningMenu();
    }
  }

  function openReasoningMenu() {
    if (!elements.reasoningMenu) return;
    elements.reasoningMenu.style.display = 'flex';

    const apiType = appConfig.apiType || (elements.settingApiType ? elements.settingApiType.value : 'openai');
    const reasoningConfig = API.getStandardReasoningOptions
      ? API.getStandardReasoningOptions(apiType, appConfig.apiUrl)
      : { levels: ['off', 'low', 'medium', 'high'], label: 'OpenAI / LM Studio' };

    if (elements.reasoningModelBadge) {
      elements.reasoningModelBadge.textContent = reasoningConfig.label || apiType.toUpperCase();
      elements.reasoningModelBadge.title = `Protocol: ${reasoningConfig.label || apiType}`;
    }

    renderReasoningMenuOptions(reasoningConfig, appConfig.reasoningEffort || 'off');
    positionReasoningMenu();
  }

  function selectReasoningLevel(level) {
    let norm = String(level).trim();
    if (norm.toLowerCase() === 'off') norm = 'none';
    appConfig.reasoningEffort = norm;
    if (Storage.saveConfig) {
      Storage.saveConfig({ reasoningEffort: norm });
    }
    updateReasoningUI(norm);
    closeReasoningMenu();
  }

  function updateReasoningUI(level) {
    const val = level || appConfig.reasoningEffort || 'none';
    const lower = String(val).toLowerCase().trim();

    if (elements.reasoningLabel) {
      if (lower === 'off' || lower === 'none') {
        elements.reasoningLabel.textContent = 'None';
        elements.btnReasoning.classList.remove('active', 'active-on', 'active-low', 'active-medium', 'active-high', 'active-xhigh', 'level-low', 'level-medium', 'level-high', 'level-xhigh');
      } else {
        let displayTxt = lower.charAt(0).toUpperCase() + lower.slice(1);
        if (lower === 'low') displayTxt = 'Low';
        else if (lower === 'medium') displayTxt = 'Med';
        else if (lower === 'high') displayTxt = 'High';
        else if (lower === 'xhigh') displayTxt = 'XHigh';
        else if (lower === 'on') displayTxt = 'On';

        elements.reasoningLabel.textContent = displayTxt;
        elements.btnReasoning.classList.add('active');
        elements.btnReasoning.classList.remove('active-on', 'active-low', 'active-medium', 'active-high', 'active-xhigh', 'level-low', 'level-medium', 'level-high', 'level-xhigh');
        if (['low', 'medium', 'high', 'xhigh', 'on'].includes(lower)) {
          elements.btnReasoning.classList.add(`active-${lower}`);
        }
      }
    }

    if (elements.reasoningOptionsContainer) {
      const options = elements.reasoningOptionsContainer.querySelectorAll('.reasoning-option');
      options.forEach(opt => {
        const optLower = String(opt.getAttribute('data-level') || '').toLowerCase().trim();
        if (optLower === lower || (lower === 'off' && optLower === 'none') || (lower === 'none' && optLower === 'off')) {
          opt.classList.add('active');
        } else {
          opt.classList.remove('active');
        }
      });
    }
  }

  function closeReasoningMenu() {
    if (elements.reasoningMenu) {
      elements.reasoningMenu.style.display = 'none';
      elements.reasoningMenu.style.left = '0px';
      elements.reasoningMenu.style.right = 'auto';
    }
  }

  // ==========================================================================
  // ==========================================================================
  // Panel Lateral de Razonamiento, Streaming & Logs (Debug)
  // ==========================================================================

  function toggleDebugPanel(forceOpen) {
    if (Debug.togglePanel) Debug.togglePanel(forceOpen);
  }

  function setDebugStatus(status, text) {
    if (Debug.setStatus) Debug.setStatus(status, text);
  }

  function getFormattedTime() {
    return Debug.getFormattedTime ? Debug.getFormattedTime() : new Date().toTimeString().split(' ')[0];
  }

  function clearDebugLogs() {
    if (Debug.clearLogs) Debug.clearLogs();
  }

  async function copyDebugLogs() {
    if (Debug.copyLogs) await Debug.copyLogs();
  }

  function addDebugLog(type, text, rawData) {
    if (Debug.addLog) Debug.addLog(type, text, rawData);
  }

  function filterDebugLogs(tabId) {
    if (Debug.filterLogs) Debug.filterLogs(tabId);
  }

  function syncDebugMessagesState(enabled, persist = true) {
    appConfig.enableDebugMessages = Boolean(enabled);
    if (elements.chkEnableDebugMessages) {
      elements.chkEnableDebugMessages.checked = appConfig.enableDebugMessages;
    }
    if (elements.debugMessagesStatusBadge) {
      elements.debugMessagesStatusBadge.textContent = appConfig.enableDebugMessages ? 'ON' : 'OFF';
      elements.debugMessagesStatusBadge.className = 'debug-status-pill ' + (appConfig.enableDebugMessages ? 'on' : 'off');
    }
    if (persist && Storage.saveConfig) {
      Storage.saveConfig(appConfig);
    }
  }

  function openDebugInterceptorModal({ endpoint, headers, payload }) {
    if (Debug.openInterceptorModal) {
      return Debug.openInterceptorModal({
        endpoint,
        headers,
        payload,
        onSyncDebugState: (enabled) => syncDebugMessagesState(enabled)
      });
    }
    return Promise.resolve({ cancel: false, modifiedPayload: null });
  }

  function updateUIFromConfig() {
    if (elements.currentServerUrl) {
      elements.currentServerUrl.textContent = appConfig.apiUrl || 'http://localhost:1234/v1';
    }
    if (elements.currentModelName) {
      elements.currentModelName.textContent = appConfig.model ? appConfig.model : t('no_model');
    }
    if (elements.settingApiType) {
      elements.settingApiType.value = appConfig.apiType || 'openai';
    }
    if (elements.settingApiUrl) {
      elements.settingApiUrl.value = appConfig.apiUrl || 'http://localhost:1234/v1';
    }
    if (elements.settingApiKey) {
      elements.settingApiKey.value = appConfig.apiKey || '';
    }
    if (elements.settingModel) {
      elements.settingModel.value = appConfig.model || '';
    }
    if (elements.modelSelectHelper && appConfig.model) {
      elements.modelSelectHelper.value = appConfig.model;
    }
    updateReasoningUI(appConfig.reasoningEffort || 'none');
    applyTheme(appConfig.theme || 'light');
    applyLanguage(appConfig.language || 'es');

    const isRawEnabled = appConfig.enableRawLogs === true;
    if (elements.chkEnableRaw) {
      elements.chkEnableRaw.checked = isRawEnabled;
    }
    if (elements.rawStatusBadge) {
      elements.rawStatusBadge.className = isRawEnabled ? 'raw-status-badge active' : 'raw-status-badge';
      elements.rawStatusBadge.textContent = isRawEnabled ? t('raw_status_active') : t('raw_status_inactive');
    }
    if (elements.settingEnableRawLogs) {
      elements.settingEnableRawLogs.checked = isRawEnabled;
    }

    syncDebugMessagesState(appConfig.enableDebugMessages, false);
  }

  function autoResizeTextarea() {
    if (!elements.userInput) return;
    elements.userInput.style.height = 'auto';
    const newHeight = Math.min(elements.userInput.scrollHeight, 160);
    elements.userInput.style.height = `${newHeight}px`;
  }

  function scrollToBottom() {
    if (elements.messagesList) {
      elements.messagesList.scrollTop = elements.messagesList.scrollHeight;
    }
  }

  // ==========================================================================
  // Gestión de Archivos Adjuntos
  // ==========================================================================

  function renderAttachedFiles() {
    if (Attachments.renderChips) {
      Attachments.renderChips(elements.attachmentsContainer, () => autoResizeTextarea());
    }
  }

  function removeAttachedFile(index) {
    if (Attachments.removeFileAt) {
      Attachments.removeFileAt(index);
      renderAttachedFiles();
    }
  }

  function clearAttachedFiles() {
    if (Attachments.clearFiles) {
      Attachments.clearFiles();
      renderAttachedFiles();
    }
    if (elements.fileInput) elements.fileInput.value = '';
  }

  async function processFiles(files) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        let parsed;
        if (FileParser.parseFile) {
          parsed = await FileParser.parseFile(file);
        } else {
          const text = await readFileAsText(file);
          parsed = {
            name: file.name,
            size: file.size,
            type: 'text',
            content: text
          };
        }
        if (Attachments.addFile) Attachments.addFile(parsed);
      } catch (err) {
        console.error(`Error processing file ${file.name}:`, err);
        alert(t('err_file_process', { name: file.name, err: err.message || err }));
      }
    }
    renderAttachedFiles();
    if (elements.userInput) elements.userInput.focus();
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  // ==========================================================================
  // Renderizado de Mensajes con Acciones y Estadísticas
  // ==========================================================================

  function removeMessage(wrapper) {
    if (!wrapper) return;
    const msgId = wrapper.getAttribute('data-msg-id');
    wrapper.remove();

    if (msgId) {
      const initialCount = chatHistory.length;
      chatHistory = chatHistory.filter(m => m.id !== msgId);
      const removedCount = initialCount - chatHistory.length;
      if (removedCount > 0 && typeof addDebugLog === 'function') {
        addDebugLog('system', t('msg_deleted_log', { id: msgId, count: removedCount }));
      }
    }

    // Invalidar y anular la caché de contexto del servidor tras la eliminación de mensajes
    sessionCacheInvalidated = true;
    sessionCacheRevision = Date.now();
    if (typeof addDebugLog === 'function') {
      addDebugLog('system', t('cache_invalidated_log'));
    }

    const remainingMessages = elements.messagesList.querySelectorAll('.message-wrapper');
    if (remainingMessages.length === 0 && elements.welcomeBanner) {
      elements.messagesList.appendChild(elements.welcomeBanner);
      elements.welcomeBanner.style.display = 'block';
    }

    // Persistir eliminación en el almacenamiento de la sesión
    saveCurrentSession();
  }

  function appendUserMessage(text, originalPrompt, attachedImages, existingMsgId) {
    if (elements.welcomeBanner && elements.welcomeBanner.parentNode) {
      elements.welcomeBanner.style.display = 'none';
    }

    const msgId = existingMsgId || ('msg_usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 7));

    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper user';
    wrapper.setAttribute('data-msg-id', msgId);

    const row = document.createElement('div');
    row.className = 'message-row user';

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'message-content-wrapper';

    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = text;

    // Miniaturas visuales de imágenes adjuntas
    if (attachedImages && attachedImages.length > 0) {
      const imagesGrid = document.createElement('div');
      imagesGrid.className = 'message-images-grid';
      attachedImages.forEach(img => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'message-image-item';
        itemDiv.innerHTML = `
          <img src="${img.dataUrl}" alt="${Markdown.escapeHtml(img.name)}" class="message-image-thumb" title="${Markdown.escapeHtml(img.name)}">
          <div class="message-image-caption">${Markdown.escapeHtml(img.name)}</div>
        `;
        const imgEl = itemDiv.querySelector('img');
        if (imgEl) {
          imgEl.addEventListener('click', () => {
            window.open(img.dataUrl, '_blank');
          });
        }
        imagesGrid.appendChild(itemDiv);
      });
      content.appendChild(imagesGrid);
    }

    const footerRow = document.createElement('div');
    footerRow.className = 'message-footer-row';

    const actions = document.createElement('div');
    actions.className = 'message-actions';

    const btnReuse = document.createElement('button');
    btnReuse.type = 'button';
    btnReuse.className = 'btn-msg-action';
    btnReuse.innerHTML = `✏️ <span>${t('btn_reuse')}</span>`;
    btnReuse.title = t('btn_reuse_title');
    btnReuse.addEventListener('click', () => {
      elements.userInput.value = originalPrompt || text;
      autoResizeTextarea();
      elements.userInput.focus();
    });

    const btnDelete = document.createElement('button');
    btnDelete.type = 'button';
    btnDelete.className = 'btn-msg-action btn-delete';
    btnDelete.innerHTML = `🗑️ <span>${t('btn_delete')}</span>`;
    btnDelete.title = t('btn_delete_usr_title');
    btnDelete.addEventListener('click', () => removeMessage(wrapper));

    actions.appendChild(btnReuse);
    actions.appendChild(btnDelete);
    footerRow.appendChild(actions);

    contentWrapper.appendChild(content);
    contentWrapper.appendChild(footerRow);

    row.appendChild(contentWrapper);
    wrapper.appendChild(row);

    elements.messagesList.appendChild(wrapper);
    scrollToBottom();

    return msgId;
  }

  function createAssistantMessagePlaceholder(existingMsgId) {
    const msgId = existingMsgId || ('msg_ast_' + Date.now() + '_' + Math.random().toString(36).substr(2, 7));

    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper assistant';
    wrapper.setAttribute('data-msg-id', msgId);

    const row = document.createElement('div');
    row.className = 'message-row assistant';

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'message-content-wrapper';

    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = '<span class="streaming-cursor initial-cursor"></span>';

    const footerRow = document.createElement('div');
    footerRow.className = 'message-footer-row';

    const statsContainer = document.createElement('div');
    statsContainer.className = 'message-stats';
    statsContainer.style.display = 'none';

    const actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.style.display = 'none';

    const btnCopy = document.createElement('button');
    btnCopy.type = 'button';
    btnCopy.className = 'btn-msg-action btn-copy-full';
    btnCopy.innerHTML = `📋 <span>${t('btn_copy')}</span>`;
    btnCopy.title = t('btn_copy_title');

    const btnDelete = document.createElement('button');
    btnDelete.type = 'button';
    btnDelete.className = 'btn-msg-action btn-delete';
    btnDelete.innerHTML = `🗑️ <span>${t('btn_delete')}</span>`;
    btnDelete.title = t('btn_delete_ast_title');
    btnDelete.addEventListener('click', () => removeMessage(wrapper));

    actions.appendChild(btnCopy);
    actions.appendChild(btnDelete);

    footerRow.appendChild(statsContainer);
    footerRow.appendChild(actions);

    contentWrapper.appendChild(content);
    contentWrapper.appendChild(footerRow);

    row.appendChild(contentWrapper);
    wrapper.appendChild(row);

    elements.messagesList.appendChild(wrapper);
    scrollToBottom();

    return { wrapper, row, content, footerRow, actions, btnCopy, statsContainer, msgId };
  }

  // ==========================================================================
  // Envío de Mensaje y Streaming
  // ==========================================================================

  async function handleSendMessage() {
    const rawText = elements.userInput.value.trim();
    const currentFiles = Attachments.getFiles ? Attachments.getFiles() : [];
    if ((!rawText && currentFiles.length === 0) || isGenerating) return;

    const { fullPrompt, displayText, imageAttachments } = Attachments.buildAttachmentsPayload
      ? Attachments.buildAttachmentsPayload(rawText, currentFiles)
      : { fullPrompt: rawText, displayText: rawText, imageAttachments: [] };

    const userMsgId = appendUserMessage(displayText, rawText, imageAttachments);
    const historyEntry = { id: userMsgId, role: 'user', content: fullPrompt };
    if (imageAttachments.length > 0) {
      historyEntry.images = imageAttachments;
    }
    chatHistory.push(historyEntry);

    elements.userInput.value = '';
    clearAttachedFiles();
    autoResizeTextarea();
    closeReasoningMenu();

    if (State.set) {
      State.set('streaming', { isGenerating: true, status: 'streaming', error: null });
    } else {
      isGenerating = true;
      elements.btnSend.disabled = true;
      elements.btnStopStream.style.display = 'inline-flex';
    }

    currentAbortController = new AbortController();
    const { wrapper, row, content, actions, btnCopy, statsContainer, msgId: assistantMsgId } = createAssistantMessagePlaceholder();

    let accumulatedText = '';
    let accumulatedConversationMarkdown = '';
    let turnIndex = 0;
    const toolCallSignatures = [];
    const parseMd = Markdown.parseMarkdown || function(txt) { return txt; };
    const attachListeners = Markdown.attachCopyCodeListeners || function() {};

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

    if (!API.streamChatCompletion) {
      row.classList.add('message-error');
      content.innerHTML = 'Error: Chat API module not loaded.';
      finishGeneration();
      return;
    }

    if (!appConfig.model || appConfig.model.trim() === '') {
      row.classList.add('message-error');
      content.innerHTML = `
        <div style="display:flex; align-items:flex-start; gap:0.5rem;">
          <span>⚠️</span>
          <div>
            <strong>${t('err_no_model_title')}</strong>
            <p style="margin-top: 0.25rem;">${t('err_no_model_desc', { url: appConfig.apiUrl })}</p>
          </div>
        </div>
      `;
      actions.style.display = 'inline-flex';
      finishGeneration();
      return;
    }

    function updateStatsDisplay(stats) {
      if (!stats) return;
      statsContainer.style.display = 'inline-flex';
      const cacheHtml = (stats.cachedTokens && stats.cachedTokens > 0)
        ? `<span>•</span><span class="stat-item stat-item-cache" title="${t('stat_cache_title')}">${t('stat_cache_tokens', { tokens: stats.cachedTokens })}</span>`
        : '';
      statsContainer.innerHTML = `
        <span class="stat-item" title="${t('stat_ttft_title')}">${t('stat_ttft', { sec: stats.ttftSec })}</span>
        <span>•</span>
        <span class="stat-item" title="${t('stat_speed_title')}">${t('stat_speed', { speed: stats.tokensPerSec })}</span>
        <span>•</span>
        <span class="stat-item" title="${t('stat_total_time_title')}">${t('stat_total_time', { sec: stats.totalSec })}</span>
        <span>•</span>
        <span class="stat-item" title="${t('stat_tokens_title')}">${t('stat_tokens', { tokens: stats.tokens })}</span>${cacheHtml}
      `;
    }

    const maxAgentTurns = 8;
    // Cargar contexto jerárquico de la rama RAG activa
    if (appConfig.activeRagBranchId && window.ChatTreeRagService) {
      try {
        currentRagSystemContext = await window.ChatTreeRagService.buildTreeRagSystemContext(appConfig.activeRagBranchId);
      } catch (err) {
        console.warn('Error al cargar contexto de RAG:', err);
        currentRagSystemContext = '';
      }
    } else {
      currentRagSystemContext = '';
    }

    while (turnIndex < maxAgentTurns) {
      if (currentAbortController && currentAbortController.signal.aborted) {
        break;
      }

      if (turnIndex === 0) {
        content.innerHTML = '';
      }

      let currentTurnText = '';
      const turnBlock = document.createElement('div');
      turnBlock.className = 'agentic-turn-block';
      content.appendChild(turnBlock);

      let turnToolCalls = null;
      let turnFinalStats = null;
      let streamError = null;

      const isFirstTurn = turnIndex === 0;
      const currentCacheInvalidated = isFirstTurn && sessionCacheInvalidated;

      const streamResult = await API.streamChatCompletion({
        apiUrl: appConfig.apiUrl,
        apiType: appConfig.apiType,
        apiKey: appConfig.apiKey,
        model: appConfig.model,
        messages: buildEffectiveMessages(),
        temperature: appConfig.temperature,
        reasoningEffort: appConfig.reasoningEffort || 'none',
        enableTools: (appConfig.enableAgentJs !== false || appConfig.enableAgentWeb !== false || appConfig.enableAgentSearch !== false || appConfig.enableAgentChart !== false),
        enableAgentJs: appConfig.enableAgentJs !== false,
        enableAgentWeb: appConfig.enableAgentWeb !== false,
        enableAgentSearch: appConfig.enableAgentSearch !== false,
        enableAgentChart: appConfig.enableAgentChart !== false,
        enableContextCache: appConfig.enableContextCache !== false,
        cacheInvalidated: currentCacheInvalidated,
        cacheRevision: sessionCacheRevision,
        signal: currentAbortController.signal,

        onBeforeRequest: appConfig.enableDebugMessages ? async function ({ endpoint, headers, payload }) {
          return await openDebugInterceptorModal({ endpoint, headers, payload });
        } : null,

        onReasoningChunk: function (chunk) {
          addDebugLog('thinking', chunk);
          setDebugStatus('streaming', t('debug_status_thinking'));
        },

        onLog: function (logData) {
          if (logData && logData.type !== 'thinking') {
            addDebugLog(logData.type, logData.text);
          }
        },

        onChunk: function (fullTextSoFar, delta, stats) {
          currentTurnText = fullTextSoFar;
          turnBlock.innerHTML = injectStreamingCursor(parseMd(currentTurnText));
          attachListeners(turnBlock);
          if (stats) updateStatsDisplay(stats);
          scrollToBottom();
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
        if (!currentTurnText && turnBlock.parentNode) {
          turnBlock.parentNode.removeChild(turnBlock);
        }
        if (wrapper && !wrapper.querySelector('.agentic-turn-block') && wrapper.parentNode) {
          wrapper.parentNode.removeChild(wrapper);
        }
        setDebugStatus('idle');
        finishGeneration();
        return;
      }

      if (sessionCacheInvalidated) {
        sessionCacheInvalidated = false;
      }

      if (streamError) {
        if (currentAbortController && currentAbortController.signal.aborted) {
          break;
        }
        setDebugStatus('error', t('debug_status_error'));
        addDebugLog('error', streamError.message || String(streamError));
        row.classList.add('message-error');
        turnBlock.innerHTML = `
          <div class="network-error-card">
            <span>⚠️</span>
            <div>
              <strong>${t('err_server_connect_title')}</strong>
              <p style="margin-top: 0.25rem;">
                ${Markdown.escapeHtml(streamError.message || String(streamError))}
              </p>
              <p style="margin-top: 0.25rem; font-size: 0.75rem; color: var(--text-muted);">
                ${t('err_server_connect_hint', { url: appConfig.apiUrl })}
              </p>
            </div>
          </div>
        `;
        actions.style.display = 'inline-flex';
        finishGeneration();
        return;
      }

      if (streamResult) {
        currentTurnText = streamResult.accumulatedText || currentTurnText;
        turnToolCalls = streamResult.toolCalls || turnToolCalls;
        turnFinalStats = streamResult.stats || turnFinalStats;
      }

      // Extraer tool calls de texto si no llegaron en estructura nativa
      if ((!turnToolCalls || turnToolCalls.length === 0) && currentTurnText) {
        if (API.extractToolCallsFromText) {
          const textCalls = API.extractToolCallsFromText(currentTurnText);
          if (textCalls && textCalls.length > 0) {
            turnToolCalls = textCalls;
          }
        }
      }

      // Si no hay herramientas para ejecutar, es la respuesta final o requiere síntesis
      if (!turnToolCalls || turnToolCalls.length === 0) {
        // Si el modelo devolvió un texto vacío tras haber ejecutado herramientas en turnos anteriores (común en Gemini cuando tool_choice es auto),
        // solicitar inmediatamente un turno de síntesis forzado con instrucción explícita y toolChoice: 'none' para que el modelo redacte el resumen.
        if ((!currentTurnText || currentTurnText.trim() === '') && turnIndex > 0 && chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'tool' && !(currentAbortController && currentAbortController.signal.aborted)) {
          addDebugLog('info', 'El modelo finalizó el turno de herramientas sin texto. Solicitando síntesis final obligatoria...');

          let synthText = '';
          let synthStats = null;

          const isEn = appConfig.language === 'en';
          const synthMessages = buildEffectiveMessages({ forceSystemPromptGuide: true });
          synthMessages.push({
            role: 'user',
            content: isEn
              ? 'Based on all the information gathered from the tools above, please write a comprehensive, detailed, and well-structured final answer to my initial question, organizing the findings clearly and citing sources.'
              : 'A partir de toda la información obtenida por las herramientas anteriores, redacta ahora una respuesta final completa, detallada y bien estructurada para mi consulta inicial, organizando los hallazgos con claridad y citando las fuentes consultadas.'
          });

          await API.streamChatCompletion({
            apiUrl: appConfig.apiUrl,
            apiType: appConfig.apiType,
            apiKey: appConfig.apiKey,
            model: appConfig.model,
            messages: synthMessages,
            temperature: appConfig.temperature,
            reasoningEffort: appConfig.reasoningEffort || 'none',
            enableTools: true,
            toolChoice: 'none', // Preservar declaraciones de herramientas pero forzar respuesta textual
            enableAgentJs: appConfig.enableAgentJs !== false,
            enableAgentWeb: appConfig.enableAgentWeb !== false,
            enableAgentSearch: appConfig.enableAgentSearch !== false,
            enableAgentChart: appConfig.enableAgentChart !== false,
            enableContextCache: appConfig.enableContextCache !== false,
            signal: currentAbortController ? currentAbortController.signal : undefined,

            onReasoningChunk: function (chunk) {
              addDebugLog('thinking', chunk);
              setDebugStatus('streaming', t('debug_status_thinking'));
            },
            onLog: function (logData) {
              if (logData && logData.type !== 'thinking') addDebugLog(logData.type, logData.text);
            },
            onChunk: function (fullTextSoFar, delta, stats) {
              synthText = fullTextSoFar;
              turnBlock.innerHTML = injectStreamingCursor(parseMd(synthText));
              attachListeners(turnBlock);
              if (stats) updateStatsDisplay(stats);
              scrollToBottom();
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

        // Si el modelo todavía no emitió texto tras la síntesis forzada, compilar los resultados de las herramientas
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

        turnBlock.innerHTML = parseMd(currentTurnText || t('empty_response'));
        attachListeners(turnBlock);
        chatHistory.push({
          id: `${assistantMsgId}_final`,
          role: 'assistant',
          content: currentTurnText
        });

        if (turnFinalStats) updateStatsDisplay(turnFinalStats);
        setDebugStatus('done', t('debug_status_done'));

        actions.style.display = 'inline-flex';
        btnCopy.onclick = async () => {
          try {
            const finalFullMarkdown = (accumulatedConversationMarkdown ? accumulatedConversationMarkdown : '') + currentTurnText;
            await navigator.clipboard.writeText(finalFullMarkdown);
            const span = btnCopy.querySelector('span');
            const originalText = span.textContent;
            span.textContent = t('copied_text');
            btnCopy.classList.add('copied');

            setTimeout(() => {
              span.textContent = originalText;
              btnCopy.classList.remove('copied');
            }, 2000);
          } catch (err) {
            console.error('Error copying composite response:', err);
          }
        };

        finishGeneration();
        return;
      }

      // Procesar llamada a herramienta
      const tc = turnToolCalls[0];
      const rawFuncName = tc.function?.name || '';
      const normName = API.normalizeToolName ? API.normalizeToolName(rawFuncName) : rawFuncName.toLowerCase().replace(/_/g, '');

      // Protección contra Bucles Infinitos: Detectar repetición idéntica de llamadas
      const callFingerprint = `${normName}:${typeof tc.function.arguments === 'object' ? JSON.stringify(tc.function.arguments) : String(tc.function.arguments || '').trim()}`;
      const identicalCount = toolCallSignatures.filter(sig => sig === callFingerprint).length;
      if (identicalCount >= 2) {
        addDebugLog('error', `[Protección Bucle Infinito]: Herramienta '${normName}' invocada repetidamente con los mismos argumentos. Interrumpiendo ciclo agéntico.`);
        const loopWarning = `\n\n> ⚠️ *[Protección de Bucle Infinito]*: La herramienta \`${normName}\` fue invocada repetidamente con los mismos parámetros sin progreso. Se finaliza la iteración.`;
        currentTurnText = (currentTurnText || '') + loopWarning;
        turnBlock.innerHTML = parseMd(currentTurnText);
        attachListeners(turnBlock);

        chatHistory.push({
          id: `${assistantMsgId}_final`,
          role: 'assistant',
          content: currentTurnText
        });

        if (turnFinalStats) updateStatsDisplay(turnFinalStats);
        setDebugStatus('done', t('debug_status_done'));
        actions.style.display = 'inline-flex';
        finishGeneration();
        return;
      }
      toolCallSignatures.push(callFingerprint);

      // Limpiar llamadas a herramientas emitidas como texto crudo en la UI
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

      if (currentTurnText) {
        turnBlock.innerHTML = parseMd(currentTurnText);
        attachListeners(turnBlock);
      } else {
        turnBlock.remove();
      }

      // 1. Ejecución de JavaScript
      if (normName === 'execute_javascript') {
        let codeToRun = '';
        try {
          const parsed = typeof tc.function.arguments === 'object' ? tc.function.arguments : JSON.parse(tc.function.arguments || '{}');
          codeToRun = parsed.code || parsed.javascript || parsed.js || parsed.script || parsed.input || (typeof parsed === 'string' ? parsed : '');
        } catch (e) {
          codeToRun = tc.function.arguments || '';
        }

        // Crear e insertar de inmediato la tarjeta en la interfaz (aparece al momento de la llamada)
        const cardDiv = document.createElement('div');
        cardDiv.className = 'tool-card-wrapper';
        cardDiv.innerHTML = `
          <div class="tool-execution-card">
            <div class="tool-card-header">
              <div class="tool-card-title">
                <span>⚡</span>
                <span>${t('tool_js_title_running') || 'execute_javascript'}</span>
              </div>
              <div class="tool-card-header-actions">
                <span class="tool-card-badge status-loading">⏳ ${t('tool_badge_executing') || 'Ejecutando...'}</span>
                <button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Minimizar'}"><span>▾</span></button>
              </div>
            </div>
            <div class="tool-card-collapsible-body">
              <pre class="tool-card-code"><code>${Markdown.escapeHtml(codeToRun)}</code></pre>
              <div class="tool-card-result">
                <div class="tool-loading-placeholder">⏳ ${t('tool_loading_js') || 'Ejecutando código en sandbox local...'}</div>
              </div>
            </div>
          </div>
        `;
        content.appendChild(cardDiv);
        attachListeners(cardDiv);
        scrollToBottom();

        addDebugLog('tool', `execute_javascript:\n${codeToRun}`);
        addDebugLog('raw', `>>> TOOL CALL execute_javascript:\n${codeToRun}`);
        const toolExecRes = await (Sandbox.execute ? Sandbox.execute(codeToRun) : { success: false, error: 'Sandbox not available' });
        const outputText = toolExecRes.success
          ? (toolExecRes.result || (toolExecRes.logs && toolExecRes.logs.length > 0 ? toolExecRes.logs.join('\n') : 'undefined'))
          : `Error: ${toolExecRes.error}`;

        addDebugLog('tool', `execute_javascript output (${toolExecRes.executionTimeMs || 0}ms):\n${outputText}`);
        addDebugLog('raw', `<<< TOOL RESULT execute_javascript (${toolExecRes.executionTimeMs || 0}ms):\n${JSON.stringify(toolExecRes, null, 2)}`);

        // Rellenar dinámicamente el resultado en la tarjeta existente
        const badgeEl = cardDiv.querySelector('.tool-card-badge');
        if (badgeEl) {
          badgeEl.className = 'tool-card-badge';
          badgeEl.textContent = `${toolExecRes.executionTimeMs || 0}ms`;
        }
        const titleEl = cardDiv.querySelector('.tool-card-title span:last-child');
        if (titleEl) {
          titleEl.textContent = t('tool_js_title', { ms: toolExecRes.executionTimeMs || 0 });
        }
        const resultEl = cardDiv.querySelector('.tool-card-result');
        if (resultEl) {
          resultEl.innerHTML = `<strong>${t('tool_sandbox_output')}</strong>\n${Markdown.escapeHtml(outputText)}`;
        }
        attachListeners(cardDiv);
        if (turnFinalStats) updateStatsDisplay(turnFinalStats);
        scrollToBottom();

        chatHistory.push({
          id: `${assistantMsgId}_turn_${turnIndex}_assistant`,
          role: 'assistant',
          content: currentTurnText || null,
          tool_calls: [tc]
        });

        chatHistory.push({
          id: `${assistantMsgId}_turn_${turnIndex}_tool_${tc.id || 'res'}`,
          role: 'tool',
          tool_call_id: tc.id,
          name: 'execute_javascript',
          content: JSON.stringify({
            success: toolExecRes.success,
            result: toolExecRes.result,
            logs: toolExecRes.logs,
            executionTimeMs: toolExecRes.executionTimeMs,
            error: toolExecRes.error
          })
        });

        const toolMd = `> ⚡ **execute_javascript**\n> \`\`\`javascript\n> ${codeToRun.split('\n').join('\n> ')}\n> \`\`\`\n> \`\`\`\n> ${outputText.split('\n').join('\n> ')}\n> \`\`\``;
        accumulatedConversationMarkdown += (currentTurnText ? currentTurnText + '\n\n' : '') + toolMd + '\n\n';

        turnIndex++;
        continue;
      }

      // 2. Consulta Web o Descarga de PDF
      else if (normName === 'fetch_web_page' || normName === 'download_pdf') {
        const isPdfCall = normName === 'download_pdf';
        let urlToFetch = '';
        try {
          const parsed = typeof tc.function.arguments === 'object' ? tc.function.arguments : JSON.parse(tc.function.arguments || '{}');
          urlToFetch = parsed.url || parsed.URL || parsed.uri || parsed.link || parsed.href || parsed.path || parsed.input || (typeof parsed === 'string' ? parsed : '');
        } catch (e) {
          urlToFetch = tc.function.arguments || '';
        }

        const cardIcon = isPdfCall ? '📄' : '🌐';
        const cardTitle = isPdfCall ? t('tool_pdf_title') : t('tool_web_title');

        // Crear e insertar de inmediato la tarjeta en la interfaz (aparece al momento de la llamada)
        const cardDiv = document.createElement('div');
        cardDiv.className = 'tool-card-wrapper';
        cardDiv.innerHTML = `
          <div class="web-request-card ${isPdfCall ? 'pdf-request-card' : ''}">
            <div class="web-card-header">
              <div class="web-card-title">
                <span>${cardIcon}</span>
                <span>${cardTitle}</span>
              </div>
              <div class="tool-card-header-actions">
                <span class="web-card-badge status-loading">⏳ ${isPdfCall ? (t('tool_badge_downloading') || 'Descargando...') : (t('tool_badge_fetching') || 'Consultando...')}</span>
                <button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Minimizar'}"><span>▾</span></button>
              </div>
            </div>
            <div class="tool-card-collapsible-body">
              <div class="web-card-section web-request-section">
                <div class="section-label">${t('tool_web_requested_url')}</div>
                <div class="url-badge"><a href="${Markdown.sanitizeUrl ? Markdown.sanitizeUrl(urlToFetch) : Markdown.escapeHtml(urlToFetch)}" target="_blank" rel="noopener noreferrer">${Markdown.escapeHtml(urlToFetch)}</a></div>
              </div>
              <div class="web-card-section web-response-section">
                <div class="section-label section-response-label">${t('tool_web_receiving') || 'Recibiendo contenido...'}</div>
                <div class="web-response-body tool-loading-placeholder">⏳ ${isPdfCall ? t('tool_loading_pdf') : t('tool_loading_web')}</div>
              </div>
            </div>
          </div>
        `;
        content.appendChild(cardDiv);
        attachListeners(cardDiv);
        scrollToBottom();

        addDebugLog('tool', `${normName}: ${urlToFetch}`);
        addDebugLog('raw', `>>> TOOL CALL ${normName}: ${urlToFetch}`);
        const webRes = await (WebBrowser.fetchPage ? WebBrowser.fetchPage(urlToFetch) : { success: false, url: urlToFetch, content: '', error: 'Web module not available' });
        const isPdfResult = webRes.isPdf || isPdfCall;

        const statusBadgeText = webRes.success
          ? (isPdfResult ? `PDF (${webRes.byteSize ? FileParser.formatBytes(webRes.byteSize) : 'OK'}) [${webRes.elapsedMs || 0}ms]` : `HTTP ${webRes.status || 200} OK (${webRes.elapsedMs || 0}ms)`)
          : `Error (${webRes.elapsedMs || 0}ms)`;

        const responsePreview = webRes.success
          ? (webRes.content || t('tool_web_empty'))
          : (webRes.error || t('tool_web_err_connect'));

        addDebugLog('tool', `${normName} (${statusBadgeText}) [${webRes.byteSize ? FileParser.formatBytes(webRes.byteSize) : '0 B'}]:\n${(responsePreview || '').substring(0, 200)}...`);
        addDebugLog('raw', `<<< TOOL RESULT ${normName} (${statusBadgeText}):\n${responsePreview || ''}`);

        // Rellenar dinámicamente la tarjeta con la respuesta obtenida
        const badgeEl = cardDiv.querySelector('.web-card-badge');
        if (badgeEl) {
          badgeEl.className = 'web-card-badge';
          badgeEl.textContent = statusBadgeText;
        }
        const respLabelEl = cardDiv.querySelector('.section-response-label');
        if (respLabelEl) {
          respLabelEl.textContent = t('tool_web_content_received', { size: webRes.byteSize ? FileParser.formatBytes(webRes.byteSize) : (webRes.content ? webRes.content.length + ' chars' : '0 B') });
        }
        const respBodyEl = cardDiv.querySelector('.web-response-body');
        if (respBodyEl) {
          respBodyEl.className = 'web-response-body';
          respBodyEl.innerHTML = `<code>${Markdown.escapeHtml(responsePreview)}</code>`;
        }
        attachListeners(cardDiv);
        if (turnFinalStats) updateStatsDisplay(turnFinalStats);
        scrollToBottom();

        chatHistory.push({
          id: `${assistantMsgId}_turn_${turnIndex}_assistant`,
          role: 'assistant',
          content: currentTurnText || null,
          tool_calls: [tc]
        });

        chatHistory.push({
          id: `${assistantMsgId}_turn_${turnIndex}_tool_${tc.id || 'res'}`,
          role: 'tool',
          tool_call_id: tc.id,
          name: normName,
          content: JSON.stringify({
            success: webRes.success,
            url: webRes.url || urlToFetch,
            status: webRes.status || 200,
            isPdf: isPdfResult,
            content: webRes.content,
            error: webRes.error
          })
        });

        const toolMd = `> ${cardIcon} **${normName}** (${statusBadgeText})\n> URL: ${webRes.url || urlToFetch}\n> \`\`\`\n> ${(responsePreview || '').split('\n').join('\n> ')}\n> \`\`\``;
        accumulatedConversationMarkdown += (currentTurnText ? currentTurnText + '\n\n' : '') + toolMd + '\n\n';

        turnIndex++;
        continue;
      }

      // 3. Búsqueda en Internet (search_web)
      else if (normName === 'search_web') {
        let queryToSearch = '';
        try {
          const parsed = typeof tc.function.arguments === 'object' ? tc.function.arguments : JSON.parse(tc.function.arguments || '{}');
          queryToSearch = parsed.query || parsed.q || parsed.search || parsed.keyword || parsed.term || parsed.text || parsed.input || (typeof parsed === 'string' ? parsed : '');
        } catch (e) {
          queryToSearch = tc.function.arguments || '';
        }

        // Crear e insertar de inmediato la tarjeta en la interfaz (aparece al momento de la llamada)
        const cardDiv = document.createElement('div');
        cardDiv.className = 'tool-card-wrapper';
        cardDiv.innerHTML = `
          <div class="web-search-card">
            <div class="web-card-header">
              <div class="web-card-title">
                <span>🔍</span>
                <span>${t('tool_search_title')}</span>
              </div>
              <div class="tool-card-header-actions">
                <span class="web-card-badge status-loading">⏳ ${t('tool_badge_searching') || 'Buscando...'}</span>
                <button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Minimizar'}"><span>▾</span></button>
              </div>
            </div>
            <div class="tool-card-collapsible-body">
              <div class="web-card-section">
                <div class="section-label">${t('tool_search_query')}</div>
                <div class="query-badge">"${Markdown.escapeHtml(queryToSearch)}"</div>
              </div>
              <div class="web-card-section search-results-section">
                <div class="section-label search-response-label">${t('tool_search_searching') || 'Buscando fuentes...'}</div>
                <div class="search-results-container">
                  <div class="tool-loading-placeholder">⏳ ${t('tool_loading_search')}</div>
                </div>
              </div>
            </div>
          </div>
        `;
        content.appendChild(cardDiv);
        attachListeners(cardDiv);
        scrollToBottom();

        addDebugLog('tool', `search_web: "${queryToSearch}"`);
        addDebugLog('raw', `>>> TOOL CALL search_web:\nQuery: "${queryToSearch}"`);
        const searchRes = await (WebSearch.search ? WebSearch.search(queryToSearch, appConfig.language || 'es') : { success: false, query: queryToSearch, count: 0, results: [], markdown: 'Módulo de búsqueda no disponible', elapsedMs: 0 });
        const statusBadgeText = `${searchRes.count} fuentes (${searchRes.elapsedMs || 0}ms)`;

        addDebugLog('tool', `search_web (${searchRes.count} resultados) [${searchRes.elapsedMs || 0}ms]:\n${(searchRes.markdown || '').substring(0, 200)}...`);
        addDebugLog('raw', `<<< TOOL RESULT search_web (${searchRes.count} resultados):\n${searchRes.markdown || ''}`);

        let resultsHtml = '';
        if (searchRes.results && searchRes.results.length > 0) {
          resultsHtml = '<div class="search-results-list">' + searchRes.results.map(r => `
            <div class="search-result-item">
              <div><a href="${Markdown.sanitizeUrl ? Markdown.sanitizeUrl(r.url) : Markdown.escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">🔗 ${Markdown.escapeHtml(r.title)}</a> <small style="opacity:0.75;">(${Markdown.escapeHtml(r.source)})</small></div>
              ${r.snippet ? `<div class="search-result-snippet">${Markdown.escapeHtml(r.snippet)}</div>` : ''}
            </div>
          `).join('') + '</div>';
        } else {
          resultsHtml = `<div class="search-result-snippet"><em>${t('tool_search_empty')}</em></div>`;
        }

        // Rellenar dinámicamente la tarjeta con los resultados encontrados
        const badgeEl = cardDiv.querySelector('.web-card-badge');
        if (badgeEl) {
          badgeEl.className = 'web-card-badge';
          badgeEl.textContent = statusBadgeText;
        }
        const respLabelEl = cardDiv.querySelector('.search-response-label');
        if (respLabelEl) {
          respLabelEl.textContent = t('tool_search_results', { count: searchRes.count });
        }
        const resultsContainer = cardDiv.querySelector('.search-results-container');
        if (resultsContainer) {
          resultsContainer.innerHTML = resultsHtml;
        }
        attachListeners(cardDiv);
        if (turnFinalStats) updateStatsDisplay(turnFinalStats);
        scrollToBottom();

        chatHistory.push({
          id: `${assistantMsgId}_turn_${turnIndex}_assistant`,
          role: 'assistant',
          content: currentTurnText || null,
          tool_calls: [tc]
        });

        chatHistory.push({
          id: `${assistantMsgId}_turn_${turnIndex}_tool_${tc.id || 'res'}`,
          role: 'tool',
          tool_call_id: tc.id,
          name: 'search_web',
          content: searchRes.markdown
        });

        const toolMd = `> 🔍 **search_web** (${searchRes.count} fuentes)\n> Query: "${queryToSearch}"\n> \`\`\`markdown\n> ${(searchRes.markdown || '').split('\n').join('\n> ')}\n> \`\`\``;
        accumulatedConversationMarkdown += (currentTurnText ? currentTurnText + '\n\n' : '') + toolMd + '\n\n';

        turnIndex++;
        continue;
      }

      // 4. Generación de Gráficos Interactivos SVG (render_chart)
      else if (normName === 'render_chart') {
        let chartArgs = {};
        try {
          chartArgs = typeof tc.function.arguments === 'object' ? tc.function.arguments : JSON.parse(tc.function.arguments || '{}');
        } catch (e) {
          chartArgs = { title: 'Gráfico', labels: [], datasets: [] };
        }

        addDebugLog('tool', `render_chart (${chartArgs.type || 'bar'}): "${chartArgs.title || 'Gráfico'}"`);
        addDebugLog('raw', `>>> TOOL CALL render_chart:\n${JSON.stringify(chartArgs, null, 2)}`);

        const chartHtml = (Charts.renderChartCard ? Charts.renderChartCard(chartArgs) : '<div class="chat-chart-card">Gráfico generado</div>');
        const cardDiv = document.createElement('div');
        cardDiv.className = 'tool-card-wrapper';
        cardDiv.innerHTML = chartHtml;
        content.appendChild(cardDiv);
        attachListeners(cardDiv);
        if (turnFinalStats) updateStatsDisplay(turnFinalStats);
        scrollToBottom();

        chatHistory.push({
          id: `${assistantMsgId}_turn_${turnIndex}_assistant`,
          role: 'assistant',
          content: currentTurnText || null,
          tool_calls: [tc]
        });

        chatHistory.push({
          id: `${assistantMsgId}_turn_${turnIndex}_tool_${tc.id || 'res'}`,
          role: 'tool',
          tool_call_id: tc.id,
          name: 'render_chart',
          content: JSON.stringify({
            success: true,
            type: chartArgs.type || 'bar',
            title: chartArgs.title || 'Gráfico'
          })
        });

        const toolMd = `> 📊 **render_chart** (${chartArgs.type || 'bar'})\n> Título: "${chartArgs.title || 'Gráfico'}"\n\n`;
        accumulatedConversationMarkdown += (currentTurnText ? currentTurnText + '\n\n' : '') + toolMd + '\n\n';

        turnIndex++;
        continue;
      }

      // 5. Base de Conocimiento RAG (read_chapter_content)
      else if (normName === 'read_chapter_content' || normName === 'readchaptercontent' || normName === 'readchapter') {
        let ragArgs = {};
        try {
          ragArgs = typeof tc.function.arguments === 'object' ? tc.function.arguments : JSON.parse(tc.function.arguments || '{}');
        } catch (e) {
          ragArgs = { docId: '', chapterId: 1 };
        }

        const docId = ragArgs.docId || ragArgs.doc_id || '';
        const chapterId = typeof ragArgs.chapterId === 'number' ? ragArgs.chapterId : parseInt(ragArgs.chapter_id || ragArgs.chapterId || 1, 10);

        const cardDiv = document.createElement('div');
        cardDiv.className = 'tool-card-wrapper';
        cardDiv.innerHTML = `
          <div class="tool-execution-card rag-execution-card">
            <div class="tool-card-header">
              <div class="tool-card-title">
                <span>📖</span>
                <span>Base de Conocimiento (RAG)</span>
              </div>
              <div class="tool-card-header-actions">
                <span class="tool-card-badge status-loading">⏳ Consultando doc "${Markdown.escapeHtml(docId)}", Cap ${Markdown.escapeHtml(String(chapterId))}...</span>
                <button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Minimizar'}"><span>▾</span></button>
              </div>
            </div>
            <div class="tool-card-collapsible-body">
              <div class="tool-card-result">
                <div class="tool-loading-placeholder">⏳ Recuperando contenido del capítulo desde IndexedDB...</div>
              </div>
            </div>
          </div>
        `;
        content.appendChild(cardDiv);
        attachListeners(cardDiv);
        scrollToBottom();

        addDebugLog('tool', `read_chapter_content: Doc [${docId}], Cap [${chapterId}]`);
        addDebugLog('raw', `>>> TOOL CALL read_chapter_content:\n${JSON.stringify(ragArgs, null, 2)}`);

        const ragService = window.ChatTreeRagService || (typeof require !== 'undefined' ? require('./chatService.js') : null);
        const ragRes = ragService && ragService.resolveChapterToolCall
          ? await ragService.resolveChapterToolCall(ragArgs)
          : { success: false, error: 'Servicio de RAG no disponible' };

        const badgeEl = cardDiv.querySelector('.tool-card-badge');
        const resContainer = cardDiv.querySelector('.tool-card-result');

        if (badgeEl) {
          badgeEl.className = ragRes.success ? 'tool-card-badge status-success' : 'tool-card-badge status-error';
          badgeEl.textContent = ragRes.success
            ? `Capítulo ${chapterId} (${FileParser.formatBytes ? FileParser.formatBytes(ragRes.charCount || 0) : (ragRes.charCount || 0) + ' chars'})`
            : 'Error al recuperar';
        }

        const outText = ragRes.success
          ? (ragRes.content || '')
          : (ragRes.error || 'No se encontró el capítulo.');

        if (resContainer) {
          resContainer.innerHTML = `<div class="result-text-block ${ragRes.success ? 'result-success' : 'result-error'}"><pre><code>${Markdown.escapeHtml(outText)}</code></pre></div>`;
        }

        addDebugLog('tool', `read_chapter_content Result: ${outText.substring(0, 200)}...`);
        addDebugLog('raw', `<<< TOOL RESULT read_chapter_content:\n${outText}`);

        chatHistory.push({
          id: `${assistantMsgId}_turn_${turnIndex}_assistant`,
          role: 'assistant',
          content: currentTurnText || null,
          tool_calls: [tc]
        });

        chatHistory.push({
          id: `${assistantMsgId}_turn_${turnIndex}_tool_${tc.id || 'res'}`,
          role: 'tool',
          tool_call_id: tc.id,
          name: 'read_chapter_content',
          content: outText
        });

        const toolMd = `> 📖 **read_chapter_content** (Doc: \`${docId}\`, Cap: \`${chapterId}\`)\n> \`\`\`text\n> ${String(outText).split('\n').join('\n> ')}\n> \`\`\`\n\n`;
        accumulatedConversationMarkdown += (currentTurnText ? currentTurnText + '\n\n' : '') + toolMd + '\n\n';

        turnIndex++;
        continue;
      }

      // 6. Herramientas MCP y Herramientas Genéricas Registradas en AgentCore
      else {
        const AgentCore = window.ChatAgentCore;
        const toolInstance = AgentCore?.registry?.getTool(rawFuncName);
        const serverName = toolInstance?.metadata?.mcpServerName || 'Herramienta Externa';
        const displayToolName = toolInstance?.metadata?.originalName || rawFuncName;

        let toolArgs = {};
        try {
          toolArgs = typeof tc.function.arguments === 'object' ? tc.function.arguments : JSON.parse(tc.function.arguments || '{}');
        } catch (e) {
          toolArgs = { input: tc.function.arguments || '' };
        }

        const cardDiv = document.createElement('div');
        cardDiv.className = 'tool-card-wrapper';
        cardDiv.innerHTML = `
          <div class="tool-execution-card mcp-tool-card">
            <div class="tool-card-header">
              <div class="tool-card-title">
                <span>🔌</span>
                <span><strong>MCP:</strong> ${Markdown.escapeHtml(displayToolName)} <small style="opacity:0.7;">(${Markdown.escapeHtml(serverName)})</small></span>
              </div>
              <div class="tool-card-header-actions">
                <span class="tool-card-badge status-running">⏳ ${t('tool_running') || 'Ejecutando...'}</span>
                <button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Minimizar'}"><span>▾</span></button>
              </div>
            </div>
            <div class="tool-card-collapsible-body">
              <div class="tool-card-section">
                <div class="section-label">${t('tool_js_code') || 'Argumentos'}</div>
                <div class="code-preview-block"><pre><code>${Markdown.escapeHtml(JSON.stringify(toolArgs, null, 2))}</code></pre></div>
              </div>
              <div class="tool-card-section tool-result-section">
                <div class="section-label">${t('tool_js_result') || 'Resultado'}</div>
                <div class="tool-result-container">
                  <div class="tool-loading-placeholder">⏳ Ejecutando en servidor MCP...</div>
                </div>
              </div>
            </div>
          </div>
        `;
        content.appendChild(cardDiv);
        attachListeners(cardDiv);
        scrollToBottom();

        addDebugLog('tool', `MCP Tool [${serverName}]: ${displayToolName}`);
        addDebugLog('raw', `>>> TOOL CALL ${rawFuncName}:\n${JSON.stringify(toolArgs, null, 2)}`);

        const execResult = AgentCore
          ? await AgentCore.executor.executeToolCall(tc, { signal: currentAbortController ? currentAbortController.signal : undefined })
          : { success: false, error: 'AgentCore no disponible' };

        const badgeEl = cardDiv.querySelector('.tool-card-badge');
        const resContainer = cardDiv.querySelector('.tool-result-container');

        if (badgeEl) {
          badgeEl.className = execResult.success ? 'tool-card-badge status-success' : 'tool-card-badge status-error';
          badgeEl.textContent = execResult.success
            ? `${t('tool_status_success') || 'Éxito'} (${execResult.executionTimeMs || 0}ms)`
            : (t('tool_status_error') || 'Error');
        }

        const outText = execResult.success
          ? (execResult.result?.content || (typeof execResult.result === 'object' ? JSON.stringify(execResult.result, null, 2) : String(execResult.result || '')))
          : (execResult.error || 'Error desconocido');

        if (resContainer) {
          resContainer.innerHTML = `<div class="result-text-block ${execResult.success ? 'result-success' : 'result-error'}"><pre><code>${Markdown.escapeHtml(outText)}</code></pre></div>`;
        }

        addDebugLog('tool', `MCP Result [${displayToolName}]: ${outText.substring(0, 200)}...`);
        addDebugLog('raw', `<<< TOOL RESULT ${rawFuncName}:\n${outText}`);

        chatHistory.push({
          id: `${assistantMsgId}_turn_${turnIndex}_assistant`,
          role: 'assistant',
          content: currentTurnText || null,
          tool_calls: [tc]
        });

        chatHistory.push({
          id: `${assistantMsgId}_turn_${turnIndex}_tool_${tc.id || 'res'}`,
          role: 'tool',
          tool_call_id: tc.id,
          name: rawFuncName,
          content: outText
        });

        const toolMd = `> 🔌 **MCP: ${displayToolName}** (*${serverName}*)\n> \`\`\`json\n> ${JSON.stringify(toolArgs, null, 2).split('\n').join('\n> ')}\n> \`\`\`\n> \`\`\`\n> ${String(outText).split('\n').join('\n> ')}\n> \`\`\`\n\n`;
        accumulatedConversationMarkdown += (currentTurnText ? currentTurnText + '\n\n' : '') + toolMd + '\n\n';

        turnIndex++;
        continue;
      }
    }

    // Si se agotaron los turnos máximos y el último mensaje fue de una herramienta (role: 'tool'),
    // realizar una última petición de síntesis al modelo con toolChoice: 'none' para garantizar el resumen final.
    if (turnIndex >= maxAgentTurns && chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'tool' && !(currentAbortController && currentAbortController.signal.aborted)) {
      const finalSynthBlock = document.createElement('div');
      finalSynthBlock.className = 'agentic-turn-block';
      content.appendChild(finalSynthBlock);

      let finalSynthText = '';
      let finalSynthStats = null;

      const isEn = appConfig.language === 'en';
      const synthMessages = buildEffectiveMessages({ forceSystemPromptGuide: true });
      synthMessages.push({
        role: 'user',
        content: isEn
          ? 'Based on all the information gathered from the tools above, please write a comprehensive, detailed, and well-structured final answer to my initial question, organizing the findings clearly and citing sources.'
          : 'A partir de toda la información obtenida por las herramientas anteriores, redacta ahora una respuesta final completa, detallada y bien estructurada para mi consulta inicial, organizando los hallazgos con claridad y citando las fuentes consultadas.'
      });

      await API.streamChatCompletion({
        apiUrl: appConfig.apiUrl,
        apiType: appConfig.apiType,
        apiKey: appConfig.apiKey,
        model: appConfig.model,
        messages: synthMessages,
        temperature: appConfig.temperature,
        reasoningEffort: appConfig.reasoningEffort || 'none',
        enableTools: true,
        toolChoice: 'none', // Preservar declaraciones de herramientas pero forzar respuesta textual
        enableAgentJs: appConfig.enableAgentJs !== false,
        enableAgentWeb: appConfig.enableAgentWeb !== false,
        enableAgentSearch: appConfig.enableAgentSearch !== false,
        enableAgentChart: appConfig.enableAgentChart !== false,
        enableContextCache: appConfig.enableContextCache !== false,
        signal: currentAbortController ? currentAbortController.signal : undefined,

        onReasoningChunk: function (chunk) {
          addDebugLog('thinking', chunk);
          setDebugStatus('streaming', t('debug_status_thinking'));
        },
        onLog: function (logData) {
          if (logData && logData.type !== 'thinking') addDebugLog(logData.type, logData.text);
        },
        onChunk: function (fullTextSoFar, delta, stats) {
          finalSynthText = fullTextSoFar;
          finalSynthBlock.innerHTML = injectStreamingCursor(parseMd(finalSynthText));
          attachListeners(finalSynthBlock);
          if (stats) updateStatsDisplay(stats);
          scrollToBottom();
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

      if (finalSynthText) {
        finalSynthBlock.innerHTML = parseMd(finalSynthText);
        attachListeners(finalSynthBlock);
        chatHistory.push({
          id: `${assistantMsgId}_final`,
          role: 'assistant',
          content: finalSynthText
        });
        if (finalSynthStats) updateStatsDisplay(finalSynthStats);
      }

      actions.style.display = 'inline-flex';
      btnCopy.onclick = async () => {
        try {
          const finalFullMarkdown = (accumulatedConversationMarkdown ? accumulatedConversationMarkdown : '') + finalSynthText;
          await navigator.clipboard.writeText(finalFullMarkdown);
          const span = btnCopy.querySelector('span');
          const originalText = span.textContent;
          span.textContent = t('copied_text');
          btnCopy.classList.add('copied');
          setTimeout(() => {
            span.textContent = originalText;
            btnCopy.classList.remove('copied');
          }, 2000);
        } catch (err) {
          console.error('Error copying response:', err);
        }
      };
    }

    setDebugStatus('done', t('debug_status_done'));
    finishGeneration();
  }

  function finishGeneration() {
    if (State.set) {
      State.set('streaming', { isGenerating: false, status: 'idle' });
    } else {
      isGenerating = false;
      if (elements.btnSend) elements.btnSend.disabled = false;
      if (elements.btnStopStream) elements.btnStopStream.style.display = 'none';
    }
    currentAbortController = null;
    if (elements.userInput) elements.userInput.focus();
    saveCurrentSession();
    scrollToBottom();
  }

  function handleStopGeneration() {
    if (currentAbortController) {
      currentAbortController.abort();
    }
  }

  // ==========================================================================
  // Modal de Configuración
  // ==========================================================================

  function openSettingsModal() {
    if (elements.settingApiType) {
      elements.settingApiType.value = appConfig.apiType || 'openai';
    }
    elements.settingApiUrl.value = appConfig.apiUrl || 'http://localhost:1234/v1';
    elements.settingApiKey.value = appConfig.apiKey || '';
    elements.settingModel.value = appConfig.model || '';
    elements.settingSystemPrompt.value = appConfig.systemPrompt || '';
    elements.settingTemperature.value = appConfig.temperature || '0.7';
    elements.temperatureVal.textContent = appConfig.temperature || '0.7';
    applyTheme(appConfig.theme || 'light');
    applyLanguage(appConfig.language || 'es');

    if (elements.serverQueryStatus) {
      elements.serverQueryStatus.style.display = 'none';
    }

    loadCachedModels();

    if (elements.settingEnableAgentJs) {
      elements.settingEnableAgentJs.checked = appConfig.enableAgentJs !== false;
    }
    if (elements.settingEnableAgentWeb) {
      elements.settingEnableAgentWeb.checked = appConfig.enableAgentWeb !== false;
    }
    if (elements.settingEnableAgentSearch) {
      elements.settingEnableAgentSearch.checked = appConfig.enableAgentSearch !== false;
    }
    if (elements.settingEnableAgentChart) {
      elements.settingEnableAgentChart.checked = appConfig.enableAgentChart !== false;
    }
    if (elements.settingEnableContextCache) {
      elements.settingEnableContextCache.checked = appConfig.enableContextCache !== false;
    }
    if (elements.settingEnableRawLogs) {
      elements.settingEnableRawLogs.checked = appConfig.enableRawLogs === true;
    }
    if (elements.settingSendDateTime) {
      elements.settingSendDateTime.checked = appConfig.sendDateTime !== false;
    }

    if (elements.modalTabs && elements.modalTabs.length > 0) {
      elements.modalTabs.forEach(b => b.classList.remove('active'));
      elements.modalPanes.forEach(p => p.classList.remove('active'));
      elements.modalTabs[0].classList.add('active');
      const firstPane = document.getElementById(elements.modalTabs[0].getAttribute('data-tab'));
      if (firstPane) firstPane.classList.add('active');
    }

    elements.settingsDialog.showModal();
  }

  function closeSettingsModal() {
    elements.settingsDialog.close();
  }

  function handleSaveSettings(e) {
    e.preventDefault();

    const selectedModel = elements.settingModel.value.trim();

    const newConfig = {
      apiUrl: elements.settingApiUrl.value.trim(),
      apiType: elements.settingApiType ? elements.settingApiType.value : (appConfig.apiType || 'openai'),
      apiKey: elements.settingApiKey.value.trim(),
      model: selectedModel,
      systemPrompt: elements.settingSystemPrompt.value.trim(),
      temperature: elements.settingTemperature.value,
      reasoningEffort: appConfig.reasoningEffort || 'none',
      theme: appConfig.theme || 'light',
      language: appConfig.language || 'es',
      enableAgentJs: elements.settingEnableAgentJs ? elements.settingEnableAgentJs.checked : true,
      enableAgentWeb: elements.settingEnableAgentWeb ? elements.settingEnableAgentWeb.checked : true,
      enableAgentSearch: elements.settingEnableAgentSearch ? elements.settingEnableAgentSearch.checked : true,
      enableAgentChart: elements.settingEnableAgentChart ? elements.settingEnableAgentChart.checked : true,
      enableContextCache: elements.settingEnableContextCache ? elements.settingEnableContextCache.checked : true,
      enableRawLogs: elements.settingEnableRawLogs ? elements.settingEnableRawLogs.checked : Boolean(appConfig.enableRawLogs),
      enableDebugMessages: Boolean(appConfig.enableDebugMessages),
      sendDateTime: elements.settingSendDateTime ? elements.settingSendDateTime.checked : true,
      activeRagBranchId: appConfig.activeRagBranchId || '',
      ragContextLimitK: appConfig.ragContextLimitK || 16
    };

    if (Storage.saveConfig) {
      Storage.saveConfig(newConfig);
    }
    appConfig = newConfig;

    if (chatHistory.length > 0 && chatHistory[0].role === 'system') {
      chatHistory[0].content = appConfig.systemPrompt || '';
    }

    updateUIFromConfig();
    closeSettingsModal();
  }

  function handleResetSettings() {
    if (Storage.getDefaultConfig) {
      const defaults = Storage.getDefaultConfig();
      if (elements.settingApiType) {
        elements.settingApiType.value = defaults.apiType || 'openai';
      }
      elements.settingApiUrl.value = defaults.apiUrl;
      elements.settingApiKey.value = defaults.apiKey;
      elements.settingModel.value = defaults.model;
      elements.settingSystemPrompt.value = '';
      elements.settingTemperature.value = defaults.temperature;
      elements.temperatureVal.textContent = defaults.temperature;
      applyTheme(defaults.theme || 'light');
      applyLanguage(defaults.language || 'es');

      if (elements.modelSelectHelper) {
        elements.modelSelectHelper.value = defaults.model;
      }

      if (elements.settingEnableAgentJs) {
        elements.settingEnableAgentJs.checked = defaults.enableAgentJs !== false;
      }
      if (elements.settingEnableAgentWeb) {
        elements.settingEnableAgentWeb.checked = defaults.enableAgentWeb !== false;
      }
      if (elements.settingEnableAgentSearch) {
        elements.settingEnableAgentSearch.checked = defaults.enableAgentSearch !== false;
      }
      if (elements.settingEnableAgentChart) {
        elements.settingEnableAgentChart.checked = defaults.enableAgentChart !== false;
      }
      if (elements.settingEnableContextCache) {
        elements.settingEnableContextCache.checked = defaults.enableContextCache !== false;
      }
      if (elements.settingEnableRawLogs) {
        elements.settingEnableRawLogs.checked = defaults.enableRawLogs === true;
      }
      if (elements.settingSendDateTime) {
        elements.settingSendDateTime.checked = defaults.sendDateTime !== false;
      }
    }
  }

  function handleClearAllData() {
    if (!confirm(t('confirm_clear_all_data'))) return;

    if (Storage.clearAllStorage) {
      Storage.clearAllStorage();
    } else {
      try { localStorage.clear(); } catch (e) {}
      try { sessionStorage.clear(); } catch (e) {}
    }

    // Recargar la aplicación para iniciar completamente desde cero
    window.location.reload();
  }

  // ==========================================================================
  // Gestión de Múltiples Sesiones de Chat (Sidebar & IndexedDB Storage)
  // ==========================================================================

  async function loadSessionsFromStorage() {
    try {
      if (Storage.initDB) {
        await Storage.initDB();
      }
      if (Storage.getConversationsList) {
        savedSessions = await Storage.getConversationsList();
      } else {
        const raw = Storage.getStorageItem ? Storage.getStorageItem('chat_sessions') : localStorage.getItem('chat_sessions');
        savedSessions = raw ? JSON.parse(raw) : [];
      }
    } catch (e) {
      console.warn('Error al cargar sesiones de chat:', e);
      savedSessions = [];
    }

    if (!Array.isArray(savedSessions)) {
      savedSessions = [];
    }

    // Siempre iniciar en un chat nuevo al abrir o recargar la página (F5 / Ctrl+F5)
    currentSessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    chatHistory = createInitialChatHistory();

    renderSessionMessages(chatHistory);
    renderSidebarChats();
  }

  async function saveCurrentSession() {
    // Comprobar si hay preguntas reales del usuario además de los turnos de inicialización de fecha/hora
    const hasRealUserMessages = Array.isArray(chatHistory) && chatHistory.some(m => {
      if (!m || m.role !== 'user') return false;
      return !isDateTimeInitialTurn(m);
    });
    
    // Si la conversación no tiene preguntas reales del usuario, no guardarla como sesión activa en el sidebar
    if (!hasRealUserMessages) {
      if (Array.isArray(savedSessions)) {
        savedSessions = savedSessions.filter(s => s.id !== currentSessionId);
        if (Storage.deleteConversation) {
          await Storage.deleteConversation(currentSessionId);
        } else {
          try {
            const serialized = JSON.stringify(savedSessions);
            if (Storage.setStorageItem) Storage.setStorageItem('chat_sessions', serialized);
            else localStorage.setItem('chat_sessions', serialized);
          } catch (e) {}
        }
      }
      renderSidebarChats();
      return;
    }

    let sess = savedSessions.find(s => s.id === currentSessionId);
    const now = Date.now();
    if (!sess) {
      sess = {
        id: currentSessionId,
        title: t('chat_untitled') || 'Nueva conversación',
        createdAt: now,
        updatedAt: now,
        messageCount: chatHistory.length
      };
      savedSessions.unshift(sess);
    } else {
      sess.updatedAt = now;
      sess.messageCount = chatHistory.length;
    }

    // Auto-generar título a partir del primer mensaje real del usuario
    const isUntitled = !sess.title ||
      sess.title === t('chat_untitled') ||
      sess.title === 'Nueva conversación' ||
      sess.title === 'New conversation';

    if (isUntitled && chatHistory.length > 1) {
      const firstRealUser = chatHistory.find(m => m.role === 'user' && !isDateTimeInitialTurn(m));
      if (firstRealUser && firstRealUser.content) {
        const rawContent = typeof firstRealUser.content === 'string' ? firstRealUser.content : (firstRealUser.content[0]?.text || '');
        const candidate = rawContent.split('\n')[0].replace(/[#*`_>\[\]]/g, '').trim();
        if (candidate) {
          sess.title = candidate.length > 35 ? candidate.substring(0, 32) + '…' : candidate;
        }
      }
    }

    if (Storage.saveConversation) {
      await Storage.saveConversation(sess, chatHistory);
    } else {
      try {
        const serialized = JSON.stringify(savedSessions);
        if (Storage.setStorageItem) Storage.setStorageItem('chat_sessions', serialized);
        else localStorage.setItem('chat_sessions', serialized);
      } catch (e) {}
    }

    renderSidebarChats();
  }

  function renderSidebarChats(filterText = '') {
    if (!elements.sidebarChatsList) return;
    elements.sidebarChatsList.innerHTML = '';

    const filter = filterText.toLowerCase().trim();
    const matching = savedSessions.filter(s => {
      if (!filter) return true;
      if (s.title && s.title.toLowerCase().includes(filter)) return true;
      return false;
    });

    if (matching.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'sidebar-no-chats';
      emptyDiv.style.cssText = 'padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.8rem;';
      emptyDiv.textContent = t('sidebar_no_chats');
      elements.sidebarChatsList.appendChild(emptyDiv);
      return;
    }

    matching.forEach(s => {
      const item = document.createElement('div');
      item.className = 'sidebar-chat-item' + (s.id === currentSessionId ? ' active' : '');
      item.setAttribute('data-session-id', s.id);

      const d = new Date(s.updatedAt || s.createdAt || Date.now());
      const timeStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      item.innerHTML = `
        <div class="sidebar-chat-info">
          <span class="sidebar-chat-title" title="${Markdown.escapeHtml(s.title || t('chat_untitled'))}">${Markdown.escapeHtml(s.title || t('chat_untitled'))}</span>
          <span class="sidebar-chat-time">${timeStr}</span>
        </div>
        <div class="sidebar-chat-actions">
          <button type="button" class="btn-chat-action btn-rename" title="Renombrar chat">✏️</button>
          <button type="button" class="btn-chat-action btn-delete" title="Eliminar chat">🗑️</button>
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.sidebar-chat-actions')) return;
        switchToSession(s.id);
      });

      const btnRename = item.querySelector('.btn-rename');
      if (btnRename) {
        btnRename.addEventListener('click', (e) => renameSession(s.id, e));
      }

      const btnDelete = item.querySelector('.btn-delete');
      if (btnDelete) {
        btnDelete.addEventListener('click', (e) => deleteSession(s.id, e));
      }

      elements.sidebarChatsList.appendChild(item);
    });
  }

  async function switchToSession(sessionId) {
    if (sessionId === currentSessionId) return;
    await saveCurrentSession();

    let targetConv = null;
    if (Storage.getConversation) {
      targetConv = await Storage.getConversation(sessionId);
    }

    if (!targetConv) {
      const found = savedSessions.find(s => s.id === sessionId);
      if (found && found.history) targetConv = found;
    }

    if (!targetConv) return;

    currentSessionId = targetConv.id;
    chatHistory = targetConv.history && targetConv.history.length > 0 ? [...targetConv.history] : [
      { id: 'system_root', role: 'system', content: appConfig.systemPrompt || '' }
    ];

    renderSessionMessages(chatHistory);
    renderSidebarChats();

    if (window.innerWidth < 900) {
      closeSidebar();
    }
  }

  async function createNewSession() {
    await saveCurrentSession();

    currentSessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    chatHistory = createInitialChatHistory();

    renderSessionMessages(chatHistory);
    renderSidebarChats();

    if (elements.userInput) {
      elements.userInput.value = '';
      autoResizeTextarea();
      elements.userInput.focus();
    }

    if (window.innerWidth < 900) {
      closeSidebar();
    }
  }

  async function deleteSession(sessionId, event) {
    if (event) event.stopPropagation();
    if (!confirm(t('chat_delete_confirm'))) return;

    const idx = savedSessions.findIndex(s => s.id === sessionId);
    if (idx === -1) return;

    savedSessions.splice(idx, 1);

    if (Storage.deleteConversation) {
      await Storage.deleteConversation(sessionId);
    } else {
      try {
        const serialized = JSON.stringify(savedSessions);
        if (Storage.setStorageItem) Storage.setStorageItem('chat_sessions', serialized);
        else localStorage.setItem('chat_sessions', serialized);
      } catch (e) {}
    }

    if (savedSessions.length === 0) {
      await createNewSession();
    } else if (currentSessionId === sessionId) {
      const next = savedSessions[0];
      await switchToSession(next.id);
    } else {
      renderSidebarChats();
    }
  }

  async function deleteAllSessions() {
    if (!savedSessions || savedSessions.length === 0) return;
    if (!confirm(t('chat_delete_all_confirm'))) return;

    savedSessions = [];
    if (Storage.deleteAllConversations) {
      await Storage.deleteAllConversations();
    } else {
      try {
        if (Storage.setStorageItem) Storage.setStorageItem('chat_sessions', JSON.stringify([]));
        else localStorage.setItem('chat_sessions', JSON.stringify([]));
      } catch (e) {}
    }

    await createNewSession();
  }

  async function renameSession(sessionId, event) {
    if (event) event.stopPropagation();
    const sess = savedSessions.find(s => s.id === sessionId);
    if (!sess) return;

    const newTitle = prompt('Nombre de la conversación:', sess.title || '');
    if (newTitle !== null && newTitle.trim() !== '') {
      sess.title = newTitle.trim();
      if (Storage.renameConversation) {
        await Storage.renameConversation(sessionId, sess.title);
      }
      renderSidebarChats();
    }
  }

  function toggleSidebar() {
    if (!elements.chatSidebar) return;
    const isHidden = elements.chatSidebar.style.display === 'none' || !elements.chatSidebar.style.display;
    elements.chatSidebar.style.display = isHidden ? 'flex' : 'none';
  }

  function closeSidebar() {
    if (elements.chatSidebar) {
      elements.chatSidebar.style.display = 'none';
    }
  }

  function renderStoredToolCard(tc, toolMsg) {
    if (ToolCards.renderHistoricalToolCard) {
      return ToolCards.renderHistoricalToolCard(tc, toolMsg);
    }
    return null;
  }

  function attachListenersToContainer(container) {
    if (!container) return;
    if (Markdown.attachCopyCodeListeners) {
      Markdown.attachCopyCodeListeners(container);
    }
    if (Markdown.attachRunJsListeners) {
      Markdown.attachRunJsListeners(container, (code, outputEl) => {
        if (Sandbox && Sandbox.execute) {
          Sandbox.execute(code).then(res => {
            if (outputEl) {
              outputEl.textContent = res.success ? (res.result || res.logs.join('\n') || 'undefined') : `Error: ${res.error}`;
            }
          });
        }
      });
    }
    // Botones de colapso de tarjetas de herramientas
    container.querySelectorAll('.btn-tool-collapse').forEach(btn => {
      btn.onclick = () => {
        const card = btn.closest('.tool-execution-card, .web-search-card');
        if (card) {
          card.classList.toggle('collapsed');
          const span = btn.querySelector('span');
          if (span) span.textContent = card.classList.contains('collapsed') ? '▸' : '▾';
        }
      };
    });
  }

  function renderSessionMessages(history) {
    if (!elements.messagesList) return;
    elements.messagesList.innerHTML = '';

    // Filtrar system messages y omitir del chat visual el par inicial de fecha/hora
    const nonSystem = (history || []).filter(m => m && m.role !== 'system');
    let validMessages = nonSystem;
    if (nonSystem.length >= 2 && isDateTimeInitialTurn(nonSystem[0]) && nonSystem[1].role === 'assistant' && (nonSystem[1].content === 'OK' || nonSystem[1].content === 'OK.')) {
      validMessages = nonSystem.slice(2);
    }

    if (validMessages.length === 0) {
      if (elements.welcomeBanner) {
        elements.messagesList.appendChild(elements.welcomeBanner);
        elements.welcomeBanner.style.display = 'block';
      }
      return;
    }

    if (elements.welcomeBanner) {
      elements.welcomeBanner.style.display = 'none';
    }

    // Agrupar mensajes en turnos: Usuario y Bloques del Asistente (incluyendo tool_calls y tools)
    let i = 0;
    while (i < validMessages.length) {
      const msg = validMessages[i];

      if (msg.role === 'user') {
        let text = '';
        let images = msg.images || [];
        if (typeof msg.content === 'string') {
          text = msg.content;
        } else if (Array.isArray(msg.content)) {
          const textPart = msg.content.find(c => c.type === 'text');
          text = textPart ? textPart.text : '';
          msg.content.forEach(c => {
            if (c.type === 'image_url' && c.image_url?.url) {
              if (!images.some(img => img.dataUrl === c.image_url.url)) {
                images.push({ name: 'Imagen adjunta', dataUrl: c.image_url.url });
              }
            }
          });
        }
        appendUserMessage(text, text, images, msg.id);
        i++;
      } else {
        // Bloque del Asistente (puede incluir múltiples turnos internos, llamadas a herramientas y resultados)
        const assistantGroup = [];
        const firstAssistantId = msg.id || ('msg_ast_' + Date.now());

        while (i < validMessages.length && validMessages[i].role !== 'user') {
          assistantGroup.push(validMessages[i]);
          i++;
        }

        const { content, actions, btnCopy } = createAssistantMessagePlaceholder(firstAssistantId);
        content.innerHTML = ''; // Limpiar el cursor inicial de streaming

        let fullAssistantMarkdown = '';

        for (let g = 0; g < assistantGroup.length; g++) {
          const item = assistantGroup[g];

          if (item.role === 'assistant') {
            // 1. Si tiene contenido de texto (razonamiento, tablas markdown, texto normal)
            if (item.content) {
              const turnBlock = document.createElement('div');
              turnBlock.className = 'agentic-turn-block';
              turnBlock.innerHTML = Markdown.renderMarkdown ? Markdown.renderMarkdown(item.content) : item.content;
              content.appendChild(turnBlock);
              fullAssistantMarkdown += (fullAssistantMarkdown ? '\n\n' : '') + item.content;
            }

            // 2. Si tiene llamadas a herramientas (tool_calls)
            if (Array.isArray(item.tool_calls) && item.tool_calls.length > 0) {
              item.tool_calls.forEach(tc => {
                // Buscar el mensaje 'tool' correspondiente
                const toolMsg = assistantGroup.find(m => m.role === 'tool' && (m.tool_call_id === tc.id || m.name === tc.function?.name));
                const cardEl = renderStoredToolCard(tc, toolMsg);
                if (cardEl) {
                  content.appendChild(cardEl);
                }
              });
            }
          }
        }

        // Si no se generó ningún contenido visual en el asistente
        if (content.children.length === 0) {
          content.innerHTML = '<p><em>(Sin respuesta de texto)</em></p>';
        }

        // Configurar botón de copia
        if (btnCopy) {
          btnCopy.onclick = async () => {
            if (navigator.clipboard) {
              await navigator.clipboard.writeText(fullAssistantMarkdown || content.innerText);
              btnCopy.innerHTML = `✅ <span>${t('btn_copied')}</span>`;
              setTimeout(() => {
                btnCopy.innerHTML = `📋 <span>${t('btn_copy')}</span>`;
              }, 2000);
            }
          };
        }

        if (actions) actions.style.display = 'inline-flex';

        // Adjuntar listeners de código, ejecución y minimizado de herramientas
        attachListenersToContainer(content);
      }
    }

    scrollToBottom();
  }

  // ==========================================================================
  // Modal de Exportación e Importación de Conversaciones
  // ==========================================================================

  function openExportModal() {
    if (elements.exportModal) {
      if (typeof elements.exportModal.showModal === 'function') {
        elements.exportModal.showModal();
      } else {
        elements.exportModal.style.display = 'block';
      }
    }
  }

  function closeExportModal() {
    if (elements.exportModal) {
      if (typeof elements.exportModal.close === 'function') {
        elements.exportModal.close();
      } else {
        elements.exportModal.style.display = 'none';
      }
    }
  }

  function exportConversationAsMarkdown() {
    const sess = savedSessions.find(s => s.id === currentSessionId);
    const title = (sess && sess.title) || 'ChatCLI_Conversation';
    const dateStr = new Date().toISOString().slice(0, 10);
    const md = Export.buildMarkdownExport ? Export.buildMarkdownExport(chatHistory, { title, model: appConfig.model }) : '';
    if (Export.downloadFile) {
      Export.downloadFile(md, `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${dateStr}.md`, 'text/markdown');
    }
    closeExportModal();
  }

  function exportConversationAsJson() {
    const sess = savedSessions.find(s => s.id === currentSessionId);
    const title = (sess && sess.title) || 'ChatCLI_Conversation';
    const dateStr = new Date().toISOString().slice(0, 10);
    const jsonStr = Export.buildJsonExport ? Export.buildJsonExport(sess, chatHistory, appConfig) : '{}';
    if (Export.downloadFile) {
      Export.downloadFile(jsonStr, `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${dateStr}.json`, 'application/json');
    }
    closeExportModal();
  }

  function exportConversationAsPrint() {
    closeExportModal();
    setTimeout(() => {
      window.print();
    }, 200);
  }

  function handleImportFileSelected(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
      try {
        const newSession = Export.parseImportedJson ? Export.parseImportedJson(evt.target.result, file.name.replace('.json', '')) : null;
        if (!newSession) throw new Error('Error al procesar el archivo');

        savedSessions.unshift(newSession);
        currentSessionId = newSession.id;
        chatHistory = newSession.history;

        renderSessionMessages(chatHistory);
        saveCurrentSession();
        alert(t('chat_imported_success'));
      } catch (err) {
        alert('Error al leer el archivo JSON: ' + (err.message || err));
      }
      if (elements.importJsonInput) elements.importJsonInput.value = '';
    };
    reader.readAsText(file);
  }

  // ==========================================================================
  // Pegado de Imágenes desde el Portapapeles (Ctrl + V)
  // ==========================================================================

  function handlePasteEvent(e) {
    if (!e.clipboardData || !e.clipboardData.items) return;
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          if (FileParser.parseFile) {
            FileParser.parseFile(file).then(parsed => {
              attachedFiles.push(parsed);
              renderAttachedFiles();
            }).catch(err => {
              console.error('Error pasting image:', err);
            });
          }
        }
      }
    }
  }

  // ==========================================================================
  // Ajuste Dinámico de Altura de Viewport (Android / Tablets / iOS / Teclados)
  // ==========================================================================

  function updateViewportHeight() {
    let vh = window.innerHeight;
    if (window.visualViewport) {
      vh = window.visualViewport.height;
    }
    document.documentElement.style.setProperty('--app-height', `${vh}px`);
  }

  function setupViewportListeners() {
    updateViewportHeight();
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        updateViewportHeight();
        positionReasoningMenu();
      });
      window.visualViewport.addEventListener('scroll', () => {
        updateViewportHeight();
        positionReasoningMenu();
      });
    }
    window.addEventListener('resize', () => {
      updateViewportHeight();
      positionReasoningMenu();
    });
    window.addEventListener('orientationchange', () => {
      setTimeout(() => { updateViewportHeight(); positionReasoningMenu(); }, 100);
      setTimeout(() => { updateViewportHeight(); positionReasoningMenu(); }, 300);
    });

    if (elements.userInput) {
      elements.userInput.addEventListener('focus', () => {
        setTimeout(() => {
          updateViewportHeight();
          positionReasoningMenu();
          if (elements.userInput) {
            elements.userInput.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        }, 150);
      });
    }
  }

  // ==========================================================================
  // Escuchadores de Eventos
  // ==========================================================================

  function setupEventListeners() {
    setupViewportListeners();

    // Formulario de chat
    elements.chatForm.addEventListener('submit', function (e) {
      e.preventDefault();
      handleSendMessage();
    });

    // Tecla Enter y Pegado
    elements.userInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });

    elements.userInput.addEventListener('input', autoResizeTextarea);
    elements.userInput.addEventListener('paste', handlePasteEvent);

    // Botones de acción
    elements.btnStopStream.addEventListener('click', handleStopGeneration);

    // Limpiar conversación actual
    if (elements.btnClearChat) {
      elements.btnClearChat.addEventListener('click', resetConversation);
    }

    // Botón rápido de Idioma en la barra superior
    if (elements.btnLangQuick) {
      elements.btnLangQuick.addEventListener('click', () => {
        const nextLang = (appConfig.language === 'en') ? 'es' : 'en';
        applyLanguage(nextLang);
      });
    }

    if (elements.btnOpenSettings) {
      elements.btnOpenSettings.addEventListener('click', openSettingsModal);
    }
    if (elements.badgeServer) {
      elements.badgeServer.addEventListener('click', openSettingsModal);
    }
    if (elements.badgeModel) {
      elements.badgeModel.addEventListener('click', openSettingsModal);
    }

    // Barra Lateral de Chats (Sidebar)
    if (elements.btnToggleSidebar) {
      elements.btnToggleSidebar.addEventListener('click', toggleSidebar);
    }
    if (elements.btnCloseSidebar) {
      elements.btnCloseSidebar.addEventListener('click', closeSidebar);
    }
    if (elements.btnSidebarNewChat) {
      elements.btnSidebarNewChat.addEventListener('click', createNewSession);
    }
    if (elements.sidebarSearchInput) {
      elements.sidebarSearchInput.addEventListener('input', () => {
        renderSidebarChats(elements.sidebarSearchInput.value);
      });
    }
    if (elements.btnImportChatFile && elements.importJsonInput) {
      elements.btnImportChatFile.addEventListener('click', () => elements.importJsonInput.click());
      elements.importJsonInput.addEventListener('change', handleImportFileSelected);
    }
    if (elements.btnDeleteAllChats) {
      elements.btnDeleteAllChats.addEventListener('click', deleteAllSessions);
    }

    // Modal de Exportación
    if (elements.btnOpenExportModal) {
      elements.btnOpenExportModal.addEventListener('click', openExportModal);
    }
    if (elements.btnQuickExport) {
      elements.btnQuickExport.addEventListener('click', openExportModal);
    }
    if (elements.btnCloseExport) {
      elements.btnCloseExport.addEventListener('click', closeExportModal);
    }
    if (elements.btnCancelExport) {
      elements.btnCancelExport.addEventListener('click', closeExportModal);
    }
    if (elements.btnExportMarkdown) {
      elements.btnExportMarkdown.addEventListener('click', exportConversationAsMarkdown);
    }
    if (elements.btnExportJson) {
      elements.btnExportJson.addEventListener('click', exportConversationAsJson);
    }
    if (elements.btnExportPrint) {
      elements.btnExportPrint.addEventListener('click', exportConversationAsPrint);
    }

    // Razonamiento (Thinking)
    if (elements.btnReasoning) {
      elements.btnReasoning.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleReasoningMenu();
      });
    }

    document.addEventListener('click', (e) => {
      if (elements.reasoningMenu && elements.reasoningMenu.style.display !== 'none') {
        const isClickInsideMenu = elements.reasoningMenu.contains(e.target);
        const isClickInsideButton = elements.btnReasoning && elements.btnReasoning.contains(e.target);
        if (!isClickInsideMenu && !isClickInsideButton) {
          closeReasoningMenu();
        }
      }
    });

    // Panel de Debug & Logs
    if (elements.btnToggleDebug) {
      elements.btnToggleDebug.addEventListener('click', () => {
        toggleDebugPanel();
      });
    }

    if (elements.btnCloseDebug) {
      elements.btnCloseDebug.addEventListener('click', () => {
        toggleDebugPanel(false);
      });
    }

    if (elements.btnClearDebug) {
      elements.btnClearDebug.addEventListener('click', clearDebugLogs);
    }

    if (elements.btnCopyDebug) {
      elements.btnCopyDebug.addEventListener('click', copyDebugLogs);
    }

    if (elements.btnToggleAutoscroll) {
      elements.btnToggleAutoscroll.addEventListener('click', () => {
        isDebugAutoscroll = !isDebugAutoscroll;
        elements.btnToggleAutoscroll.classList.toggle('active', isDebugAutoscroll);
      });
    }

    if (elements.debugTabs && elements.debugTabs.length > 0) {
      elements.debugTabs.forEach(tab => {
        tab.addEventListener('click', () => {
          elements.debugTabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          const filter = tab.getAttribute('data-debug-tab') || 'all';
          filterDebugLogs(filter);
        });
      });
    }

    function syncRawLogsState(enabled) {
      appConfig.enableRawLogs = Boolean(enabled);
      if (Debug.setRawLogsEnabled) Debug.setRawLogsEnabled(enabled);
      if (elements.chkEnableRaw) elements.chkEnableRaw.checked = enabled;
      if (elements.settingEnableRawLogs) elements.settingEnableRawLogs.checked = enabled;
      if (elements.rawStatusBadge) {
        elements.rawStatusBadge.className = enabled ? 'raw-status-badge active' : 'raw-status-badge';
        elements.rawStatusBadge.textContent = enabled ? t('raw_status_active') : t('raw_status_inactive');
      }
      if (Storage.saveConfig) Storage.saveConfig(appConfig);
    }

    if (elements.chkEnableRaw) {
      elements.chkEnableRaw.addEventListener('change', () => {
        syncRawLogsState(elements.chkEnableRaw.checked);
      });
    }

    if (elements.settingEnableRawLogs) {
      elements.settingEnableRawLogs.addEventListener('change', () => {
        syncRawLogsState(elements.settingEnableRawLogs.checked);
      });
    }

    if (elements.chkEnableDebugMessages) {
      elements.chkEnableDebugMessages.addEventListener('change', () => {
        syncDebugMessagesState(elements.chkEnableDebugMessages.checked);
      });
    }

    // Adjuntos de archivos
    elements.btnAttachFile.addEventListener('click', () => {
      elements.fileInput.click();
    });

    elements.fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        processFiles(Array.from(e.target.files));
      }
    });

    // Soporte de Arrastrar y Soltar (Drag and Drop)
    elements.chatForm.addEventListener('dragover', (e) => {
      e.preventDefault();
      elements.chatForm.classList.add('drag-over');
    });

    elements.chatForm.addEventListener('dragleave', () => {
      elements.chatForm.classList.remove('drag-over');
    });

    elements.chatForm.addEventListener('drop', (e) => {
      e.preventDefault();
      elements.chatForm.classList.remove('drag-over');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processFiles(Array.from(e.dataTransfer.files));
      }
    });

    // Modal de Configuración
    elements.btnCloseSettings.addEventListener('click', closeSettingsModal);
    elements.btnCancelSettings.addEventListener('click', closeSettingsModal);
    elements.settingsForm.addEventListener('submit', handleSaveSettings);
    elements.btnResetSettings.addEventListener('click', handleResetSettings);
    if (elements.btnClearAllData) {
      elements.btnClearAllData.addEventListener('click', handleClearAllData);
    }

    if (elements.settingApiType) {
      elements.settingApiType.addEventListener('change', function () {
        const val = this.value;
        const currentUrl = elements.settingApiUrl ? elements.settingApiUrl.value.trim() : '';

        const isDefaultOrEmpty = !currentUrl ||
          currentUrl === 'http://localhost:1234/v1' ||
          currentUrl === 'http://localhost:11434' ||
          currentUrl === 'https://api.openai.com/v1' ||
          currentUrl === 'https://openrouter.ai/api/v1' ||
          currentUrl === 'https://api.anthropic.com/v1' ||
          currentUrl === 'https://generativelanguage.googleapis.com/v1beta/openai';

        if (isDefaultOrEmpty && elements.settingApiUrl) {
          if (val === 'openai') elements.settingApiUrl.value = 'http://localhost:1234/v1';
          else if (val === 'ollama') elements.settingApiUrl.value = 'http://localhost:11434';
          else if (val === 'openrouter') elements.settingApiUrl.value = 'https://openrouter.ai/api/v1';
          else if (val === 'claude') elements.settingApiUrl.value = 'https://api.anthropic.com/v1';
          else if (val === 'gemini') elements.settingApiUrl.value = 'https://generativelanguage.googleapis.com/v1beta/openai';
        }
      });
    }

    if (elements.btnQueryServer) {
      elements.btnQueryServer.addEventListener('click', (e) => {
        e.preventDefault();
        handleQueryServer();
      });
    }

    if (elements.btnRunInspector) {
      elements.btnRunInspector.addEventListener('click', (e) => {
        e.preventDefault();
        handleRunInspector();
      });
    }

    if (elements.modelSelectHelper) {
      elements.modelSelectHelper.addEventListener('change', function () {
        if (this.value) {
          elements.settingModel.value = this.value;
        }
      });
    }

    if (elements.settingModel) {
      elements.settingModel.addEventListener('input', function () {
        const val = this.value.trim();
        if (elements.modelSelectHelper) {
          elements.modelSelectHelper.value = val;
        }
      });

      elements.settingModel.addEventListener('change', function () {
        const val = this.value.trim();
        if (elements.modelSelectHelper) {
          elements.modelSelectHelper.value = val;
        }
      });
    }

    if (elements.modalTabs && elements.modalTabs.length > 0) {
      elements.modalTabs.forEach(tabBtn => {
        tabBtn.addEventListener('click', function (e) {
          e.preventDefault();
          const targetTabId = tabBtn.getAttribute('data-tab');
          if (!targetTabId) return;

          elements.modalTabs.forEach(b => b.classList.remove('active'));
          elements.modalPanes.forEach(p => p.classList.remove('active'));

          tabBtn.classList.add('active');
          const targetPane = document.getElementById(targetTabId);
          if (targetPane) {
            targetPane.classList.add('active');
          }
        });
      });
    }

    if (elements.themeButtons && elements.themeButtons.length > 0) {
      elements.themeButtons.forEach(btn => {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          const targetTheme = btn.getAttribute('data-theme') || 'light';
          applyTheme(targetTheme);
          if (Storage.saveConfig) {
            Storage.saveConfig({ theme: targetTheme });
          }
        });
      });
    }

    if (elements.langButtons && elements.langButtons.length > 0) {
      elements.langButtons.forEach(btn => {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          const targetLang = btn.getAttribute('data-lang') || 'es';
          applyLanguage(targetLang);
        });
      });
    }

    elements.settingTemperature.addEventListener('input', function (e) {
      elements.temperatureVal.textContent = e.target.value;
    });

    elements.btnToggleKey.addEventListener('click', function () {
      const isPass = elements.settingApiKey.type === 'password';
      elements.settingApiKey.type = isPass ? 'text' : 'password';
      elements.btnToggleKey.textContent = isPass ? '🔒' : '👁️';
    });

    elements.settingsDialog.addEventListener('click', function (e) {
      if (e.target === elements.settingsDialog) {
        closeSettingsModal();
      }
    });

    // Sugerencias iniciales
    document.querySelectorAll('.suggestion-card').forEach(function (card) {
      card.addEventListener('click', function () {
        const prompt = card.getAttribute('data-prompt');
        if (prompt) {
          elements.userInput.value = prompt;
          autoResizeTextarea();
          handleSendMessage();
        }
      });
    });
  }

  function init() {
    cacheDomElements();
    if (Debug.setElements) Debug.setElements(elements);
    if (Debug.setRawLogsEnabled) Debug.setRawLogsEnabled(appConfig.enableRawLogs);

    if (State.setState) {
      State.setState({
        config: appConfig,
        sessions: { activeId: currentSessionId, list: savedSessions }
      });
    }

    if (State.subscribe) {
      State.subscribe('streaming', (streamingState) => {
        isGenerating = Boolean(streamingState.isGenerating);
        if (elements.btnSend) elements.btnSend.disabled = isGenerating;
        if (elements.btnStopStream) elements.btnStopStream.style.display = isGenerating ? 'inline-flex' : 'none';
      });
    }

    loadCachedModels();
    updateUIFromConfig();
    loadSessionsFromStorage();
    setupEventListeners();

    if (window.ChatTreeRagUI && window.ChatTreeRagUI.initTreeRagUI) {
      window.ChatTreeRagUI.initTreeRagUI();
    }

    window.ChatApp = {
      toggleReasoningMenu,
      updateReasoningUI,
      toggleDebugPanel,
      addDebugLog,
      clearDebugLogs,
      setDebugStatus,
      applyLanguage,
      switchToSession,
      createNewSession,
      deleteSession,
      renameSession,
      exportConversationAsMarkdown,
      exportConversationAsJson,
      exportConversationAsPrint
    };

    console.log('💬 ChatCLI v4.0 initialized successfully with Multi-chat Sidebar, GFM Tables, SVG Charts, Context Caching and Live Tools.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
