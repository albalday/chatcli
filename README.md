# ZeroChat v6.0

ZeroChat es un cliente web universal de chat, agente IA y conocimiento local. La distribución final se entrega como un único archivo autónomo, `zerochat.html`, que puede abrirse directamente mediante `file://` y no requiere backend propio.

## Características

- Proveedores compatibles con OpenAI, Ollama, OpenRouter, Anthropic Claude, Google Gemini y servidores locales con API compatible.
- Agente con herramientas para ejecutar JavaScript aislado, buscar y leer páginas web, descargar PDF, crear gráficos y usar servidores MCP.
- Historial de conversaciones, mensajes y adjuntos persistido en IndexedDB.
- Consola de depuración con eventos, tráfico SSE y payloads de las llamadas.
- Interfaz en español e inglés, temas claro y oscuro y exportación de conversaciones.
- Base de conocimiento local con IndexedDB y [Orama](https://orama.com/orama-js) embebido en el bundle.

## Conocimiento local

La ingesta y la recuperación se realizan completamente en el navegador:

1. El texto se extrae de PDF, Markdown o TXT.
2. Se divide de forma determinista en bloques principales de hasta 6.000 caracteres, con 400 caracteres de solapamiento y preferencia por límites naturales.
3. El archivo original, sus metadatos y sus fragmentos se guardan por separado en `ZeroChatDB` (IndexedDB).
4. Orama construye bajo demanda índices derivados en memoria por rama o por documento, según el alcance de la consulta.
5. El agente consulta el contenido mediante `search_knowledge_base`, que puede focalizar una fuente identificable o diversificar resultados entre varias fuentes, y amplía fragmentos concretos con `read_knowledge_chunk`. `list_documents` queda disponible para inventarios completos.

La ingesta no llama a ningún LLM, no genera resúmenes y no solicita acceso persistente a carpetas. Por tanto, no tiene costes de modelo ni depende de la File System Access API. Los PDF basados únicamente en imágenes necesitan OCR previo.

Cada rama puede descargarse y restaurarse con el formato actual `zerochat-knowledge`. No se incluyen migraciones ni compatibilidad con formatos experimentales anteriores.

## Privacidad y persistencia

- Conversaciones, adjuntos y conocimiento se guardan localmente en IndexedDB.
- La configuración de conexión se guarda localmente en el navegador.
- Los documentos solo salen del navegador si el usuario los adjunta expresamente a una conversación o su contenido se incorpora a una petición del modelo.
- Orama funciona localmente y su índice puede reconstruirse desde los fragmentos persistidos.

## Uso

1. Descarga `zerochat.html`.
2. Ábrelo en un navegador moderno.
3. Configura el proveedor, endpoint, clave y modelo.
4. Para usar documentos, abre **Conocimiento**, crea una rama, carga los archivos y actívala.

## Desarrollo

Requisitos de compilación: Node.js, npm y Python 3. La aplicación generada no requiere instalarlos.

```bash
npm ci
npm test
npm run build
```

`npm run build` genera el bundle de Orama para navegador y después reconstruye `zerochat.html`. También puede reconstruirse únicamente el HTML con `python3 bundle.py` cuando el vendor ya está actualizado.

## Estructura relevante

```text
zerochat/
├── index.html
├── zerochat.html
├── bundle.py
├── package.json
├── css/styles.css
├── js/
│   ├── storage-db.js       # Esquema y conexión IndexedDB compartidos
│   ├── cookies.js          # Configuración e historial de chat
│   ├── ragStorage.js       # Persistencia del conocimiento y respaldos
│   ├── ingestionEngine.js  # Extracción y particionado determinista
│   ├── rag-index.js        # Índice local de Orama
│   ├── rag-service.js      # Recuperación y contexto para las tools
│   ├── rag-ui.js           # Gestión de ramas y documentos
│   ├── file-parser.js      # Lectura de PDF, texto e imágenes adjuntas
│   ├── tools/              # Contratos y herramientas del agente
│   └── vendor/orama.browser.js
├── scripts/                # Generación del vendor de navegador
├── tests/
└── THIRD_PARTY_NOTICES.md
```

Las reglas de contribución, pruebas y empaquetado están en [AGENT_GUIDELINES.md](AGENT_GUIDELINES.md). Las dependencias de terceros y sus licencias se detallan en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Desarrollo colaborativo con IA (Zero-Code)

Este proyecto ha sido desarrollado y evolucionado como un experimento real de **programación 100% asistida por IA sin intervención manual de código por parte del usuario**:

- **Colaboración Codex & Antigravity**: La arquitectura modular dual, el motor RAG local, el pipeline de pruebas unitarias, la optimización de rendimiento y la resolución iterativa de incidencias complejas fueron guiados e implementados colaborativamente por los asistentes de IA Codex y Antigravity.
- **Librería externa para RAG local**: Se integró [Orama](https://orama.com/orama-js) como única librería externa especializada, empaquetada como vendor local autónomo dentro del bundle, posibilitando un índice de búsqueda en memoria ultrarrápido y 100% privado en el cliente sobre IndexedDB.
- **Flujo sin código manual**: Demuestra la viabilidad práctica de diseñar, depurar, perfilar y desplegar software web de alta complejidad técnica iterando mediante especificación conversacional de alto nivel.
