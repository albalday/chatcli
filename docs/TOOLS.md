# Tools de ZeroChat

Cada tool nativa vive en `js/tools/builtin/<nombre>.tool.js` y exporta un módulo con `id`, `definition` y `createTool(Tool)`.

El contrato obligatorio es:

- `definition`: nombre, descripción y JSON Schema de Function Calling.
- `settings`: descriptor de configuración.
- `execute(args, context)`: ejecución; consume dependencias mediante `context.services`.
- `result`: adaptadores `toModel` y/o `toMarkdown`.
- `view`: tarjeta opcional (`createLiveCard`, `updateLiveCard`, `renderHistoricalCard`).

No usar `ui` ni `handler`: fueron eliminados. Para una dependencia nueva, declárala en `js/tools/tool-runtime.js`, inyéctala en pruebas y evita acceder a globals desde `agent-core.js`.

Las herramientas de conocimiento local usan cuatro operaciones canónicas: `list_documents`, `search_knowledge_base`, `read_knowledge_chunk` y `read_knowledge_image`. La última recupera bajo demanda una imagen ya extraída del documento; el modelo decide usarla únicamente si puede analizar imágenes. El registro y la ejecución del agente usan exclusivamente las definiciones declaradas por estos módulos.
