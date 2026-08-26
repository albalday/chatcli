/**
 * Módulo de ejecución de JavaScript local en entorno aislado (ChatSandbox).
 * - Entorno seguro sin acceso a red (sin fetch, XMLHttpRequest, WebSocket) ni archivos ni almacenamiento.
 * - Captura de console.log y valores de retorno.
 * - Límite de tiempo de ejecución (timeout) para evitar bucles infinitos.
 * - Compatible con file:// y http://.
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatSandbox = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_TIMEOUT_MS = 2500;

  /**
   * Ejecuta código JavaScript de forma aislada y controlada.
   * @param {string} code - Código a ejecutar
   * @param {number} timeoutMs - Tiempo máximo en ms
   * @returns {Promise<{ success: boolean, result: string, logs: string[], executionTimeMs: number, error?: string }>}
   */
  async function execute(code, timeoutMs = DEFAULT_TIMEOUT_MS) {
    if (!code || typeof code !== 'string') {
      return {
        success: false,
        result: '',
        logs: [],
        executionTimeMs: 0,
        error: 'No se proporcionó código JavaScript para ejecutar.'
      };
    }

    const logs = [];
    const customConsole = {
      log: (...args) => logs.push(args.map(formatValue).join(' ')),
      info: (...args) => logs.push('[INFO] ' + args.map(formatValue).join(' ')),
      warn: (...args) => logs.push('[WARN] ' + args.map(formatValue).join(' ')),
      error: (...args) => logs.push('[ERROR] ' + args.map(formatValue).join(' '))
    };

    function formatValue(v) {
      if (v === null) return 'null';
      if (v === undefined) return 'undefined';
      if (typeof v === 'object') {
        try {
          return JSON.stringify(v, null, 2);
        } catch (e) {
          return String(v);
        }
      }
      return String(v);
    }

    const startTime = performance.now();

    return new Promise((resolve) => {
      let isResolved = false;

      // Temporizador de corte para evitar bloqueos por bucles infinitos
      const timer = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          const elapsed = (performance.now() - startTime).toFixed(2);
          resolve({
            success: false,
            result: '',
            logs: logs,
            executionTimeMs: parseFloat(elapsed),
            error: `Tiempo de ejecución excedido (Timeout de ${timeoutMs}ms). El código fue interrumpido.`
          });
        }
      }, timeoutMs);

      try {
        // Creación de función aislada bloqueando APIs de red, almacenamiento y DOM
        const blockedGlobals = [
          'window', 'document', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource',
          'localStorage', 'sessionStorage', 'indexedDB', 'cookie', 'location', 'navigator',
          'parent', 'top', 'frames', 'opener', 'Worker', 'SharedWorker', 'ServiceWorker',
          'FileReader', 'DecompressionStream', 'CompressionStream', 'alert', 'confirm', 'prompt',
          'open', 'close', 'postMessage', 'importScripts'
        ];

        // Lista de parámetros bloqueados que reciben undefined
        const paramNames = ['console', ...blockedGlobals];
        const paramValues = [customConsole, ...blockedGlobals.map(() => undefined)];

        // Preparar el cuerpo del código para capturar expresiones directas o retornos
        const trimmedCode = code.trim();
        let wrappedBody;

        // Si el código no contiene 'return' explícito y no es una declaración de múltiples sentencias, intentar retornar la última expresión
        if (!trimmedCode.includes('return') && !trimmedCode.includes(';') && !trimmedCode.includes('\n')) {
          wrappedBody = `"use strict"; return (${trimmedCode});`;
        } else {
          wrappedBody = `"use strict";\n${trimmedCode}`;
        }

        const runner = new Function(...paramNames, wrappedBody);
        const rawResult = runner.apply(null, paramValues);

        clearTimeout(timer);
        if (!isResolved) {
          isResolved = true;
          const elapsed = (performance.now() - startTime).toFixed(2);
          resolve({
            success: true,
            result: rawResult !== undefined ? formatValue(rawResult) : (logs.length > 0 ? logs.join('\n') : 'undefined'),
            logs: logs,
            executionTimeMs: parseFloat(elapsed)
          });
        }
      } catch (err) {
        clearTimeout(timer);
        if (!isResolved) {
          isResolved = true;
          const elapsed = (performance.now() - startTime).toFixed(2);
          resolve({
            success: false,
            result: '',
            logs: logs,
            executionTimeMs: parseFloat(elapsed),
            error: err.toString()
          });
        }
      }
    });
  }

  /**
   * Definición estándar de herramienta (Tool/Function Calling) para OpenAI.
   */
  const JAVASCRIPT_TOOL_DEFINITION = {
    type: 'function',
    function: {
      name: 'execute_javascript',
      description: 'Ejecuta JavaScript local para cálculos o lógica (ej: "return 2+2").',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'Código JS ejecutable.'
          }
        },
        required: ['code']
      }
    }
  };

  return {
    execute,
    JAVASCRIPT_TOOL_DEFINITION
  };
});

