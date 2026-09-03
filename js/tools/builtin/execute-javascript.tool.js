/**
 * Tool autocontenida: execute_javascript.
 *
 * La dependencia de Sandbox se recibe desde ToolExecutionContext.services;
 * este módulo no depende de globals ni de resolutores del núcleo agéntico.
 */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatBuiltinExecuteJavascriptTool = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const definition = {
    name: 'execute_javascript',
    description: 'Ejecuta código JavaScript localmente en un sandbox seguro en el navegador para cálculos matemáticos y procesamiento de datos.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Código JS ejecutable.' }
      },
      required: ['code']
    }
  };

  function getCode(args) {
    return args?.code || args?.javascript || args?.js || args?.script || args?.input || (typeof args === 'string' ? args : '');
  }

  function toModel(_args, result, outcome) {
    return result?.success
      ? (result.result || (result.logs && result.logs.length > 0 ? result.logs.join('\n') : 'undefined'))
      : `Error: ${result?.error || outcome?.error || 'Error de ejecución'}`;
  }

  function toMarkdown(args, result, outcome) {
    const code = getCode(args);
    const output = toModel(args, result, outcome);
    return `> ⚡ **execute_javascript**\n> \`\`\`javascript\n> ${code.split('\n').join('\n> ')}\n> \`\`\`\n> \`\`\`\n> ${String(output).split('\n').join('\n> ')}\n> \`\`\``;
  }

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

  const SPINNER_SVG = '<svg class="ui-icon ui-icon-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>';
  const CHECK_SVG = '<svg class="ui-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  const ERROR_SVG = '<svg class="ui-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
  const CHEVRON_SVG = '<svg class="ui-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  const JS_ICON_SVG = '<svg class="ui-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>';

  function createLiveCard(args, ui) {
    const cardDiv = createCardWrapper(ui);
    if (!cardDiv) return null;
    const { Markdown, t } = getUiHelpers(ui);
    const code = getCode(args);
    cardDiv.innerHTML = `
      <div class="tool-execution-card">
        <div class="tool-card-header">
          <div class="tool-card-title">
            <span>${JS_ICON_SVG}</span>
            <span>${t('tool_js_title_running') || 'execute_javascript'}</span>
          </div>
          <div class="tool-card-header-actions">
            <span class="tool-card-badge status-loading">${SPINNER_SVG} <span>${t('tool_badge_executing') || 'Ejecutando...'}</span></span>
            <button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Minimizar'}">${CHEVRON_SVG}</button>
          </div>
        </div>
        <div class="tool-card-collapsible-body">
          <pre class="tool-card-code"><code>${Markdown.escapeHtml(code)}</code></pre>
          <div class="tool-card-result">
            <div class="tool-loading-placeholder">${SPINNER_SVG} <span>${t('tool_loading_js') || 'Ejecutando código en sandbox local...'}</span></div>
          </div>
        </div>
      </div>
    `;
    return cardDiv;
  }

  function updateLiveCard(cardDiv, _args, result = {}, elapsedMs = 0, ui) {
    if (!cardDiv) return;
    const { Markdown, t } = getUiHelpers(ui);
    const isSuccess = result?.success !== false && !result?.error;
    const badgeEl = cardDiv.querySelector('.tool-card-badge');
    if (badgeEl) {
      badgeEl.className = `tool-card-badge ${isSuccess ? 'status-success' : 'status-error'}`;
      badgeEl.innerHTML = isSuccess
        ? `${CHECK_SVG} <span>${t('tool_status_success') || 'Completado'} (${elapsedMs || 0}ms)</span>`
        : `${ERROR_SVG} <span>Error (${elapsedMs || 0}ms)</span>`;
    }
    const resContainer = cardDiv.querySelector('.tool-card-result');
    if (resContainer) {
      const output = isSuccess
        ? (result.result || (result.logs && result.logs.length > 0 ? result.logs.join('\n') : 'undefined'))
        : `Error: ${result.error || 'Error de ejecución'}`;
      const cleanOutput = String(output ?? '').trim();
      resContainer.innerHTML = `<div class="tool-result-label">${t('tool_sandbox_output') || 'Salida del Sandbox:'}</div><pre class="tool-result-pre"><code>${Markdown.escapeHtml(cleanOutput)}</code></pre>`;
    }
  }

  function renderHistoricalCard(args, toolMessage, ui) {
    const cardDiv = createCardWrapper(ui);
    if (!cardDiv) return null;
    const { Markdown, t } = getUiHelpers(ui);
    let output = '';
    if (toolMessage?.content) {
      try {
        const parsed = JSON.parse(toolMessage.content);
        output = parsed.result || (parsed.logs && parsed.logs.length > 0
          ? parsed.logs.join('\n')
          : (parsed.error ? `Error: ${parsed.error}` : toolMessage.content));
      } catch (e) {
        output = toolMessage.content;
      }
    }
    const cleanOutput = String(output ?? '').trim();
    cardDiv.innerHTML = `
      <div class="tool-execution-card">
        <div class="tool-card-header">
          <div class="tool-card-title"><span>${JS_ICON_SVG}</span><span>${t('tool_js_title_running') || 'execute_javascript'}</span></div>
          <div class="tool-card-header-actions">
            <span class="tool-card-badge status-success">${CHECK_SVG} <span>${t('tool_status_success') || 'Completado'}</span></span>
            <button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Minimizar'}">${CHEVRON_SVG}</button>
          </div>
        </div>
        <div class="tool-card-collapsible-body">
          <pre class="tool-card-code"><code>${Markdown.escapeHtml(getCode(args).trim())}</code></pre>
          <div class="tool-card-result"><div class="tool-result-label">${t('tool_sandbox_output') || 'Salida del Sandbox:'}</div><pre class="tool-result-pre"><code>${Markdown.escapeHtml(cleanOutput)}</code></pre></div>
        </div>
      </div>
    `;
    return cardDiv;
  }

  function createTool(Tool) {
    if (typeof Tool !== 'function') {
      throw new Error('La clase Tool es necesaria para crear execute_javascript.');
    }

    return new Tool({
      id: definition.name,
      definition,
      aliases: ['executejs', 'execute_js', 'run_javascript', 'run_js', 'javascript', 'evaljs'],
      category: 'sandbox',
      metadata: { icon: '⚡', label: definition.name },
      settings: {
        titleKey: 'agent_js_title',
        titleFallback: 'Ejecución de JavaScript Local (Sandbox)',
        descKey: 'agent_js_desc',
        descFallback: 'Permite al modelo invocar execute_javascript para calcular, procesar datos o validar algoritmos en un entorno seguro en el navegador.',
        icon: '⚡',
        defaultEnabled: true,
        showInSettings: true
      },
      promptGuide: (lang) => lang === 'en'
        ? '- `execute_javascript(code="...")`: Executes JavaScript code locally in the browser for math calculations, algorithms, and data processing.'
        : '- `execute_javascript(code="...")`: Ejecuta código JavaScript localmente en el navegador para cálculos matemáticos, algoritmos y procesamiento de datos.',
      execute: async (args, context = {}) => {
        const Sandbox = context.services?.sandbox;
        if (!Sandbox || !Sandbox.execute) {
          return { success: false, error: 'Módulo Sandbox no disponible.' };
        }
        const timeoutMs = typeof context.timeoutMs === 'number'
          ? context.timeoutMs
          : (typeof context.options?.timeoutMs === 'number' ? context.options.timeoutMs : undefined);
        return Sandbox.execute(getCode(args), timeoutMs);
      },
      result: { toModel, toMarkdown },
      view: { id: 'execute_javascript', createLiveCard, updateLiveCard, renderHistoricalCard }
    });
  }

  const toolModule = {
    id: definition.name,
    definition,
    createTool,
    getCode,
    toModel,
    toMarkdown,
    view: { id: 'execute_javascript', createLiveCard, updateLiveCard, renderHistoricalCard }
  };

  function registerWithBuiltinManifest() {
    let manifestApi = null;
    if (typeof window !== 'undefined' && window.ChatToolManifest) {
      manifestApi = window.ChatToolManifest;
    } else if (typeof require !== 'undefined') {
      try { manifestApi = require('../tool-manifest.js'); } catch (e) {}
    }
    if (manifestApi?.builtin && !manifestApi.builtin.has(toolModule.id)) {
      manifestApi.builtin.register(toolModule);
    }
  }

  registerWithBuiltinManifest();
  return toolModule;
});
