# 🔮 ZeroChat — Roadmap de Mejoras Futuras y Calidad

Este documento registra las iniciativas de ingeniería, optimizaciones de arquitectura y mejoras de calidad planificadas para las siguientes iteraciones de **ZeroChat**.

---

## 1. 🧪 Pruebas de Integración con Navegador Real (E2E / Headless Browser Testing)

### 🎯 Objetivo
Complementar la suite actual de pruebas unitarias en Node.js (177+ tests) con un arnés de pruebas automatizadas que ejecute un navegador real en modo *headless* (Chromium/Firefox) para garantizar que las modificaciones de código no provoquen regresiones en el DOM, errores de consola o fallos en el ciclo de vida de la interfaz.

### 🔍 Casos de Prueba Críticos a Cubrir
1. **Smoke Test de Carga y Cero Errores de Consola**:
   - Cargar tanto el código fuente modular (`index.html`) como la distribución autónoma (`zerochat.html`).
   - Monitorizar y fallar ante cualquier `pageerror` o excepción JS no capturada (`Uncaught TypeError`, `SyntaxError`, etc.).
   - Verificar que la descompresión gzip en memoria (`DecompressionStream`) se completa y monta la interfaz en menos de 500 ms.
2. **Renderizado Dinámico de Herramientas (`ToolRegistry` ➜ UI)**:
   - Abrir el modal de Configuración ➜ Pestaña Agente.
   - Verificar que `#agent-tools-container` renderiza los toggles de herramientas registradas con sus etiquetas, descripciones traducidas y sliders visuales.
3. **Persistencia e Interacción de Usuario**:
   - Conmutar switches de activación/desactivación de herramientas y perfiles.
   - Guardar configuración, recargar la página (incluso bajo protocolo `file:///`) y validar que el estado del DOM y `localStorage` persisten fielmente.
4. **Ejecución Real en Sandbox Web Worker**:
   - Despachar llamadas `execute_javascript` y validar que el Worker aislado recibe el código, lo ejecuta y devuelve la respuesta al chat sin bloquear el hilo principal.
5. **Apertura e Integridad de Modales y Paneles**:
   - Verificar la apertura, navegación por pestañas y cierre limpio de `#settings-dialog`, `#tree-rag-dialog` y consola de logs `#debug-panel`.

### 🛠️ Opciones de Implementación Evaluadas
- **Opción A (Playwright / Puppeteer-core)**: Lanzar `/usr/bin/chromium` mediante la API de alto nivel de Playwright para tests declarativos y rápidos.
- **Opción B (Chromium Headless CDP Nativo)**: Conexión directa por WebSocket al Chrome DevTools Protocol (`remote-debugging-port`) usando Node.js puro para mantener 0 dependencias añadidas.

---

## 2. 🌳 Motor Tree-RAG v6.0 (Evolución de Base de Conocimiento)
- Consolidación del árbol jerárquico de documentos tras la fase experimental v5.3.
- Búsqueda híbrida vectorial/semántica ligera en cliente complementaria a la búsqueda estructural por capítulos.
- Optimizaciones de compresión en almacenamiento IndexedDB para grandes volúmenes de documentos.

---

## 3. 🔌 Expansión de Proveedores MCP (Model Context Protocol)
- Descubrimiento dinámico de herramientas y recursos desde servidores MCP locales (Stdio / SSE).
- Integración nativa de servidores MCP de sistema de archivos, SQLite y herramientas CLI externas.
