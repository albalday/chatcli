/**
 * Módulo de almacenamiento y persistencia de configuración (ChatStorage).
 * Compatible con file:// y http:// tanto en modo script clásico como ES module.
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatStorage = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

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
    enableAgentJs: true,
    enableAgentWeb: true,
    enableAgentSearch: true,
    enableAgentChart: true,
    enableContextCache: true,
    enableRawLogs: false,
    sendDateTime: true
  };

  const STORAGE_PREFIX = 'chatcli_';
  const DEFAULT_EXPIRY_DAYS = 365;

  const memoryStorage = new Map();

  function isLocalStorageAvailable() {
    try {
      const testKey = '__chatcli_test__';
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
      } catch (e) {
        // Fallback a cookies
      }
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

  function loadConfig() {
    const apiUrl = getStorageItem('apiUrl');
    const apiType = getStorageItem('apiType');
    const apiKey = getStorageItem('apiKey');
    const model = getStorageItem('model');
    const systemPrompt = getStorageItem('systemPrompt');
    const temperature = getStorageItem('temperature');
    const reasoningEffort = getStorageItem('reasoningEffort');
    const theme = getStorageItem('theme');
    const language = getStorageItem('language');
    const enableAgentJs = getStorageItem('enableAgentJs');
    const enableAgentWeb = getStorageItem('enableAgentWeb');
    const enableAgentSearch = getStorageItem('enableAgentSearch');
    const enableAgentChart = getStorageItem('enableAgentChart');
    const enableContextCache = getStorageItem('enableContextCache');
    const enableRawLogs = getStorageItem('enableRawLogs');
    const sendDateTime = getStorageItem('sendDateTime');
    const modelReasoningConfigRaw = getStorageItem('modelReasoningConfig');

    let effectiveApiUrl = apiUrl;
    if (!effectiveApiUrl || effectiveApiUrl === 'https://api.openai.com/v1') {
      effectiveApiUrl = DEFAULT_CONFIG.apiUrl;
    }

    let effectiveTheme = theme;
    if (effectiveTheme !== 'dark' && effectiveTheme !== 'light') {
      effectiveTheme = 'light';
    }

    let effectiveLanguage = language;
    if (effectiveLanguage !== 'es' && effectiveLanguage !== 'en') {
      // Usar auto-detección del módulo i18n si existe, o default
      if (typeof window !== 'undefined' && window.ChatI18n && window.ChatI18n.detectInitialLanguage) {
        effectiveLanguage = window.ChatI18n.detectInitialLanguage();
      } else {
        effectiveLanguage = DEFAULT_CONFIG.language;
      }
    }

    let parsedReasoningConfig = null;
    try {
      if (modelReasoningConfigRaw) {
        parsedReasoningConfig = JSON.parse(modelReasoningConfigRaw);
      }
    } catch (e) {}

    let effectiveApiType = (apiType && apiType !== 'auto') ? apiType : DEFAULT_CONFIG.apiType;

    let effectiveSystemPrompt = systemPrompt !== null ? systemPrompt : DEFAULT_CONFIG.systemPrompt;
    if (effectiveSystemPrompt && (
      effectiveSystemPrompt.startsWith('Eres un asistente de IA útil') ||
      effectiveSystemPrompt.startsWith('You are a helpful, concise and precise AI assistant')
    )) {
      effectiveSystemPrompt = '';
    }

    return {
      apiUrl: effectiveApiUrl,
      apiType: effectiveApiType,
      apiKey: apiKey !== null ? apiKey : DEFAULT_CONFIG.apiKey,
      model: model !== null && model !== '' ? model : DEFAULT_CONFIG.model,
      systemPrompt: effectiveSystemPrompt,
      temperature: temperature !== null && temperature !== '' ? temperature : DEFAULT_CONFIG.temperature,
      reasoningEffort: (reasoningEffort === 'off' || reasoningEffort === 'none') ? 'none' : (reasoningEffort !== null && reasoningEffort !== '' ? reasoningEffort : DEFAULT_CONFIG.reasoningEffort),
      modelReasoningConfig: parsedReasoningConfig,
      theme: effectiveTheme,
      language: effectiveLanguage,
      enableAgentJs: parseBool(enableAgentJs, DEFAULT_CONFIG.enableAgentJs),
      enableAgentWeb: parseBool(enableAgentWeb, DEFAULT_CONFIG.enableAgentWeb),
      enableAgentSearch: parseBool(enableAgentSearch, DEFAULT_CONFIG.enableAgentSearch),
      enableAgentChart: parseBool(enableAgentChart, DEFAULT_CONFIG.enableAgentChart),
      enableContextCache: parseBool(enableContextCache, DEFAULT_CONFIG.enableContextCache),
      enableRawLogs: parseBool(enableRawLogs, DEFAULT_CONFIG.enableRawLogs),
      sendDateTime: parseBool(sendDateTime, DEFAULT_CONFIG.sendDateTime)
    };
  }

  function saveConfig(config) {
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
    if (config.enableAgentJs !== undefined) setStorageItem('enableAgentJs', String(config.enableAgentJs));
    if (config.enableAgentWeb !== undefined) setStorageItem('enableAgentWeb', String(config.enableAgentWeb));
    if (config.enableAgentSearch !== undefined) setStorageItem('enableAgentSearch', String(config.enableAgentSearch));
    if (config.enableAgentChart !== undefined) setStorageItem('enableAgentChart', String(config.enableAgentChart));
    if (config.enableContextCache !== undefined) setStorageItem('enableContextCache', String(config.enableContextCache));
    if (config.enableRawLogs !== undefined) setStorageItem('enableRawLogs', String(config.enableRawLogs));
    if (config.sendDateTime !== undefined) setStorageItem('sendDateTime', String(config.sendDateTime));
  }

  function resetConfigToDefaults() {
    saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }

  function getDefaultConfig() {
    return { ...DEFAULT_CONFIG };
  }

  return {
    setStorageItem,
    getStorageItem,
    deleteStorageItem,
    setCookie: setStorageItem,
    getCookie: getStorageItem,
    deleteCookie: deleteStorageItem,
    loadConfig,
    saveConfig,
    resetConfigToDefaults,
    getDefaultConfig
  };
});
