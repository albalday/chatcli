/**
 * Aplicación principal del cliente de chat Web (ChatCLI v2.0).
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
    sendDateTime: true
  };

  let chatHistory = [];
  let currentAbortController = null;
  let isGenerating = false;
  let attachedFiles = [];

  // Estado de sesiones múltiples (Sidebar)
  let currentSessionId = 'session_' + Date.now();
  let savedSessions = [];

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
      btnVoiceInput: document.getElementById('btn-voice-input'),

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
      settingEnableAgentJs: document.getElementById('setting-enable-agent-js'),
      settingEnableAgentWeb: document.getElementById('setting-enable-agent-web'),
      settingEnableAgentSearch: document.getElementById('setting-enable-agent-search'),
      settingEnableAgentChart: document.getElementById('setting-enable-agent-chart'),
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

    if (tools.length === 0) return '';

    if (isEs) {
      return `[HERRAMIENTAS Y FUNCIONES DISPONIBLES]:\nTienes disponibles las siguientes herramientas. Si necesitas consultar URLs, buscar en la web, leer documentos PDF o calcular, invoca la herramienta adecuada con sus parámetros obligatorios:\n${tools.join('\n')}\n*Instrucción de flujo:* Cuando obtengas el resultado de una herramienta, utilízalo para responder o invoca otra herramienta si necesitas más información.`;
    } else {
      return `[AVAILABLE TOOLS AND FUNCTIONS]:\nYou have the following tools available. If you need to fetch URLs, search the web, read PDF documents, or calculate, call the appropriate tool with its required parameters:\n${tools.join('\n')}\n*Workflow instruction:* Once you receive a tool's output, use it to answer the user or call another tool if you need more information.`;
    }
  }

  function buildEffectiveMessages() {
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
        messages.push({
          role: 'tool',
          tool_call_id: m.tool_call_id || `call_${Date.now()}`,
          name: m.name || 'tool',
          content: typeof m.content === 'object' ? JSON.stringify(m.content) : String(m.content || '')
        });
      } else if (m.role === 'system') {
        messages.push({ role: 'system', content: m.content || '' });
      }
    });

    const defaultPrompt = t('default_system_prompt');
    let activePrompt = (appConfig.systemPrompt && appConfig.systemPrompt.trim() !== '')
      ? appConfig.systemPrompt
      : defaultPrompt;

    const toolsGuide = getToolsSystemPromptGuide();
    if (toolsGuide) {
      activePrompt = activePrompt + '\n\n' + toolsGuide;
    }

    if (appConfig.sendDateTime !== false) {
      const now = new Date();
      const dtString = getFormattedDateTime();
      const currentYear = now.getFullYear();
      const timeContext = t('system_context_prefix', { datetime: dtString, year: currentYear });

      if (messages.length > 0 && messages[0].role === 'system') {
        messages[0].content = (messages[0].content || '') + timeContext;
      } else {
        messages.unshift({
          role: 'system',
          content: activePrompt + timeContext
        });
      }
    } else if (messages.length === 0 || messages[0].role !== 'system') {
      messages.unshift({
        role: 'system',
        content: activePrompt
      });
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

  function resetConversation() {
    if (isGenerating && currentAbortController) {
      currentAbortController.abort();
    }

    const defaultPrompt = t('default_system_prompt');
    chatHistory = [
      { id: 'system_root', role: 'system', content: appConfig.systemPrompt || defaultPrompt }
    ];

    // Limpiar sesión vacía previa y generar nuevo ID de sesión limpia
    if (Array.isArray(savedSessions)) {
      savedSessions = savedSessions.filter(s => s.id !== currentSessionId);
    }
    currentSessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    try {
      const serialized = JSON.stringify(savedSessions || []);
      if (Storage.setStorageItem) Storage.setStorageItem('chat_sessions', serialized);
      else localStorage.setItem('chat_sessions', serialized);
    } catch (e) {}

    if (elements.messagesList) {
      elements.messagesList.innerHTML = '';
      if (elements.welcomeBanner) {
        elements.messagesList.appendChild(elements.welcomeBanner);
        elements.welcomeBanner.style.display = 'block';
      }
    }

    clearAttachedFiles();
    if (elements.userInput) {
      elements.userInput.value = '';
      autoResizeTextarea();
      elements.userInput.focus();
    }

    renderSidebarChats();
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

      const res = await API.fetchServerModels(apiUrl, apiKey, apiType);

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

  function toggleReasoningMenu() {
    if (!elements.reasoningMenu) return;
    const isVisible = elements.reasoningMenu.style.display === 'block';
    if (isVisible) {
      closeReasoningMenu();
    } else {
      openReasoningMenu();
    }
  }

  function openReasoningMenu() {
    if (!elements.reasoningMenu) return;
    elements.reasoningMenu.style.display = 'block';

    const apiType = appConfig.apiType || (elements.settingApiType ? elements.settingApiType.value : 'openai');
    const reasoningConfig = API.getStandardReasoningOptions
      ? API.getStandardReasoningOptions(apiType, appConfig.apiUrl)
      : { levels: ['off', 'low', 'medium', 'high'], label: 'OpenAI / LM Studio' };

    if (elements.reasoningModelBadge) {
      elements.reasoningModelBadge.textContent = reasoningConfig.label || apiType.toUpperCase();
      elements.reasoningModelBadge.title = `Protocol: ${reasoningConfig.label || apiType}`;
    }

    renderReasoningMenuOptions(reasoningConfig, appConfig.reasoningEffort || 'off');
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
    }
  }

  // ==========================================================================
  // Panel Lateral de Razonamiento, Streaming & Logs (Debug)
  // ==========================================================================

  let isDebugAutoscroll = true;
  let activeDebugFilter = 'all';
  let activeThinkingBlock = null;

  function toggleDebugPanel(forceOpen) {
    if (!elements.debugPanel) return;
    const isCurrentlyVisible = elements.debugPanel.style.display !== 'none';
    const shouldOpen = (forceOpen !== undefined) ? forceOpen : !isCurrentlyVisible;

    if (shouldOpen) {
      elements.debugPanel.style.display = 'flex';
      if (elements.btnToggleDebug) elements.btnToggleDebug.classList.add('active');
      if (isDebugAutoscroll && elements.debugLogContent) {
        elements.debugLogContent.scrollTop = elements.debugLogContent.scrollHeight;
      }
    } else {
      elements.debugPanel.style.display = 'none';
      if (elements.btnToggleDebug) elements.btnToggleDebug.classList.remove('active');
    }
  }

  function setDebugStatus(status, text) {
    if (!elements.debugStatusIndicator) return;
    elements.debugStatusIndicator.className = `debug-status-indicator ${status || 'idle'}`;
    let label = text;
    if (!label) {
      if (status === 'streaming') label = t('debug_status_streaming');
      else if (status === 'done') label = t('debug_status_done');
      else if (status === 'error') label = t('debug_status_error');
      else label = t('debug_status_idle');
    }
    elements.debugStatusIndicator.textContent = label;
  }

  function getFormattedTime() {
    const now = new Date();
    return now.toTimeString().split(' ')[0];
  }

  function clearDebugLogs() {
    if (!elements.debugLogContent) return;
    elements.debugLogContent.innerHTML = `
      <div class="debug-entry debug-entry-system" data-type="system">
        <span class="debug-time">[${getFormattedTime()}]</span>
        <span class="debug-tag system">[${t('debug_tag_system')}]</span>
        <span class="debug-msg">${t('debug_sys_cleared')}</span>
      </div>
    `;
    activeThinkingBlock = null;
  }

  async function copyDebugLogs() {
    if (!elements.debugLogContent || !elements.btnCopyDebug) return;
    try {
      const text = elements.debugLogContent.innerText;
      await navigator.clipboard.writeText(text);
      const originalText = elements.btnCopyDebug.textContent;
      elements.btnCopyDebug.textContent = '✅';
      setTimeout(() => {
        elements.btnCopyDebug.textContent = originalText;
      }, 1500);
    } catch (e) {
      console.error('Error al copiar logs:', e);
    }
  }

  function addDebugLog(type, text, rawData) {
    if (!elements.debugLogContent) return;

    if (type === 'thinking') {
      if (!activeThinkingBlock) {
        const entry = document.createElement('div');
        entry.className = 'debug-entry debug-entry-thinking';
        entry.setAttribute('data-type', 'thinking');
        entry.innerHTML = `
          <div class="debug-entry-header">
            <span class="debug-time">[${getFormattedTime()}]</span>
            <span class="debug-tag thinking">🧠 ${t('debug_tag_thinking')}</span>
          </div>
          <div class="debug-msg"></div>
        `;
        elements.debugLogContent.appendChild(entry);
        activeThinkingBlock = entry.querySelector('.debug-msg');

        if (activeDebugFilter !== 'all' && activeDebugFilter !== 'thinking') {
          entry.style.display = 'none';
        }
      }

      if (activeThinkingBlock) {
        activeThinkingBlock.textContent += text;
      }

      if (isDebugAutoscroll) {
        elements.debugLogContent.scrollTop = elements.debugLogContent.scrollHeight;
      }
      return;
    }

    activeThinkingBlock = null;

    const entry = document.createElement('div');
    entry.className = `debug-entry debug-entry-${type || 'info'}`;
    entry.setAttribute('data-type', type || 'info');

    let tagLabel = t('debug_tag_info');
    if (type === 'network') tagLabel = t('debug_tag_network');
    else if (type === 'thinking') tagLabel = t('debug_tag_thinking');
    else if (type === 'tool') tagLabel = t('debug_tag_tool');
    else if (type === 'stats') tagLabel = t('debug_tag_stats');
    else if (type === 'error') tagLabel = t('debug_tag_error');
    else if (type === 'system') tagLabel = t('debug_tag_system');

    entry.innerHTML = `
      <div class="debug-entry-header">
        <span class="debug-time">[${getFormattedTime()}]</span>
        <span class="debug-tag ${type || 'info'}">[${tagLabel}]</span>
      </div>
      <div class="debug-msg">${Markdown.escapeHtml(text)}</div>
    `;

    if (activeDebugFilter !== 'all') {
      const match = (activeDebugFilter === type) || (activeDebugFilter === 'tool' && type === 'tool') || (activeDebugFilter === 'network' && (type === 'network' || type === 'stats'));
      if (!match) entry.style.display = 'none';
    }

    elements.debugLogContent.appendChild(entry);

    if (isDebugAutoscroll) {
      elements.debugLogContent.scrollTop = elements.debugLogContent.scrollHeight;
    }
  }

  function filterDebugLogs(tabId) {
    activeDebugFilter = tabId;
    if (!elements.debugLogContent) return;

    const entries = elements.debugLogContent.querySelectorAll('.debug-entry');
    entries.forEach(entry => {
      const type = entry.getAttribute('data-type');
      if (tabId === 'all') {
        entry.style.display = 'flex';
      } else if (tabId === 'thinking') {
        entry.style.display = type === 'thinking' ? 'flex' : 'none';
      } else if (tabId === 'tool') {
        entry.style.display = type === 'tool' ? 'flex' : 'none';
      } else if (tabId === 'network') {
        entry.style.display = (type === 'network' || type === 'stats') ? 'flex' : 'none';
      }
    });
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
    if (!elements.attachmentsContainer) return;

    if (attachedFiles.length === 0) {
      elements.attachmentsContainer.innerHTML = '';
      elements.attachmentsContainer.style.display = 'none';
      return;
    }

    elements.attachmentsContainer.style.display = 'flex';
    elements.attachmentsContainer.innerHTML = '';

    attachedFiles.forEach((file, index) => {
      const chip = document.createElement('div');
      chip.className = 'file-chip';

      let icon = '📄';
      if (file.type === 'pdf') icon = '📕';
      else if (file.type === 'image') icon = '🖼️';

      chip.innerHTML = `
        <span class="file-chip-icon">${icon}</span>
        <span class="file-chip-name" title="${file.name}">${file.name}</span>
        <span class="file-chip-size">(${FileParser.formatBytes(file.size)})</span>
        <button type="button" class="btn-remove-chip" data-index="${index}" title="Remove">×</button>
      `;

      chip.querySelector('.btn-remove-chip').addEventListener('click', () => {
        removeAttachedFile(index);
      });

      elements.attachmentsContainer.appendChild(chip);
    });
  }

  function removeAttachedFile(index) {
    attachedFiles.splice(index, 1);
    renderAttachedFiles();
  }

  function clearAttachedFiles() {
    attachedFiles = [];
    renderAttachedFiles();
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
        attachedFiles.push(parsed);
      } catch (err) {
        console.error(`Error processing file ${file.name}:`, err);
        alert(t('err_file_process', { name: file.name, err: err.message || err }));
      }
    }
    renderAttachedFiles();
    elements.userInput.focus();
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

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = t('user_avatar');

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

    row.appendChild(avatar);
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

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 8V4H8"></path>
        <rect width="16" height="12" x="4" y="8" rx="2"></rect>
        <path d="M2 14h2"></path>
        <path d="M20 14h2"></path>
        <path d="M15 13v2"></path>
        <path d="M9 13v2"></path>
      </svg>
    `;

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'message-content-wrapper';

    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = '<span class="streaming-cursor"></span>';

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

    const btnSpeak = document.createElement('button');
    btnSpeak.type = 'button';
    btnSpeak.className = 'btn-msg-action btn-msg-speak';
    btnSpeak.innerHTML = `🔊 <span>${t('btn_speak')}</span>`;
    btnSpeak.title = t('btn_speak_title');
    btnSpeak.addEventListener('click', () => toggleSpeakMessage(content.innerText || content.textContent, btnSpeak));

    const btnDelete = document.createElement('button');
    btnDelete.type = 'button';
    btnDelete.className = 'btn-msg-action btn-delete';
    btnDelete.innerHTML = `🗑️ <span>${t('btn_delete')}</span>`;
    btnDelete.title = t('btn_delete_ast_title');
    btnDelete.addEventListener('click', () => removeMessage(wrapper));

    actions.appendChild(btnCopy);
    actions.appendChild(btnSpeak);
    actions.appendChild(btnDelete);

    footerRow.appendChild(statsContainer);
    footerRow.appendChild(actions);

    contentWrapper.appendChild(content);
    contentWrapper.appendChild(footerRow);

    row.appendChild(avatar);
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
    if ((!rawText && attachedFiles.length === 0) || isGenerating) return;

    let fullPrompt = rawText;
    let displayText = rawText;
    let imageAttachments = [];

    if (attachedFiles.length > 0) {
      imageAttachments = attachedFiles.filter(f => f.type === 'image' && f.dataUrl).map(f => ({
        name: f.name,
        dataUrl: f.dataUrl,
        mimeType: f.mimeType || 'image/jpeg'
      }));

      const attachmentsText = attachedFiles.map(file => {
        if (file.type === 'pdf') {
          return `\n\n--- PDF Document: ${file.name} (${FileParser.formatBytes(file.size)}) ---\n\`\`\`text\n${file.content}\n\`\`\``;
        } else if (file.type === 'image') {
          return `\n\n--- Image: ${file.name} (${FileParser.formatBytes(file.size)}) ---`;
        }
        return `\n\n--- File: ${file.name} (${FileParser.formatBytes(file.size)}) ---\n\`\`\`\n${file.content}\n\`\`\``;
      }).join('');

      fullPrompt = rawText ? `${rawText}\n${attachmentsText}` : `Attached files for analysis:${attachmentsText}`;
      
      const fileNamesList = attachedFiles.map(f => {
        const icon = f.type === 'pdf' ? '📕' : f.type === 'image' ? '🖼️' : '📎';
        return `${icon} ${f.name}`;
      }).join(', ');
      displayText = rawText ? `${rawText}\n\n[${fileNamesList}]` : `[${fileNamesList}]`;
    }

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

    isGenerating = true;
    elements.btnSend.disabled = true;
    elements.btnStopStream.style.display = 'inline-flex';

    currentAbortController = new AbortController();
    const { wrapper, row, content, actions, btnCopy, statsContainer, msgId: assistantMsgId } = createAssistantMessagePlaceholder();

    let accumulatedText = '';
    const parseMd = Markdown.parseMarkdown || function(txt) { return txt; };
    const attachListeners = Markdown.attachCopyCodeListeners || function() {};

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
      statsContainer.innerHTML = `
        <span class="stat-item" title="${t('stat_ttft_title')}">${t('stat_ttft', { sec: stats.ttftSec })}</span>
        <span>•</span>
        <span class="stat-item" title="${t('stat_speed_title')}">${t('stat_speed', { speed: stats.tokensPerSec })}</span>
        <span>•</span>
        <span class="stat-item" title="${t('stat_total_time_title')}">${t('stat_total_time', { sec: stats.totalSec })}</span>
        <span>•</span>
        <span class="stat-item" title="${t('stat_tokens_title')}">${t('stat_tokens', { tokens: stats.tokens })}</span>
      `;
    }

    const maxAgentTurns = 5;
    let turnIndex = 0;
    let accumulatedConversationMarkdown = '';

    while (turnIndex < maxAgentTurns) {
      if (currentAbortController && currentAbortController.signal.aborted) {
        break;
      }

      let currentTurnText = '';
      const turnBlock = document.createElement('div');
      turnBlock.className = 'agentic-turn-block';
      content.appendChild(turnBlock);

      let turnToolCalls = null;
      let turnFinalStats = null;
      let streamError = null;

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
        signal: currentAbortController.signal,

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
          turnBlock.innerHTML = parseMd(currentTurnText) + '<span class="streaming-cursor"></span>';
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

      if (streamError) {
        if (currentAbortController && currentAbortController.signal.aborted) {
          break;
        }
        setDebugStatus('error', t('debug_status_error'));
        addDebugLog('error', streamError.message || String(streamError));
        row.classList.add('message-error');
        turnBlock.innerHTML = `
          <div style="display:flex; align-items:flex-start; gap:0.5rem;">
            <span>⚠️</span>
            <div>
              <strong>${t('err_server_connect')}</strong>
              <p style="margin-top: 0.25rem;">${streamError.message || streamError}</p>
              <p style="margin-top: 0.5rem; font-size: 0.85em; opacity: 0.9;">
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

      // Si no hay herramientas para ejecutar, es la respuesta final -> salir del bucle
      if (!turnToolCalls || turnToolCalls.length === 0) {
        turnBlock.innerHTML = parseMd(currentTurnText || t('empty_response'));
        attachListeners(turnBlock);
        chatHistory.push({ id: assistantMsgId, role: 'assistant', content: currentTurnText });

        if (turnFinalStats) updateStatsDisplay(turnFinalStats);
        setDebugStatus('done', t('debug_status_done'));

        actions.style.display = 'inline-flex';
        btnCopy.addEventListener('click', async () => {
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
        });

        finishGeneration();
        return;
      }

      // Procesar llamada a herramienta
      const tc = turnToolCalls[0];
      const rawFuncName = tc.function?.name || '';
      const normName = API.normalizeToolName ? API.normalizeToolName(rawFuncName) : rawFuncName.toLowerCase().replace(/_/g, '');

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

        addDebugLog('tool', `execute_javascript:\n${codeToRun}`);
        const toolExecRes = await (Sandbox.execute ? Sandbox.execute(codeToRun) : { success: false, error: 'Sandbox not available' });
        const outputText = toolExecRes.success
          ? (toolExecRes.result || (toolExecRes.logs && toolExecRes.logs.length > 0 ? toolExecRes.logs.join('\n') : 'undefined'))
          : `Error: ${toolExecRes.error}`;

        addDebugLog('tool', `execute_javascript output (${toolExecRes.executionTimeMs || 0}ms):\n${outputText}`);

        const toolCardHtml = `
          <div class="tool-execution-card">
            <div class="tool-card-header">
              <span>${t('tool_js_title', { ms: toolExecRes.executionTimeMs || 0 })}</span>
            </div>
            <pre class="tool-card-code"><code>${Markdown.escapeHtml(codeToRun)}</code></pre>
            <div class="tool-card-result"><strong>${t('tool_sandbox_output')}</strong>\n${Markdown.escapeHtml(outputText)}</div>
          </div>
        `;

        const cardDiv = document.createElement('div');
        cardDiv.innerHTML = toolCardHtml;
        content.appendChild(cardDiv);
        attachListeners(content);
        if (turnFinalStats) updateStatsDisplay(turnFinalStats);
        scrollToBottom();

        chatHistory.push({
          id: assistantMsgId,
          role: 'assistant',
          content: currentTurnText || null,
          tool_calls: [tc]
        });

        chatHistory.push({
          id: assistantMsgId,
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

        addDebugLog('tool', `${normName}: ${urlToFetch}`);
        const webRes = await (WebBrowser.fetchPage ? WebBrowser.fetchPage(urlToFetch) : { success: false, url: urlToFetch, content: '', error: 'Web module not available' });
        const isPdfResult = webRes.isPdf || isPdfCall;

        const statusBadgeText = webRes.success
          ? (isPdfResult ? `PDF (${webRes.byteSize ? FileParser.formatBytes(webRes.byteSize) : 'OK'}) [${webRes.elapsedMs || 0}ms]` : `HTTP ${webRes.status || 200} OK (${webRes.elapsedMs || 0}ms)`)
          : `Error (${webRes.elapsedMs || 0}ms)`;

        const cardIcon = isPdfResult ? '📄' : '🌐';
        const cardTitle = isPdfResult ? t('tool_pdf_title') : t('tool_web_title');

        const responsePreview = webRes.success
          ? (webRes.content || t('tool_web_empty'))
          : (webRes.error || t('tool_web_err_connect'));

        addDebugLog('tool', `${normName} (${statusBadgeText}) [${webRes.byteSize ? FileParser.formatBytes(webRes.byteSize) : '0 B'}]:\n${(responsePreview || '').substring(0, 200)}...`);

        const webCardHtml = `
          <div class="web-request-card ${isPdfResult ? 'pdf-request-card' : ''}">
            <div class="web-card-header">
              <div class="web-card-title">
                <span>${cardIcon}</span>
                <span>${cardTitle}</span>
              </div>
              <span class="web-card-badge">${statusBadgeText}</span>
            </div>
            <div class="web-card-section web-request-section">
              <div class="section-label">${t('tool_web_requested_url')}</div>
              <div class="url-badge"><a href="${Markdown.escapeHtml(webRes.url || urlToFetch)}" target="_blank" rel="noopener noreferrer">${Markdown.escapeHtml(webRes.url || urlToFetch)}</a></div>
            </div>
            <div class="web-card-section web-response-section">
              <div class="section-label">${t('tool_web_content_received', { size: webRes.byteSize ? FileParser.formatBytes(webRes.byteSize) : (webRes.content ? webRes.content.length + ' chars' : '0 B') })}</div>
              <pre class="web-response-body"><code>${Markdown.escapeHtml(responsePreview)}</code></pre>
            </div>
          </div>
        `;

        const cardDiv = document.createElement('div');
        cardDiv.innerHTML = webCardHtml;
        content.appendChild(cardDiv);
        attachListeners(content);
        if (turnFinalStats) updateStatsDisplay(turnFinalStats);
        scrollToBottom();

        chatHistory.push({
          id: assistantMsgId,
          role: 'assistant',
          content: currentTurnText || null,
          tool_calls: [tc]
        });

        chatHistory.push({
          id: assistantMsgId,
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

        addDebugLog('tool', `search_web: "${queryToSearch}"`);
        const searchRes = await (WebSearch.search ? WebSearch.search(queryToSearch, appConfig.language || 'es') : { success: false, query: queryToSearch, count: 0, results: [], markdown: 'Módulo de búsqueda no disponible', elapsedMs: 0 });
        const statusBadgeText = `${searchRes.count} fuentes (${searchRes.elapsedMs || 0}ms)`;

        addDebugLog('tool', `search_web (${searchRes.count} resultados) [${searchRes.elapsedMs || 0}ms]:\n${(searchRes.markdown || '').substring(0, 200)}...`);

        let resultsHtml = '';
        if (searchRes.results && searchRes.results.length > 0) {
          resultsHtml = '<div class="search-results-list">' + searchRes.results.map(r => `
            <div class="search-result-item">
              <div><a href="${Markdown.escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">🔗 ${Markdown.escapeHtml(r.title)}</a> <small style="opacity:0.75;">(${Markdown.escapeHtml(r.source)})</small></div>
              ${r.snippet ? `<div class="search-result-snippet">${Markdown.escapeHtml(r.snippet)}</div>` : ''}
            </div>
          `).join('') + '</div>';
        } else {
          resultsHtml = `<div class="search-result-snippet"><em>${t('tool_search_empty')}</em></div>`;
        }

        const searchCardHtml = `
          <div class="web-search-card">
            <div class="web-card-header">
              <div class="web-card-title">
                <span>🔍</span>
                <span>${t('tool_search_title')}</span>
              </div>
              <span class="web-card-badge">${statusBadgeText}</span>
            </div>
            <div class="web-card-section">
              <div class="section-label">${t('tool_search_query')}</div>
              <div class="query-badge">"${Markdown.escapeHtml(queryToSearch)}"</div>
            </div>
            <div class="web-card-section">
              <div class="section-label">${t('tool_search_results', { count: searchRes.count })}</div>
              ${resultsHtml}
            </div>
          </div>
        `;

        const cardDiv = document.createElement('div');
        cardDiv.innerHTML = searchCardHtml;
        content.appendChild(cardDiv);
        attachListeners(content);
        if (turnFinalStats) updateStatsDisplay(turnFinalStats);
        scrollToBottom();

        chatHistory.push({
          id: assistantMsgId,
          role: 'assistant',
          content: currentTurnText || null,
          tool_calls: [tc]
        });

        chatHistory.push({
          id: assistantMsgId,
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

        const chartHtml = (Charts.renderChartCard ? Charts.renderChartCard(chartArgs) : '<div class="chat-chart-card">Gráfico generado</div>');
        const cardDiv = document.createElement('div');
        cardDiv.innerHTML = chartHtml;
        content.appendChild(cardDiv);
        attachListeners(content);
        if (turnFinalStats) updateStatsDisplay(turnFinalStats);
        scrollToBottom();

        chatHistory.push({
          id: assistantMsgId,
          role: 'assistant',
          content: currentTurnText || null,
          tool_calls: [tc]
        });

        chatHistory.push({
          id: assistantMsgId,
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
    }

    setDebugStatus('done', t('debug_status_done'));
    finishGeneration();
  }

  function finishGeneration() {
    isGenerating = false;
    currentAbortController = null;
    if (elements.btnSend) elements.btnSend.disabled = false;
    if (elements.btnStopStream) elements.btnStopStream.style.display = 'none';
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
      sendDateTime: elements.settingSendDateTime ? elements.settingSendDateTime.checked : true
    };

    if (Storage.saveConfig) {
      Storage.saveConfig(newConfig);
    }
    appConfig = newConfig;

    if (chatHistory.length > 0 && chatHistory[0].role === 'system') {
      chatHistory[0].content = appConfig.systemPrompt || t('default_system_prompt');
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
      if (elements.settingSendDateTime) {
        elements.settingSendDateTime.checked = defaults.sendDateTime !== false;
      }
    }
  }

  // ==========================================================================
  // Gestión de Múltiples Sesiones de Chat (Sidebar & Storage)
  // ==========================================================================

  function loadSessionsFromStorage() {
    try {
      const raw = Storage.getStorageItem ? Storage.getStorageItem('chat_sessions') : localStorage.getItem('chat_sessions');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          savedSessions = parsed.filter(s => s && Array.isArray(s.history) && s.history.some(m => m && m.role !== 'system'));
        }
      }
    } catch (e) {
      console.warn('Error al cargar sesiones de chat:', e);
    }

    if (!savedSessions) {
      savedSessions = [];
    }

    // Siempre iniciar en un chat nuevo y vacío al abrir o recargar la página (F5 / Ctrl+F5)
    currentSessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const defaultPrompt = t('default_system_prompt');
    chatHistory = [
      { id: 'system_root', role: 'system', content: appConfig.systemPrompt || defaultPrompt }
    ];

    renderSessionMessages(chatHistory);
    renderSidebarChats();
  }

  function saveCurrentSession() {
    const hasMessages = Array.isArray(chatHistory) && chatHistory.some(m => m && m.role !== 'system');
    
    // Si la conversación está vacía (o se han borrado todos los mensajes), no guardarla como sesión activa
    if (!hasMessages) {
      if (Array.isArray(savedSessions)) {
        savedSessions = savedSessions.filter(s => s.id !== currentSessionId);
        try {
          const serialized = JSON.stringify(savedSessions);
          if (Storage.setStorageItem) Storage.setStorageItem('chat_sessions', serialized);
          else localStorage.setItem('chat_sessions', serialized);
        } catch (e) {}
      }
      renderSidebarChats();
      return;
    }

    let sess = savedSessions.find(s => s.id === currentSessionId);
    if (!sess) {
      sess = {
        id: currentSessionId,
        title: t('chat_untitled'),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        history: [...chatHistory]
      };
      savedSessions.unshift(sess);
    } else {
      sess.history = [...chatHistory];
      sess.updatedAt = Date.now();
    }

    // Auto-generar título si es el título genérico por defecto
    const isUntitled = !sess.title ||
      sess.title === t('chat_untitled') ||
      sess.title === 'Nueva conversación' ||
      sess.title === 'New conversation';

    if (isUntitled && chatHistory.length > 1) {
      const firstUser = chatHistory.find(m => m.role === 'user');
      if (firstUser && firstUser.content) {
        const rawContent = typeof firstUser.content === 'string' ? firstUser.content : (firstUser.content[0]?.text || '');
        const candidate = rawContent.split('\n')[0].replace(/[#*`_>\[\]]/g, '').trim();
        if (candidate) {
          sess.title = candidate.length > 35 ? candidate.substring(0, 32) + '…' : candidate;
        }
      }
    }

    try {
      const serialized = JSON.stringify(savedSessions);
      if (Storage.setStorageItem) Storage.setStorageItem('chat_sessions', serialized);
      else localStorage.setItem('chat_sessions', serialized);
    } catch (e) {}

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

  function switchToSession(sessionId) {
    if (sessionId === currentSessionId) return;
    saveCurrentSession();

    const target = savedSessions.find(s => s.id === sessionId);
    if (!target) return;

    currentSessionId = target.id;
    chatHistory = target.history ? [...target.history] : [
      { id: 'system_root', role: 'system', content: appConfig.systemPrompt || t('default_system_prompt') }
    ];

    renderSessionMessages(chatHistory);
    renderSidebarChats();

    if (window.innerWidth < 900) {
      closeSidebar();
    }
  }

  function createNewSession() {
    saveCurrentSession();

    currentSessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const defaultPrompt = t('default_system_prompt');
    chatHistory = [
      { id: 'system_root', role: 'system', content: appConfig.systemPrompt || defaultPrompt }
    ];

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

  function deleteSession(sessionId, event) {
    if (event) event.stopPropagation();
    if (!confirm(t('chat_delete_confirm'))) return;

    const idx = savedSessions.findIndex(s => s.id === sessionId);
    if (idx === -1) return;

    savedSessions.splice(idx, 1);

    if (savedSessions.length === 0) {
      createNewSession();
    } else if (currentSessionId === sessionId) {
      const next = savedSessions[0];
      currentSessionId = next.id;
      chatHistory = next.history ? [...next.history] : [
        { id: 'system_root', role: 'system', content: appConfig.systemPrompt || t('default_system_prompt') }
      ];
      renderSessionMessages(chatHistory);
    }

    try {
      const serialized = JSON.stringify(savedSessions);
      if (Storage.setStorageItem) Storage.setStorageItem('chat_sessions', serialized);
      else localStorage.setItem('chat_sessions', serialized);
    } catch (e) {}

    renderSidebarChats();
  }

  function renameSession(sessionId, event) {
    if (event) event.stopPropagation();
    const sess = savedSessions.find(s => s.id === sessionId);
    if (!sess) return;

    const newTitle = prompt('Nombre de la conversación:', sess.title || '');
    if (newTitle !== null && newTitle.trim() !== '') {
      sess.title = newTitle.trim();
      saveCurrentSession();
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

  function renderSessionMessages(history) {
    if (!elements.messagesList) return;
    elements.messagesList.innerHTML = '';

    const validMessages = (history || []).filter(m => m && m.role !== 'system');
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

    validMessages.forEach(msg => {
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
      } else if (msg.role === 'assistant') {
        const { content, actions, btnCopy } = createAssistantMessagePlaceholder(msg.id);
        let renderedHtml = '';

        if (msg.content) {
          renderedHtml = Markdown.renderMarkdown ? Markdown.renderMarkdown(msg.content) : msg.content;
        }

        content.innerHTML = renderedHtml || '<p><em>(Sin respuesta de texto)</em></p>';

        if (btnCopy) {
          btnCopy.addEventListener('click', () => {
            if (navigator.clipboard) {
              navigator.clipboard.writeText(msg.content || content.innerText);
              btnCopy.innerHTML = `✅ <span>${t('btn_copied')}</span>`;
              setTimeout(() => {
                btnCopy.innerHTML = `📋 <span>${t('btn_copy')}</span>`;
              }, 2000);
            }
          });
        }

        if (actions) actions.style.display = 'inline-flex';
        if (Markdown.attachCopyCodeListeners) {
          Markdown.attachCopyCodeListeners(content);
        }
      }
    });

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

    let md = `# ${title}\n\n*Fecha de exportación: ${new Date().toLocaleString()}*\n*Modelo: ${appConfig.model || 'No especificado'}*\n\n---\n\n`;

    chatHistory.forEach(m => {
      if (m.role === 'user') {
        const contentStr = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        md += `### 👤 Usuario\n\n${contentStr}\n\n---\n\n`;
      } else if (m.role === 'assistant' && m.content) {
        md += `### 🤖 Asistente\n\n${m.content}\n\n---\n\n`;
      }
    });

    downloadBlob(md, `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${dateStr}.md`, 'text/markdown');
    closeExportModal();
  }

  function exportConversationAsJson() {
    const sess = savedSessions.find(s => s.id === currentSessionId);
    const title = (sess && sess.title) || 'ChatCLI_Conversation';
    const dateStr = new Date().toISOString().slice(0, 10);

    const exportData = {
      version: '2.1',
      app: 'ChatCLI',
      exportedAt: new Date().toISOString(),
      session: sess || {
        id: currentSessionId,
        title: title,
        history: chatHistory
      },
      config: {
        model: appConfig.model,
        apiUrl: appConfig.apiUrl,
        apiType: appConfig.apiType
      }
    };

    const jsonStr = JSON.stringify(exportData, null, 2);
    downloadBlob(jsonStr, `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${dateStr}.json`, 'application/json');
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
        const data = JSON.parse(evt.target.result);
        const importedSession = data.session || data;

        if (!importedSession.history || !Array.isArray(importedSession.history)) {
          alert('El archivo no contiene un historial de chat válido.');
          return;
        }

        const newId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const newSession = {
          id: newId,
          title: importedSession.title || file.name.replace('.json', ''),
          createdAt: importedSession.createdAt || Date.now(),
          updatedAt: Date.now(),
          history: importedSession.history
        };

        savedSessions.unshift(newSession);
        currentSessionId = newId;
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

  function downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ==========================================================================
  // Dictado por Voz (Speech-to-Text) y Lectura en Voz Alta (Text-to-Speech)
  // ==========================================================================

  let speechRecognition = null;
  let isListening = false;
  let activeSpeakingButton = null;

  function setupVoiceInput() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      if (elements.btnVoiceInput) {
        elements.btnVoiceInput.style.opacity = '0.5';
        elements.btnVoiceInput.title = t('voice_not_supported');
      }
      return;
    }

    speechRecognition = new SpeechRec();
    speechRecognition.continuous = false;
    speechRecognition.interimResults = true;

    speechRecognition.onstart = function() {
      isListening = true;
      if (elements.btnVoiceInput) {
        elements.btnVoiceInput.classList.add('recording');
        const icon = elements.btnVoiceInput.querySelector('.voice-mic-icon');
        if (icon) icon.textContent = '🔴';
      }
    };

    speechRecognition.onresult = function(event) {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      if (transcript && elements.userInput) {
        elements.userInput.value = (elements.userInput.value ? elements.userInput.value + ' ' : '') + transcript;
        autoResizeTextarea();
      }
    };

    speechRecognition.onerror = function() {
      stopVoiceInput();
    };

    speechRecognition.onend = function() {
      stopVoiceInput();
    };

    if (elements.btnVoiceInput) {
      elements.btnVoiceInput.addEventListener('click', () => {
        if (isListening) {
          stopVoiceInput();
        } else {
          startVoiceInput();
        }
      });
    }
  }

  function startVoiceInput() {
    if (!speechRecognition) return;
    const lang = appConfig.language || (I18n.getLanguage ? I18n.getLanguage() : 'es');
    speechRecognition.lang = (lang === 'en') ? 'en-US' : 'es-ES';
    try {
      speechRecognition.start();
    } catch (e) {}
  }

  function stopVoiceInput() {
    isListening = false;
    if (speechRecognition) {
      try { speechRecognition.stop(); } catch(e) {}
    }
    if (elements.btnVoiceInput) {
      elements.btnVoiceInput.classList.remove('recording');
      const icon = elements.btnVoiceInput.querySelector('.voice-mic-icon');
      if (icon) icon.textContent = '🎙️';
    }
  }

  function cleanTextForSpeech(raw) {
    if (!raw) return '';
    return raw
      .replace(/```[\s\S]*?```/g, ' [Bloque de código omitido] ')
      .replace(/`[^`]+`/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#*>\-_~|]/g, ' ')
      .replace(/https?:\/\/\S+/g, ' enlace ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function toggleSpeakMessage(text, buttonElement) {
    if (!window.speechSynthesis) return;

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      if (activeSpeakingButton) {
        activeSpeakingButton.classList.remove('speaking');
        activeSpeakingButton.innerHTML = `🔊 <span>${t('btn_speak')}</span>`;
        activeSpeakingButton.title = t('btn_speak_title');
      }
      if (activeSpeakingButton === buttonElement) {
        activeSpeakingButton = null;
        return;
      }
    }

    const clean = cleanTextForSpeech(text);
    if (!clean) return;

    const lang = appConfig.language || (I18n.getLanguage ? I18n.getLanguage() : 'es');
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = (lang === 'en') ? 'en-US' : 'es-ES';
    utter.rate = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const matchingVoice = voices.find(v => v.lang.startsWith(utter.lang.slice(0, 2)));
    if (matchingVoice) utter.voice = matchingVoice;

    utter.onstart = function() {
      activeSpeakingButton = buttonElement;
      buttonElement.classList.add('speaking');
      buttonElement.innerHTML = `⏹️ <span>${t('btn_stop_speak')}</span>`;
      buttonElement.title = t('btn_stop_speak_title');
    };

    utter.onend = function() {
      buttonElement.classList.remove('speaking');
      buttonElement.innerHTML = `🔊 <span>${t('btn_speak')}</span>`;
      buttonElement.title = t('btn_speak_title');
      activeSpeakingButton = null;
    };

    utter.onerror = function() {
      buttonElement.classList.remove('speaking');
      buttonElement.innerHTML = `🔊 <span>${t('btn_speak')}</span>`;
      buttonElement.title = t('btn_speak_title');
      activeSpeakingButton = null;
    };

    window.speechSynthesis.speak(utter);
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
  // Escuchadores de Eventos
  // ==========================================================================

  function setupEventListeners() {
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
      if (elements.reasoningMenu && !elements.reasoningMenu.contains(e.target) && e.target !== elements.btnReasoning) {
        closeReasoningMenu();
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
    loadCachedModels();
    updateUIFromConfig();
    setupVoiceInput();
    loadSessionsFromStorage();
    setupEventListeners();

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

    console.log('💬 ChatCLI v2.1 initialized successfully with Multi-chat Sidebar, SVG Charts, Voice STT/TTS and Export.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
