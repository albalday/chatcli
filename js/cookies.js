/**
 * Módulo de almacenamiento y persistencia de configuración y conversaciones (ChatStorage).
 * - Configuración síncrona en localStorage / cookies (preferencias ligeras y API keys).
 * - Persistencia estructurada y asíncrona de conversaciones, mensajes y adjuntos en IndexedDB (ZeroChatDB).
 * - Migración automática de sesiones legacy desde localStorage sin pérdida de datos.
 * - Carga bajo demanda de mensajes para optimizar el consumo de memoria.
 * - Fallback transparente para entornos sin soporte de IndexedDB.
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatStorage = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DB_NAME = 'ZeroChatDB';
  const DB_VERSION = 1;
  const STORE_CONVERSATIONS = 'conversations';
  const STORE_MESSAGES = 'messages';
  const STORE_ATTACHMENTS = 'attachments';

  const DEFAULT_CONFIG = {
    apiUrl: 'http://localhost:1234/v1',
    apiType: 'openai', // 'openai' | 'ollama' | 'openrouter' | 'claude' | 'gemini' | 'custom'
    apiKey: '',
    model: '',
    systemPrompt: '',
    temperature: '0.7',
    reasoningEffort: 'none', // 'none' | 'low' | 'medium' | 'high'
    theme: 'light', // 'light' | 'dark'
    language: 'es', // 'es' | 'en'
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
    activeRagBranchId: '',
    ragContextLimitK: 128,
    ragSummaryProfile: 'Local resumen'
  };

  const STORAGE_PREFIX = 'zerochat_';
  const DEFAULT_EXPIRY_DAYS = 365;

  const memoryStorage = new Map();
  // Almacén en memoria para fallback cuando IndexedDB no está disponible
  const memoryConversations = new Map();
  const memoryMessages = new Map();

  function isLocalStorageAvailable() {
    try {
      const testKey = '__zerochat_test__';
      localStorage.setItem(testKey, testKey);
      localStorage.removeItem(testKey);
      return true;
      localStorage.setItem(testKey, testKey);
      localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  const hasLocalStorage = isLocalStorageAvailable();

  function setStorageItem(name, value, days = DEFAULT_EXPIRY_DAYS) {
    const key = `${STORAGE_PREFIX}${name}`;
    const strVal = value ?? '';

    if (hasLocalStorage) {
      try {
        localStorage.setItem(key, String(strVal));
      } catch (e) {}
    }

    if (typeof document !== 'undefined' && location.protocol !== 'file:') {
      try {
        const d = new Date();
        d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
        const expires = 'expires=' + d.toUTCString();
        document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(strVal)};${expires};path=/;SameSite=Lax`;
      } catch (e) {}
    }

    memoryStorage.set(key, String(strVal));
  }

  function getStorageItem(name) {
    const key = `${STORAGE_PREFIX}${name}`;

    if (hasLocalStorage) {
      try {
        const item = localStorage.getItem(key);
        if (item !== null) return item;
      } catch (e) {}
    }

    if (typeof document !== 'undefined' && location.protocol !== 'file:') {
      try {
        const nameEQ = encodeURIComponent(key) + '=';
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
          let c = ca[i];
          while (c.charAt(0) === ' ') c = c.substring(1, c.length);
          if (c.indexOf(nameEQ) === 0) {
            return decodeURIComponent(c.substring(nameEQ.length, c.length));
          }
        }
      } catch (e) {}
    }

    if (memoryStorage.has(key)) {
      return memoryStorage.get(key);
    }

    return null;
  }

  function deleteStorageItem(name) {
    const key = `${STORAGE_PREFIX}${name}`;
    if (hasLocalStorage) {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
    }
    if (typeof document !== 'undefined' && location.protocol !== 'file:') {
      try {
        document.cookie = `${encodeURIComponent(key)}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax`;
      } catch (e) {}
    }
    memoryStorage.delete(key);
  }

  function parseBool(val, defaultVal) {
    if (val === null || val === undefined || val === '') return defaultVal;
    return val === 'true' || val === true || val === '1';
  }

  const DEFAULT_PROFILES = {
    'Local chat': {
      apiUrl: 'http://localhost:1234/v1',
      apiType: 'openai',
      apiKey: '',
      model: 'google/gemma-4-26b-a4b-qat',
      systemPrompt: '',
      temperature: '0.7',
      reasoningEffort: 'none',
      modelReasoningConfig: null,
      enableAgentJs: true,
      enableAgentWeb: true,
      enableAgentSearch: true,
      enableAgentChart: true,
      enableContextCache: true,
      enableRawLogs: false,
      enableDebugMessages: false,
      sendDateTime: true,
      ragContextLimitK: 128
    },
    'Remoto chat': {
      apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiType: 'gemini',
      apiKey: '',
      model: 'gemini-3.6-flash',
      systemPrompt: '',
      temperature: '0.7',
      reasoningEffort: 'none',
      modelReasoningConfig: null,
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
      ragContextLimitK: 128
    },
    'Local resumen': {
      apiUrl: 'http://localhost:1234/v1',
      apiType: 'openai',
      apiKey: '',
      model: 'google/gemma-4-e4b',
      systemPrompt: '',
      temperature: '0.7',
      reasoningEffort: 'none',
      modelReasoningConfig: null,
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
      ragContextLimitK: 128
    },
    'Remoto resumen': {
      apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiType: 'gemini',
      apiKey: '',
      model: 'gemini-3.6-flash',
      systemPrompt: '',
      temperature: '0.7',
      reasoningEffort: 'none',
      modelReasoningConfig: null,
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
      ragContextLimitK: 128
    },
    'Nuevo': {
      apiUrl: '',
      apiType: 'openai',
      apiKey: '',
      model: '',
      systemPrompt: '',
      temperature: '0.7',
      reasoningEffort: 'none',
      modelReasoningConfig: null,
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
      ragContextLimitK: 128
    }
  };

  /**
   * Obtiene todos los perfiles de configuración guardados, o inicializa con los predeterminados.
   */
  function getProfiles() {
    const raw = getStorageItem('profiles');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          return parsed;
        }
      } catch (e) {}
    }
    // Si no existen, inicializar con DEFAULT_PROFILES
    const initial = JSON.parse(JSON.stringify(DEFAULT_PROFILES));
    setStorageItem('profiles', JSON.stringify(initial));
    setActiveProfileName('Local chat');
    return initial;
  }

  /**
   * Obtiene el nombre del perfil activo actual.
   */
  function getActiveProfileName() {
    const active = getStorageItem('active_profile');
    const profiles = getProfiles();
    if (active && profiles[active]) {
      return active;
    }
    const firstKey = Object.keys(profiles)[0] || 'Local chat';
    return firstKey;
  }

  /**
   * Establece el perfil activo actual por su nombre.
   */
  function setActiveProfileName(name) {
    if (typeof name === 'string' && name.trim()) {
      setStorageItem('active_profile', name.trim());
    }
  }

  /**
   * Obtiene la configuración completa de un perfil por nombre.
   */
  function getProfile(name) {
    const profiles = getProfiles();
    if (profiles && profiles[name]) {
      return JSON.parse(JSON.stringify(profiles[name]));
    }
    return null;
  }

  /**
   * Guarda o actualiza un perfil con todos sus campos específicos.
   */
  function saveProfile(name, profileData) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new Error('El nombre del perfil no puede estar vacío.');
    }
    const cleanName = name.trim();
    const profiles = getProfiles();
    
    // Extraer y normalizar todos los campos de configuración
    profiles[cleanName] = {
      apiUrl: profileData.apiUrl !== undefined ? String(profileData.apiUrl).trim() : 'http://localhost:1234/v1',
      apiType: profileData.apiType !== undefined ? String(profileData.apiType).trim() : 'openai',
      apiKey: profileData.apiKey !== undefined ? String(profileData.apiKey).trim() : '',
      model: profileData.model !== undefined ? String(profileData.model).trim() : '',
      systemPrompt: profileData.systemPrompt !== undefined ? String(profileData.systemPrompt).trim() : '',
      temperature: profileData.temperature !== undefined ? String(profileData.temperature) : '0.7',
      reasoningEffort: profileData.reasoningEffort || 'none',
      modelReasoningConfig: profileData.modelReasoningConfig || null,
      enabledTools: (profileData.enabledTools && typeof profileData.enabledTools === 'object')
        ? { ...profileData.enabledTools }
        : { ...DEFAULT_CONFIG.enabledTools },
      enableContextCache: profileData.enableContextCache !== false,
      enableRawLogs: profileData.enableRawLogs === true,
      enableDebugMessages: profileData.enableDebugMessages === true,
      sendDateTime: profileData.sendDateTime !== false,
      ragContextLimitK: (() => {
        const val = parseInt(profileData.ragContextLimitK, 10);
        if (isNaN(val) || val < 16) return 64;
        if (val > 1024) return 1024;
        return val;
      })()
    };

    setStorageItem('profiles', JSON.stringify(profiles));
    setActiveProfileName(cleanName);
    return profiles[cleanName];
  }

  /**
   * Elimina un perfil por nombre. Si era el activo, conmuta al primero disponible.
   */
  function deleteProfile(name) {
    if (!name) return false;
    const cleanName = String(name).trim();
    const profiles = getProfiles();
    if (!profiles[cleanName]) return false;

    delete profiles[cleanName];
    
    // Si no quedan perfiles, restaurar DEFAULT_PROFILES
    if (Object.keys(profiles).length === 0) {
      const restored = JSON.parse(JSON.stringify(DEFAULT_PROFILES));
      setStorageItem('profiles', JSON.stringify(restored));
      setActiveProfileName('Local chat');
      return true;
    }

    setStorageItem('profiles', JSON.stringify(profiles));
    const currentActive = getActiveProfileName();
    if (currentActive === cleanName) {
      setActiveProfileName(Object.keys(profiles)[0]);
    }
    return true;
  }

  function loadConfig() {
    const activeProfileName = getActiveProfileName();
    const profiles = getProfiles();
    const activeProfile = profiles[activeProfileName] || DEFAULT_PROFILES['Local chat'];

    const apiUrl = getStorageItem('apiUrl');
    const apiType = getStorageItem('apiType');
    const apiKey = getStorageItem('apiKey');
    const model = getStorageItem('model');
    const systemPrompt = getStorageItem('systemPrompt');
    const temperature = getStorageItem('temperature');
    const reasoningEffort = getStorageItem('reasoningEffort');
    const theme = getStorageItem('theme');
    const language = getStorageItem('language');
    const enabledToolsRaw = getStorageItem('enabledTools');
    const enableContextCache = getStorageItem('enableContextCache');
    const enableRawLogs = getStorageItem('enableRawLogs');
    const enableDebugMessages = getStorageItem('enableDebugMessages');
    const sendDateTime = getStorageItem('sendDateTime');
    const activeRagBranchId = getStorageItem('activeRagBranchId');
    const ragContextLimitK = getStorageItem('ragContextLimitK');
    const modelReasoningConfigRaw = getStorageItem('modelReasoningConfig');

    let effectiveApiUrl = apiUrl !== null ? apiUrl : (activeProfile.apiUrl || DEFAULT_CONFIG.apiUrl);
    if (!effectiveApiUrl || effectiveApiUrl === 'https://api.openai.com/v1') {
      effectiveApiUrl = DEFAULT_CONFIG.apiUrl;
    }

    let effectiveTheme = theme;
    if (effectiveTheme !== 'dark' && effectiveTheme !== 'light') {
      effectiveTheme = 'light';
    }

    let effectiveLanguage = language;
    if (effectiveLanguage !== 'es' && effectiveLanguage !== 'en') {
      if (typeof window !== 'undefined' && window.ChatI18n && window.ChatI18n.detectInitialLanguage) {
        effectiveLanguage = window.ChatI18n.detectInitialLanguage();
      } else {
        effectiveLanguage = DEFAULT_CONFIG.language;
      }
    }

    let parsedReasoningConfig = activeProfile.modelReasoningConfig || null;
    try {
      if (modelReasoningConfigRaw) {
        parsedReasoningConfig = JSON.parse(modelReasoningConfigRaw);
      }
    } catch (e) {}

    let effectiveApiType = (apiType && apiType !== 'auto') ? apiType : (activeProfile.apiType || DEFAULT_CONFIG.apiType);

    let effectiveSystemPrompt = systemPrompt !== null ? systemPrompt : (activeProfile.systemPrompt !== undefined ? activeProfile.systemPrompt : DEFAULT_CONFIG.systemPrompt);
    if (effectiveSystemPrompt && (
      effectiveSystemPrompt.startsWith('Eres un asistente de IA útil') ||
      effectiveSystemPrompt.startsWith('You are a helpful, concise and precise AI assistant')
    )) {
      effectiveSystemPrompt = '';
    }

    let effectiveEnabledTools = activeProfile.enabledTools ? { ...activeProfile.enabledTools } : { ...DEFAULT_CONFIG.enabledTools };
    if (enabledToolsRaw) {
      try {
        const parsed = JSON.parse(enabledToolsRaw);
        if (parsed && typeof parsed === 'object') {
          effectiveEnabledTools = { ...effectiveEnabledTools, ...parsed };
        }
      } catch (e) {}
    }

    return {
      activeProfileName: activeProfileName,
      apiUrl: effectiveApiUrl,
      apiType: effectiveApiType,
      apiKey: apiKey !== null ? apiKey : (activeProfile.apiKey !== undefined ? activeProfile.apiKey : DEFAULT_CONFIG.apiKey),
      model: model !== null && model !== '' ? model : (activeProfile.model !== undefined ? activeProfile.model : DEFAULT_CONFIG.model),
      systemPrompt: effectiveSystemPrompt,
      temperature: temperature !== null && temperature !== '' ? temperature : (activeProfile.temperature !== undefined ? activeProfile.temperature : DEFAULT_CONFIG.temperature),
      reasoningEffort: (reasoningEffort === 'off' || reasoningEffort === 'none') ? 'none' : (reasoningEffort !== null && reasoningEffort !== '' ? reasoningEffort : (activeProfile.reasoningEffort || DEFAULT_CONFIG.reasoningEffort)),
      modelReasoningConfig: parsedReasoningConfig,
      theme: effectiveTheme,
      language: effectiveLanguage,
      enabledTools: effectiveEnabledTools,
      enableContextCache: parseBool(enableContextCache, activeProfile.enableContextCache !== undefined ? activeProfile.enableContextCache : DEFAULT_CONFIG.enableContextCache),
      enableRawLogs: parseBool(enableRawLogs, activeProfile.enableRawLogs !== undefined ? activeProfile.enableRawLogs : DEFAULT_CONFIG.enableRawLogs),
      enableDebugMessages: parseBool(enableDebugMessages, activeProfile.enableDebugMessages !== undefined ? activeProfile.enableDebugMessages : DEFAULT_CONFIG.enableDebugMessages),
      sendDateTime: parseBool(sendDateTime, activeProfile.sendDateTime !== undefined ? activeProfile.sendDateTime : DEFAULT_CONFIG.sendDateTime),
      activeRagBranchId: activeRagBranchId !== null ? activeRagBranchId : DEFAULT_CONFIG.activeRagBranchId,
      ragSummaryProfile: getStorageItem('ragSummaryProfile') || DEFAULT_CONFIG.ragSummaryProfile,
      ragContextLimitK: (() => {
        const val = parseInt(ragContextLimitK !== null ? ragContextLimitK : activeProfile.ragContextLimitK, 10);
        if (isNaN(val) || val < 32) return DEFAULT_CONFIG.ragContextLimitK;
        if (val > 1024) return 1024;
        return val;
      })()
    };
  }

  function saveConfig(config) {
    if (config.activeProfileName !== undefined && config.activeProfileName) {
      setActiveProfileName(config.activeProfileName);
      // Auto-actualizar el perfil guardado con los nuevos valores
      saveProfile(config.activeProfileName, config);
    }
    if (config.apiUrl !== undefined) setStorageItem('apiUrl', config.apiUrl.trim());
    if (config.apiType !== undefined) setStorageItem('apiType', config.apiType.trim());
    if (config.apiKey !== undefined) setStorageItem('apiKey', config.apiKey.trim());
    if (config.model !== undefined) setStorageItem('model', config.model.trim());
    if (config.systemPrompt !== undefined) setStorageItem('systemPrompt', config.systemPrompt.trim());
    if (config.temperature !== undefined) setStorageItem('temperature', String(config.temperature));
    if (config.reasoningEffort !== undefined) setStorageItem('reasoningEffort', config.reasoningEffort);
    if (config.modelReasoningConfig !== undefined) {
      setStorageItem('modelReasoningConfig', config.modelReasoningConfig ? JSON.stringify(config.modelReasoningConfig) : '');
    }
    if (config.theme !== undefined) setStorageItem('theme', config.theme);
    if (config.language !== undefined) setStorageItem('language', config.language);
    if (config.enabledTools !== undefined) {
      setStorageItem('enabledTools', JSON.stringify(config.enabledTools));
    }
    if (config.enableContextCache !== undefined) setStorageItem('enableContextCache', String(config.enableContextCache));
    if (config.enableRawLogs !== undefined) setStorageItem('enableRawLogs', String(config.enableRawLogs));
    if (config.enableDebugMessages !== undefined) setStorageItem('enableDebugMessages', String(config.enableDebugMessages));
    if (config.sendDateTime !== undefined) setStorageItem('sendDateTime', String(config.sendDateTime));
    if (config.activeRagBranchId !== undefined) setStorageItem('activeRagBranchId', String(config.activeRagBranchId));
    if (config.ragSummaryProfile !== undefined) setStorageItem('ragSummaryProfile', String(config.ragSummaryProfile).trim());
    if (config.ragContextLimitK !== undefined) {
      let k = parseInt(config.ragContextLimitK, 10);
      if (isNaN(k) || k < 32) k = 128;
      if (k > 1024) k = 1024;
      setStorageItem('ragContextLimitK', String(k));
    }
  }

  function resetConfigToDefaults() {
    saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }

  function getDefaultConfig() {
    return { ...DEFAULT_CONFIG };
  }

  function getDefaultProfiles() {
    return JSON.parse(JSON.stringify(DEFAULT_PROFILES));
  }

  function clearAllStorage() {
    if (hasLocalStorage) {
      try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith(STORAGE_PREFIX) || k === 'chat_sessions' || k.startsWith('chatcli') || k.startsWith('zerochat'))) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      } catch (e) {}
    }

    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.clear();
      }
    } catch (e) {}

    if (typeof document !== 'undefined') {
      try {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
          const cookie = cookies[i];
          const eqPos = cookie.indexOf('=');
          const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
          if (name) {
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax`;
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=;SameSite=Lax`;
          }
        }
      } catch (e) {}
    }

    memoryStorage.clear();
    memoryConversations.clear();
    memoryMessages.clear();
  }

  // ==========================================================================
  // Capa de Persistencia en IndexedDB para Conversaciones y Mensajes
  // ==========================================================================

  let dbPromise = null;

  function isIndexedDBAvailable() {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  }

  /**
   * Abre o inicializa la base de datos IndexedDB.
   * @returns {Promise<IDBDatabase|null>}
   */
  function openDatabase() {
    if (!isIndexedDBAvailable()) {
      return Promise.resolve(null);
    }

    if (dbPromise) {
      return dbPromise;
    }

    dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = function (event) {
          const db = event.target.result;

          // 1. Store de Conversaciones
          if (!db.objectStoreNames.contains(STORE_CONVERSATIONS)) {
            const convStore = db.createObjectStore(STORE_CONVERSATIONS, { keyPath: 'id' });
            convStore.createIndex('by_updatedAt', 'updatedAt', { unique: false });
            convStore.createIndex('by_createdAt', 'createdAt', { unique: false });
          }

          // 2. Store de Mensajes
          if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
            const msgStore = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
            msgStore.createIndex('by_conversationId', 'conversationId', { unique: false });
            msgStore.createIndex('by_createdAt', 'createdAt', { unique: false });
            msgStore.createIndex('by_role', 'role', { unique: false });
          }

          // 3. Store de Adjuntos (PDFs, imágenes Base64, archivos)
          if (!db.objectStoreNames.contains(STORE_ATTACHMENTS)) {
            const attStore = db.createObjectStore(STORE_ATTACHMENTS, { keyPath: 'id' });
            attStore.createIndex('by_conversationId', 'conversationId', { unique: false });
            attStore.createIndex('by_messageId', 'messageId', { unique: false });
          }
        };

        request.onsuccess = function (event) {
          const db = event.target.result;
          resolve(db);
        };

        request.onerror = function (event) {
          console.warn('ChatStorage: No se pudo abrir IndexedDB. Usando fallback en memoria.', event.target.error);
          resolve(null);
        };

        request.onblocked = function () {
          console.warn('ChatStorage: La base de datos IndexedDB está bloqueada por otra pestaña.');
        };
      } catch (e) {
        console.warn('ChatStorage: Error al intentar inicializar IndexedDB:', e);
        resolve(null);
      }
    });

    return dbPromise;
  }

  /**
   * Obtiene la lista de cabeceras de conversaciones (sin cargar todos los mensajes en memoria).
   * @param {string} filterText - Filtro opcional por título
   * @returns {Promise<Array<{ id: string, title: string, createdAt: number, updatedAt: number, messageCount: number }>>}
   */
  async function getConversationsList(filterText = '') {
    const db = await openDatabase();
    const filter = filterText.toLowerCase().trim();

    if (!db) {
      // Fallback en memoria / localStorage
      const results = [];
      for (const conv of memoryConversations.values()) {
        if (!filter || (conv.title && conv.title.toLowerCase().includes(filter))) {
          results.push({ ...conv });
        }
      }
      return results.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_CONVERSATIONS], 'readonly');
        const store = tx.objectStore(STORE_CONVERSATIONS);
        const index = store.index('by_updatedAt');
        const results = [];

        // Iterar en orden descendente de updatedAt
        const request = index.openCursor(null, 'prev');

        request.onsuccess = function (event) {
          const cursor = event.target.result;
          if (cursor) {
            const val = cursor.value;
            if (!filter || (val.title && val.title.toLowerCase().includes(filter))) {
              results.push({
                id: val.id,
                title: val.title || 'Nueva conversación',
                createdAt: val.createdAt,
                updatedAt: val.updatedAt,
                messageCount: val.messageCount || 0,
                model: val.model || '',
                pinned: Boolean(val.pinned),
                summary: val.summary || ''
              });
            }
            cursor.continue();
          } else {
            resolve(results);
          }
        };

        request.onerror = function () {
          resolve([]);
        };
      } catch (e) {
        console.warn('ChatStorage: Error al leer lista de conversaciones:', e);
        resolve([]);
      }
    });
  }

  /**
   * Carga una conversación completa con sus mensajes ordenados cronológicamente.
   * @param {string} sessionId
   * @returns {Promise<{ id: string, title: string, createdAt: number, updatedAt: number, history: Array } | null>}
   */
  async function getConversation(sessionId) {
    if (!sessionId) return null;
    const db = await openDatabase();

    if (!db) {
      const conv = memoryConversations.get(sessionId);
      if (!conv) return null;
      const msgs = (memoryMessages.get(sessionId) || []).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      return { ...conv, history: msgs };
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_CONVERSATIONS, STORE_MESSAGES], 'readonly');
        const convStore = tx.objectStore(STORE_CONVERSATIONS);
        const msgStore = tx.objectStore(STORE_MESSAGES);
        const msgIndex = msgStore.index('by_conversationId');

        const convReq = convStore.get(sessionId);

        convReq.onsuccess = function () {
          const conv = convReq.result;
          if (!conv) {
            resolve(null);
            return;
          }

          const msgsReq = msgIndex.getAll(sessionId);
          msgsReq.onsuccess = function () {
            const msgs = msgsReq.result || [];
            msgs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
            resolve({
              ...conv,
              history: msgs
            });
          };
          msgsReq.onerror = function () {
            resolve({ ...conv, history: [] });
          };
        };

        convReq.onerror = function () {
          resolve(null);
        };
      } catch (e) {
        console.warn('ChatStorage: Error al obtener conversación:', e);
        resolve(null);
      }
    });
  }

  /**
   * Guarda o actualiza una conversación y sus mensajes asociados atómicamente.
   * @param {Object} sessionMeta - { id, title, createdAt, updatedAt, ... }
   * @param {Array} messages - Array de mensajes del chat
   * @returns {Promise<boolean>}
   */
  async function saveConversation(sessionMeta, messages = []) {
    if (!sessionMeta || !sessionMeta.id) return false;
    const db = await openDatabase();
    const sessionId = sessionMeta.id;
    const now = Date.now();

    const conversationRecord = {
      id: sessionId,
      title: sessionMeta.title || 'Nueva conversación',
      createdAt: sessionMeta.createdAt || now,
      updatedAt: sessionMeta.updatedAt || now,
      messageCount: messages.length,
      model: sessionMeta.model || '',
      summary: sessionMeta.summary || '',
      tags: sessionMeta.tags || [],
      pinned: Boolean(sessionMeta.pinned),
      metadata: sessionMeta.metadata || {}
    };

    if (!db) {
      memoryConversations.set(sessionId, conversationRecord);
      memoryMessages.set(sessionId, [...messages]);
      return true;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_CONVERSATIONS, STORE_MESSAGES], 'readwrite');
        const convStore = tx.objectStore(STORE_CONVERSATIONS);
        const msgStore = tx.objectStore(STORE_MESSAGES);
        const msgIndex = msgStore.index('by_conversationId');

        convStore.put(conversationRecord);

        // Borrar mensajes existentes de esta conversación y re-insertar actualizados
        const delReq = msgIndex.openCursor(sessionId);
        delReq.onsuccess = function (e) {
          const cursor = e.target.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            // Insertar mensajes actualizados garantizando IDs únicos por mensaje
            const seenMsgIds = new Set();
            messages.forEach((m, idx) => {
              let msgId = m.id;
              if (!msgId || seenMsgIds.has(msgId)) {
                msgId = `msg_${sessionId}_${idx}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
              }
              seenMsgIds.add(msgId);

              const msgRecord = {
                id: msgId,
                conversationId: sessionId,
                role: m.role || 'user',
                content: m.content !== undefined ? m.content : '',
                tool_calls: m.tool_calls || null,
                tool_call_id: m.tool_call_id || null,
                name: m.name || null,
                stats: m.stats || null,
                createdAt: m.createdAt || (conversationRecord.createdAt + idx * 10)
              };
              if (m.images) msgRecord.images = m.images;
              msgStore.put(msgRecord);
            });
          }
        };

        tx.oncomplete = function () {
          resolve(true);
        };

        tx.onerror = function (e) {
          console.warn('ChatStorage: Error en transacción saveConversation:', e.target.error);
          resolve(false);
        };
      } catch (e) {
        console.warn('ChatStorage: Excepción al guardar conversación:', e);
        resolve(false);
      }
    });
  }

  /**
   * Elimina una conversación y todos sus mensajes y adjuntos asociados.
   * @param {string} sessionId
   * @returns {Promise<boolean>}
   */
  async function deleteConversation(sessionId) {
    if (!sessionId) return false;
    const db = await openDatabase();

    if (!db) {
      memoryConversations.delete(sessionId);
      memoryMessages.delete(sessionId);
      return true;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_CONVERSATIONS, STORE_MESSAGES, STORE_ATTACHMENTS, STORE_KNOWLEDGE], 'readwrite');
        const convStore = tx.objectStore(STORE_CONVERSATIONS);
        const msgStore = tx.objectStore(STORE_MESSAGES);
        const msgIndex = msgStore.index('by_conversationId');

        convStore.delete(sessionId);

        const delMsgs = msgIndex.openCursor(sessionId);
        delMsgs.onsuccess = function (e) {
          const cursor = e.target.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };

        tx.oncomplete = function () {
          resolve(true);
        };

        tx.onerror = function (e) {
          console.warn('ChatStorage: Error al eliminar conversación:', e.target.error);
          resolve(false);
        };
      } catch (e) {
        console.warn('ChatStorage: Excepción al eliminar conversación:', e);
        resolve(false);
      }
    });
  }

  /**
   * Elimina todas las conversaciones y mensajes guardados.
   * @returns {Promise<boolean>}
   */
  async function deleteAllConversations() {
    const db = await openDatabase();

    if (!db) {
      memoryConversations.clear();
      memoryMessages.clear();
      return true;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_CONVERSATIONS, STORE_MESSAGES, STORE_ATTACHMENTS, STORE_KNOWLEDGE], 'readwrite');
        tx.objectStore(STORE_CONVERSATIONS).clear();
        tx.objectStore(STORE_MESSAGES).clear();
        tx.objectStore(STORE_ATTACHMENTS).clear();
        tx.objectStore(STORE_KNOWLEDGE).clear();

        tx.oncomplete = function () {
          resolve(true);
        };

        tx.onerror = function (e) {
          console.warn('ChatStorage: Error al vaciar base de datos:', e.target.error);
          resolve(false);
        };
      } catch (e) {
        console.warn('ChatStorage: Excepción al vaciar conversaciones:', e);
        resolve(false);
      }
    });
  }

  /**
   * Renombra una conversación.
   * @param {string} sessionId
   * @param {string} newTitle
   * @returns {Promise<boolean>}
   */
  async function renameConversation(sessionId, newTitle) {
    if (!sessionId || !newTitle) return false;
    const db = await openDatabase();

    if (!db) {
      const conv = memoryConversations.get(sessionId);
      if (conv) {
        conv.title = newTitle.trim();
        conv.updatedAt = Date.now();
        return true;
      }
      return false;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_CONVERSATIONS], 'readwrite');
        const store = tx.objectStore(STORE_CONVERSATIONS);
        const req = store.get(sessionId);

        req.onsuccess = function () {
          const conv = req.result;
          if (conv) {
            conv.title = newTitle.trim();
            conv.updatedAt = Date.now();
            store.put(conv);
          }
        };

        tx.oncomplete = function () {
          resolve(true);
        };

        tx.onerror = function () {
          resolve(false);
        };
      } catch (e) {
        resolve(false);
      }
    });
  }

  /**
   * Inicializa el almacenamiento IndexedDB y ejecuta migraciones si es necesario.
   */
  async function initDB() {
    const db = await openDatabase();
    if (db) {
    }
    return db;
  }

  return {
    // Configuración Síncrona (localStorage / cookies)
    setStorageItem,
    getStorageItem,
    deleteStorageItem,
    setCookie: setStorageItem,
    getCookie: getStorageItem,
    deleteCookie: deleteStorageItem,
    loadConfig,
    saveConfig,
    resetConfigToDefaults,
    getDefaultConfig,
    getDefaultProfiles,
    getProfiles,
    getProfile,
    saveProfile,
    deleteProfile,
    getActiveProfileName,
    setActiveProfileName,
    clearAllStorage,

    // Persistencia Asíncrona en IndexedDB (Conversaciones & Mensajes)
    initDB,
    getConversationsList,
    getConversation,
    saveConversation,
    deleteConversation,
    deleteAllConversations,
    renameConversation,

    // Constantes de esquema exportadas
    DB_NAME,
    DB_VERSION,
    STORE_CONVERSATIONS,
    STORE_MESSAGES,
    STORE_ATTACHMENTS
  };
});
