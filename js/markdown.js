/**
 * Módulo de parseo y renderizado de Markdown (ChatMarkdown) con soporte i18n.
 * Parser directo por bloques (Block Tokenizer).
 * - Soporta bloques de código con cabecera, botón de copia y botón de ejecución JS local.
 * - Soporta bloques de razonamiento <think>...</think> (DeepSeek-R1, QwQ, Ollama).
 * - Soporta listas, código inline, negrita, cursiva, encabezados, citas y enlaces.
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatMarkdown = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const Sandbox = typeof window !== 'undefined' ? (window.ChatSandbox || {}) : {};
  const I18n = typeof window !== 'undefined' ? (window.ChatI18n || {}) : {};

  function tr(key, fallback, params) {
    if (typeof window !== 'undefined' && window.ChatI18n && window.ChatI18n.t) {
      return window.ChatI18n.t(key, params);
    }
    if (I18n.t) {
      return I18n.t(key, params);
    }
    return fallback;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Parsea segmentos de texto normales (fuera de bloques de código).
   */
  function parseTextMarkdown(text) {
    if (!text) return '';

    let p = escapeHtml(text);

    const thoughtTitle = tr('md_thought_title', '💭 Proceso de razonamiento');
    const thoughtReasoning = tr('md_thought_reasoning', '💭 Razonando...');

    // 1. Bloques de pensamiento <think>...</think>
    p = p.replace(/&lt;think&gt;([\s\S]*?)&lt;\/think&gt;/gi, function (match, thought) {
      return `
        <details class="thought-block" open>
          <summary class="thought-summary">
            <span>${thoughtTitle}</span>
          </summary>
          <div class="thought-content">${thought.trim().replace(/\n/g, '<br>')}</div>
        </details>
      `;
    });

    p = p.replace(/&lt;think&gt;([\s\S]*)$/gi, function (match, thought) {
      return `
        <details class="thought-block" open>
          <summary class="thought-summary">
            <span>${thoughtReasoning}</span>
          </summary>
          <div class="thought-content">${thought.trim().replace(/\n/g, '<br>')}</div>
        </details>
      `;
    });

    // 2. Código inline `código`
    p = p.replace(/`([^`\n]+)`/g, function (match, code) {
      return `<code>${code}</code>`;
    });

    // 3. Encabezados (# Titulo)
    p = p.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    p = p.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    p = p.replace(/^# (.*$)/gm, '<h1>$1</h1>');

    // 4. Citas / Blockquotes (> texto)
    p = p.replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>');

    // 5. Listas no ordenadas (- item o * item)
    p = p.replace(/(?:^[ \t]*[*-][ \t]+.+(?:\n|$))+/gm, function (match) {
      const lines = match.trim().split('\n');
      const listItems = lines.map(line => {
        const itemContent = line.replace(/^[ \t]*[*-][ \t]+/, '');
        return `<li>${itemContent}</li>`;
      }).join('');
      return `<ul>${listItems}</ul>\n`;
    });

    // 6. Listas ordenadas (1. item)
    p = p.replace(/(?:^[ \t]*\d+\.[ \t]+.+(?:\n|$))+/gm, function (match) {
      const lines = match.trim().split('\n');
      const listItems = lines.map(line => {
        const itemContent = line.replace(/^[ \t]*\d+\.[ \t]+/, '');
        return `<li>${itemContent}</li>`;
      }).join('');
      return `<ol>${listItems}</ol>\n`;
    });

    // 7. Negrita y cursiva
    p = p.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    p = p.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    p = p.replace(/__(.*?)__/g, '<strong>$1</strong>');
    p = p.replace(/\*([^\*\n]+)\*/g, '<em>$1</em>');
    p = p.replace(/_([^_\n]+)_/g, '<em>$1</em>');

    // 8. Enlaces [texto](url)
    p = p.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // 9. Párrafos y saltos de línea
    const chunks = p.split(/\n{2,}/);
    return chunks.map(chunk => {
      const trimmed = chunk.trim();
      if (!trimmed) return '';
      if (
        trimmed.startsWith('<h1') ||
        trimmed.startsWith('<h2') ||
        trimmed.startsWith('<h3') ||
        trimmed.startsWith('<ul') ||
        trimmed.startsWith('<ol') ||
        trimmed.startsWith('<blockquote') ||
        trimmed.startsWith('<details')
      ) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    }).filter(Boolean).join('');
  }

  /**
   * Parser principal de Markdown estructurado por bloques.
   */
  function parseMarkdown(markdown) {
    if (!markdown) return '';

    const normalized = markdown.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');

    let htmlResult = '';
    let inCodeBlock = false;
    let codeLang = '';
    let codeLines = [];
    let textBuffer = [];

    const runTitle = tr('md_run_js_title', 'Ejecutar en sandbox local (sin red ni archivos)');
    const runBtn = tr('md_run_js_btn', 'Ejecutar JS');
    const copyTitle = tr('md_copy_code_title', 'Copiar código');
    const copyBtn = tr('md_copy_code_btn', 'Copiar');

    function flushTextBuffer() {
      if (textBuffer.length === 0) return;
      htmlResult += parseTextMarkdown(textBuffer.join('\n'));
      textBuffer = [];
    }

    function flushCodeBlock() {
      const rawCode = codeLines.join('\n');
      const safeLang = escapeHtml(codeLang || 'javascript');
      const safeCode = escapeHtml(rawCode);
      const rawCodeAttr = encodeURIComponent(rawCode);
      const isJs = safeLang.toLowerCase() === 'javascript' || safeLang.toLowerCase() === 'js';

      const runButtonHtml = isJs ? `
        <button class="btn-run-code" data-code="${rawCodeAttr}" title="${runTitle}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <span>${runBtn}</span>
        </button>
      ` : '';

      htmlResult += `
        <div class="code-block-container">
          <div class="code-block-header">
            <span class="code-lang">${safeLang}</span>
            <div class="code-block-actions">
              ${runButtonHtml}
              <button class="btn-copy-code" data-code="${rawCodeAttr}" title="${copyTitle}">
                <svg class="icon-copy" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span>${copyBtn}</span>
              </button>
            </div>
          </div>
          <pre><code class="language-${safeLang}">${safeCode}</code></pre>
          <div class="code-output-container" style="display: none;"></div>
        </div>
      `;
      codeLines = [];
      codeLang = '';
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const fenceMatch = line.match(/^[ \t]*```([a-zA-Z0-9_+#.-]*)\s*$/);

      if (fenceMatch) {
        if (!inCodeBlock) {
          flushTextBuffer();
          inCodeBlock = true;
          codeLang = fenceMatch[1] ? fenceMatch[1].trim() : '';
          codeLines = [];
        } else {
          flushCodeBlock();
          inCodeBlock = false;
        }
      } else if (inCodeBlock) {
        codeLines.push(line);
      } else {
        textBuffer.push(line);
      }
    }

    if (inCodeBlock) {
      flushCodeBlock();
    } else {
      flushTextBuffer();
    }

    return htmlResult;
  }

  function attachCopyCodeListeners(container) {
    if (!container) return;

    // 1. Botones de copiar código
    container.querySelectorAll('.btn-copy-code').forEach(function (button) {
      if (button.dataset.listenerAttached) return;
      button.dataset.listenerAttached = 'true';

      button.addEventListener('click', async function () {
        const rawCode = decodeURIComponent(button.getAttribute('data-code') || '');
        try {
          await navigator.clipboard.writeText(rawCode);
          const span = button.querySelector('span');
          const originalText = span.textContent;
          span.textContent = tr('copied_text', '¡Copiado!');
          button.classList.add('copied');

          setTimeout(function () {
            span.textContent = originalText;
            button.classList.remove('copied');
          }, 2000);
        } catch (err) {
          console.error('Error al copiar al portapapeles:', err);
        }
      });
    });

    // 2. Botones de ejecución local de JavaScript
    container.querySelectorAll('.btn-run-code').forEach(function (button) {
      if (button.dataset.listenerAttached) return;
      button.dataset.listenerAttached = 'true';

      button.addEventListener('click', async function () {
        const rawCode = decodeURIComponent(button.getAttribute('data-code') || '');
        const blockContainer = button.closest('.code-block-container');
        if (!blockContainer) return;

        let outputContainer = blockContainer.querySelector('.code-output-container');
        if (!outputContainer) {
          outputContainer = document.createElement('div');
          outputContainer.className = 'code-output-container';
          blockContainer.appendChild(outputContainer);
        }

        outputContainer.style.display = 'block';
        outputContainer.innerHTML = '<div class="output-header"><span>⏳ ' + tr('agent_js_title', 'Ejecutando en sandbox local...') + '</span></div>';

        const sandboxRunner = window.ChatSandbox || Sandbox;
        if (sandboxRunner && sandboxRunner.execute) {
          const res = await sandboxRunner.execute(rawCode);
          const statusClass = res.success ? 'success' : 'error';
          const headerTitle = res.success ? `▶️ ${tr('md_output_title', 'Resultado')} (${res.executionTimeMs}ms)` : `⚠️ Error (${res.executionTimeMs}ms)`;

          let outputContent = '';
          if (res.logs && res.logs.length > 0) {
            outputContent += `<div class="output-logs"><strong>Console:</strong>\n${escapeHtml(res.logs.join('\n'))}</div>`;
          }
          if (res.result && res.result !== 'undefined') {
            outputContent += `<div class="output-return"><strong>Retorno:</strong> ${escapeHtml(res.result)}</div>`;
          }
          if (res.error) {
            outputContent += `<div class="output-error">${escapeHtml(res.error)}</div>`;
          }
          if (!outputContent) {
            outputContent = `<div class="output-empty">(${tr('empty_response', 'Ejecutado sin salida de consola ni retorno')})</div>`;
          }

          outputContainer.innerHTML = `
            <div class="output-header ${statusClass}">
              <span>${headerTitle}</span>
              <button type="button" class="btn-close-output" title="${tr('md_clear_output', 'Cerrar salida')}">×</button>
            </div>
            <pre class="output-body">${outputContent}</pre>
          `;

          outputContainer.querySelector('.btn-close-output').addEventListener('click', () => {
            outputContainer.style.display = 'none';
          });
        }
      });
    });
  }

  return {
    escapeHtml,
    parseMarkdown,
    attachCopyCodeListeners
  };
});
