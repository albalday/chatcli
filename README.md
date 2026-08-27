# 💬 ChatCLI - Cliente Web Universal de Chat para IA (v3.1)

[![Versión](https://img.shields.io/badge/versión-3.1-blue.svg)](chatcli.html)
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

## ✨ Novedades en la Versión 3.1

- 📊 **Tablas Markdown GFM Nativas**: Parseador y renderizador completo de tablas GitHub Flavored Markdown con soporte de alineaciones (`:---`, `:---:`, `---:`), formato interno enriquecido y contenedor adaptativo con scroll horizontal.
- ⚡ **Herramientas en Vivo (Live Tool Cards)**: Aparición instantánea de las tarjetas de herramientas (`search_web`, `fetch_web_page`, `download_pdf`, `execute_javascript`, `render_chart`) con animación de progreso y llenado dinámico de las respuestas en tiempo real.
- ▾ **Minimizado/Expandido de Herramientas y Gráficos**: Botón interactivo para plegar y desplegar cualquier consulta a herramientas o gráfico para optimizar el espacio vertical.
- 🗑️ **Borrado Total del Historial**: Botón *Borrar todos* en la barra lateral con diálogo de seguridad para limpiar todo el almacenamiento local y crear una sesión en blanco.
- 📄 **Parseador Léxico Iterativo de PDF**: Motor de extracción $O(N)$ sin retroceso ni recursión para evitar errores de desbordamiento de pila (*too much recursion*) en documentos PDF complejos.
- 🔊 **Compatibilidad TTS en Linux**: Limpieza inteligente de emojis, fragmentación de frases y adaptación para sintetizadores `speech-dispatcher` y `espeak-ng`.

---

## ✨ Características Principales

1. **Gestión Multi-Chat e Historial (Sidebar)**:
   - Barra lateral izquierda retráctil con lista de conversaciones guardadas en `localStorage`/`ChatStorage`.
   - Cambio dinámico e instantáneo entre hilos de conversación.
   - Creación de nuevos chats dentro de la misma vista, renombrado inline, borrado individual y borrado completo.
   - Buscador en tiempo real de conversaciones anteriores.

2. **Herramientas Agénticas y Análisis Gráfico**:
   - **`render_chart` (Nativo en SVG)**: Motor de gráficos autónomo (`js/charts.js`) capaz de visualizar datos en gráficos de barras, líneas y sectores/donut sin librerías externas.
   - **`download_pdf`**: Descarga y extracción de texto completo de documentos PDF desde URLs web.
   - **`fetch_web_page`**: Consulta y lectura de páginas web públicas y artículos HTML.
   - **`search_web`**: Motor de búsqueda real en internet con DuckDuckGo (CORS bypass con Jina Reader) y Wikipedia.
   - **`execute_javascript`**: Sandbox seguro para cálculos matemáticos y procesamiento de datos.

3. **Interacción por Voz (Voz a Texto / Texto a Voz)**:
   - **Dictado por voz (Speech-to-Text)**: Botón de micrófono `🎙️` con reconocimiento continuo mediante Web Speech API adaptado al idioma activo (ES/EN).
   - **Lectura en voz alta (Text-to-Speech)**: Botón `🔊 Escuchar` en cada respuesta del asistente con limpieza inteligente de markdown y selección de voz del sistema.

4. **Exportación e Importación Completa**:
   - Descarga de conversaciones en formato **Markdown limpio (`.md`)**.
   - Exportación de la sesión completa en **JSON estructurado (`.json`)** e importación directa para restaurar el chat.
   - Modo de impresión y **Guardar como PDF** maquetado profesionalmente sin elementos de la interfaz.

5. **Adjuntos Multimodales y Pegado de Imágenes**:
   - Soporte para adjuntar imágenes (`.png`, `.jpg`, `.webp`) y **pegado directo desde el portapapeles (`Ctrl + V`)**.
   - Formateo multimodal estándar (OpenAI `image_url` y Claude `base64`).
   - Soporte de documentos PDF y archivos de código/texto con Drag & Drop.

6. **Compatibilidad Universal Multi-Endpoint**:
   - **LM Studio** (`http://localhost:1234/v1`), **Ollama** (`http://localhost:11434`), **OpenAI**, **Claude**, **Gemini**, **OpenRouter**, **vLLM** y **LocalAI**.

7. **Control de Razonamiento (Thinking / CoT) y Consola en Vivo**:
   - Botón directo `🧠` con niveles de pensamiento (`None`, `Low`, `Med`, `High`, `XHigh`).
   - Panel de logs en tiempo real con filtrado (`Todo`, `🧠 Razonamiento`, `⚙️ Herramientas`, `🌐 Red`).

8. **Caché de Contexto Inteligente (Context / Prompt Caching)**:
   - Optimización automática de latencia y costes reutilizando la memoria caché de contexto (KV Cache / Prompt Caching) en servidores compatibles (OpenAI, Claude, OpenRouter, Gemini, LM Studio, vLLM).
   - **Auto-invalidación inteligente**: Si el usuario elimina preguntas o respuestas intermedias del chat, la aplicación anula la caché automáticamente y reconstruye un contexto limpio para evitar desincronizaciones o estados residuales en el servidor.
   - **Métricas de caché en tiempo real**: Visualización de tokens leídos desde la caché (`💾 N cache`) directamente en las estadísticas de cada respuesta y en la consola de depuración.

9. **Métricas de Rendimiento Precisas**:
   - Latencia al primer token (TTFT), velocidad (`⚡ tok/s`), tiempo total y conteo de tokens.

---

## 📁 Estructura del Repositorio

```text
chatcli/
├── chatcli.html        # 🚀 ARCHIVO AUTÓNOMO ÚNICO (Solo necesitas este archivo para usar el chat)
├── index.html          # Interfaz principal modular, sidebar y modales (<dialog>)
├── css/
│   └── styles.css      # Estilos visuales modernos, tablas GFM, sidebar, gráficos SVG, voz y tema print
├── js/
│   ├── app.js          # Controlador principal de la UI, multi-chat, eventos, voz y consola debug
│   ├── i18n.js         # Módulo de Internacionalización y traducciones reactivas (ES/EN)
│   ├── api.js          # Cliente SSE universal, streaming, herramientas y protocolos multi-endpoint
│   ├── charts.js       # Motor de renderizado de gráficos SVG nativos interactivos
│   ├── cookies.js      # Persistencia en localStorage y Cookies
│   ├── sandbox.js      # Sandbox aislado para ejecución de JavaScript
│   ├── web-search.js   # Buscador web en tiempo real con DuckDuckGo y Wikipedia
│   ├── web-browser.js  # Módulo de consulta de páginas web y descarga de PDFs en tiempo real
│   ├── file-parser.js  # Extractor de texto para documentos PDF, código e imágenes
│   └── markdown.js     # Parseador de Markdown con tablas GFM y ejecución sandbox JS
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

## 📄 Licencia

Este proyecto se distribuye bajo la licencia **MIT**. Consulta el archivo `LICENSE` para más detalles.

