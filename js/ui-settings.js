/**
 * Módulo de Interfaz de Usuario para Configuración, Perfiles y Herramientas.
 * ZeroChat - js/ui-settings.js
 */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatUISettings = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function getI18n() {
    return (typeof window !== 'undefined' && window.ChatI18n)
      ? window.ChatI18n
      : (typeof require !== 'undefined' ? (function () { try { return require('./i18n.js'); } catch (e) { return null; } })() : null);
  }

  function getStorage() {
    return (typeof window !== 'undefined' && window.ChatStorage)
      ? window.ChatStorage
      : (typeof require !== 'undefined' ? (function () { try { return require('./cookies.js'); } catch (e) { return null; } })() : null);
  }

  function getAgentCore() {
    return (typeof window !== 'undefined' && window.ChatAgentCore)
      ? window.ChatAgentCore
      : (typeof require !== 'undefined' ? (function () { try { return require('./agent-core.js'); } catch (e) { return null; } })() : null);
  }

  function getMarkdown() {
    return (typeof window !== 'undefined' && window.ChatMarkdown)
      ? window.ChatMarkdown
      : (typeof require !== 'undefined' ? (function () { try { return require('./markdown.js'); } catch (e) { return null; } })() : null);
  }

  function t(key, params) {
    const I18n = getI18n();
    if (I18n && typeof I18n.t === 'function') return I18n.t(key, params);
    return key;
  }

  function escapeHtml(str) {
    const Markdown = getMarkdown();
    if (Markdown && typeof Markdown.escapeHtml === 'function') {
      return Markdown.escapeHtml(str);
    }
    return String(str || '').replace(/[&<>"']/g, (m) => {
      switch (m) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return m;
      }
    });
  }

  function applyTheme(elements, appConfig, theme) {
    const doc = (typeof document !== 'undefined') ? document : null;
    const root = doc ? doc.documentElement : null;
    const effective = (theme === 'dark') ? 'dark' : 'light';
    if (appConfig) appConfig.theme = effective;

    if (root) {
      if (effective === 'dark') {
        root.setAttribute('data-theme', 'dark');
      } else {
        root.removeAttribute('data-theme');
      }
    }

    if (elements?.themeButtons && elements.themeButtons.length > 0) {
      elements.themeButtons.forEach(btn => {
        if (btn.getAttribute('data-theme') === effective) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }
    return effective;
  }

  function applyLanguage(elements, appConfig, lang, callbacks = {}) {
    const target = (lang === 'en') ? 'en' : 'es';
    if (appConfig) appConfig.language = target;

    const I18n = getI18n();
    if (I18n?.setLanguage) {
      I18n.setLanguage(target, true);
    }
    const Storage = getStorage();
    if (Storage?.saveConfig) {
      Storage.saveConfig({ language: target });
    }

    if (elements?.currentLangLabel) {
      elements.currentLangLabel.textContent = target.toUpperCase();
    }

    if (elements?.langButtons && elements.langButtons.length > 0) {
      elements.langButtons.forEach(btn => {
        if (btn.getAttribute('data-lang') === target) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    if (elements?.currentProfileName) {
      const activeProf = (Storage?.getActiveProfileName ? Storage.getActiveProfileName() : appConfig?.activeProfileName) || appConfig?.activeProfileName || 'Local chat';
      elements.currentProfileName.textContent = activeProf;
    }
    if (elements?.currentModelName) {
      elements.currentModelName.textContent = appConfig?.model ? appConfig.model : t('no_model');
    }

    if (typeof callbacks.updateReasoningUI === 'function' && appConfig) {
      callbacks.updateReasoningUI(appConfig.reasoningEffort);
    }

    if (elements?.settingSystemPrompt) {
      elements.settingSystemPrompt.setAttribute('placeholder', t('field_system_prompt_placeholder'));
    }
    return target;
  }

  function renderAgentToolsUI(container, currentEnabledTools = {}) {
    if (!container) return;
    const AgentCore = getAgentCore();
    const tools = (AgentCore?.registry && typeof AgentCore.registry.listToolsForUI === 'function')
      ? AgentCore.registry.listToolsForUI()
      : [];

    container.innerHTML = '';
    const doc = container.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;

    tools.forEach(tool => {
      const isChecked = currentEnabledTools[tool.id] !== undefined
        ? currentEnabledTools[tool.id] !== false
        : (currentEnabledTools[tool.name] !== undefined ? currentEnabledTools[tool.name] !== false : tool.defaultEnabled !== false);

      const title = t(tool.titleKey) || tool.titleFallback || tool.name;
      const desc = t(tool.descKey) || tool.descFallback || '';

      const card = doc.createElement('div');
      card.className = 'setting-toggle-card';
      card.innerHTML = `
        <div class="toggle-card-info">
          <div class="toggle-card-title">
            <span data-i18n="${escapeHtml(tool.titleKey)}">${escapeHtml(title)}</span>
          </div>
          <p class="toggle-card-desc" data-i18n="${escapeHtml(tool.descKey)}">${escapeHtml(desc)}</p>
        </div>
        <label class="switch">
          <input type="checkbox" class="agent-tool-checkbox" data-tool-id="${escapeHtml(tool.id)}" ${isChecked ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      `;
      container.appendChild(card);
    });
  }

  function gatherEnabledToolsFromUI(container) {
    const map = {};
    if (!container) return map;
    container.querySelectorAll('.agent-tool-checkbox').forEach(cb => {
      const tid = cb.getAttribute('data-tool-id');
      if (tid) map[tid] = cb.checked;
    });
    return map;
  }

  function applyProfileToForm(elements, profileData) {
    if (!elements || !profileData) return;

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

  function gatherCurrentFormConfig(elements, appConfig) {
    const profileName = elements?.settingProfileName ? elements.settingProfileName.value.trim() : (appConfig?.activeProfileName || 'Local chat');
    const selectedModel = elements?.settingModel ? elements.settingModel.value.trim() : '';

    return {
      activeProfileName: profileName,
      apiUrl: elements?.settingApiUrl ? elements.settingApiUrl.value.trim() : (appConfig?.apiUrl || 'http://localhost:1234/v1'),
      apiType: elements?.settingApiType ? elements.settingApiType.value : (appConfig?.apiType || 'openai'),
      apiKey: elements?.settingApiKey ? elements.settingApiKey.value.trim() : '',
      model: selectedModel,
      systemPrompt: elements?.settingSystemPrompt ? elements.settingSystemPrompt.value.trim() : '',
      temperature: elements?.settingTemperature ? elements.settingTemperature.value : '0.7',
      reasoningEffort: appConfig?.reasoningEffort || 'none',
      modelReasoningConfig: appConfig?.modelReasoningConfig || null,
      theme: appConfig?.theme || 'light',
      language: appConfig?.language || 'es',
      enabledTools: gatherEnabledToolsFromUI(elements?.agentToolsContainer),
      enableContextCache: elements?.settingEnableContextCache ? elements.settingEnableContextCache.checked : true,
      enableRawLogs: elements?.settingEnableRawLogs ? elements.settingEnableRawLogs.checked : Boolean(appConfig?.enableRawLogs),
      enableDebugMessages: Boolean(appConfig?.enableDebugMessages),
      sendDateTime: elements?.settingSendDateTime ? elements.settingSendDateTime.checked : true,
      activeRagBranchId: appConfig?.activeRagBranchId || ''
    };
  }

  function showProfileFeedback(elements, msg, type = 'success') {
    if (!elements || !elements.profileActionFeedback) return;
    elements.profileActionFeedback.style.display = 'block';
    elements.profileActionFeedback.className = `server-query-status status-${type}`;
    elements.profileActionFeedback.textContent = msg;
    setTimeout(() => {
      if (elements.profileActionFeedback) {
        elements.profileActionFeedback.style.display = 'none';
      }
    }, 4000);
  }

  function handleSaveProfile(elements, appConfig, populateProfileSelector) {
    const name = elements?.settingProfileName ? elements.settingProfileName.value.trim() : '';
    if (!name) {
      showProfileFeedback(elements, t('err_profile_name_empty') || 'Por favor, escribe un nombre para el perfil.', 'error');
      return;
    }

    const currentConfig = gatherCurrentFormConfig(elements, appConfig);
    const Storage = getStorage();
    if (Storage?.saveProfile) {
      Storage.saveProfile(name, currentConfig);
      if (typeof populateProfileSelector === 'function') {
        populateProfileSelector(name);
      }
      showProfileFeedback(elements, t('msg_profile_saved', { name }) || `Perfil "${name}" guardado con éxito.`, 'success');
    }
  }

  function handleDeleteProfile(elements, populateProfileSelector, applyProfile) {
    const name = elements?.settingProfileName ? elements.settingProfileName.value.trim() : '';
    if (!name) return;

    const confirmMsg = t('confirm_delete_profile', { name }) || `¿Estás seguro de que deseas eliminar el perfil "${name}"?`;
    if (!confirm(confirmMsg)) return;

    const Storage = getStorage();
    if (Storage?.deleteProfile) {
      Storage.deleteProfile(name);
      const newActive = Storage.getActiveProfileName ? Storage.getActiveProfileName() : 'Local chat';
      if (typeof populateProfileSelector === 'function') {
        populateProfileSelector(newActive);
      }
      const newProfileData = Storage.getProfile ? Storage.getProfile(newActive) : null;
      if (newProfileData && typeof applyProfile === 'function') {
        applyProfile(newProfileData);
      }
      showProfileFeedback(elements, t('msg_profile_deleted', { name }) || `Perfil "${name}" eliminado.`, 'success');
    }
  }

  function openSettingsModal(elements, appConfig, callbacks = {}) {
    if (!elements || !elements.settingsDialog) return;
    const Storage = getStorage();
    const activeProfileName = (Storage?.getActiveProfileName ? Storage.getActiveProfileName() : appConfig?.activeProfileName) || 'Local chat';

    if (typeof callbacks.populateProfileSelector === 'function') {
      callbacks.populateProfileSelector(activeProfileName);
    }

    if (elements.settingApiType) {
      elements.settingApiType.value = appConfig?.apiType || 'openai';
    }
    if (elements.settingApiUrl) elements.settingApiUrl.value = appConfig?.apiUrl || 'http://localhost:1234/v1';
    if (elements.settingApiKey) elements.settingApiKey.value = appConfig?.apiKey || '';
    if (elements.settingModel) elements.settingModel.value = appConfig?.model || '';
    if (elements.settingSystemPrompt) elements.settingSystemPrompt.value = appConfig?.systemPrompt || '';
    if (elements.settingTemperature) elements.settingTemperature.value = appConfig?.temperature || '0.7';
    if (elements.temperatureVal) elements.temperatureVal.textContent = appConfig?.temperature || '0.7';

    applyTheme(elements, appConfig, appConfig?.theme || 'light');
    applyLanguage(elements, appConfig, appConfig?.language || 'es', callbacks);

    if (elements.serverQueryStatus) elements.serverQueryStatus.style.display = 'none';
    if (elements.profileActionFeedback) elements.profileActionFeedback.style.display = 'none';

    if (typeof callbacks.loadCachedModels === 'function') {
      callbacks.loadCachedModels();
    }

    if (elements.agentToolsContainer) {
      renderAgentToolsUI(elements.agentToolsContainer, appConfig?.enabledTools || {});
    }
    if (elements.settingEnableContextCache) {
      elements.settingEnableContextCache.checked = appConfig?.enableContextCache !== false;
    }
    if (elements.settingEnableRawLogs) {
      elements.settingEnableRawLogs.checked = appConfig?.enableRawLogs === true;
    }
    if (elements.settingSendDateTime) {
      elements.settingSendDateTime.checked = appConfig?.sendDateTime !== false;
    }

    if (elements.modalTabs && elements.modalTabs.length > 0) {
      elements.modalTabs.forEach(b => b.classList.remove('active'));
      elements.modalPanes.forEach(p => p.classList.remove('active'));
      elements.modalTabs[0].classList.add('active');
      const doc = elements.settingsDialog.ownerDocument || document;
      const firstPane = doc.getElementById(elements.modalTabs[0].getAttribute('data-tab'));
      if (firstPane) firstPane.classList.add('active');
    }

    if (typeof elements.settingsDialog.showModal === 'function') {
      elements.settingsDialog.showModal();
    }
  }

  function closeSettingsModal(elements) {
    if (elements?.settingsDialog && typeof elements.settingsDialog.close === 'function') {
      elements.settingsDialog.close();
    }
  }

  function handleResetSettings(elements) {
    const Storage = getStorage();
    if (Storage?.getDefaultConfig) {
      const defaults = Storage.getDefaultConfig();
      if (elements.settingApiType) elements.settingApiType.value = defaults.apiType || 'openai';
      if (elements.settingApiUrl) elements.settingApiUrl.value = defaults.apiUrl;
      if (elements.settingApiKey) elements.settingApiKey.value = defaults.apiKey;
      if (elements.settingModel) elements.settingModel.value = defaults.model;
      if (elements.settingSystemPrompt) elements.settingSystemPrompt.value = '';
      if (elements.settingTemperature) elements.settingTemperature.value = defaults.temperature;
      if (elements.temperatureVal) elements.temperatureVal.textContent = defaults.temperature;

      applyTheme(elements, null, defaults.theme || 'light');
      applyLanguage(elements, null, defaults.language || 'es');

      if (elements.modelSelectHelper) elements.modelSelectHelper.value = defaults.model;
      if (elements.agentToolsContainer) renderAgentToolsUI(elements.agentToolsContainer, defaults.enabledTools || {});
      if (elements.settingEnableContextCache) elements.settingEnableContextCache.checked = defaults.enableContextCache !== false;
      if (elements.settingEnableRawLogs) elements.settingEnableRawLogs.checked = defaults.enableRawLogs === true;
      if (elements.settingSendDateTime) elements.settingSendDateTime.checked = defaults.sendDateTime !== false;
      return defaults;
    }
    return null;
  }

  function handleClearAllData() {
    if (!confirm(t('confirm_clear_all_data'))) return;
    const Storage = getStorage();
    if (Storage?.clearAllStorage) {
      Storage.clearAllStorage();
    } else {
      try { localStorage.clear(); } catch (e) {}
      try { sessionStorage.clear(); } catch (e) {}
    }
    if (typeof window !== 'undefined' && window.location) {
      window.location.reload();
    }
  }

  return {
    applyTheme,
    applyLanguage,
    renderAgentToolsUI,
    gatherEnabledToolsFromUI,
    applyProfileToForm,
    gatherCurrentFormConfig,
    showProfileFeedback,
    handleSaveProfile,
    handleDeleteProfile,
    openSettingsModal,
    closeSettingsModal,
    handleResetSettings,
    handleClearAllData
  };
});
