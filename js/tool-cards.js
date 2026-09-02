/**
 * Módulo de Renderizado de Tarjetas de Herramientas (ChatToolCards) para ZeroChat.
 * Unifica la creación y actualización reactiva de tarjetas DOM para herramientas agénticas
 * (execute_javascript, fetch_web_page, download_pdf, search_web, render_chart y herramientas MCP)
 * tanto durante la ejecución en vivo como al restaurar conversaciones desde el historial.
 */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatToolCards = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function getMarkdown() {
    return (typeof window !== 'undefined' && window.ChatMarkdown) ? window.ChatMarkdown : {
      escapeHtml: (str) => String(str || ''),
      sanitizeUrl: (url) => String(url || ''),
      renderMarkdown: (txt) => String(txt || '')
    };
  }

  function getFileParser() {
    return (typeof window !== 'undefined' && window.ChatFileParser) ? window.ChatFileParser : {
      formatBytes: (b) => `${b} B`
    };
  }

  function getI18n() {
    return (typeof window !== 'undefined' && window.ChatI18n) ? window.ChatI18n : {
      t: (k) => k
    };
  }

  function t(key, params) {
    const i18n = getI18n();
    return i18n.t ? i18n.t(key, params) : key;
  }

  function normalizeName(rawName) {
    return String(rawName || '').trim().toLowerCase().replace(/_/g, '');
  }

  function getAgentCore() {
    return (typeof window !== 'undefined' && window.ChatAgentCore) ? window.ChatAgentCore : null;
  }

  function createToolViewContext() {
    return {
      document: typeof document !== 'undefined' ? document : null,
      markdown: getMarkdown(),
      charts: (typeof window !== 'undefined' && window.ChatCharts) ? window.ChatCharts : null,
      t
    };
  }

  function resolveToolView(rawName) {
    const AgentCore = getAgentCore();
    const tool = AgentCore?.registry?.getTool ? AgentCore.registry.getTool(rawName) : null;
    return tool?.view || null;
  }

  /**
   * Crea el elemento DOM inicial de la tarjeta con estado de carga para el turno en vivo.
   */
  function createLiveToolCard(rawName, toolArgs = {}) {
    if (typeof document === 'undefined') return null;
    const Markdown = getMarkdown();
    const norm = normalizeName(rawName);
    const toolView = resolveToolView(rawName);
    if (typeof toolView?.createLiveCard === 'function') {
      return toolView.createLiveCard(toolArgs, createToolViewContext());
    }
    const cardDiv = document.createElement('div');
    cardDiv.className = 'tool-card-wrapper';

    // 4. Base de Conocimiento RAG (list_documents / search_knowledge_base / read_chapter_content)
    if (norm === 'listdocuments' || norm === 'listknowledgebase' || norm === 'getdocuments' || norm === 'listdocs' || norm === 'listardocumentos' ||
        norm === 'searchknowledgebase' || norm === 'searchkb' || norm === 'searchdocuments' || norm === 'searchknowledge' || norm === 'buscarendocumentos') {
      const isSearch = norm.includes('search') || norm.includes('buscar');
      const query = toolArgs.query || toolArgs.q || toolArgs.search || '';
      cardDiv.innerHTML = `
        <div class="tool-execution-card rag-execution-card collapsed">
          <div class="tool-card-header">
            <div class="tool-card-title">
              <span>📖</span>
              <span>Base de Conocimiento (${isSearch ? `Búsqueda: "${Markdown.escapeHtml(query)}"` : 'Índice de Documentos'})</span>
            </div>
            <div class="tool-card-header-actions">
              <span class="tool-card-badge status-loading">⏳ ${isSearch ? 'Buscando en base de conocimiento...' : 'Consultando documentos indexados...'}</span>
              <button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Expandir'}"><span>▸</span></button>
            </div>
          </div>
          <div class="tool-card-collapsible-body">
            <div class="tool-card-result">
              <div class="tool-loading-placeholder">⏳ Recuperando índice y resúmenes desde IndexedDB...</div>
            </div>
          </div>
        </div>
      `;
      return cardDiv;
    }

    if (norm === 'readchaptercontent' || norm === 'readchapter') {
      const docId = toolArgs.docId || toolArgs.doc_id || '';
      const chapterId = toolArgs.chapterId || toolArgs.chapter_id || '';
      cardDiv.innerHTML = `
        <div class="tool-execution-card rag-execution-card collapsed">
          <div class="tool-card-header">
            <div class="tool-card-title">
              <span>📖</span>
              <span>Base de Conocimiento (RAG Local)</span>
            </div>
            <div class="tool-card-header-actions">
              <span class="tool-card-badge status-loading">⏳ Consultando doc "${Markdown.escapeHtml(docId)}", Cap ${Markdown.escapeHtml(String(chapterId))}...</span>
              <button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Expandir'}"><span>▸</span></button>
            </div>
          </div>
          <div class="tool-card-collapsible-body">
            <div class="tool-card-result">
              <div class="tool-loading-placeholder">⏳ Recuperando contenido íntegro del capítulo desde IndexedDB...</div>
            </div>
          </div>
        </div>
      `;
      return cardDiv;
    }

    // 5. Default / Generic / MCP
    const isMcp = rawName.startsWith('mcp__') || rawName.startsWith('mcp_');
    const displayTitle = isMcp ? `🔌 MCP: ${rawName.replace(/^mcp__([^_]+)__/, '$1 / ')}` : `⚙️ ${rawName}`;
    cardDiv.innerHTML = `
      <div class="tool-execution-card">
        <div class="tool-card-header">
          <div class="tool-card-title">
            <span>${isMcp ? '🔌' : '⚙️'}</span>
            <span>${Markdown.escapeHtml(displayTitle)}</span>
          </div>
          <div class="tool-card-header-actions">
            <span class="tool-card-badge status-loading">⏳ ${t('tool_badge_executing') || 'Ejecutando...'}</span>
            <button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Minimizar'}"><span>▾</span></button>
          </div>
        </div>
        <div class="tool-card-collapsible-body">
          <pre class="tool-card-code"><code>${Markdown.escapeHtml(JSON.stringify(toolArgs, null, 2))}</code></pre>
          <div class="tool-card-result">
            <div class="tool-loading-placeholder">⏳ ${t('tool_badge_executing') || 'Ejecutando...'}</div>
          </div>
        </div>
      </div>
    `;
    return cardDiv;
  }

  /**
   * Renderiza una tarjeta de herramienta estática reconstruida desde el historial de IndexedDB.
   */
  function renderHistoricalToolCard(tc, toolMsg) {
    if (!tc || !tc.function || typeof document === 'undefined') return null;
    const Markdown = getMarkdown();
    const rawFuncName = tc.function.name || '';
    const norm = normalizeName(rawFuncName);

    let toolArgs = {};
    try {
      toolArgs = typeof tc.function.arguments === 'object' ? tc.function.arguments : JSON.parse(tc.function.arguments || '{}');
    } catch (e) {
      toolArgs = { input: tc.function.arguments || '' };
    }

    const toolView = resolveToolView(rawFuncName);
    if (typeof toolView?.renderHistoricalCard === 'function') {
      return toolView.renderHistoricalCard(toolArgs, toolMsg, createToolViewContext());
    }

    const cardDiv = document.createElement('div');
    cardDiv.className = 'tool-card-wrapper';

    // 5a. Base de Conocimiento RAG (list_documents / search_knowledge_base)
    if (norm === 'listdocuments' || norm === 'listknowledgebase' || norm === 'getdocuments' || norm === 'listdocs' || norm === 'listardocumentos' ||
        norm === 'searchknowledgebase' || norm === 'searchkb' || norm === 'searchdocuments' || norm === 'searchknowledge' || norm === 'buscarendocumentos') {
      const isSearch = norm.includes('search') || norm.includes('buscar');
      const query = toolArgs.query || toolArgs.q || toolArgs.search || '';
      let textContent = '';
      let isSuccess = true;
      let count = 0;

      if (toolMsg && toolMsg.content) {
        try {
          const parsed = JSON.parse(toolMsg.content);
          textContent = parsed.text || toolMsg.content;
          count = parsed.count ?? parsed.matchesCount ?? (parsed.documents ? parsed.documents.length : 0);
          isSuccess = parsed.success !== false && !parsed.error;
        } catch (e) {
          textContent = toolMsg.content;
        }
      }

      cardDiv.innerHTML = `
        <div class="tool-execution-card rag-execution-card collapsed">
          <div class="tool-card-header">
            <div class="tool-card-title">
              <span>📖</span>
              <span>Base de Conocimiento (${isSearch ? `Búsqueda: "${Markdown.escapeHtml(query)}"` : 'Índice de Documentos'})</span>
            </div>
            <div class="tool-card-header-actions">
              <span class="tool-card-badge ${isSuccess ? 'status-success' : 'status-error'}">${isSuccess ? `✅ ${count} doc${count === 1 ? '' : 's'} indexado${count === 1 ? '' : 's'}` : '❌ Error al consultar'}</span>
              <button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Expandir'}"><span>▸</span></button>
            </div>
          </div>
          <div class="tool-card-collapsible-body">
            <div class="tool-card-result">
              <pre class="tool-result-pre"><code>${Markdown.escapeHtml(textContent.slice(0, 3000))}${textContent.length > 3000 ? '\n... (texto completo truncado en tarjeta)' : ''}</code></pre>
            </div>
          </div>
        </div>
      `;
      return cardDiv;
    }

    // 5b. Base de Conocimiento RAG (read_chapter_content)
    if (norm === 'readchaptercontent' || norm === 'readchapter') {
      const docId = toolArgs.docId || toolArgs.doc_id || '';
      const chapterId = toolArgs.chapterId || toolArgs.chapter_id || '';
      let chapterContent = '';
      let charCount = 0;
      let isSuccess = true;

      if (toolMsg && toolMsg.content) {
        try {
          const parsed = JSON.parse(toolMsg.content);
          chapterContent = parsed.content || toolMsg.content;
          charCount = parsed.charCount || chapterContent.length;
          isSuccess = parsed.success !== false;
        } catch (e) {
          chapterContent = toolMsg.content;
          charCount = chapterContent.length;
        }
      }

      cardDiv.innerHTML = `
        <div class="tool-execution-card rag-execution-card collapsed">
          <div class="tool-card-header">
            <div class="tool-card-title">
              <span>📖</span>
              <span>Base de Conocimiento: "${Markdown.escapeHtml(docId)}" (Capítulo ${Markdown.escapeHtml(String(chapterId))})</span>
            </div>
            <div class="tool-card-header-actions">
              <span class="tool-card-badge ${isSuccess ? 'status-success' : 'status-error'}">${isSuccess ? `✅ Capítulo recuperado (${charCount} caracteres)` : '❌ No encontrado'}</span>
              <button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Minimizar'}"><span>▸</span></button>
            </div>
          </div>
          <div class="tool-card-collapsible-body">
            <div class="tool-card-result">
              <pre class="tool-result-pre"><code>${Markdown.escapeHtml(chapterContent.slice(0, 2000))}${chapterContent.length > 2000 ? '\n... (texto completo truncado en tarjeta)' : ''}</code></pre>
            </div>
          </div>
        </div>
      `;
      return cardDiv;
    }

    // 6. Herramientas MCP o Personalizadas
    const isMcp = rawFuncName.startsWith('mcp__') || rawFuncName.startsWith('mcp_');
    const displayTitle = isMcp ? `🔌 MCP: ${rawFuncName.replace(/^mcp__([^_]+)__/, '$1 / ')}` : `⚙️ ${rawFuncName}`;
    let resultPreview = toolMsg?.content || 'Sin salida';

    cardDiv.innerHTML = `
      <div class="tool-execution-card">
        <div class="tool-card-header">
          <div class="tool-card-title">
            <span>${isMcp ? '🔌' : '⚙️'}</span>
            <span>${Markdown.escapeHtml(displayTitle)}</span>
          </div>
          <div class="tool-card-header-actions">
            <span class="tool-card-badge status-success">✅ ${t('tool_status_success') || 'Completado'}</span>
            <button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Minimizar'}"><span>▾</span></button>
          </div>
        </div>
        <div class="tool-card-collapsible-body">
          <pre class="tool-card-code"><code>${Markdown.escapeHtml(JSON.stringify(toolArgs, null, 2))}</code></pre>
          <div class="tool-card-result">
            <div class="tool-result-label">${t('tool_generic_result') || 'Resultado de la herramienta:'}</div>
            <pre class="tool-result-pre"><code>${Markdown.escapeHtml(resultPreview)}</code></pre>
          </div>
        </div>
      </div>
    `;
    return cardDiv;
  }

  /**
   * Actualiza una tarjeta de herramienta en vivo tras completar su ejecución.
   */
  function updateLiveToolCard(cardDiv, rawName, toolArgs = {}, result = {}, elapsedMs = 0) {
    if (!cardDiv || typeof document === 'undefined') return;
    const Markdown = getMarkdown();
    const norm = normalizeName(rawName);
    const toolView = resolveToolView(rawName);
    if (typeof toolView?.updateLiveCard === 'function') {
      toolView.updateLiveCard(cardDiv, toolArgs, result, elapsedMs, createToolViewContext());
      return;
    }

    // 4a. Base de Conocimiento RAG (list_documents / search_knowledge_base)
    if (norm === 'listdocuments' || norm === 'listknowledgebase' || norm === 'getdocuments' || norm === 'listdocs' || norm === 'listardocumentos' ||
        norm === 'searchknowledgebase' || norm === 'searchkb' || norm === 'searchdocuments' || norm === 'searchknowledge' || norm === 'buscarendocumentos') {
      const isSuccess = result?.success !== false && !result?.error;
      const count = result?.count ?? result?.matchesCount ?? (result?.documents ? result.documents.length : 0);
      const text = result?.text || (typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result || ''));

      const badgeEl = cardDiv.querySelector('.tool-card-badge');
      if (badgeEl) {
        badgeEl.className = `tool-card-badge ${isSuccess ? 'status-success' : 'status-error'}`;
        badgeEl.textContent = isSuccess
          ? `✅ ${count} doc${count === 1 ? '' : 's'} indexado${count === 1 ? '' : 's'} (${elapsedMs || 0}ms)`
          : `❌ ${result?.error || 'Error al consultar'}`;
      }

      const resContainer = cardDiv.querySelector('.tool-card-result');
      if (resContainer) {
        resContainer.innerHTML = `
          <pre class="tool-result-pre"><code>${Markdown.escapeHtml(text.slice(0, 3000))}${text.length > 3000 ? '\n... (texto completo truncado en tarjeta)' : ''}</code></pre>
        `;
      }
      return;
    }

    // 4b. Base de Conocimiento RAG (read_chapter_content)
    if (norm === 'readchaptercontent' || norm === 'readchapter') {
      const isSuccess = result?.success !== false && !result?.error;
      const charCount = result?.charCount || (result?.content ? result.content.length : 0);
      const contentStr = result?.content || result?.error || '';

      const badgeEl = cardDiv.querySelector('.tool-card-badge');
      if (badgeEl) {
        badgeEl.className = `tool-card-badge ${isSuccess ? 'status-success' : 'status-error'}`;
        badgeEl.textContent = isSuccess
          ? `✅ Capítulo recuperado (${charCount} caracteres)`
          : `❌ ${result?.error || 'No encontrado'}`;
      }

      const resContainer = cardDiv.querySelector('.tool-card-result');
      if (resContainer) {
        resContainer.innerHTML = `
          <pre class="tool-result-pre"><code>${Markdown.escapeHtml(contentStr.slice(0, 2000))}${contentStr.length > 2000 ? '\n... (texto completo truncado en tarjeta)' : ''}</code></pre>
        `;
      }
      return;
    }

    // 6. Generic / MCP
    const isSuccess = result?.success !== false && !result?.error;
    const badgeEl = cardDiv.querySelector('.tool-card-badge');
    if (badgeEl) {
      badgeEl.className = `tool-card-badge ${isSuccess ? 'status-success' : 'status-error'}`;
      badgeEl.textContent = isSuccess ? `✅ ${t('tool_status_success') || 'Completado'} (${elapsedMs || 0}ms)` : `❌ Error (${elapsedMs || 0}ms)`;
    }
    const resContainer = cardDiv.querySelector('.tool-card-result');
    if (resContainer) {
      const outText = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result || '');
      resContainer.innerHTML = `
        <div class="tool-result-label">${t('tool_generic_result') || 'Resultado de la herramienta:'}</div>
        <pre class="tool-result-pre"><code>${Markdown.escapeHtml(outText)}</code></pre>
      `;
    }
  }

  return {
    normalizeName,
    resolveToolView,
    createLiveToolCard,
    updateLiveToolCard,
    renderHistoricalToolCard
  };
}));
