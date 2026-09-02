/** Renderer genérico: cada tool declara su propia vista. */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') module.exports = factory();
  else root.ChatToolCards = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const getMarkdown = () => (typeof window !== 'undefined' && window.ChatMarkdown) || { escapeHtml: value => String(value || '') };
  const t = (key, params) => (typeof window !== 'undefined' && window.ChatI18n?.t) ? window.ChatI18n.t(key, params) : key;
  const normalizeName = name => String(name || '').trim().toLowerCase().replace(/_/g, '');
  const getView = name => (typeof window !== 'undefined' && window.ChatAgentCore?.registry?.getTool) ? window.ChatAgentCore.registry.getTool(name)?.view : null;
  const context = () => ({ document: typeof document === 'undefined' ? null : document, markdown: getMarkdown(), charts: typeof window !== 'undefined' ? window.ChatCharts : null, t });
  function fallback(name, args, isHistorical = false) {
    const card = document.createElement('div'); card.className = 'tool-card-wrapper';
    const hasArgs = args && typeof args === 'object' && Object.keys(args).length > 0;
    const tool = (typeof window !== 'undefined' && window.ChatAgentCore?.registry?.getTool) ? window.ChatAgentCore.registry.getTool(name) : null;
    const icon = tool?.metadata?.icon || '⚙️';
    const badgeClass = isHistorical ? 'tool-card-badge status-success' : 'tool-card-badge status-loading';
    const badgeText = isHistorical ? `✅ ${t('tool_status_success') || 'Completado'}` : `⏳ ${t('tool_badge_executing') || 'Ejecutando...'}`;
    const collapseBtn = hasArgs
      ? `<button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Minimizar'}"><span>▾</span></button>`
      : '';
    const bodyHtml = hasArgs
      ? `<div class="tool-card-collapsible-body"><div class="tool-card-result"><pre class="tool-card-code"><code>${getMarkdown().escapeHtml(JSON.stringify(args, null, 2))}</code></pre></div></div>`
      : '';
    card.innerHTML = `<div class="tool-execution-card"><div class="tool-card-header"><div class="tool-card-title"><span>${icon}</span><span>${getMarkdown().escapeHtml(name)}</span></div><div class="tool-card-header-actions"><span class="${badgeClass}">${badgeText}</span>${collapseBtn}</div></div>${bodyHtml}</div>`;
    return card;
  }
  function createLiveToolCard(name, args = {}) { if (typeof document === 'undefined') return null; const view = getView(name); return view?.createLiveCard ? view.createLiveCard(args, context()) : fallback(name, args, false); }
  function updateLiveToolCard(card, name, args = {}, result = {}, elapsedMs = 0) { const view = getView(name); if (view?.updateLiveCard) return view.updateLiveCard(card, args, result, elapsedMs, context()); const badge = card?.querySelector('.tool-card-badge'); if (badge) { const isSuccess = result?.success !== false && !result?.error; badge.className = `tool-card-badge ${isSuccess ? 'status-success' : 'status-error'}`; badge.textContent = isSuccess ? `✅ ${t('tool_status_success') || 'Completado'} (${elapsedMs}ms)` : `❌ Error (${elapsedMs}ms)`; } }
  function renderHistoricalToolCard(call, message) { if (!call?.function || typeof document === 'undefined') return null; let args = {}; try { args = typeof call.function.arguments === 'object' ? call.function.arguments : JSON.parse(call.function.arguments || '{}'); } catch (e) { args = { input: call.function.arguments || '' }; } const view = getView(call.function.name); return view?.renderHistoricalCard ? view.renderHistoricalCard(args, message, context()) : fallback(call.function.name, args, true); }
  return { normalizeName, resolveToolView: getView, createLiveToolCard, updateLiveToolCard, renderHistoricalToolCard };
}));
