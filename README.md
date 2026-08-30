# ⚡ ZeroChat - Cliente Web Universal, Agente IA Autónomo & RAG Local (v6.0)

[![Versión](https://img.shields.io/badge/versión-6.0-blue.svg)](zerochat.html)
[![Zero-Instalación](https://img.shields.io/badge/instalación-0%20dependencias-success.svg)](zerochat.html)
[![Privacidad](https://img.shields.io/badge/privacidad-100%25%20local-brightgreen.svg)](#-privacidad-y-almacenamiento-local)
[![Multi-Idioma](https://img.shields.io/badge/idiomas-ES%20%7C%20EN-orange.svg)](#-soporte-multi-idioma-i18n)
[![Licencia](https://img.shields.io/badge/licencia-MIT-green.svg)](LICENSE)
[![Desarrollo](https://img.shields.io/badge/100%25-Antigravity%20AI-purple.svg)](#-desarrollo-100-con-antigravity)

**ZeroChat** es una plataforma de chat web universal, agente de IA autónomo y motor de base de conocimiento (Tree-RAG) en **un único archivo autónomo y de cero instalación (`zerochat.html`)**, diseñado para ejecutarse directamente en cualquier navegador moderno sin requerir servidores, compiladores ni dependencias externas.

---

## 📖 Evolución del Proyecto

El proyecto nació originalmente como un **cliente de chat básico y minimalista** concebido para realizar pruebas rápidas, individuales y privadas con cualquier modelo de lenguaje (LLM) local o remoto.

A lo largo de su desarrollo, **ZeroChat ha preservado estrictamente esa filosofía de partida y su estructura fundacional**:
> **Un único fichero autónomo (`zerochat.html`) que funciona con doble clic, incluso bajo el protocolo `file:///` sin necesidad de levantar un servidor web ni instalar librerías.**

Sin embargo, sobre esa misma estructura ligera, el proyecto ha evolucionado sustancialmente para convertirse en una **herramienta integral y de nivel profesional**, dotada de:
1. **Capacidades Agénticas Autónomas**: Invocación de herramientas (*tool calling*), ejecución de código en sandbox aislado, navegación y extracción web en tiempo real, y generación dinámica de gráficos SVG interactivos.
2. **Sistema de Depuración y Auditoría de Tráfico (Debug & Raw Logs)**: Consola de eventos en vivo con monitor de red, inspección de streams SSE sin procesar y detección granular de capacidades por modelo.
3. **Motor Tree-RAG (Base de Conocimiento Jerárquica Local)**: Ingestión, procesamiento y recuperación contextual de grandes colecciones de documentos (PDF con diagramas, Markdown, TXT) en IndexedDB en cliente.

---

## 🎯 Características Principales

### 1. 🚀 Cero Instalación & Portabilidad Absoluta
- **Un solo archivo para todo**: Toda la aplicación (HTML, CSS, JavaScript, cargador bootstrap y assets) reside compilada en el archivo [**`zerochat.html`**](zerochat.html).
- **Compresión Gzip Base64 Nativa**: Empaquetado en un payload ultra-compacto (~280 KB) que se descomprime en memoria en tiempo de ejecución mediante la API nativa `DecompressionStream('gzip')` del navegador.
- **Sin backend intermedio**: Tu navegador se comunica directamente con el proveedor de IA (LM Studio, Ollama, OpenAI, Anthropic, Gemini, OpenRouter, etc.).

### 2. 🤖 Arquitectura Agéntica & Invocación de Herramientas
ZeroChat incluye un catálogo completo de herramientas integradas con tarjetas interactivas (*Live Tool Cards*):
- **`execute_javascript`**: Sandbox aislado en Web Worker para cálculos numéricos, transformaciones de datos y algoritmos.
- **`render_chart`**: Visualización de datos interactiva en SVG nativo (gráficos de barras, líneas, donut y dispersión) sin librerías externas.
- **`search_web`**: Búsqueda en internet en tiempo real con DuckDuckGo y SearXNG sin necesidad de claves de API.
- **`fetch_web_page` & `download_pdf`**: Navegación, scraping y lectura de páginas web y documentos PDF en línea.
- **Protocolo MCP (Model Context Protocol)**: Conexión con servidores MCP para descubrir e invocar herramientas personalizadas.

### 3. 🌳 Tree-RAG: Base de Conocimiento Jerárquica Local
- **Indexación en Cliente**: Ingestión ultrarrápida de documentos PDF, Markdown y TXT organizados en ramas de conocimiento.
- **Extracción de Diagramas e Imágenes**: Normalización de esquemas e imágenes de documentos (incluyendo conversión de espacios de color Adobe CMYK a sRGB JPEG) almacenados en IndexedDB.
- **Segmentación por Capítulos y Resúmenes Adaptativos**: Indexación estructurada que permite al modelo consultar el mapa del documento y cargar exclusivamente los capítulos pertinentes bajo demanda, evitando el desbordamiento de contexto.
- **Visor e Inspector de Documentos**: Modal de exploración rápida con estadísticas, previsualización de esquemas y gestión de ramas.

### 4. 📡 Consola de Depuración, Logs y Tráfico Raw
- **Filtros Especializados**: Pestañas en vivo para `Todo`, `🧠 Razonamiento`, `⚙️ Herramientas` y `📡 Raw`.
- **Monitor de Red & SSE**: Inspección detallada de peticiones HTTP, headers, chunks recibidos en streaming y payloads JSON.
- **Detección Dinámica de Capacidades**: Adaptadores inteligentes para OpenAI, Claude, Gemini, Ollama y OpenRouter con auto-recuperación ante errores 400 por parámetros no soportados.

### 5. 🧠 Flujo de Razonamiento (Thinking / CoT) & Caché de Contexto
- Selector directo de nivel de pensamiento (`None`, `Low`, `Med`, `High`, `XHigh`) para modelos como Claude 3.7 Sonnet, Gemini 2.5 y DeepSeek-R1.
- Reutilización inteligente de memoria caché de contexto (*Prompt Caching* / KV Cache) con auto-invalidación al editar o eliminar turnos anteriores.

### 6. 🌐 Soporte Multi-Idioma (i18n)
- Soporte completo y reactivo para **Español (Castellano)** e **Inglés (English)**, conmutables en tiempo real con persistencia automática de preferencias.

---

## 📁 Estructura del Proyecto

```text
zerochat/
├── zerochat.html       # 🚀 ARCHIVO AUTÓNOMO ÚNICO (Solo necesitas este archivo para usar ZeroChat)
├── index.html          # Interfaz principal modular, sidebar, modales y panel RAG
├── bundle.py           # Compilador con compresión Gzip Base64 (compresslevel=9)
├── css/
│   └── styles.css      # Estilos visuales modernos, temas claro/oscuro, RAG y diseño responsivo
├── js/
│   ├── app.js          # Controlador principal de la UI, eventos y ciclo de vida
│   ├── agent-core.js   # Bucle de ejecución del Agente IA y resolución de llamadas a herramientas
│   ├── ragStorage.js   # Base de datos IndexedDB para Ramas, Documentos y Diagramas (Tree-RAG)
│   ├── ingestionEngine.js # Motor de análisis, resumen por capítulos y segmentación de documentos
│   ├── treeRagUI.js    # Interfaz gráfica del panel Tree-RAG y visor de estructura
│   ├── api.js          # Cliente SSE universal y gestión de conexiones
│   ├── providers.js    # Adaptadores multi-proveedor (OpenAI, Claude, Gemini, Ollama, etc.)
│   ├── file-parser.js  # Parseador de PDFs, texto y conversor de imágenes CMYK a sRGB JPEG
│   ├── charts.js       # Motor de renderizado de gráficos SVG interactivos
│   ├── sandbox.js      # Sandbox de ejecución de código JavaScript
│   ├── web-search.js   # Proveedores de búsqueda web (DuckDuckGo, SearXNG)
│   ├── web-browser.js  # Lector de páginas web y extractor de contenidos
│   ├── debug.js        # Consola de depuración y monitor de tráfico Raw
│   ├── state.js        # Gestor de estado reactivo global (ChatState)
│   ├── i18n.js         # Módulo de internacionalización reactiva (ES/EN)
│   ├── markdown.js     # Renderizador de Markdown con tablas GFM y sanitización
│   └── mcp.js          # Cliente del protocolo Model Context Protocol (MCP)
├── tests/              # Suite de pruebas automatizadas (139+ tests unitarios)
├── LICENSE             # Licencia MIT
└── README.md           # Documentación del proyecto
```

---

## 🚀 Inicio Rápido

### Método Recomendado (Zero-Instalación):
1. Descarga el archivo [**`zerochat.html`**](zerochat.html).
2. Haz doble clic sobre el archivo para abrirlo en tu navegador favorito (Chrome, Firefox, Edge, Safari, Brave, Opera).
3. Pulsa el botón **⚙️ Configuración**, selecciona tu proveedor o introduce la URL de tu servidor local (ej. `http://localhost:1234/v1` para LM Studio u `http://localhost:11434` para Ollama), pulsa **🔍 Query** para detectar tus modelos y ¡comienza a chatear!

### Para Desarrolladores (Compilación del Bundle):
Si modificas los archivos modulares del código fuente:
```bash
# Compilar y generar zerochat.html con compresión Gzip Base64
python3 bundle.py

# Ejecutar la suite completa de pruebas unitarias
node --test tests/*.js
```

---

## 🤖 Desarrollo 100% con Antigravity (Zero-Code Typing)

**Todo este proyecto ha sido concebido, programado, probado y empaquetado exclusivamente con Google Antigravity, sin que el autor haya tecleado manualmente una sola línea de código.**

Desde el diseño de la arquitectura modular, el sistema reactivo de estado, los adaptadores multi-proveedor, el motor Tree-RAG en IndexedDB, hasta el compilador Gzip Base64 y la suite de pruebas automatizadas: todo el ciclo de vida del software ha sido generado mediante programación en pareja (*pair programming*) con Antigravity.

---

## 📄 Licencia

Este proyecto se distribuye bajo la licencia **MIT**. Consulta el archivo `LICENSE` para más detalles.


