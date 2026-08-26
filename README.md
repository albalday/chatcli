# 💬 ChatCLI - Cliente Web Universal de Chat para IA (v1.0)

[![Versión](https://img.shields.io/badge/versión-1.0-blue.svg)](chatcli.html)
[![Multi-Idioma](https://img.shields.io/badge/idiomas-ES%20%7C%20EN-orange.svg)](#-soporte-multi-idioma-internacionalizaci%C3%B3n-i18n)
[![Licencia](https://img.shields.io/badge/licencia-MIT-green.svg)](LICENSE)
[![Desarrollo](https://img.shields.io/badge/100%25-Antigravity%20AI-purple.svg)](#-desarrollo-100-con-antigravity)

**ChatCLI** es un cliente web de chat universal, ligero y autosuficiente para modelos de lenguaje (LLMs), diseñado para funcionar directamente en el navegador con cero dependencias externas.

---

## 🎯 Objetivo Principal

El objetivo primordial de este proyecto es disponer de un **cliente de chat para Inteligencia Artificial en un solo fichero (`chatcli.html`)** para poder realizar pruebas individuales, rápidas y privadas con cualquier modelo local o remoto.

- **Solo necesitas un archivo**: Aunque el repositorio incluye todo el código fuente modularizado como proyecto Open Source para mostrar la implementación, **para usar la aplicación solo tienes que descargarte el archivo autónomo [`chatcli.html`](chatcli.html)** y abrirlo en tu navegador favorito con doble clic (funciona incluso directamente bajo el protocolo `file:///` sin necesidad de levantar un servidor web).
- **Máxima privacidad y portabilidad**: No requiere `npm install`, Node.js, librerías pesadas ni conexión a internet externa para su interfaz. Todo el estado y la configuración se guardan de forma local en tu navegador.

---

## 🌐 Soporte Multi-Idioma (Internacionalización / i18n)

A partir de la versión **v1.0**, ChatCLI cuenta con soporte completo y reactivo para múltiples idiomas:
- **Español (Castellano)**: Idioma por defecto de la aplicación.
- **English**: Detección automática si el idioma configurado en el navegador es inglés (`en`).
- **Selector de Idioma Dinámico**: Conmutable al instante con el botón directo `🌐 ES | EN` en la barra superior o desde el modal de Configuración, con persistencia automática de tu preferencia.
- **Localización Completa**: Traducción inmediata de toda la interfaz, sugerencias interactivas, menús de razonamiento, consola de depuración, herramientas agénticas y marcas temporales del contexto del sistema.

---

## ⚠️ Descargo de Responsabilidad (Proyecto de Aficionado)

> [!IMPORTANT]
> Este es un **proyecto personal y de aficionado** desarrollado como banco de pruebas experimental para explorar las capacidades del asistente **Google Antigravity**.
> El software se entrega *"tal cual"* (*AS IS*), sin garantías de ningún tipo expresas o implícitas. No se asume ninguna responsabilidad derivada de su uso, ejecución de código en sandbox o conexión a endpoints de terceros.

---

## 🤖 Desarrollo 100% con Antigravity (Zero-Code Typing)

**Todo este proyecto ha sido concebido, programado, probado y empaquetado exclusivamente con Google Antigravity, sin que el autor haya tecleado manualmente una sola línea de código.**

Desde el diseño de la arquitectura por módulos, la creación de la interfaz HTML5/CSS3 con temas claro y oscuro, el sistema de internacionalización i18n, el cliente de streaming por SSE, el soporte multi-endpoint, el parseador de documentos PDF en cliente, el sandbox de ejecución agéntica, hasta el empaquetador en Base64 en Python y las pruebas automatizadas: todo el ciclo de vida del software ha sido generado mediante programación en pareja (*pair programming*) con Antigravity.

---

## ✨ Características Principales

1. **Soporte Multi-idioma (ES / EN)**:
   - Detección inteligente del idioma del navegador con fallback a castellano.
   - Selector en la barra de herramientas y en la ventana de ajustes con cambio en caliente.

2. **Compatibilidad Universal Multi-Endpoint**:
   - **LM Studio** (`http://localhost:1234/v1`)
   - **Ollama** (`http://localhost:11434`)
   - **OpenAI** (`https://api.openai.com/v1`)
   - **Anthropic Claude** (`https://api.anthropic.com/v1`)
   - **Google Gemini** (`https://generativelanguage.googleapis.com/v1beta/openai`)
   - **OpenRouter** (`https://openrouter.ai/api/v1`)
   - **vLLM / LocalAI / Custom**

3. **Control de Esfuerzo de Razonamiento (Thinking / CoT)**:
   - Botón directo `🧠` en la barra del chat con los niveles estándar de la industria: **`None` (Desactivado)**, **`Low` (Bajo)**, **`Med` (Medio)**, **`High` (Alto)** y **`XHigh` (Muy Alto)**.
   - Adaptación automática del payload por endpoint (`reasoning_effort` para OpenAI/LM Studio/vLLM, `thinking budget` para Claude, `reasoning` para OpenRouter).

4. **Panel Lateral de Logs y Razonamiento en Vivo (Consola Debug)**:
   - Visualización en tiempo real de los tokens de razonamiento (`thinking`) según van llegando del servidor.
   - Registro de peticiones de red (`[RED]`), ejecuciones de herramientas (`[HERRAMIENTA]`), estadísticas de generación (`[STATS]`) y errores.
   - Pestañas de filtrado (`Todo`, `🧠 Razonamiento`, `⚙️ Herramientas`, `🌐 Red`), auto-scroll y copia al portapapeles.

5. **Capacidades Agénticas (Tools / Function Calling)**:
   - **`search_web` (Activa por defecto)**: Motor de búsqueda en internet en tiempo real basado exclusivamente en la **API de DuckDuckGo** (Instant Answer, resúmenes, dominios web oficiales y temas relacionados).
   - **`fetch_web_page` (Activa por defecto)**: Consulta de páginas web públicas y **descarga y extracción de documentos PDF (`.pdf`)** en tiempo real para integrar su contenido completo directamente en el contexto del modelo.
   - **`execute_javascript` (Activa por defecto)**: Sandbox seguro y aislado en el navegador para cálculos matemáticos, lógica y transformación de datos.
   - *Definiciones de herramientas ultracompactas* diseñadas para minimizar el consumo de tokens en cada petición.

6. **Métricas de Rendimiento Precisas**:
   - **Latencia inicial (TTFT)**: Tiempo exacto hasta el 1º token (`⏳ 1º token: X.XXs`).
   - **Velocidad de generación**: Calculada estrictamente durante el streaming (`⚡ X.X tok/s`).
   - **Tiempo total** (`⏱️ X.XXs`) y **conteo estimado de tokens** (`📝 N tok`).

7. **Adjuntos Multimodales y Extracción en Cliente**:
   - Soporte para **documentos PDF (`.pdf`)** con extracción directa de texto en JavaScript en el navegador.
   - Soporte para imágenes (`.png`, `.jpg`, `.webp`) y archivos de código/texto (`.js`, `.py`, `.json`, `.csv`, `.md`, `.txt`, etc.).
   - Soporte para arrastrar y soltar (**Drag & Drop**).

8. **Gestión Total del Historial**:
   - Borrado individual de mensajes con **eliminación estricta de memoria** (los mensajes borrados nunca se vuelven a enviar al servidor).
   - Reutilización instantánea de preguntas con el botón ✏️.
   - Botón para copiar respuestas completas en Markdown con un solo clic.

---

## 📁 Estructura del Repositorio

```text
chatcli/
├── chatcli.html        # 🚀 ARCHIVO AUTÓNOMO ÚNICO (Solo necesitas este archivo para usar el chat)
├── index.html          # Interfaz principal modular y modal de configuración (<dialog>)
├── css/
│   └── styles.css      # Estilos visuales modernos, Glassmorphism, temas Claro/Oscuro y selectores
├── js/
│   ├── app.js          # Controlador principal de la UI, eventos, historial y consola debug
│   ├── i18n.js         # Módulo de Internacionalización y traducciones reactivas (ES/EN)
│   ├── api.js          # Cliente SSE universal, streaming y protocolos multi-endpoint
│   ├── cookies.js      # Persistencia en localStorage y Cookies
│   ├── sandbox.js      # Sandbox aislado para ejecución de JavaScript
│   ├── web-search.js   # Módulo de búsqueda en internet con la API de DuckDuckGo
│   ├── web-browser.js  # Módulo de consulta de páginas web y descarga de PDFs en tiempo real
│   ├── file-parser.js  # Extractor de texto para documentos PDF, código e imágenes
│   └── markdown.js     # Parseador ligero de Markdown con soporte de bloques de código
├── bundle.py           # Script generador del archivo autónomo chatcli.html
├── LICENSE             # Licencia MIT
├── .gitignore          # Filtros para Git
└── README.md           # Documentación del proyecto
```

---

## 🚀 Cómo Usarlo

### La forma más rápida (Recomendada):
1. Descarga el archivo [**`chatcli.html`**](chatcli.html).
2. Haz doble clic sobre él para abrirlo en cualquier navegador (Chrome, Firefox, Edge, Safari, Brave, Opera).
3. Abre la configuración con el botón **⚙️**, introduce la URL de tu servidor (ej. `http://localhost:1234/v1` para LM Studio) y pulsa **🔍 Query** para listar tus modelos.
4. ¡Listo para chatear!

---

## 📋 Metaprompt para Replicar este Proyecto

Si deseas generar un proyecto similar utilizando **Google Antigravity** o cualquier modelo de lenguaje avanzado, puedes utilizar el siguiente prompt maestro detallado:

```text
Actúa como un Ingeniero de Software Frontend Senior y Diseñador de Interfaces Web. Crea una aplicación web de chat para modelos de Inteligencia Artificial ("ChatCLI") construida 100% en Vanilla HTML5, CSS3 y JavaScript sin dependencias pesadas ni frameworks, optimizada para funcionar como una SPA modular y también compilable a un único archivo autónomo (.html).

La aplicación debe cumplir con los siguientes requerimientos:

1. ARQUITECTURA MULTI-ENDPOINT Y MULTI-IDIOMA:
- Compatible con servidores compatibles con OpenAI (LM Studio, vLLM, LocalAI), Ollama, Anthropic Claude, Google Gemini y OpenRouter.
- Botón "Query" junto a la URL del servidor que consulte los endpoints (/v1/models, /models, /api/tags) y pueble un combobox dinámico con los modelos instalados/disponibles.
- Soporte completo para multi-idioma (Castellano e Inglés) con autodetección por navegador y selector interactivo.
- Persistencia universal de ajustes (URL, modelo, API key, prompt de sistema, temperatura, idioma, tema claro/oscuro) mediante localStorage y cookies.

2. RAZONAMIENTO Y STREAMING (SSE):
- Consumo en tiempo real mediante Server-Sent Events (SSE).
- Selector estático en la barra del chat para niveles de razonamiento (None, Low, Med, High, XHigh), que configure el payload de forma adecuada según el endpoint (reasoning_effort: "none"|"low"|"medium"|"high"|"xhigh" para OpenAI/LM Studio, thinking budget para Claude, etc.).
- Extracción de tokens de pensamiento en tiempo real (delta.reasoning_content, delta.thinking, bloques <think>).
- Panel lateral derecho estilo consola de debug (con selector de filtros: Todo, Razonamiento, Herramientas, Red), auto-scroll conmutable, marcas de tiempo y botón de copia, que muestre la actividad del servidor sin alterar el diseño del chat.
- Métricas en cada respuesta: TTFT (latencia al primer token), tokens/segundo, duración total y tokens estimados.

3. HERRAMIENTAS AGÉNTICAS (TOOL CALLING):
- Soporte para llamadas a funciones (Function Calling).
- Herramienta "execute_javascript": ejecución segura en sandbox local sin acceso a red ni archivos, con captura de console.log y retorno.
- Herramienta "fetch_web_page": consulta y extracción de texto de páginas web.
- Descripciones de herramientas ultracompactas con un único ejemplo para minimizar el consumo de tokens en cada petición.

4. GESTIÓN DE MENSAJES Y ADJUNTOS:
- Historial sincronizado con IDs únicos por turno: al borrar cualquier mensaje del chat, eliminarlo completamente de la memoria para que nunca se vuelva a enviar en futuras peticiones.
- Soporte para adjuntar archivos (código, texto, imágenes) y descompresión/extracción de texto de documentos PDF (.pdf) en cliente con FileReader.
- Parser de Markdown ligero integrado con botones para copiar código y respuesta completa.

5. EMPAQUETADO AUTÓNOMO:
- Proporciona el proyecto dividido en módulos limpios (index.html, css/styles.css, js/app.js, js/i18n.js, js/api.js, js/cookies.js, js/sandbox.js, js/web-browser.js, js/file-parser.js) y un script en Python (bundle.py) que compile todo en un único archivo "chatcli.html" auto-contenido listo para usarse con doble clic.
```

---

## 📄 Licencia

Este proyecto se distribuye bajo la licencia **MIT**. Consulta el archivo `LICENSE` para más detalles.
