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

  function getCharts() {
    return (typeof window !== 'undefined' && window.ChatCharts) ? window.ChatCharts : null;
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

  /**
   * Crea el elemento DOM inicial de la tarjeta con estado de carga para el turno en vivo.
   */
  function createLiveToolCard(rawName, toolArgs = {}) {
    if (typeof document === 'undefined') return null;
    const Markdown = getMarkdown();
    const norm = normalizeName(rawName);
    const cardDiv = document.createElement('div');
    cardDiv.className = 'tool-card-wrapper';

    // 1. JavaScript Execution
    if (norm === 'executejavascript') {
      const codeToRun = toolArgs.code || toolArgs.javascript || toolArgs.js || toolArgs.script || toolArgs.input || '';
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
      return cardDiv;
    }

    // 2. Web Page / PDF Fetch
    if (norm === 'fetchwebpage' || norm === 'downloadpdf') {
      const isPdfCall = norm === 'downloadpdf';
      const urlToFetch = toolArgs.url || toolArgs.URL || toolArgs.uri || toolArgs.link || toolArgs.href || toolArgs.path || toolArgs.input || '';
      const cardIcon = isPdfCall ? '📄' : '🌐';
      const cardTitle = isPdfCall ? t('tool_pdf_title') : t('tool_web_title');

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
              <div class="url-badge"><a href="${Markdown.sanitizeUrl(urlToFetch)}" target="_blank" rel="noopener noreferrer">${Markdown.escapeHtml(urlToFetch)}</a></div>
            </div>
            <div class="web-card-section web-response-section">
              <div class="section-label section-response-label">${t('tool_web_receiving') || 'Recibiendo contenido...'}</div>
              <div class="web-response-body tool-loading-placeholder">⏳ ${isPdfCall ? t('tool_loading_pdf') : t('tool_loading_web')}</div>
            </div>
          </div>
        </div>
      `;
      return cardDiv;
    }

    // 3. Web Search
    if (norm === 'searchweb') {
      const queryToSearch = toolArgs.query || toolArgs.q || toolArgs.search || toolArgs.keyword || toolArgs.text || toolArgs.input || '';
      cardDiv.innerHTML = `
        <div class="web-search-card">
          <div class="search-card-header">
            <div class="search-card-title">
              <span>🔍</span>
              <span>${t('tool_search_title') || 'Búsqueda en Internet'}</span>
            </div>
            <div class="tool-card-header-actions">
              <span class="search-card-badge status-loading">⏳ ${t('tool_badge_searching') || 'Buscando...'}</span>
              <button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Minimizar'}"><span>▾</span></button>
            </div>
          </div>
          <div class="tool-card-collapsible-body">
            <div class="search-query-section">
              <div class="section-label">${t('tool_search_query')}</div>
              <div class="query-badge">🔍 <strong>${Markdown.escapeHtml(queryToSearch)}</strong></div>
            </div>
            <div class="search-results-section">
              <div class="section-label search-sources-label">${t('tool_search_searching') || 'Buscando fuentes...'}</div>
              <div class="search-results-list tool-loading-placeholder">⏳ ${t('tool_loading_search') || 'Consultando motores de búsqueda...'}</div>
            </div>
          </div>
        </div>
      `;
      return cardDiv;
    }

    // 4. Base de Conocimiento RAG (read_chapter_content)
    if (norm === 'readchaptercontent' || norm === 'readchapter') {
      const docId = toolArgs.docId || toolArgs.doc_id || '';
      const chapterId = toolArgs.chapterId || toolArgs.chapter_id || '';
      cardDiv.innerHTML = `
        <div class="tool-execution-card rag-execution-card">
          <div class="tool-card-header">
            <div class="tool-card-title">
              <span>📖</span>
              <span>Base de Conocimiento (RAG Local)</span>
            </div>
            <div class="tool-card-header-actions">
              <span class="tool-card-badge status-loading">⏳ Consultando doc "${Markdown.escapeHtml(docId)}", Cap ${Markdown.escapeHtml(String(chapterId))}...</span>
              <button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Minimizar'}"><span>▾</span></button>
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

    const cardDiv = document.createElement('div');
    cardDiv.className = 'tool-card-wrapper';

    // 1. Gráficos interactivos SVG (render_chart)
    if (norm === 'renderchart') {
      const Charts = getCharts();
      if (Charts && Charts.renderChartCard) {
        cardDiv.innerHTML = Charts.renderChartCard(toolArgs);
      } else {
        cardDiv.innerHTML = `<div class="chat-chart-card">📊 ${Markdown.escapeHtml(toolArgs.title || 'Gráfico')}</div>`;
      }
      return cardDiv;
    }

    // 2. Ejecución de JavaScript
    if (norm === 'executejavascript') {
      const codeToRun = toolArgs.code || toolArgs.javascript || toolArgs.js || toolArgs.script || toolArgs.input || '';
      let outText = '';
      if (toolMsg && toolMsg.content) {
        try {
          const parsedRes = JSON.parse(toolMsg.content);
          outText = parsedRes.result || (parsedRes.logs && parsedRes.logs.length > 0 ? parsedRes.logs.join('\n') : (parsedRes.error ? `Error: ${parsedRes.error}` : toolMsg.content));
        } catch (e) {
          outText = toolMsg.content;
        }
      }

      cardDiv.innerHTML = `
        <div class="tool-execution-card">
          <div class="tool-card-header">
            <div class="tool-card-title">
              <span>⚡</span>
              <span>${t('tool_js_title_running') || 'execute_javascript'}</span>
            </div>
            <div class="tool-card-header-actions">
              <span class="tool-card-badge status-success">✅ ${t('tool_status_success') || 'Completado'}</span>
              <button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Minimizar'}"><span>▾</span></button>
            </div>
          </div>
          <div class="tool-card-collapsible-body">
            <pre class="tool-card-code"><code>${Markdown.escapeHtml(codeToRun)}</code></pre>
            <div class="tool-card-result">
              <div class="tool-result-label">${t('tool_sandbox_output') || 'Salida del Sandbox:'}</div>
              <pre class="tool-result-pre"><code>${Markdown.escapeHtml(outText)}</code></pre>
            </div>
          </div>
        </div>
      `;
      return cardDiv;
    }

    // 3. Búsqueda Web
    if (norm === 'searchweb') {
      const queryToSearch = toolArgs.query || toolArgs.q || toolArgs.search || toolArgs.keyword || toolArgs.text || '';
      let resultsHtml = '';
      if (toolMsg && toolMsg.content) {
        resultsHtml = `<div class="search-results-list"><div class="search-result-snippet">${Markdown.renderMarkdown(toolMsg.content)}</div></div>`;
      } else {
        resultsHtml = `<div class="search-results-list"><div class="search-result-snippet">${t('tool_search_empty')}</div></div>`;
      }

      cardDiv.innerHTML = `
        <div class="web-search-card">
          <div class="search-card-header">
            <div class="search-card-title">
              <span>🔍</span>
              <span>${t('tool_search_title') || 'Búsqueda en Internet'}</span>
            </div>
            <div class="tool-card-header-actions">
              <span class="search-card-badge status-success">✅ ${t('tool_status_success') || 'Completado'}</span>
              <button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Minimizar'}"><span>▾</span></button>
            </div>
          </div>
          <div class="tool-card-collapsible-body">
            <div class="search-query-section">
              <div class="section-label">${t('tool_search_query') || 'Consulta realizada:'}</div>
              <div class="query-badge">🔍 <strong>${Markdown.escapeHtml(queryToSearch)}</strong></div>
            </div>
            <div class="search-results-section">
              <div class="section-label">${t('tool_search_sources_label') || 'Fuentes y resultados encontrados:'}</div>
              ${resultsHtml}
            </div>
          </div>
        </div>
      `;
      return cardDiv;
    }

    // 4. Consulta Web o Descarga de PDF
    if (norm === 'fetchwebpage' || norm === 'downloadpdf') {
      const isPdfCall = norm === 'downloadpdf';
      const urlToFetch = toolArgs.url || toolArgs.URL || toolArgs.uri || toolArgs.link || toolArgs.href || toolArgs.path || toolArgs.input || '';
      let responseContent = '';
      let httpStatus = 200;

      if (toolMsg && toolMsg.content) {
        try {
          const parsed = JSON.parse(toolMsg.content);
          responseContent = parsed.content || parsed.error || toolMsg.content;
          httpStatus = parsed.status || 200;
        } catch (e) {
          responseContent = toolMsg.content;
        }
      }

      const cardIcon = isPdfCall ? '📄' : '🌐';
      const cardTitle = isPdfCall ? t('tool_pdf_title') : t('tool_web_title');

      cardDiv.innerHTML = `
        <div class="web-request-card ${isPdfCall ? 'pdf-request-card' : ''}">
          <div class="web-card-header">
            <div class="web-card-title">
              <span>${cardIcon}</span>
              <span>${cardTitle}</span>
            </div>
            <div class="tool-card-header-actions">
              <span class="web-card-badge status-success">${isPdfCall ? 'PDF OK' : `HTTP ${httpStatus} OK`}</span>
              <button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Minimizar'}"><span>▾</span></button>
            </div>
          </div>
          <div class="tool-card-collapsible-body">
            <div class="web-card-section web-request-section">
              <div class="section-label">${t('tool_web_requested_url') || 'URL consultada:'}</div>
              <div class="url-badge"><a href="${Markdown.sanitizeUrl(urlToFetch)}" target="_blank" rel="noopener noreferrer">${Markdown.escapeHtml(urlToFetch)}</a></div>
            </div>
            <div class="web-card-section web-response-section">
              <div class="section-label">${t('tool_web_content_received', { size: responseContent.length + ' chars' })}</div>
              <div class="web-response-body"><code>${Markdown.escapeHtml(responseContent.slice(0, 1500))}${responseContent.length > 1500 ? '...' : ''}</code></div>
            </div>
          </div>
        </div>
      `;
      return cardDiv;
    }

    // 5. Base de Conocimiento RAG (read_chapter_content)
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

  return {
    normalizeName,
    createLiveToolCard,
    renderHistoricalToolCard
  };
}));
