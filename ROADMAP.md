# ZeroChat — Roadmap técnico

Este documento recoge trabajo futuro. La arquitectura actual de conocimiento local usa IndexedDB como fuente de verdad y Orama como índice derivado en memoria.

## 1. Pruebas E2E en navegador real

Añadir Playwright o un arnés CDP para validar en Chromium y Firefox:

- carga sin errores de `index.html` y `zerochat.html`;
- funcionamiento bajo `file://` y HTTP;
- persistencia real de conversaciones, adjuntos y conocimiento en IndexedDB;
- apertura, navegación y cierre de `#settings-dialog`, `#rag-modal` y `#debug-panel`;
- ingesta mediante selector y arrastre de archivos;
- reconstrucción y consulta del índice Orama;
- ejecución del sandbox Web Worker y renderizado de tarjetas de herramientas.

## 2. Calidad de recuperación

- Crear un conjunto reproducible de consultas y documentos para medir precisión y cobertura.
- Ajustar tamaño y solapamiento de fragmentos con resultados medidos.
- Evaluar búsqueda híbrida semántica solo si aporta una mejora suficiente para justificar tamaño, memoria y tiempo de carga.
- Mostrar diagnósticos simples del índice: documentos, fragmentos, construcción y latencia de consulta.

## 3. Robustez del almacenamiento

- Añadir pruebas E2E de límites de cuota y recuperación tras transacciones abortadas.
- Medir el impacto de archivos grandes y establecer límites visibles antes de iniciar la ingesta.
- Permitir verificar la integridad de un respaldo antes de restaurarlo.

## 4. Proveedores y herramientas

- Ampliar la cobertura de integración de servidores MCP por HTTP/SSE.
- Mantener pruebas contractuales de las tools y de normalización de streaming por proveedor.
- Mejorar la detección de capacidades de modelos sin introducir tablas rígidas difíciles de mantener.
