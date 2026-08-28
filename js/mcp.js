/**
 * Módulo de Integración MCP (Model Context Protocol) para ChatCLI.
 *
 * ==============================================================================================
 * DOCUMENTACIÓN DE SEGURIDAD Y LIMITACIONES DEL NAVEGADOR PARA MCP
 * ==============================================================================================
 * 1. Transporte en Entornos de Navegador vs Escritorio:
 *    - El protocolo MCP estándar soporta dos transportes principales: stdio (procesos CLI del SO)
 *      y HTTP con Server-Sent Events (SSE) o JSON-RPC 2.0 sobre POST.
 *    - En un entorno puramente cliente web en el navegador (ejecutado vía file:// o servido por HTTP),
 *      el sandbox de seguridad del navegador prohíbe terminantemente la creación directa de subprocesos
 *      locales (child_process / stdio).
 *    - Por tanto, ChatCLI implementa el transporte nativo HTTP JSON-RPC 2.0 / SSE / REST para conectarse
 *      a servidores MCP remotos o locales (ej. http://localhost:8000/sse o endpoints de herramientas).
 *      Los servidores que solo admiten stdio pueden exponerse al navegador utilizando un bridge/proxy SSE.
 *
 * 2. Aislamiento de Credenciales y Seguridad:
 *    - Las cabeceras y tokens de autenticación de cada servidor MCP se gestionan exclusivamente en
 *      el cliente HTTP y NUNCA se inyectan en el prompt del sistema ni son accesibles para el sandbox
 *      de ejecución de JavaScript.
 *    - Cada herramienta MCP indica explícitamente el servidor de procedencia para mantener la
 *      trazabilidad de ejecución en todo momento.
 *    - Se aplica control estricto de timeout (AbortController) y truncado de respuestas para evitar
 *      ataques de denegación de servicio o desbordamiento de contexto.
 * ==============================================================================================
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatMCP = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_TIMEOUT_MS = 15000;
  const MAX_OUTPUT_LENGTH = 60000;

  function getAgentCore() {
    if (typeof window !== 'undefined' && window.ChatAgentCore) return window.ChatAgentCore;
    if (typeof require !== 'undefined') {
      try { return require('./agent-core.js'); } catch (e) {}
    }
    return null;
  }

  function getStorage() {
    if (typeof window !== 'undefined' && window.ChatStorage) return window.ChatStorage;
    if (typeof require !== 'undefined') {
      try { return require('./cookies.js'); } catch (e) {}
    }
    return null;
  }

  /**
   * Realiza una petición fetch con timeout controlado mediante AbortController.
   */
  async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const response = await fetch(url, {
        ...options,
        signal: options.signal || (controller ? controller.signal : undefined)
      });
      if (timer) clearTimeout(timer);
      return response;
    } catch (err) {
      if (timer) clearTimeout(timer);
      throw err;
    }
  }

  /**
   * Cliente de Protocolo MCP (Model Context Protocol) basado en JSON-RPC 2.0 sobre HTTP.
   */
  class McpClient {
    constructor(config = {}) {
      this.id = config.id || `mcp_server_${Date.now()}`;
      this.name = config.name || 'MCP Server';
      this.url = (config.url || '').trim().replace(/\/+$/, '');
      this.headers = config.headers || {};
      this.timeoutMs = config.timeoutMs || DEFAULT_TIMEOUT_MS;
      this.requestId = 1;
      this.serverCapabilities = null;
      this.serverInfo = null;
    }

    /**
     * Construye las cabeceras HTTP necesarias, incluyendo autenticación si está configurada.
     */
    buildHeaders() {
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream, */*'
      };
      if (this.headers && typeof this.headers === 'object') {
        Object.assign(headers, this.headers);
      }
      return headers;
    }

    /**
     * Despacha una petición JSON-RPC 2.0 al endpoint del servidor MCP.
     */
    async request(method, params = {}, options = {}) {
      if (!this.url) {
        throw new Error(`El servidor MCP '${this.name}' no tiene una URL configurada.`);
      }

      const id = this.requestId++;
      const payload = {
        jsonrpc: '2.0',
        id: id,
        method: method,
        params: params
      };

      const timeoutMs = options.timeoutMs || this.timeoutMs;
      const res = await fetchWithTimeout(this.url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(payload),
        signal: options.signal
      }, timeoutMs);

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`Servidor MCP respondió con HTTP ${res.status}: ${errorText.slice(0, 200)}`);
      }

      const data = await res.json();
      if (data.error) {
        const code = data.error.code ? ` (${data.error.code})` : '';
        throw new Error(`Error MCP${code}: ${data.error.message || JSON.stringify(data.error)}`);
      }

      return data.result;
    }

    /**
     * Negocia el protocolo e inicializa la sesión MCP (initialize).
     */
    async initialize(options = {}) {
      try {
        const result = await this.request('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {
            roots: { listChanged: false },
            sampling: {}
          },
          clientInfo: {
            name: 'ChatCLI',
            version: '1.0.0'
          }
        }, options);

        this.serverCapabilities = result?.capabilities || {};
        this.serverInfo = result?.serverInfo || { name: this.name, version: 'unknown' };

        // Enviar notificación de inicialización completada si el servidor lo soporta
        try {
          await this.notify('notifications/initialized', {});
        } catch (e) {}

        return {
          success: true,
          serverInfo: this.serverInfo,
          capabilities: this.serverCapabilities
        };
      } catch (err) {
        // Fallback tolerante: algunos servidores JSON-RPC no requieren initialize estricto
        return {
          success: false,
          error: err.message
        };
      }
    }

    /**
     * Envía una notificación JSON-RPC (sin esperar resultado).
     */
    async notify(method, params = {}) {
      if (!this.url) return;
      const payload = {
        jsonrpc: '2.0',
        method: method,
        params: params
      };
      try {
        await fetch(this.url, {
          method: 'POST',
          headers: this.buildHeaders(),
          body: JSON.stringify(payload)
        });
      } catch (e) {}
    }

    /**
     * Descubre las herramientas disponibles en el servidor MCP (tools/list).
     */
    async listTools(options = {}) {
      const result = await this.request('tools/list', {}, options);
      const tools = result?.tools || [];
      return Array.isArray(tools) ? tools : [];
    }

    /**
     * Invoca una herramienta en el servidor MCP (tools/call).
     */
    async callTool(name, args = {}, options = {}) {
      const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

      const result = await this.request('tools/call', {
        name: name,
        arguments: args
      }, options);

      const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const elapsed = parseFloat((endTime - startTime).toFixed(2));

      // Extraer y procesar contenido retornado por MCP
      let textOutput = '';
      let isError = result?.isError === true;
      const contentList = result?.content || [];

      if (Array.isArray(contentList)) {
        textOutput = contentList.map(item => {
          if (item.type === 'text') return item.text || '';
          if (item.type === 'image') return `[Imagen embebida: ${item.mimeType || 'image/png'}]`;
          if (item.type === 'resource') return `[Recurso: ${item.resource?.uri || 'URI'}]\n${item.resource?.text || ''}`;
          return JSON.stringify(item);
        }).join('\n\n').trim();
      } else if (typeof result === 'string') {
        textOutput = result;
      } else if (result) {
        textOutput = JSON.stringify(result, null, 2);
      }

      if (textOutput.length > MAX_OUTPUT_LENGTH) {
        textOutput = textOutput.slice(0, MAX_OUTPUT_LENGTH) + '\n\n[... Contenido MCP truncado por límite de tamaño ...]';
      }

      return {
        success: !isError,
        isError: isError,
        content: textOutput,
        rawResult: result,
        executionTimeMs: elapsed
      };
    }
  }

  /**
   * Proveedor de herramientas MCP integrado en la arquitectura AgentCore (McpToolProvider).
   */
  class McpToolProvider {
    constructor(client, options = {}) {
      const AgentCore = getAgentCore();
      this.client = client;
      this.id = options.id || client.id || `mcp_${Date.now()}`;
      this.name = options.name || client.name || 'MCP Tool Provider';
      this.serverName = client.name || 'MCP Server';
      this.serverUrl = client.url || '';
      this.cachedTools = [];
    }

    /**
     * Descubre las herramientas remotas del servidor MCP y las transforma en instancias Tool.
     */
    async discoverTools(options = {}) {
      const AgentCore = getAgentCore();
      if (!AgentCore || !AgentCore.Tool) {
        throw new Error('Módulo ChatAgentCore no disponible.');
      }

      // Inicializar sesión
      await this.client.initialize(options);

      // Listar herramientas
      const rawTools = await this.client.listTools(options);
      const toolInstances = [];

      for (const rt of rawTools) {
        if (!rt.name) continue;

        // Nombre canónico con prefijo seguro para evitar colisiones entre múltiples servidores
        const safeServerId = this.client.id.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
        const namespacedName = `mcp__${safeServerId}__${rt.name}`;

        const tool = new AgentCore.Tool({
          name: namespacedName,
          description: rt.description ? `[MCP: ${this.serverName}] ${rt.description}` : `[MCP: ${this.serverName}] Herramienta ${rt.name}`,
          parameters: rt.inputSchema || { type: 'object', properties: {} },
          aliases: [rt.name, `mcp_${rt.name}`, `${safeServerId}_${rt.name}`],
          category: 'mcp',
          metadata: {
            icon: '🔌',
            label: rt.name,
            mcpServerName: this.serverName,
            mcpServerUrl: this.serverUrl,
            originalName: rt.name,
            mcpServerId: this.client.id
          },
          handler: async (args, context = {}) => {
            return this.client.callTool(rt.name, args, {
              signal: context.signal,
              timeoutMs: options.timeoutMs
            });
          },
          formatter: (args, result) => {
            const output = result.content || (result.rawResult ? JSON.stringify(result.rawResult, null, 2) : 'Sin salida');
            return `> 🔌 **MCP: ${rt.name}** (*${this.serverName}*)\n> \`\`\`json\n> ${JSON.stringify(args, null, 2).split('\n').join('\n> ')}\n> \`\`\`\n> \`\`\`\n> ${String(output).split('\n').join('\n> ')}\n> \`\`\``;
          }
        });

        toolInstances.push(tool);
      }

      this.cachedTools = toolInstances;
      return toolInstances;
    }

    /**
     * Devuelve las herramientas descubiertas registradas en este proveedor.
     */
    getTools() {
      return this.cachedTools;
    }
  }

  /**
   * Administrador de Servidores MCP y sincronización con ToolRegistry (McpManager).
   */
  class McpManager {
    constructor() {
      this.servers = [];
      this.clients = new Map();
      this.providers = new Map();
      this.storageKey = 'chat_mcp_servers';
      this.loadConfig();
    }

    /**
     * Carga la lista de servidores MCP configurados desde el almacenamiento local.
     */
    loadConfig() {
      try {
        const Storage = getStorage();
        let raw = null;
        if (Storage && Storage.getStorageItem) {
          raw = Storage.getStorageItem(this.storageKey);
        } else if (typeof localStorage !== 'undefined') {
          raw = localStorage.getItem(this.storageKey);
        }

        if (raw) {
          this.servers = JSON.parse(raw);
        } else {
          this.servers = [];
        }
      } catch (e) {
        this.servers = [];
      }
    }

    /**
     * Guarda la configuración de servidores MCP en el almacenamiento local.
     */
    saveConfig() {
      try {
        const Storage = getStorage();
        const serialized = JSON.stringify(this.servers);
        if (Storage && Storage.setStorageItem) {
          Storage.setStorageItem(this.storageKey, serialized);
        } else if (typeof localStorage !== 'undefined') {
          localStorage.setItem(this.storageKey, serialized);
        }
      } catch (e) {}
    }

    /**
     * Obtiene la lista de servidores configurados.
     */
    getServers() {
      return [...this.servers];
    }

    /**
     * Añade o actualiza un servidor MCP.
     */
    addServer(serverConfig) {
      if (!serverConfig || !serverConfig.url) {
        throw new Error('La URL del servidor MCP es obligatoria.');
      }

      const id = serverConfig.id || `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const existingIdx = this.servers.findIndex(s => s.id === id);

      const serverData = {
        id: id,
        name: serverConfig.name || 'Servidor MCP',
        url: serverConfig.url.trim(),
        headers: serverConfig.headers || {},
        enabled: serverConfig.enabled !== false,
        lastConnected: null,
        toolCount: 0
      };

      if (existingIdx !== -1) {
        this.servers[existingIdx] = serverData;
      } else {
        this.servers.push(serverData);
      }

      this.saveConfig();
      return serverData;
    }

    /**
     * Elimina un servidor MCP configurado.
     */
    removeServer(id) {
      this.servers = this.servers.filter(s => s.id !== id);
      this.clients.delete(id);
      this.providers.delete(id);
      this.saveConfig();
    }

    /**
     * Obtiene o crea una instancia de McpClient para un servidor.
     */
    getClient(serverId) {
      if (this.clients.has(serverId)) {
        return this.clients.get(serverId);
      }

      const serverConfig = this.servers.find(s => s.id === serverId);
      if (!serverConfig) return null;

      const client = new McpClient(serverConfig);
      this.clients.set(serverId, client);
      return client;
    }

    /**
     * Descubre y registra las herramientas de un servidor MCP en el ToolRegistry de AgentCore.
     */
    async connectAndRegisterServer(serverId, registry) {
      const AgentCore = getAgentCore();
      const targetRegistry = registry || (AgentCore ? AgentCore.registry : null);
      if (!targetRegistry) return { success: false, error: 'ToolRegistry no disponible' };

      const serverConfig = this.servers.find(s => s.id === serverId);
      if (!serverConfig || !serverConfig.enabled) {
        return { success: false, error: 'Servidor no encontrado o deshabilitado' };
      }

      const client = this.getClient(serverId);
      const provider = new McpToolProvider(client, {
        id: `mcp_prov_${serverId}`,
        name: serverConfig.name
      });

      try {
        const tools = await provider.discoverTools();
        targetRegistry.registerProvider(provider);

        serverConfig.lastConnected = Date.now();
        serverConfig.toolCount = tools.length;
        this.providers.set(serverId, provider);
        this.saveConfig();

        return {
          success: true,
          toolCount: tools.length,
          tools: tools.map(t => ({ name: t.name, description: t.description }))
        };
      } catch (err) {
        return {
          success: false,
          error: err.message
        };
      }
    }

    /**
     * Conecta y sincroniza todos los servidores habilitados con el ToolRegistry.
     */
    async syncAllWithRegistry(registry) {
      const results = [];
      for (const server of this.servers) {
        if (server.enabled) {
          const res = await this.connectAndRegisterServer(server.id, registry);
          results.push({ serverId: server.id, name: server.name, ...res });
        }
      }
      return results;
    }
  }

  const manager = new McpManager();

  return {
    McpClient,
    McpToolProvider,
    McpManager,
    manager
  };
});
