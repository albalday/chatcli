/**
 * Módulo de Internacionalización y Multi-idioma (ChatI18n) para ZeroChat v5.2.
 * Gestiona diccionarios en Español e Inglés, formateo de fechas y reactividad de UI.
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatI18n = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const Storage = typeof window !== 'undefined' ? (window.ChatStorage || {}) : {};

  const TRANSLATIONS = {
    es: {
      // Metadatos y Encabezados
      app_title: 'ZeroChat v5.2 - Cliente Web Universal de Chat & Agente IA',
      app_description: 'Cliente web universal, agente IA autónomo y RAG local en un solo archivo con cero instalación',
      
      // Bienvenida y Sugerencias
      welcome_heading: '¿En qué puedo ayudarte hoy?',
      welcome_desc: 'Cliente de chat conectado a tu API. Puedes configurar el servidor, modelo, API Key y prompt en el botón de configuración junto a la caja de chat.',
      sug_explain_title: '💡 Explicar conceptos',
      sug_explain_text: '¿Cómo funciona una API REST con JavaScript?',
      sug_explain_prompt: 'Explícame cómo funciona una API REST con un ejemplo sencillo en JavaScript.',
      sug_code_title: '💻 Escribir código',
      sug_code_text: 'Función JS para ordenar un array de objetos',
      sug_code_prompt: 'Escribe una función en JavaScript para ordenar un array de objetos por una clave específica.',
      sug_ideas_title: '🚀 Ideas de proyectos',
      sug_ideas_text: '3 ideas de proyectos web en JavaScript Vanilla',
      sug_ideas_prompt: 'Dame 3 ideas de proyectos web interesantes que utilicen HTML5 y JavaScript Vanilla.',

      // Barra de herramientas superior
      profile_badge_title: 'Perfil de conexión activo (clic para abrir Configuración)',
      server_badge_title: 'Servidor configurado (clic para cambiar)',
      model_badge_title: 'Modelo activo (clic para cambiar)',
      no_model: '(Sin modelo)',
      btn_clear_chat: 'Limpiar',
      btn_clear_chat_title: 'Limpiar conversación actual',
      btn_logs: 'Logs y Debug',
      btn_logs_title: 'Abrir/Cerrar panel lateral de logs y depuración',
      btn_settings: 'Configuración',
      btn_settings_title: 'Abrir configuración de API y Modelo',
      btn_tree_rag: 'Base de Conocimiento',
      btn_tree_rag_title: 'Gestionar Base de Conocimiento por Ramas (RAG Jerárquico)',
      rag_tab_active: '🌿 Rama Activa en Chat',
      rag_tab_manage: '📁 Gestión de Ramas y Documentos',
      rag_tab_help: '❓ Ayuda',
      rag_help_intro_title: '¿Qué es el RAG Agéntico Local?',
      rag_help_how_it_works_title: '¿Cómo funciona la indexación y recuperación?',
      rag_help_model_rec_title: 'Modelo para Ingesta y Carga de Archivos',
      rag_help_storage_title: 'Ubicación de Archivos, Exportación e Importación',
      rag_context_limit_title: '📦 Tamaño de Contexto por Capítulo (Tokens)',
      rag_context_limit_desc: 'Define la capacidad máxima de tokens por capítulo (16K a 1M tokens) para segmentar documentos y realizar síntesis con el modelo. Protege imágenes y tablas completas.',
      rag_select_branch_chat: 'Seleccionar Rama para el Chat',
      rag_select_branch_chat_hint: 'Haz clic en una rama para activarla en la conversación actual:',
      rag_editing_branch: 'Rama en edición:',
      rag_active_label: 'Rama Activa en Chat:',
      rag_inactive_label: 'RAG Desactivado',
      rag_no_context: 'Sin contexto documental',
      rag_btn_deactivate: 'Desactivar RAG',
      rag_btn_activate: 'Activar en Chat',
      rag_branch_default: '🌿 Sin contexto (RAG desactivado)',
      rag_branch_select_title: 'Seleccionar Rama de Conocimiento (RAG)',
      rag_modal_title: 'Base de Conocimiento (RAG Jerárquico por Ramas)',
      rag_branches_title: 'Ramas de Proyecto',
      rag_btn_new_branch: '+ Nueva Rama',
      rag_btn_activate_branch: 'Activar en chat',
      rag_active_branch_badge: 'Rama Activa en Chat',
      rag_dropzone_title: 'Arrastra tus documentos PDF, Markdown o Texto (.txt) aquí',
      rag_dropzone_hint: 'o haz clic para explorar tus archivos locales',
      rag_docs_title: 'Documentos Indexados en esta Rama',
      rag_no_docs: 'No hay documentos en esta rama. Arrastra archivos arriba para comenzar a indexar.',
      rag_no_branches: 'No hay ramas creadas. Crea una nueva rama para organizar tus documentos.',
      rag_structure_title: 'Estructura del Documento',
      rag_global_summary_label: '📌 Resumen Global del Documento',
      rag_chapters_label: '📑 Capítulos Detectados',
      rag_btn_view_structure: 'Ver estructura',
      rag_btn_view_chapter_content: 'Ver contenido íntegro',
      rag_btn_delete: 'Eliminar',
      rag_confirm_delete_branch: '¿Estás seguro de que deseas eliminar esta rama? Se eliminarán todos sus documentos y capítulos asociados.',
      rag_confirm_delete_doc: '¿Estás seguro de que deseas eliminar este documento?',
      rag_status_waiting: 'En espera',
      rag_status_reading: 'Extrayendo texto',
      rag_status_extracting_pdf: 'Extrayendo páginas PDF',
      rag_status_generating_summaries: 'Generando resúmenes con IA...',
      rag_status_saving: 'Guardando en base de datos',
      rag_status_completed: 'Guardado',
      rag_status_error: 'Error',
      rag_btn_cancel_queue: 'Cancelar Cola',
      lang_switcher_title: 'Cambiar idioma / Switch language',

      // Barra de entrada y formulario
      btn_attach_title: 'Adjuntar archivos (PDF, código, texto, imágenes)',
      reasoning_btn_title: 'Nivel de razonamiento (Desactivado por defecto)',
      reasoning_menu_title: '🧠 Nivel de Razonamiento',
      input_placeholder: 'Envía un mensaje o arrastra un archivo... (Enter para enviar, Shift+Enter para nueva línea)',
      btn_stop: 'Detener',
      btn_stop_title: 'Detener respuesta',
      btn_send_title: 'Enviar mensaje',
      chat_disclaimer: 'Las respuestas generadas pueden variar según el servidor y modelo configurados. Guarda tu API Key de forma segura.',

      // Niveles de razonamiento
      reasoning_level_none: 'Desactivado (None)',
      reasoning_desc_none: 'Sin razonamiento extendido',
      reasoning_level_on: 'Activado (On)',
      reasoning_desc_on: 'Razonamiento extendido activado',
      reasoning_level_minimal: 'Mínimo (Minimal)',
      reasoning_desc_minimal: 'Razonamiento ultra rápido y conciso',
      reasoning_level_low: 'Bajo (Low)',
      reasoning_desc_low: 'Razonamiento ligero y rápido',
      reasoning_level_medium: 'Medio (Medium)',
      reasoning_desc_medium: 'Equilibrio entre velocidad y análisis',
      reasoning_level_high: 'Alto (High)',
      reasoning_desc_high: 'Máximo análisis y deducción profunda',
      reasoning_level_xhigh: 'Extra Alto (X-High)',
      reasoning_desc_xhigh: 'Razonamiento exhaustivo máximo',

      // Panel lateral de Logs y Debug
      debug_panel_title: 'Logs y Debug',
      debug_status_idle: 'Inactivo',
      debug_status_streaming: 'Generando...',
      debug_status_thinking: 'Pensando...',
      debug_status_done: 'Completado',
      debug_status_error: 'Error',
      btn_copy_debug_title: 'Copiar logs al portapapeles',
      btn_clear_debug_title: 'Limpiar logs',
      btn_autoscroll_title: 'Auto-scroll activado',
      btn_close_debug_title: 'Cerrar panel de logs',
      debug_messages_toggle: 'Debug messages',
      debug_messages_toggle_title: 'Activar/Desactivar depuración interactiva de mensajes salientes',
      debug_modal_title: 'Debug de Mensaje Saliente',
      debug_modal_desc: 'Revisa o modifica el payload JSON antes de enviarlo al servidor. Puedes editar cualquier mensaje, parámetros o herramientas.',
      btn_format_json: '✨ Formatear',
      btn_copy_all: '📋 Copiar todo',
      btn_send: 'Enviar',
      btn_send_and_stop_debug: 'Enviar y parar debug',
      btn_maximize_title: 'Maximizar / Restaurar',
      debug_json_error_invalid: 'Error de sintaxis en JSON: {error}',
      debug_tab_all: 'Todo',
      debug_tab_thinking: '🧠 Razonamiento',
      debug_tab_tool: '⚙️ Herramientas',
      debug_tab_network: '🌐 Red',
      debug_tab_raw: '📡 Raw',
      debug_raw_capture_title: 'Activar/Desactivar captura de tráfico Raw',
      raw_capture_label: 'Capturar tráfico crudo (HTTP / SSE / Tools)',
      raw_status_active: 'ACTIVO',
      raw_status_inactive: 'INACTIVO',
      debug_sys_init: 'Inspector de logs y razonamiento iniciado.',
      debug_sys_cleared: 'Logs limpiados. Esperando peticiones...',
      debug_tag_system: 'SISTEMA',
      debug_tag_thinking: 'PENSAMIENTO',
      debug_tag_tool: 'HERRAMIENTA',
      debug_tag_network: 'RED',
      debug_tag_raw: 'RAW',
      debug_tag_stats: 'STATS',
      debug_tag_error: 'ERROR',
      debug_tag_info: 'INFO',

      // Mensajes del chat y acciones
      user_avatar: 'Tú',
      btn_reuse: 'Reutilizar',
      btn_reuse_title: 'Colocar mensaje en la caja de texto',
      btn_delete: 'Borrar',
      btn_delete_usr_title: 'Eliminar esta pregunta',
      btn_delete_ast_title: 'Eliminar esta respuesta',
      btn_copy: 'Copiar',
      btn_copy_title: 'Copiar respuesta completa al portapapeles',
      copied_text: '¡Copiado!',
      empty_response: '(Respuesta vacía)',
      msg_deleted_log: 'Mensaje [{id}] eliminado de la memoria y la interfaz ({count} turnos retirados).',

      // Estadísticas
      stat_ttft: '⏳ 1º token: {sec}s',
      stat_ttft_title: 'Tiempo hasta recibir el 1º token (Latencia / TTFT)',
      stat_speed: '⚡ {speed} tok/s',
      stat_speed_title: 'Velocidad de generación (calculada desde el 1º token)',
      stat_total_time: '⏱️ {sec}s',
      stat_total_time_title: 'Tiempo total de respuesta',
      stat_tokens: '📝 {tokens} tok',
      stat_tokens_title: 'Tokens totales estimados',
      stat_cache_tokens: '💾 {tokens} cache',
      stat_cache_title: 'Tokens leídos desde la caché de contexto del servidor (Prompt/KV Caching)',
      cache_invalidated_log: '🔄 Caché de contexto invalidada tras el borrado de mensajes del chat. Se reconstruye un contexto limpio en el servidor.',
      cache_hit_log: '⚡ Caché de contexto activa: {cached} tokens leídos de caché.',

      // Respuestas agénticas y herramientas
      tool_js_title: '⚡ Herramienta Ejecutada: execute_javascript ({ms}ms)',
      tool_js_title_running: 'Ejecutar JavaScript',
      tool_badge_executing: 'Ejecutando...',
      tool_badge_fetching: 'Consultando...',
      tool_badge_downloading: 'Descargando...',
      tool_badge_searching: 'Buscando...',
      tool_loading_js: 'Ejecutando código en sandbox local...',
      tool_loading_web: 'Conectando y descargando página web...',
      tool_loading_pdf: 'Descargando y analizando documento PDF...',
      tool_loading_search: 'Consultando motores de búsqueda en tiempo real...',
      tool_web_receiving: 'Recibiendo contenido...',
      tool_search_searching: 'Buscando fuentes...',
      tool_btn_collapse: 'Minimizar herramienta',
      tool_btn_expand: 'Expandir herramienta',
      tool_sandbox_output: 'Salida del Sandbox:',
      tool_web_title: 'Navegador Web: fetch_web_page',
      tool_pdf_title: 'Documento PDF: download_pdf',
      tool_web_requested_url: '📤 URL Solicitada por el Modelo:',
      tool_web_content_received: '📥 Contenido Obtenido ({size}):',
      tool_web_empty: '(Página web o PDF cargado sin contenido de texto)',
      tool_web_err_connect: 'Error al conectar con la página web o descargar el PDF',
      tool_search_title: 'Buscador DuckDuckGo: search_web',
      tool_search_query: '🔍 Búsqueda Solicitada por el Modelo:',
      tool_search_results: '📄 Resultados Obtenidos ({count} resultados):',
      tool_search_empty: 'No se encontraron resultados directos en DuckDuckGo para esta búsqueda.',
      tool_error_title: 'Error procesando la herramienta:',
      tool_error_assistant: 'Error en la respuesta del asistente:',

      // Modal de Configuración
      modal_title: 'Configuración del Chat',
      tab_general: '🌐 General',
      tab_agent: '🤖 Agente',
      tab_model: '⚙️ Modelo',
      tab_appearance: '🎨 Visualización',
      tab_inspector: '🔍 Inspector',
      inspector_desc: 'Analiza el endpoint configurado para determinar con precisión qué capacidades soporta, distinguiendo entre capacidades declaradas, inferidas y comprobadas mediante pruebas activas seguras.',
      btn_run_inspector: 'Ejecutar Diagnóstico de Capacidades',
      btn_running_inspector: 'Diagnosticando endpoint...',
      inspector_status_confirmed: 'Comprobada',
      inspector_status_inferred: 'Inferida',
      inspector_status_declared: 'Declarada',
      inspector_status_unsupported: 'No soportada',
      inspector_status_unknown: 'Desconocida',
      inspector_cap_streaming: 'Streaming (SSE)',
      inspector_cap_tools: 'Herramientas (Tool Calling)',
      inspector_cap_vision: 'Visión Multimodal',
      inspector_cap_reasoning: 'Control de Razonamiento',
      inspector_cap_jsonMode: 'Modo Estructurado (JSON)',
      inspector_cap_promptCaching: 'Caché de Contexto',
      inspector_cap_embeddings: 'Embeddings',
      inspector_cap_modelListing: 'Descubrimiento de Modelos',
      inspector_summary_title: 'Informe de Capacidades del Proveedor',
      inspector_models_found: '{count} modelos detectados',
      field_language: 'Idioma de la Interfaz (Language)',
      field_language_hint: 'Selecciona el idioma visual de la aplicación.',
      field_profile: 'Perfil de Conexión / Servidor',
      field_profile_hint: 'Selecciona un perfil guardado o escribe un nuevo nombre para crearlo.',
      field_profile_name_label: 'Nombre del Perfil',
      field_profile_placeholder: 'Nombre del perfil (ej: LM Studio, Ollama, OpenRouter...)',
      profile_card_title: 'Valores y Parámetros del Perfil',
      profile_select_default: '▾ Elegir perfil guardado...',
      btn_save_profile: 'Guardar Perfil',
      btn_save_profile_title: 'Guardar todos los valores actuales en este perfil',
      btn_delete_profile_title: 'Eliminar el perfil seleccionado',
      msg_profile_saved: '✅ Perfil "{name}" guardado con éxito.',
      msg_profile_deleted: '🗑️ Perfil "{name}" eliminado correctamente.',
      confirm_delete_profile: '¿Estás seguro de que deseas eliminar el perfil "{name}"?',
      err_profile_name_empty: 'Por favor, escribe un nombre para el perfil.',
      field_api_type: 'Tipo de Interfaz / Protocolo',
      field_api_type_hint: 'Determina el formato del JSON de petición y las opciones de razonamiento.',
      field_api_url: 'URL del Servidor / Endpoint de Chat',
      field_api_url_hint: 'Compatible con OpenAI, LM Studio, Ollama, LocalAI, vLLM, OpenRouter, Claude, Gemini, etc.',
      btn_query_title: 'Consultar modelos disponibles y capacidades de la API en el servidor',
      btn_query_text: 'Query',
      btn_querying_text: 'Consultando...',
      field_api_key: 'Clave de API (API Key)',
      field_api_key_hint: 'Opcional si usas un servidor local (LM Studio / Ollama / LocalAI).',
      btn_toggle_key_title: 'Mostrar/Ocultar clave',
      field_model: 'Nombre del Modelo',
      field_model_hint: 'Selecciona de la lista del servidor o escribe cualquier nombre personalizado.',
      field_model_placeholder: 'Escribe o pulsa Query para consultar modelos...',
      model_select_default: '▾ Elegir modelo detectado...',
      model_select_count: '▾ Elegir modelo detectado ({count})...',
      field_theme: 'Tema Visual de la Interfaz',
      field_theme_hint: 'Selecciona el modo de visualización.',
      theme_light: '☀️ Modo Claro',
      theme_dark: '🌙 Modo Oscuro',
      agent_intro: 'Configura las herramientas agénticas y el contexto temporal que se transmiten al modelo.',
      agent_search_title: '🔍 Búsqueda en DuckDuckGo en Tiempo Real',
      agent_search_desc: 'Permite al modelo invocar search_web para buscar información actualizada, definiciones, noticias y enlaces web mediante la API de DuckDuckGo.',
      agent_js_title: '⚡ Ejecución de JavaScript Local (Sandbox)',
      agent_js_desc: 'Permite al modelo invocar execute_javascript para calcular, procesar datos o validar algoritmos en un entorno seguro en el navegador.',
      agent_web_title: '🌐 Navegación Web y Descarga de Documentos PDF',
      agent_web_desc: 'Permite al modelo invocar fetch_web_page para consultar páginas web públicas y download_pdf para descargar y extraer documentos PDF en tiempo real.',
      agent_chart_title: '📊 Visualización de Datos y Gráficos Nativos (SVG)',
      agent_chart_desc: 'Permite al modelo invocar render_chart para generar y mostrar gráficos interactivos de barras, líneas o sectores sin librerías externas.',
      agent_cache_title: '⚡ Caché de Contexto (Context / Prompt Caching)',
      agent_cache_desc: 'Reutiliza la caché de contexto (KV Cache / Prompt Caching) en servidores compatibles (OpenAI, Claude, OpenRouter, Gemini, LM Studio, vLLM) reduciendo latencia y coste. Se invalida y reconstruye automáticamente si borras mensajes del chat.',
      agent_datetime_title: '🕒 Informar Fecha y Hora al Iniciar Chat',
      agent_datetime_desc: 'Inserta automáticamente la fecha y hora actual como primer mensaje de la conversación (con respuesta \'OK\') para informar al modelo sin invalidar la caché de contexto en las siguientes peticiones.',
      datetime_initial_user_msg: 'La fecha y hora actual es: {datetime}.',
      agent_raw_logs_title: '📡 Captura de Tráfico Raw en Logs',
      agent_raw_logs_desc: 'Registra todo el tráfico de red entrante y saliente (solicitudes HTTP, chunks SSE crudos y llamadas de herramientas) en la pestaña dedicada Raw del panel de logs.',
      field_system_prompt: 'Prompt del Sistema (Opcional)',
      field_system_prompt_hint: 'Instrucciones base personalizadas que guían el comportamiento del asistente (opcional).',
      field_system_prompt_placeholder: 'Escribe aquí tus instrucciones personalizadas para el modelo (opcional)...',
      field_temperature: 'Temperatura: {val}',
      field_temperature_hint: 'Controla la creatividad de las respuestas (0 = determinista/preciso, 1 = creativo).',
      cookie_notice: 'Toda la configuración se almacena localmente de forma persistente (compatible tanto con <strong>file://</strong> como con servidores web).',
      btn_reset: 'Restablecer valores',
      btn_clear_all_data: '🗑️ Borrar todo',
      btn_clear_all_data_title: 'Borrar todas las cookies, sesiones y configuraciones locales',
      confirm_clear_all_data: '¿Estás seguro de que deseas borrar TODA la configuración, historial de chats, modelos y cookies locales?\n\nLa aplicación se reiniciará completamente limpia desde cero.',
      btn_cancel: 'Cancelar',
      btn_save: 'Guardar Configuración',
      btn_close: 'Cerrar',
      modal_btn_close: 'Cerrar',
      modal_close_aria: 'Cerrar modal',

      // Mensajes de estado y errores
      err_no_model_title: 'No hay ningún modelo seleccionado:',
      err_no_model_desc: 'Por favor, abre la <strong>Configuración</strong> para introducir un modelo o pulsa el botón <strong>Query</strong> para consultar los modelos disponibles en tu servidor ({url}).',
      err_server_connect: 'Error al conectar con el servidor:',
      err_server_connect_hint: '💡 Abre la <strong>Configuración</strong> para verificar la URL del servidor ({url}), el modelo y tu API Key.',
      err_invalid_url: 'Por favor, introduce una URL de servidor válida.',
      err_connecting_models: '⏳ Conectando con {url} para obtener modelos...',
      msg_models_success: '✅ <strong>{count} modelos detectados con éxito</strong> en <code>{endpoint}</code>.',
      err_api_connect: '❌ <strong>Error al conectar con la API:</strong> {err}',
      err_file_process: 'No se pudo procesar el archivo {name}: {err}',

      // Markdown & Sandbox
      md_thought_title: '💭 Proceso de razonamiento',
      md_thought_reasoning: '💭 Razonando...',
      md_run_js_title: 'Ejecutar en sandbox local (sin acceso a red ni archivos)',
      md_run_js_btn: 'Ejecutar JS',
      md_copy_code_title: 'Copiar código',
      md_copy_code_btn: 'Copiar',
      md_output_title: 'Salida (Consola / Retorno):',
      md_clear_output: 'Limpiar salida',

      // Barra lateral e Historial de Conversaciones (Sidebar)
      sidebar_title: 'Conversaciones',
      btn_sidebar_title: 'Abrir historial de conversaciones',
      btn_chats_history: 'Abrir historial',
      btn_open_history: 'Abrir historial',
      btn_new_chat_sidebar_title: 'Crear nueva conversación',
      btn_close_sidebar_title: 'Cerrar barra lateral',
      sidebar_search_placeholder: 'Buscar en historial...',
      sidebar_no_chats: 'No hay conversaciones guardadas',
      btn_import_chat: 'Importar',
      btn_import_chat_title: 'Importar conversación desde archivo JSON',
      btn_export_all: 'Exportar',
      btn_export_short: 'Exportar',
      btn_export_chat_title: 'Exportar conversación (Markdown, JSON, PDF)',
      btn_delete_all_chats: 'Borrar todos',
      btn_delete_all_chats_title: 'Eliminar todas las conversaciones guardadas',
      chat_untitled: 'Nueva conversación',
      chat_delete_confirm: '¿Seguro que deseas eliminar esta conversación?',
      chat_delete_all_confirm: '¿Estás seguro de que deseas eliminar todas las conversaciones guardadas? Esta acción no se puede deshacer.',
      chat_imported_success: 'Conversación importada con éxito.',

      // Modal de Exportación
      export_modal_title: 'Exportar Conversación',
      btn_close_export_title: 'Cerrar modal de exportación',
      export_md_title: 'Descargar Markdown (.md)',
      export_md_desc: 'Formato limpio con formato, código y tablas legible en cualquier visor.',
      export_json_title: 'Descargar JSON de Sesión (.json)',
      export_json_desc: 'Historial estructurado completo con herramientas, imágenes y metadatos para restaurar.',
      export_pdf_title: 'Imprimir / Guardar como PDF',
      export_pdf_desc: 'Genera un documento PDF limpio maquetado para lectura e informes.',

      // Gráficos interactivos
      tool_chart_title: '📊 Visualización de Datos ({type})',

      // Contexto del sistema de fecha/hora del mundo real
      system_context_prefix: '\n\n[INFORMACIÓN TEMPORAL DEL MUNDO REAL]\n- Fecha y hora actual del mundo real: {datetime}.\n- Año presente en el mundo real: {year}.\n- Contexto temporal obligatorio: Esta es la fecha y hora REAL y PRESENTE del mundo físico en el que se produce esta conversación. No es una fecha hipotética, ni una simulación, ni una fecha futura. Todo acontecimiento anterior a este momento pertenece al pasado, y el año actual es {year}. Responde y razona siempre tomando esta fecha como el momento presente real de hoy.',
      default_system_prompt: ''
    },

    en: {
      // Metadata & Headers
      app_title: 'ZeroChat v5.2 - Universal AI Chat & Agent Web Client',
      app_description: 'Universal, zero-install, standalone web chat client, autonomous AI agent and local RAG in a single file',
      
      // Bienvenida y Sugerencias
      welcome_heading: 'How can I help you today?',
      welcome_desc: 'Chat client connected to your API. You can configure the server, model, API Key, and system prompt using the settings button next to the input box.',
      sug_explain_title: '💡 Explain concepts',
      sug_explain_text: 'How does a REST API work with JavaScript?',
      sug_explain_prompt: 'Explain how a REST API works with a simple example in JavaScript.',
      sug_code_title: '💻 Write code',
      sug_code_text: 'JS function to sort an array of objects',
      sug_code_prompt: 'Write a JavaScript function to sort an array of objects by a specific key.',
      sug_ideas_title: '🚀 Project ideas',
      sug_ideas_text: '3 interesting web project ideas in Vanilla JavaScript',
      sug_ideas_prompt: 'Give me 3 interesting web project ideas using HTML5 and Vanilla JavaScript.',

      // Barra de herramientas superior
      profile_badge_title: 'Active connection profile (click to open Settings)',
      server_badge_title: 'Configured server (click to change)',
      model_badge_title: 'Active model (click to change)',
      no_model: '(No model)',
      btn_clear_chat: 'Clear',
      btn_clear_chat_title: 'Clear current conversation',
      btn_logs: 'Logs & Debug',
      btn_logs_title: 'Open/Close logs & debugging side panel',
      btn_settings: 'Settings',
      btn_settings_title: 'Open API and Model settings',
      btn_tree_rag: 'Knowledge Base',
      btn_tree_rag_title: 'Manage Branch Knowledge Base (Hierarchical Tree RAG)',
      rag_tab_active: '🌿 Active Chat Branch',
      rag_tab_manage: '📁 Branch & Document Manager',
      rag_tab_help: '❓ Help',
      rag_help_intro_title: 'What is Local Agentic RAG?',
      rag_help_how_it_works_title: 'How does indexing and retrieval work?',
      rag_help_model_rec_title: 'Model for Document Ingestion and Loading',
      rag_help_storage_title: 'File Location, Export, and Import',
      rag_context_limit_title: '📦 Chapter Context Size (Tokens)',
      rag_context_limit_desc: 'Sets the maximum token capacity per chapter (16K to 1M tokens) for document partitioning and AI summaries. Preserves atomic tables and images.',
      rag_select_branch_chat: 'Select Branch for Chat',
      rag_select_branch_chat_hint: 'Click a branch to activate it in the current conversation:',
      rag_editing_branch: 'Editing Branch:',
      rag_active_label: 'Active Chat Branch:',
      rag_inactive_label: 'RAG Disabled',
      rag_no_context: 'No document context',
      rag_btn_deactivate: 'Disable RAG',
      rag_btn_activate: 'Activate in Chat',
      rag_branch_default: '🌿 No context (RAG disabled)',
      rag_branch_select_title: 'Select Knowledge Branch (RAG)',
      rag_modal_title: 'Knowledge Base (Hierarchical Branch RAG)',
      rag_branches_title: 'Project Branches',
      rag_btn_new_branch: '+ New Branch',
      rag_btn_activate_branch: 'Activate in chat',
      rag_active_branch_badge: 'Active in Chat',
      rag_dropzone_title: 'Drag & Drop your PDF, Markdown, or Text (.txt) files here',
      rag_dropzone_hint: 'or click to browse your local files',
      rag_docs_title: 'Indexed Documents in this Branch',
      rag_no_docs: 'No documents in this branch. Drop files above to start indexing.',
      rag_no_branches: 'No branches created. Create a new branch to organize your documents.',
      rag_structure_title: 'Document Structure',
      rag_global_summary_label: '📌 Global Document Summary',
      rag_chapters_label: '📑 Detected Chapters',
      rag_btn_view_structure: 'View structure',
      rag_btn_view_chapter_content: 'View full content',
      rag_btn_delete: 'Delete',
      rag_confirm_delete_branch: 'Are you sure you want to delete this branch? All associated documents and chapters will be deleted.',
      rag_confirm_delete_doc: 'Are you sure you want to delete this document?',
      rag_status_waiting: 'Queued',
      rag_status_reading: 'Extracting text',
      rag_status_extracting_pdf: 'Extracting PDF pages',
      rag_status_generating_summaries: 'Generating AI summaries...',
      rag_status_saving: 'Saving to database',
      rag_status_completed: 'Saved',
      rag_status_error: 'Error',
      rag_btn_cancel_queue: 'Cancel Queue',
      lang_switcher_title: 'Switch language / Cambiar idioma',

      // Barra de entrada y formulario
      btn_attach_title: 'Attach files (PDF, code, text, images)',
      reasoning_btn_title: 'Reasoning effort level (Disabled by default)',
      reasoning_menu_title: '🧠 Reasoning Level',
      input_placeholder: 'Send a message or drag a file... (Enter to send, Shift+Enter for new line)',
      btn_stop: 'Stop',
      btn_stop_title: 'Stop response generation',
      btn_send_title: 'Send message',
      chat_disclaimer: 'Generated responses may vary based on configured server and model. Keep your API Key secure.',

      // Niveles de razonamiento
      reasoning_level_none: 'Disabled (None)',
      reasoning_desc_none: 'No extended reasoning',
      reasoning_level_on: 'Enabled (On)',
      reasoning_desc_on: 'Extended reasoning enabled',
      reasoning_level_minimal: 'Minimal',
      reasoning_desc_minimal: 'Ultra-fast and concise reasoning',
      reasoning_level_low: 'Low',
      reasoning_desc_low: 'Lightweight and fast reasoning',
      reasoning_level_medium: 'Medium',
      reasoning_desc_medium: 'Balanced speed and analytical depth',
      reasoning_level_high: 'High',
      reasoning_desc_high: 'Maximum reasoning and deep deduction',
      reasoning_level_xhigh: 'Extra High (X-High)',
      reasoning_desc_xhigh: 'Exhaustive reasoning effort',

      // Panel lateral de Logs y Debug
      debug_panel_title: 'Logs & Debug',
      debug_status_idle: 'Idle',
      debug_status_streaming: 'Generating...',
      debug_status_thinking: 'Thinking...',
      debug_status_done: 'Completed',
      debug_status_error: 'Error',
      btn_copy_debug_title: 'Copy logs to clipboard',
      btn_clear_debug_title: 'Clear logs',
      btn_autoscroll_title: 'Auto-scroll enabled',
      btn_close_debug_title: 'Close logs panel',
      debug_messages_toggle: 'Debug messages',
      debug_messages_toggle_title: 'Enable/Disable interactive debugging of outgoing messages',
      debug_modal_title: 'Outgoing Message Debug',
      debug_modal_desc: 'Review or edit the JSON payload before sending it to the server. You can modify any message, parameters, or tools.',
      btn_format_json: '✨ Format',
      btn_copy_all: '📋 Copy all',
      btn_send: 'Send',
      btn_send_and_stop_debug: 'Send & stop debug',
      btn_maximize_title: 'Maximize / Restore',
      debug_json_error_invalid: 'JSON syntax error: {error}',
      debug_tab_all: 'All',
      debug_tab_thinking: '🧠 Thinking',
      debug_tab_tool: '⚙️ Tools',
      debug_tab_network: '🌐 Network',
      debug_tab_raw: '📡 Raw',
      debug_raw_capture_title: 'Enable/Disable Raw traffic capture',
      raw_capture_label: 'Capture raw traffic (HTTP / SSE / Tools)',
      raw_status_active: 'ACTIVE',
      raw_status_inactive: 'INACTIVE',
      debug_sys_init: 'Logs and reasoning inspector started.',
      debug_sys_cleared: 'Logs cleared. Waiting for requests...',
      debug_tag_system: 'SYSTEM',
      debug_tag_thinking: 'THINKING',
      debug_tag_tool: 'TOOL',
      debug_tag_network: 'NETWORK',
      debug_tag_raw: 'RAW',
      debug_tag_stats: 'STATS',
      debug_tag_error: 'ERROR',
      debug_tag_info: 'INFO',

      // Mensajes del chat y acciones
      user_avatar: 'You',
      btn_reuse: 'Reuse',
      btn_reuse_title: 'Put message into the input box',
      btn_delete: 'Delete',
      btn_delete_usr_title: 'Delete this question',
      btn_delete_ast_title: 'Delete this response',
      btn_copy: 'Copy',
      btn_copy_title: 'Copy full response to clipboard',
      copied_text: 'Copied!',
      empty_response: '(Empty response)',
      msg_deleted_log: 'Message [{id}] removed from memory and UI ({count} turns cleared).',

      // Estadísticas
      stat_ttft: '⏳ 1st token: {sec}s',
      stat_ttft_title: 'Time to first token (Latency / TTFT)',
      stat_speed: '⚡ {speed} tok/s',
      stat_speed_title: 'Generation speed (calculated from 1st token)',
      stat_total_time: '⏱️ {sec}s',
      stat_total_time_title: 'Total response time',
      stat_tokens: '📝 {tokens} tok',
      stat_tokens_title: 'Estimated total tokens',
      stat_cache_tokens: '💾 {tokens} cache',
      stat_cache_title: 'Tokens read from server context cache (Prompt / KV Caching)',
      cache_invalidated_log: '🔄 Context cache invalidated after message deletion. Clean context rebuilt on server.',
      cache_hit_log: '⚡ Context cache active: {cached} tokens read from cache.',

      // Respuestas agénticas y herramientas
      tool_js_title: '⚡ Tool Executed: execute_javascript ({ms}ms)',
      tool_js_title_running: 'Execute JavaScript',
      tool_badge_executing: 'Executing...',
      tool_badge_fetching: 'Fetching...',
      tool_badge_downloading: 'Downloading...',
      tool_badge_searching: 'Searching...',
      tool_loading_js: 'Executing code in local sandbox...',
      tool_loading_web: 'Connecting and fetching web page...',
      tool_loading_pdf: 'Downloading and parsing PDF document...',
      tool_loading_search: 'Searching web engines in real time...',
      tool_web_receiving: 'Receiving content...',
      tool_search_searching: 'Searching sources...',
      tool_btn_collapse: 'Minimize tool',
      tool_btn_expand: 'Expand tool',
      tool_sandbox_output: 'Sandbox Output:',
      tool_web_title: 'Web Browser: fetch_web_page',
      tool_pdf_title: 'PDF Document: download_pdf',
      tool_web_requested_url: '📤 URL Requested by Model:',
      tool_web_content_received: '📥 Retrieved Content ({size}):',
      tool_web_empty: '(Web page or PDF loaded with no readable text content)',
      tool_web_err_connect: 'Error connecting to web page or downloading PDF',
      tool_search_title: 'DuckDuckGo Search: search_web',
      tool_search_query: '🔍 Search Requested by Model:',
      tool_search_results: '📄 Retrieved Results ({count} results):',
      tool_search_empty: 'No search results found on DuckDuckGo for this query.',
      tool_error_title: 'Error processing tool:',
      tool_error_assistant: 'Error in assistant response:',

      // Modal de Configuración
      modal_title: 'Chat Settings',
      tab_general: '🌐 General',
      tab_agent: '🤖 Agent',
      tab_model: '⚙️ Model',
      tab_appearance: '🎨 Appearance',
      tab_inspector: '🔍 Inspector',
      inspector_desc: 'Analyzes the configured endpoint to determine which capabilities are supported, distinguishing between declared, inferred, and confirmed capabilities via safe active probes.',
      btn_run_inspector: 'Run Capability Diagnostics',
      btn_running_inspector: 'Diagnosing endpoint...',
      inspector_status_confirmed: 'Confirmed',
      inspector_status_inferred: 'Inferred',
      inspector_status_declared: 'Declared',
      inspector_status_unsupported: 'Unsupported',
      inspector_status_unknown: 'Unknown',
      inspector_cap_streaming: 'Streaming (SSE)',
      inspector_cap_tools: 'Tools (Tool Calling)',
      inspector_cap_vision: 'Multimodal Vision',
      inspector_cap_reasoning: 'Reasoning Control',
      inspector_cap_jsonMode: 'Structured Output (JSON)',
      inspector_cap_promptCaching: 'Context Caching',
      inspector_cap_embeddings: 'Embeddings',
      inspector_cap_modelListing: 'Model Discovery',
      inspector_summary_title: 'Provider Capabilities Report',
      inspector_models_found: '{count} models detected',
      field_language: 'Interface Language (Idioma)',
      field_language_hint: 'Select the visual language of the application.',
      field_profile: 'Connection Profile / Server',
      field_profile_hint: 'Select a saved profile or type a new name to create one.',
      field_profile_name_label: 'Profile Name',
      field_profile_placeholder: 'Profile name (e.g. LM Studio, Ollama, OpenRouter...)',
      profile_card_title: 'Profile Settings & Parameters',
      profile_select_default: '▾ Choose saved profile...',
      btn_save_profile: 'Save Profile',
      btn_save_profile_title: 'Save all current values into this profile',
      btn_delete_profile_title: 'Delete selected profile',
      msg_profile_saved: '✅ Profile "{name}" saved successfully.',
      msg_profile_deleted: '🗑️ Profile "{name}" deleted successfully.',
      confirm_delete_profile: 'Are you sure you want to delete profile "{name}"?',
      err_profile_name_empty: 'Please enter a name for the profile.',
      field_api_type: 'Interface Type / Protocol',
      field_api_type_hint: 'Determines the request JSON format and reasoning options.',
      field_api_url: 'Server URL / Chat Endpoint',
      field_api_url_hint: 'Compatible with OpenAI, LM Studio, Ollama, LocalAI, vLLM, OpenRouter, Claude, Gemini, etc.',
      btn_query_title: 'Query available models and API capabilities from the server',
      btn_query_text: 'Query',
      btn_querying_text: 'Querying...',
      field_api_key: 'API Key',
      field_api_key_hint: 'Optional when using a local server (LM Studio / Ollama / LocalAI).',
      btn_toggle_key_title: 'Show/Hide API Key',
      field_model: 'Model Name',
      field_model_hint: 'Select from the server model list or type any custom name.',
      field_model_placeholder: 'Type or click Query to discover models...',
      model_select_default: '▾ Choose detected model...',
      model_select_count: '▾ Choose detected model ({count})...',
      field_theme: 'Visual Interface Theme',
      field_theme_hint: 'Select the display appearance mode.',
      theme_light: '☀️ Light Mode',
      theme_dark: '🌙 Dark Mode',
      agent_intro: 'Configure agentic tools and temporal context passed to the model.',
      agent_search_title: '🔍 Real-time DuckDuckGo Search',
      agent_search_desc: 'Allows the model to call search_web to search for up-to-date information, definitions, news, and links using the DuckDuckGo API.',
      agent_js_title: '⚡ Local JavaScript Execution (Sandbox)',
      agent_js_desc: 'Allows the model to call execute_javascript to compute, process data, or validate algorithms safely in the browser.',
      agent_web_title: '🌐 Web Browsing & PDF Document Downloads',
      agent_web_desc: 'Allows the model to call fetch_web_page to retrieve public web pages and download_pdf to download and extract PDF documents in real-time.',
      agent_chart_title: '📊 Data Visualization & Native SVG Charts',
      agent_chart_desc: 'Allows the model to call render_chart to generate and display interactive bar, line, doughnut or pie charts without external libraries.',
      agent_cache_title: '⚡ Context / Prompt Caching',
      agent_cache_desc: 'Reuses context cache (KV Cache / Prompt Caching) on compatible servers (OpenAI, Claude, OpenRouter, Gemini, LM Studio, vLLM) reducing latency and costs. Automatically invalidated and rebuilt if you delete messages from chat.',
      agent_datetime_title: '🕒 Send Date & Time on Chat Start',
      agent_datetime_desc: 'Automatically inserts the current date and time as the first message of the conversation (with an \'OK\' response) to inform the model once without invalidating the context cache on follow-up requests.',
      datetime_initial_user_msg: 'The current date and time is: {datetime}.',
      agent_raw_logs_title: '📡 Capture Raw Traffic in Logs',
      agent_raw_logs_desc: 'Records all unmodified incoming and outgoing network traffic (HTTP requests, raw SSE chunks, and tool invocations) in the dedicated Raw tab of the logs panel.',
      field_system_prompt: 'System Prompt (Optional)',
      field_system_prompt_hint: 'Custom base instructions guiding the assistant behavior (optional).',
      field_system_prompt_placeholder: 'Enter custom system instructions for the model (optional)...',
      field_temperature: 'Temperature: {val}',
      field_temperature_hint: 'Controls randomness/creativity (0 = deterministic/precise, 1 = creative).',
      cookie_notice: 'All settings are stored locally and persistently (compatible with both <strong>file://</strong> and web servers).',
      btn_reset: 'Reset defaults',
      btn_clear_all_data: '🗑️ Clear all data',
      btn_clear_all_data_title: 'Wipe all cookies, chat sessions and local storage data',
      confirm_clear_all_data: 'Are you sure you want to delete ALL settings, chat history, discovered models and local cookies?\n\nThe application will reload completely fresh from scratch.',
      btn_cancel: 'Cancel',
      btn_save: 'Save Settings',
      btn_close: 'Close',
      modal_btn_close: 'Close',
      modal_close_aria: 'Close modal',

      // Mensajes de estado y errores
      err_no_model_title: 'No model selected:',
      err_no_model_desc: 'Please open <strong>Settings</strong> to enter a model or click <strong>Query</strong> to discover available models on your server ({url}).',
      err_server_connect: 'Error connecting to server:',
      err_server_connect_hint: '💡 Open <strong>Settings</strong> to verify server URL ({url}), model name, and API Key.',
      err_invalid_url: 'Please enter a valid server URL.',
      err_connecting_models: '⏳ Connecting to {url} to fetch models...',
      msg_models_success: '✅ <strong>{count} models detected successfully</strong> at <code>{endpoint}</code>.',
      err_api_connect: '❌ <strong>Error connecting to API:</strong> {err}',
      err_file_process: 'Could not process file {name}: {err}',

      // Markdown & Sandbox
      md_thought_title: '💭 Reasoning process',
      md_thought_reasoning: '💭 Reasoning...',
      md_run_js_title: 'Run in local sandbox (no network or files)',
      md_run_js_btn: 'Run JS',
      md_copy_code_title: 'Copy code',
      md_copy_code_btn: 'Copy',
      md_output_title: 'Output (Console / Return):',
      md_clear_output: 'Clear output',

      // Sidebar & Conversation History
      sidebar_title: 'Conversations',
      btn_sidebar_title: 'Open conversation history',
      btn_chats_history: 'Open history',
      btn_open_history: 'Open history',
      btn_new_chat_sidebar_title: 'Create new conversation',
      btn_close_sidebar_title: 'Close sidebar',
      sidebar_search_placeholder: 'Search history...',
      sidebar_no_chats: 'No saved conversations',
      btn_import_chat: 'Import',
      btn_import_chat_title: 'Import conversation from JSON file',
      btn_export_all: 'Export',
      btn_export_short: 'Export',
      btn_export_chat_title: 'Export conversation (Markdown, JSON, PDF)',
      btn_delete_all_chats: 'Delete all',
      btn_delete_all_chats_title: 'Delete all saved conversations',
      chat_untitled: 'New conversation',
      chat_delete_confirm: 'Are you sure you want to delete this conversation?',
      chat_delete_all_confirm: 'Are you sure you want to delete all saved conversations? This action cannot be undone.',
      chat_imported_success: 'Conversation imported successfully.',

      // Export Modal
      export_modal_title: 'Export Conversation',
      btn_close_export_title: 'Close export modal',
      export_md_title: 'Download Markdown (.md)',
      export_md_desc: 'Clean format with markdown, code and tables readable in any viewer.',
      export_json_title: 'Download Session JSON (.json)',
      export_json_desc: 'Complete structured history with tools, images and metadata to restore.',
      export_pdf_title: 'Print / Save as PDF',
      export_pdf_desc: 'Generates a clean PDF document formatted for reading and reports.',

      // Interactive Charts
      tool_chart_title: '📊 Data Visualization ({type})',

      // Real-world temporal system context
      system_context_prefix: '\n\n[REAL-WORLD TEMPORAL INFORMATION]\n- Current real-world date and time: {datetime}.\n- Current real-world year: {year}.\n- Mandatory temporal context: This is the ACTUAL, REAL-WORLD PRESENT time of the physical world in which this conversation is occurring. It is NOT a hypothetical date, a simulation, or a future date. All events prior to this timestamp are in the past, and the current year is {year}. Always answer and reason taking this date and time as today\'s real-world present.',
      default_system_prompt: ''
    }
  };

  let currentLang = 'es';

  /**
   * Detecta el idioma inicial según la política:
   * 1. Si hay preferencia guardada en storage ('es' o 'en'), usarla.
   * 2. Si no, comprobar el idioma del navegador. Si empieza por 'en', usar 'en'.
   * 3. En caso contrario, usar 'es' por defecto.
   */
  function detectInitialLanguage() {
    try {
      if (Storage.getStorageItem) {
        const saved = Storage.getStorageItem('language');
        if (saved === 'es' || saved === 'en') {
          return saved;
        }
      }
    } catch (e) {}

    try {
      const browserLang = (
        (navigator.languages && navigator.languages.length ? navigator.languages[0] : null) ||
        navigator.language ||
        navigator.userLanguage ||
        ''
      ).toLowerCase();

      if (browserLang.startsWith('en')) {
        return 'en';
      }
    } catch (e) {}

    return 'es';
  }

  function getLanguage() {
    return currentLang;
  }

  function setLanguage(lang, persist = true) {
    const target = (lang === 'en') ? 'en' : 'es';
    currentLang = target;

    if (persist && Storage.setStorageItem) {
      Storage.setStorageItem('language', target);
    }

    if (typeof document !== 'undefined') {
      document.documentElement.lang = target;
      applyTranslations(document);
    }

    return target;
  }

  /**
   * Obtiene la traducción para una clave, interpolando parámetros opcionales {nombre}.
   */
  function t(key, params) {
    const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.es;
    let str = dict[key];
    if (str === undefined) {
      str = TRANSLATIONS.es[key] !== undefined ? TRANSLATIONS.es[key] : key;
    }

    if (params && typeof params === 'object') {
      Object.keys(params).forEach(k => {
        const val = params[k];
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), val !== undefined && val !== null ? val : '');
      });
    }

    return str;
  }

  /**
   * Formatea la fecha y hora actual en el locale correspondiente ('es-ES' o 'en-US').
   */
  function getFormattedDateTime(date = new Date(), lang = currentLang) {
    const locale = (lang === 'en') ? 'en-US' : 'es-ES';
    const options = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    try {
      return date.toLocaleDateString(locale, options);
    } catch (e) {
      return date.toLocaleString();
    }
  }

  /**
   * Aplica las traducciones a todos los elementos del DOM marcados con atributos data-i18n*.
   */
  function applyTranslations(rootElement = document) {
    if (!rootElement || typeof rootElement.querySelectorAll !== 'function') return;

    // 1. data-i18n -> textContent
    rootElement.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        const val = t(key);
        if (val !== key || !el.textContent.trim()) {
          el.textContent = val;
        }
      }
    });

    // 2. data-i18n-html -> innerHTML
    rootElement.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      if (key) {
        const val = t(key);
        if (val !== key || !el.innerHTML.trim()) {
          el.innerHTML = val;
        }
      }
    });

    // 3. data-i18n-title -> title attribute
    rootElement.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (key) {
        const val = t(key);
        if (val !== key || !el.getAttribute('title')) {
          el.setAttribute('title', val);
        }
      }
    });

    // 4. data-i18n-placeholder -> placeholder attribute
    rootElement.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) {
        const val = t(key);
        if (val !== key || !el.getAttribute('placeholder')) {
          el.setAttribute('placeholder', val);
        }
      }
    });

    // 5. data-i18n-aria -> aria-label attribute
    rootElement.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria');
      if (key) {
        const val = t(key);
        if (val !== key || !el.getAttribute('aria-label')) {
          el.setAttribute('aria-label', val);
        }
      }
    });

    // 6. Actualizar título de la página
    if (typeof document !== 'undefined') {
      document.title = t('app_title');
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute('content', t('app_description'));
      }
    }
  }

  function getAvailableLanguages() {
    return [
      { code: 'es', label: 'Español', flag: '🇪🇸' },
      { code: 'en', label: 'English', flag: '🇬🇧' }
    ];
  }

  // Inicialización automática de idioma
  currentLang = detectInitialLanguage();

  return {
    t,
    getLanguage,
    setLanguage,
    detectInitialLanguage,
    getFormattedDateTime,
    applyTranslations,
    getAvailableLanguages,
    TRANSLATIONS
  };
});

