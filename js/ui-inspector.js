/**
 * Módulo de Interfaz de Usuario para Consulta de Modelos e Inspector de Servidor.
 * ZeroChat - js/ui-inspector.js
 */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatUIInspector = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  let discoveredModels = [];

  function getI18n() {
    return (typeof window !== 'undefined' && window.ChatI18n)
      ? window.ChatI18n
      : (typeof require !== 'undefined' ? (function () { try { return require('./i18n.js'); } catch (e) { return null; } })() : null);
  }

  function getApi() {
    return (typeof window !== 'undefined' && window.ChatAPI)
      ? window.ChatAPI
      : (typeof require !== 'undefined' ? (function () { try { return require('./api.js'); } catch (e) { return null; } })() : null);
  }

  function getStorage() {
    return (typeof window !== 'undefined' && window.ChatStorage)
      ? window.ChatStorage
      : (typeof require !== 'undefined' ? (function () { try { return require('./cookies.js'); } catch (e) { return null; } })() : null);
  }

  function getMarkdown() {
    return (typeof window !== 'undefined' && window.ChatMarkdown)
      ? window.ChatMarkdown
      : (typeof require !== 'undefined' ? (function () { try { return require('./markdown.js'); } catch (e) { return null; } })() : null);
  }

  function getDebug() {
    return (typeof window !== 'undefined' && window.ChatDebug)
      ? window.ChatDebug
      : (typeof require !== 'undefined' ? (function () { try { return require('./debug.js'); } catch (e) { return null; } })() : null);
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

  function addDebugLog(type, text, rawData) {
    const Debug = getDebug();
    if (Debug && typeof Debug.addLog === 'function') {
      Debug.addLog(type, text, rawData);
    }
  }

  function loadCachedModels(elements, appConfig) {
    try {
      const Storage = getStorage();
      const cached = Storage?.getStorageItem ? Storage.getStorageItem('cached_models') : null;
      if (cached) {
        discoveredModels = JSON.parse(cached);
        if (Array.isArray(discoveredModels) && discoveredModels.length > 0) {
          populateModelList(elements, appConfig, discoveredModels, false);
        }
      }
    } catch (e) {
      console.warn('No se pudieron cargar modelos de caché:', e);
    }
    return discoveredModels;
  }

  function saveCachedModels(models) {
    discoveredModels = models || [];
    try {
      const Storage = getStorage();
      if (Storage?.setStorageItem) {
        Storage.setStorageItem('cached_models', JSON.stringify(discoveredModels));
      }
    } catch (e) {}
    return discoveredModels;
  }

  function getCachedModels() {
    return discoveredModels;
  }

  function populateModelList(elements, appConfig, models, selectFirstIfEmpty = false) {
    if (!models || !Array.isArray(models) || models.length === 0) return;

    const doc = elements?.modelDatalist?.ownerDocument || elements?.modelSelectHelper?.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;

    if (elements?.modelDatalist) {
      elements.modelDatalist.innerHTML = '';
      models.forEach(m => {
        const id = (typeof m === 'string' ? m : (m.id || m.name || '')).trim();
        if (id) {
          const opt = doc.createElement('option');
          opt.value = id;
          elements.modelDatalist.appendChild(opt);
        }
      });
    }

    if (elements?.modelSelectHelper) {
      elements.modelSelectHelper.innerHTML = '';
      const defaultOpt = doc.createElement('option');
      defaultOpt.value = '';
      defaultOpt.disabled = true;
      defaultOpt.selected = true;
      defaultOpt.textContent = t('model_select_count', { count: models.length });
      elements.modelSelectHelper.appendChild(defaultOpt);

      const currentVal = elements.settingModel ? elements.settingModel.value.trim() : (appConfig?.model || '');

      models.forEach(m => {
        const id = (typeof m === 'string' ? m : (m.id || m.name || '')).trim();
        if (id) {
          const opt = doc.createElement('option');
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

    if (selectFirstIfEmpty && elements?.settingModel) {
      const currentVal = elements.settingModel.value.trim();
      const firstId = (typeof models[0] === 'string' ? models[0] : (models[0].id || models[0].name || '')).trim();
      if (!currentVal && firstId) {
        elements.settingModel.value = firstId;
        if (elements.modelSelectHelper) elements.modelSelectHelper.value = firstId;
      }
    }
  }

  async function handleQueryServer(elements, appConfig) {
    if (!elements || !elements.btnQueryServer) return;

    const apiUrl = (elements.settingApiUrl ? elements.settingApiUrl.value : appConfig?.apiUrl || '').trim();
    const apiKey = (elements.settingApiKey ? elements.settingApiKey.value : appConfig?.apiKey || '').trim();
    const apiType = (elements.settingApiType ? elements.settingApiType.value : appConfig?.apiType || 'openai').trim();

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
      const API = getApi();
      if (!API?.fetchServerModels) {
        throw new Error('API query function not available.');
      }

      addDebugLog('network', `Consultando modelos en ${apiUrl} [${apiType}]`);
      addDebugLog('raw', `>>> OUTGOING GET/POST ${apiUrl} (fetchServerModels)`);
      const res = await API.fetchServerModels(apiUrl, apiKey, apiType);
      addDebugLog('raw', `<<< INCOMING (fetchServerModels):\n${JSON.stringify(res, null, 2)}`);

      if (res.success && res.models && res.models.length > 0) {
        saveCachedModels(res.models);
        populateModelList(elements, appConfig, res.models, true);

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
        elements.serverQueryStatus.className = 'server-query-status status-error';
        elements.serverQueryStatus.innerHTML = t('err_api_connect', { err: escapeHtml(err.message || String(err)) });
      }
    } finally {
      elements.btnQueryServer.disabled = false;
      elements.btnQueryServer.classList.remove('loading');
      if (queryText) queryText.textContent = t('btn_query_text');
    }
  }

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

  function renderInspectorReport(elements, report) {
    if (!elements || !elements.inspectorResults || !report) return;

    const p = report.provider || {};
    const ep = report.endpoint || {};
    const m = report.model || {};
    const caps = report.capabilities || {};

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
          <div class="cap-card-detail">${escapeHtml(c.detail || '')}</div>
        </div>
      `;
    });

    const modelInfoText = m.totalDiscovered > 0
      ? `${m.totalDiscovered} modelo(s) descubierto(s)`
      : (m.selected ? `Modelo: ${escapeHtml(m.selected)}` : 'Sin modelos listados');

    elements.inspectorResults.innerHTML = `
      <div class="inspector-header-meta">
        <div class="inspector-meta-item">
          <span class="meta-label">Proveedor</span>
          <span class="meta-value">${escapeHtml(p.label || p.id || 'Desconocido')}</span>
        </div>
        <div class="inspector-meta-item">
          <span class="meta-label">Endpoint Chat</span>
          <span class="meta-value" style="font-family: monospace; font-size: 0.775rem;">${escapeHtml(ep.normalized || ep.raw || '')}</span>
        </div>
        <div class="inspector-meta-item">
          <span class="meta-label">Modelos</span>
          <span class="meta-value">${escapeHtml(modelInfoText)}</span>
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

  async function handleRunInspector(elements, appConfig) {
    if (!elements || !elements.btnRunInspector || !elements.inspectorResults) return;

    const apiUrl = elements.settingApiUrl ? elements.settingApiUrl.value.trim() : (appConfig?.apiUrl || '');
    const apiType = elements.settingApiType ? elements.settingApiType.value : (appConfig?.apiType || 'openai');
    const apiKey = elements.settingApiKey ? elements.settingApiKey.value.trim() : (appConfig?.apiKey || '');
    const model = elements.settingModel ? elements.settingModel.value.trim() : (appConfig?.model || '');

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
      const API = getApi();
      if (!API?.inspectProvider) {
        throw new Error('Módulo de inspección no disponible.');
      }

      addDebugLog('network', `Ejecutando Provider Inspector en ${apiUrl} [${apiType}]`);
      const report = await API.inspectProvider({ apiUrl, apiType, apiKey, model });

      renderInspectorReport(elements, report);
    } catch (err) {
      console.error('Error in Provider Inspector:', err);
      elements.inspectorResults.innerHTML = `
        <div class="server-query-status status-error" style="display: block;">
          ${escapeHtml(err.message || String(err))}
        </div>
      `;
    } finally {
      elements.btnRunInspector.disabled = false;
      if (btnText) btnText.textContent = originalText;
    }
  }

  return {
    loadCachedModels,
    saveCachedModels,
    getCachedModels,
    populateModelList,
    handleQueryServer,
    handleRunInspector,
    renderInspectorReport,
    getBadgeClass,
    getBadgeIcon,
    getStatusLabel
  };
});
