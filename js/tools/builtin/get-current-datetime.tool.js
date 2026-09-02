/** Tool autocontenida: get_current_datetime. */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') module.exports = factory();
  else root.ChatBuiltinGetCurrentDatetimeTool = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const definition = {
    name: 'get_current_datetime',
    description: 'Obtiene la fecha, hora, día de la semana y zona horaria actual en tiempo real en el cliente.',
    parameters: { type: 'object', properties: { timezone: { type: 'string', description: 'Zona horaria opcional (ej: "Europe/Madrid", "America/New_York", "UTC").' } } }
  };

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
        ? '- `get_current_datetime(timezone="...")`: Retrieves the current date, exact time, day of week and timezone in real-time.'
        : '- `get_current_datetime(timezone="...")`: Obtiene la fecha, hora exacta, día de la semana y zona horaria actual en tiempo real.',
      execute: async (args = {}) => {
        const now = new Date();
        const timezone = args.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        return {
          success: true,
          iso: now.toISOString(),
          date: now.toLocaleDateString('es-ES', { timeZone: timezone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
          time: now.toLocaleTimeString('es-ES', { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          timestamp: now.getTime(),
          timezone
        };
      },
      result: {
        toMarkdown: (_args, result) => '> ⚙️ **get_current_datetime**\n> ```\n> ' +
          (typeof result === 'object' ? JSON.stringify(result) : String(result ?? '')).slice(0, 300) + '\n> ```'
      },
      view: { id: definition.name }
    });
  }

  const toolModule = { id: definition.name, definition, createTool };
  let manifestApi = null;
  if (typeof window !== 'undefined' && window.ChatToolManifest) manifestApi = window.ChatToolManifest;
  else if (typeof require !== 'undefined') { try { manifestApi = require('../tool-manifest.js'); } catch (e) {} }
  if (manifestApi?.builtin && !manifestApi.builtin.has(toolModule.id)) manifestApi.builtin.register(toolModule);
  return toolModule;
});
