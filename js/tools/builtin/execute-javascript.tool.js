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
        titleFallback: '⚡ Ejecución de JavaScript Local (Sandbox)',
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
      // La vista se conectará al renderer genérico en el paso 5.
      view: { id: 'execute_javascript' }
    });
  }

  const toolModule = {
    id: definition.name,
    definition,
    createTool,
    getCode,
    toModel,
    toMarkdown
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
