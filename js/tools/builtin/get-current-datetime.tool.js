/** Tool autocontenida: get_current_datetime. */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') module.exports = factory();
  else root.ChatBuiltinGetCurrentDatetimeTool = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const definition = {
    name: 'get_current_datetime',
    description: 'Obtiene la hora exacta actual. NOTA: La fecha actual y la zona horaria ya están en tu System Prompt. Usa esta herramienta SÓLO si necesitas saber la hora/minuto exacto.',
    parameters: { type: 'object', properties: {} }
  };

  function createCardWrapper(ui) {
    const doc = ui?.document || (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;
    const cardDiv = doc.createElement('div');
    cardDiv.className = 'tool-card-wrapper';
    return cardDiv;
  }

  function getUiHelpers(ui) {
    return {
      Markdown: ui?.markdown || { escapeHtml: (value) => String(value || '') },
      t: ui?.t || ((key) => key)
    };
  }

  function createLiveCard(_args, ui) {
    const cardDiv = createCardWrapper(ui);
    if (!cardDiv) return null;
    const { t } = getUiHelpers(ui);
    cardDiv.innerHTML = `
      <div class="tool-execution-card">
        <div class="tool-card-header">
          <div class="tool-card-title">
            <span>⏱️</span>
            <span>${definition.name}</span>
          </div>
          <div class="tool-card-header-actions">
            <span class="tool-card-badge status-loading">⏳ ${t('tool_badge_executing') || 'Ejecutando...'}</span>
            <button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Minimizar'}"><span>▾</span></button>
          </div>
        </div>
        <div class="tool-card-collapsible-body">
          <div class="tool-card-result">
            <div class="tool-loading-placeholder">⏳ Consultando hora exacta...</div>
          </div>
        </div>
      </div>
    `;
    return cardDiv;
  }

  function updateLiveCard(cardDiv, _args, result = {}, elapsedMs = 0, ui) {
    if (!cardDiv) return;
    const { t } = getUiHelpers(ui);
    const isSuccess = result?.success !== false && !result?.error;
    const badgeEl = cardDiv.querySelector('.tool-card-badge');
    if (badgeEl) {
      badgeEl.className = `tool-card-badge ${isSuccess ? 'status-success' : 'status-error'}`;
      badgeEl.textContent = isSuccess
        ? `✅ ${t('tool_status_success') || 'Completado'} (${elapsedMs || 0}ms)`
        : `❌ Error (${elapsedMs || 0}ms)`;
    }
    const resContainer = cardDiv.querySelector('.tool-card-result');
    if (resContainer) {
      resContainer.innerHTML = '';
      const body = cardDiv.querySelector('.tool-card-collapsible-body');
      if (body) body.style.display = 'none';
    }
  }

  function renderHistoricalCard(_args, _toolMessage, ui) {
    const cardDiv = createCardWrapper(ui);
    if (!cardDiv) return null;
    const { t } = getUiHelpers(ui);
    cardDiv.innerHTML = `
      <div class="tool-execution-card">
        <div class="tool-card-header">
          <div class="tool-card-title"><span>⏱️</span><span>${definition.name}</span></div>
          <div class="tool-card-header-actions">
            <span class="tool-card-badge status-success">✅ ${t('tool_status_success') || 'Completado'}</span>
          </div>
        </div>
      </div>
    `;
    return cardDiv;
  }

  const toolView = { id: definition.name, createLiveCard, updateLiveCard, renderHistoricalCard };

  function createTool(Tool) {
    if (typeof Tool !== 'function') throw new Error('La clase Tool es necesaria para crear get_current_datetime.');
    return new Tool({
      id: definition.name,
      definition,
      aliases: ['get_current_time', 'get_datetime', 'current_time', 'current_date', 'get_date', 'now', 'fecha_actual', 'hora_actual'],
      category: 'system',
      metadata: { icon: '⏱️', label: definition.name },
      settings: { showInSettings: false },
      promptGuide: (lang) => lang === 'en'
        ? '- `get_current_datetime()`: Retrieves the exact current time. Use ONLY if the user asks for the exact time (the current date is already in your system context).'
        : '- `get_current_datetime()`: Obtiene la hora exacta. Usa SÓLO si el usuario pide la hora exacta (la fecha actual ya está en tu contexto de sistema).',
      isAvailable: (appConfig = {}) => appConfig.sendDateTime !== false,
      execute: async () => {
        return {
          success: true,
          iso: new Date().toISOString()
        };
      },
      result: {
        toMarkdown: () => ''
      },
      view: toolView
    });
  }

  const toolModule = { id: definition.name, definition, createTool, view: toolView };
  let manifestApi = null;
  if (typeof window !== 'undefined' && window.ChatToolManifest) manifestApi = window.ChatToolManifest;
  else if (typeof require !== 'undefined') { try { manifestApi = require('../tool-manifest.js'); } catch (e) {} }
  if (manifestApi?.builtin && !manifestApi.builtin.has(toolModule.id)) manifestApi.builtin.register(toolModule);
  return toolModule;
});
