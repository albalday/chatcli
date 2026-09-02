/**
 * Aplicación principal del cliente de chat Web (ZeroChat v5.3).
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
  const AgentCore = window.ChatAgentCore || {};
  const Engine = window.ChatEngine || {};
  const UIReasoning = window.ChatUIReasoning || {};

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
    enabledTools: {
      execute_javascript: true,
      search_web: true,
      fetch_web_page: true,
      download_pdf: true,
      render_chart: true
    },
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

      badgeProfile: document.getElementById('badge-profile'),
      currentProfileName: document.getElementById('current-profile-name'),
      activeProfileSelect: document.getElementById('active-profile-select'),
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
      settingProfileName: document.getElementById('setting-profile-name'),
      profileSelectHelper: document.getElementById('profile-select-helper'),
      profileDatalist: document.getElementById('profile-datalist'),
      btnSaveProfile: document.getElementById('btn-save-profile'),
      btnDeleteProfile: document.getElementById('btn-delete-profile'),
      profileActionFeedback: document.getElementById('profile-action-feedback'),
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
      agentToolsContainer: document.getElementById('agent-tools-container'),
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
    return Engine.getDailyDateAnchor ? Engine.getDailyDateAnchor(appConfig.language || 'es') : '';
  }

  function getToolsSystemPromptGuide() {
    return Engine.getToolsSystemPromptGuide ? Engine.getToolsSystemPromptGuide(appConfig, appConfig.language || 'es') : '';
  }

  function buildEffectiveMessages(options = {}) {
    if (Engine.buildEffectiveMessages) {
      return Engine.buildEffectiveMessages(chatHistory, appConfig, {
        currentRagSystemContext,
        activeRagBranchId: appConfig.activeRagBranchId,
        ...options
      });
    }
    return chatHistory;
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

    // Actualizar modelo y perfil en badges
    if (elements.currentProfileName) {
      const activeProf = (Storage.getActiveProfileName ? Storage.getActiveProfileName() : appConfig.activeProfileName) || appConfig.activeProfileName || 'Local chat';
      elements.currentProfileName.textContent = activeProf;
    }
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
    if (UIReasoning.getReasoningLevelLabel) return UIReasoning.getReasoningLevelLabel(lvl);
    return { icon: '⚙️', label: lvl, desc: '' };
  }

  function renderReasoningMenuOptions(reasoningInfo, activeLevel) {
    if (UIReasoning.renderReasoningMenuOptions) {
      UIReasoning.renderReasoningMenuOptions(elements, reasoningInfo, activeLevel, selectReasoningLevel);
    }
  }

  function positionReasoningMenu() {
    if (UIReasoning.positionReasoningMenu) {
      UIReasoning.positionReasoningMenu(elements);
    }
  }

  function toggleReasoningMenu() {
    if (UIReasoning.toggleReasoningMenu) {
      UIReasoning.toggleReasoningMenu(elements, appConfig, selectReasoningLevel);
    }
  }

  function openReasoningMenu() {
    if (UIReasoning.openReasoningMenu) {
      UIReasoning.openReasoningMenu(elements, appConfig, selectReasoningLevel);
    }
  }

  function selectReasoningLevel(level) {
    if (UIReasoning.selectReasoningLevel) {
      UIReasoning.selectReasoningLevel(elements, appConfig, level);
    }
  }

  function updateReasoningUI(level) {
    if (UIReasoning.updateReasoningUI) {
      UIReasoning.updateReasoningUI(elements, level);
    }
  }

  function closeReasoningMenu() {
    if (UIReasoning.closeReasoningMenu) {
      UIReasoning.closeReasoningMenu(elements);
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
    if (elements.activeProfileSelect && Storage.getProfiles) {
      const active = (Storage.getActiveProfileName ? Storage.getActiveProfileName() : appConfig.activeProfileName) || 'Local chat';
      elements.activeProfileSelect.innerHTML = Object.keys(Storage.getProfiles()).map(name => `<option value="${Markdown.escapeHtml(name)}"${name === active ? ' selected' : ''}>${Markdown.escapeHtml(name)}</option>`).join('');
    }
    if (elements.currentProfileName) {
      const activeProf = (Storage.getActiveProfileName ? Storage.getActiveProfileName() : appConfig.activeProfileName) || appConfig.activeProfileName || 'Local chat';
      elements.currentProfileName.textContent = activeProf;
    }
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

    // Sincronizar dinámicamente la rama RAG activa desde ChatTreeRagUI o Storage
    const activeRagBranchId = (typeof window !== 'undefined' && window.ChatTreeRagUI && window.ChatTreeRagUI.getActiveChatBranchId)
      ? window.ChatTreeRagUI.getActiveChatBranchId()
      : (appConfig.activeRagBranchId || (Storage.loadConfig ? Storage.loadConfig()?.activeRagBranchId : '') || '');
    appConfig.activeRagBranchId = activeRagBranchId;

    // Cargar contexto jerárquico inicial de la rama RAG para Context-Caching en System Prompt
    if (activeRagBranchId && window.ChatTreeRagService && window.ChatTreeRagService.buildTreeRagSystemContext) {
      try {
        currentRagSystemContext = await window.ChatTreeRagService.buildTreeRagSystemContext(activeRagBranchId);
      } catch (err) {
        console.warn('Error al cargar contexto inicial de RAG:', err);
        currentRagSystemContext = '';
      }
    } else {
      currentRagSystemContext = '';
    }

    const runner = window.ChatEngine || Engine;
    const loopResult = await runner.executeAgentTurnLoop({
      apiUrl: appConfig.apiUrl,
      apiType: appConfig.apiType,
      apiKey: appConfig.apiKey,
      model: appConfig.model,
      temperature: appConfig.temperature,
      reasoningEffort: appConfig.reasoningEffort || 'none',
      chatHistory: chatHistory,
      appConfig: appConfig,
      assistantMsgId: assistantMsgId,
      activeRagBranchId: activeRagBranchId,
      currentRagSystemContext: currentRagSystemContext,
      sessionCacheInvalidated: sessionCacheInvalidated,
      sessionCacheRevision: sessionCacheRevision,
      signal: currentAbortController.signal,
      container: content,

      onBeforeRequest: appConfig.enableDebugMessages ? async function ({ endpoint, headers, payload }) {
        return await openDebugInterceptorModal({ endpoint, headers, payload });
      } : null,

      onReasoningChunk: function (chunk) {
        addDebugLog('thinking', chunk);
        setDebugStatus('streaming', t('debug_status_thinking'));
      },

      onLog: function (type, text) {
        addDebugLog(type, text);
      },

      onStats: function (stats) {
        updateStatsDisplay(stats);
      },

      onChunk: function ({ turnIndex, fullText, delta, stats }) {
        if (stats) updateStatsDisplay(stats);
        scrollToBottom();
      },

      scrollToBottom: () => scrollToBottom(),
      attachListeners: (el) => attachListeners(el)
    });

    if (sessionCacheInvalidated) {
      sessionCacheInvalidated = false;
    }

    if (loopResult && loopResult.cancelled) {
      if (wrapper && !wrapper.querySelector('.agentic-turn-block') && wrapper.parentNode) {
        wrapper.parentNode.removeChild(wrapper);
      }
      setDebugStatus('idle');
      finishGeneration();
      return;
    }

    if (loopResult && loopResult.error) {
      if (currentAbortController && currentAbortController.signal.aborted) {
        finishGeneration();
        return;
      }
      setDebugStatus('error', t('debug_status_error'));
      addDebugLog('error', loopResult.error.message || String(loopResult.error));
      row.classList.add('message-error');
      content.innerHTML = `
        <div class="network-error-card">
          <span>⚠️</span>
          <div>
            <strong>${t('err_server_connect_title')}</strong>
            <p style="margin-top: 0.25rem;">
              ${Markdown.escapeHtml ? Markdown.escapeHtml(loopResult.error.message || String(loopResult.error)) : String(loopResult.error)}
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

    if (loopResult && loopResult.stats) {
      updateStatsDisplay(loopResult.stats);
    }

    actions.style.display = 'inline-flex';
    btnCopy.onclick = async () => {
      try {
        const fullMd = loopResult?.accumulatedMarkdown || loopResult?.finalAssistantText || '';
        await navigator.clipboard.writeText(fullMd);
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
  // Modal de Configuración & Gestión de Perfiles
  // ==========================================================================

  /**
   * Puebla el combobox auxiliar y el datalist con todos los perfiles disponibles.
   */
  function populateProfileSelector(selectedProfileName) {
    if (!Storage.getProfiles) return;
    const profiles = Storage.getProfiles();
    const profileNames = Object.keys(profiles);

    if (elements.profileDatalist) {
      elements.profileDatalist.innerHTML = '';
      profileNames.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        elements.profileDatalist.appendChild(opt);
      });
    }

    if (elements.profileSelectHelper) {
      elements.profileSelectHelper.innerHTML = `<option value="" disabled data-i18n="profile_select_default">▾ Elegir perfil guardado...</option>`;
      profileNames.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        if (name === selectedProfileName) {
          opt.selected = true;
        }
        elements.profileSelectHelper.appendChild(opt);
      });
    }

    if (elements.settingProfileName) {
      elements.settingProfileName.value = selectedProfileName || '';
    }
  }

  /**
   * Renderiza dinámicamente las tarjetas de herramientas agénticas registradas en ToolRegistry.
   */
  function renderAgentToolsUI(container, currentEnabledTools = {}) {
    if (!container) return;
    const tools = (AgentCore.registry && typeof AgentCore.registry.listToolsForUI === 'function')
      ? AgentCore.registry.listToolsForUI()
      : [];

    container.innerHTML = '';
    tools.forEach(tool => {
      const isChecked = currentEnabledTools[tool.id] !== undefined
        ? currentEnabledTools[tool.id] !== false
        : (currentEnabledTools[tool.name] !== undefined ? currentEnabledTools[tool.name] !== false : tool.defaultEnabled !== false);

      const title = t(tool.titleKey) || tool.titleFallback || tool.name;
      const desc = t(tool.descKey) || tool.descFallback || '';

      const card = document.createElement('div');
      card.className = 'setting-toggle-card';
      card.innerHTML = `
        <div class="toggle-card-info">
          <div class="toggle-card-title">
            <span data-i18n="${Markdown.escapeHtml ? Markdown.escapeHtml(tool.titleKey) : tool.titleKey}">${Markdown.escapeHtml ? Markdown.escapeHtml(title) : title}</span>
          </div>
          <p class="toggle-card-desc" data-i18n="${Markdown.escapeHtml ? Markdown.escapeHtml(tool.descKey) : tool.descKey}">${Markdown.escapeHtml ? Markdown.escapeHtml(desc) : desc}</p>
        </div>
        <label class="switch">
          <input type="checkbox" class="agent-tool-checkbox" data-tool-id="${Markdown.escapeHtml ? Markdown.escapeHtml(tool.id) : tool.id}" ${isChecked ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      `;
      container.appendChild(card);
    });
  }

  /**
   * Recoge el estado de activación de todas las herramientas desde la UI.
   */
  function gatherEnabledToolsFromUI() {
    const map = {};
    if (elements.agentToolsContainer) {
      elements.agentToolsContainer.querySelectorAll('.agent-tool-checkbox').forEach(cb => {
        const tid = cb.getAttribute('data-tool-id');
        if (tid) map[tid] = cb.checked;
      });
    }
    return map;
  }

  /**
   * Rellena todos los campos de todas las pestañas de configuración con los valores de un perfil.
   */
  function applyProfileToForm(profileData) {
    if (!profileData) return;

    if (elements.settingApiType && profileData.apiType !== undefined) {
      elements.settingApiType.value = profileData.apiType;
    }
    if (elements.settingApiUrl && profileData.apiUrl !== undefined) {
      elements.settingApiUrl.value = profileData.apiUrl;
    }
    if (elements.settingApiKey && profileData.apiKey !== undefined) {
      elements.settingApiKey.value = profileData.apiKey;
    }
    if (elements.settingModel && profileData.model !== undefined) {
      elements.settingModel.value = profileData.model;
    }
    if (elements.modelSelectHelper && profileData.model !== undefined) {
      elements.modelSelectHelper.value = profileData.model;
    }
    if (elements.settingSystemPrompt && profileData.systemPrompt !== undefined) {
      elements.settingSystemPrompt.value = profileData.systemPrompt;
    }
    if (elements.settingTemperature && profileData.temperature !== undefined) {
      elements.settingTemperature.value = profileData.temperature;
      if (elements.temperatureVal) {
        elements.temperatureVal.textContent = profileData.temperature;
      }
    }
    if (elements.agentToolsContainer) {
      renderAgentToolsUI(elements.agentToolsContainer, profileData.enabledTools || {});
    }
    if (elements.settingEnableContextCache && profileData.enableContextCache !== undefined) {
      elements.settingEnableContextCache.checked = profileData.enableContextCache !== false;
    }
    if (elements.settingEnableRawLogs && profileData.enableRawLogs !== undefined) {
      elements.settingEnableRawLogs.checked = profileData.enableRawLogs === true;
    }
    if (elements.settingSendDateTime && profileData.sendDateTime !== undefined) {
      elements.settingSendDateTime.checked = profileData.sendDateTime !== false;
    }
  }

  /**
   * Recoge la configuración completa de todos los campos actuales del formulario.
   */
  function gatherCurrentFormConfig() {
    const profileName = elements.settingProfileName ? elements.settingProfileName.value.trim() : (appConfig.activeProfileName || 'Local chat');
    const selectedModel = elements.settingModel ? elements.settingModel.value.trim() : '';

    return {
      activeProfileName: profileName,
      apiUrl: elements.settingApiUrl ? elements.settingApiUrl.value.trim() : (appConfig.apiUrl || 'http://localhost:1234/v1'),
      apiType: elements.settingApiType ? elements.settingApiType.value : (appConfig.apiType || 'openai'),
      apiKey: elements.settingApiKey ? elements.settingApiKey.value.trim() : '',
      model: selectedModel,
      systemPrompt: elements.settingSystemPrompt ? elements.settingSystemPrompt.value.trim() : '',
      temperature: elements.settingTemperature ? elements.settingTemperature.value : '0.7',
      reasoningEffort: appConfig.reasoningEffort || 'none',
      modelReasoningConfig: appConfig.modelReasoningConfig || null,
      theme: appConfig.theme || 'light',
      language: appConfig.language || 'es',
      enabledTools: gatherEnabledToolsFromUI(),
      enableContextCache: elements.settingEnableContextCache ? elements.settingEnableContextCache.checked : true,
      enableRawLogs: elements.settingEnableRawLogs ? elements.settingEnableRawLogs.checked : Boolean(appConfig.enableRawLogs),
      enableDebugMessages: Boolean(appConfig.enableDebugMessages),
      sendDateTime: elements.settingSendDateTime ? elements.settingSendDateTime.checked : true,
      activeRagBranchId: appConfig.activeRagBranchId || '',
      ragContextLimitK: appConfig.ragContextLimitK || 128
    };
  }

  function showProfileFeedback(msg, type = 'success') {
    if (!elements.profileActionFeedback) return;
    elements.profileActionFeedback.style.display = 'block';
    elements.profileActionFeedback.className = `server-query-status status-${type}`;
    elements.profileActionFeedback.textContent = msg;
    setTimeout(() => {
      if (elements.profileActionFeedback) {
        elements.profileActionFeedback.style.display = 'none';
      }
    }, 4000);
  }

  function handleSaveProfile() {
    const name = elements.settingProfileName ? elements.settingProfileName.value.trim() : '';
    if (!name) {
      showProfileFeedback(t('err_profile_name_empty') || 'Por favor, escribe un nombre para el perfil.', 'error');
      return;
    }

    const currentConfig = gatherCurrentFormConfig();
    if (Storage.saveProfile) {
      Storage.saveProfile(name, currentConfig);
      populateProfileSelector(name);
      showProfileFeedback(t('msg_profile_saved', { name: name }) || `Perfil "${name}" guardado con éxito.`, 'success');
    }
  }

  function handleDeleteProfile() {
    const name = elements.settingProfileName ? elements.settingProfileName.value.trim() : '';
    if (!name) return;

    const confirmMsg = t('confirm_delete_profile', { name: name }) || `¿Estás seguro de que deseas eliminar el perfil "${name}"?`;
    if (!confirm(confirmMsg)) return;

    if (Storage.deleteProfile) {
      Storage.deleteProfile(name);
      const newActive = Storage.getActiveProfileName ? Storage.getActiveProfileName() : 'Local chat';
      populateProfileSelector(newActive);
      const newProfileData = Storage.getProfile ? Storage.getProfile(newActive) : null;
      if (newProfileData) {
        applyProfileToForm(newProfileData);
      }
      showProfileFeedback(t('msg_profile_deleted', { name: name }) || `Perfil "${name}" eliminado.`, 'success');
    }
  }

  function openSettingsModal() {
    const activeProfileName = (Storage.getActiveProfileName ? Storage.getActiveProfileName() : appConfig.activeProfileName) || 'Local chat';
    populateProfileSelector(activeProfileName);

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
    if (elements.profileActionFeedback) {
      elements.profileActionFeedback.style.display = 'none';
    }

    loadCachedModels();

    if (elements.agentToolsContainer) {
      renderAgentToolsUI(elements.agentToolsContainer, appConfig.enabledTools || {});
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

    const newConfig = gatherCurrentFormConfig();

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

      if (elements.agentToolsContainer) {
        renderAgentToolsUI(elements.agentToolsContainer, defaults.enabledTools || {});
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

  async function createNewSession({ saveCurrent = true } = {}) {
    if (saveCurrent) await saveCurrentSession();

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
      await createNewSession({ saveCurrent: false });
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
      const deleted = await Storage.deleteAllConversations();
      if (!deleted) {
        alert('No se pudo borrar el historial persistente. Revisa la consola para más detalles.');
        return;
      }
      // Evita que la migración de arranque reimporte sesiones legacy tras F5.
      if (Storage.deleteStorageItem) Storage.deleteStorageItem('chat_sessions');
      else {
        try { localStorage.removeItem('chat_sessions'); } catch (e) {}
      }
    } else {
      try {
        if (Storage.setStorageItem) Storage.setStorageItem('chat_sessions', JSON.stringify([]));
        else localStorage.setItem('chat_sessions', JSON.stringify([]));
      } catch (e) {}
    }

    await createNewSession({ saveCurrent: false });
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
    if (elements.btnToggleSidebar) {
      elements.btnToggleSidebar.style.display = isHidden ? 'none' : 'inline-flex';
    }
  }

  function closeSidebar() {
    if (elements.chatSidebar) {
      elements.chatSidebar.style.display = 'none';
    }
    if (elements.btnToggleSidebar) {
      elements.btnToggleSidebar.style.display = 'inline-flex';
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
    // Botones y cabeceras de colapso de tarjetas de herramientas
    container.querySelectorAll('.btn-tool-collapse, .tool-card-header, .web-card-header, .search-card-header').forEach(el => {
      el.onclick = (e) => {
        if (e.target.closest('a')) return;
        const card = el.closest('.tool-execution-card, .web-request-card, .web-search-card, .chat-chart-card');
        if (card) {
          card.classList.toggle('collapsed');
          const span = card.querySelector('.btn-tool-collapse span');
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
    const title = (sess && sess.title) || 'ZeroChat_Conversation';
    const dateStr = new Date().toISOString().slice(0, 10);
    const md = Export.buildMarkdownExport ? Export.buildMarkdownExport(chatHistory, { title, model: appConfig.model }) : '';
    if (Export.downloadFile) {
      Export.downloadFile(md, `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${dateStr}.md`, 'text/markdown');
    }
    closeExportModal();
  }

  function exportConversationAsJson() {
    const sess = savedSessions.find(s => s.id === currentSessionId);
    const title = (sess && sess.title) || 'ZeroChat_Conversation';
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
    if (elements.badgeProfile) {
      elements.badgeProfile.addEventListener('click', openSettingsModal);
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
    if (elements.activeProfileSelect) {
      elements.activeProfileSelect.addEventListener('change', function () {
        const profile = Storage.getProfile ? Storage.getProfile(this.value) : null;
        if (!profile) return;
        appConfig = {
          ...appConfig,
          ...profile,
          activeProfileName: this.value,
          reasoningEffort: profile.reasoningEffort || 'none',
          modelReasoningConfig: profile.modelReasoningConfig || null
        };
        if (Storage.setActiveProfileName) Storage.setActiveProfileName(this.value);
        if (Storage.saveConfig) Storage.saveConfig(appConfig);
        updateUIFromConfig();
      });
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

    // Modal de Configuración & Perfiles
    elements.btnCloseSettings.addEventListener('click', closeSettingsModal);
    elements.btnCancelSettings.addEventListener('click', closeSettingsModal);
    elements.settingsForm.addEventListener('submit', handleSaveSettings);
    elements.btnResetSettings.addEventListener('click', handleResetSettings);
    if (elements.btnClearAllData) {
      elements.btnClearAllData.addEventListener('click', handleClearAllData);
    }

    if (elements.profileSelectHelper) {
      elements.profileSelectHelper.addEventListener('change', function () {
        const selectedName = this.value;
        if (!selectedName) return;
        if (elements.settingProfileName) {
          elements.settingProfileName.value = selectedName;
        }
        if (Storage.getProfile) {
          const prof = Storage.getProfile(selectedName);
          if (prof) {
            applyProfileToForm(prof);
          }
        }
      });
    }

    if (elements.settingProfileName) {
      elements.settingProfileName.addEventListener('change', function () {
        const typedName = this.value.trim();
        if (!typedName) return;
        if (Storage.getProfile) {
          const prof = Storage.getProfile(typedName);
          if (prof) {
            applyProfileToForm(prof);
            if (elements.profileSelectHelper) {
              elements.profileSelectHelper.value = typedName;
            }
          }
        }
      });
    }

    if (elements.btnSaveProfile) {
      elements.btnSaveProfile.addEventListener('click', (e) => {
        e.preventDefault();
        handleSaveProfile();
      });
    }

    if (elements.btnDeleteProfile) {
      elements.btnDeleteProfile.addEventListener('click', (e) => {
        e.preventDefault();
        handleDeleteProfile();
      });
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

    console.log('💬 ZeroChat v5.3 initialized successfully with Autonomous Agentic Engine, Traffic Debug Logs and Tree-RAG.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
