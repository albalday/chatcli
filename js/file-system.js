/**
 * ZeroChat Local File System Module (ChatFileSystem)
 * 
 * Capa de abstracción para el acceso y persistencia en el sistema de archivos local
 * del usuario mediante la File System Access API estándar del navegador (window.showDirectoryPicker).
 *
 * Características principales:
 * - Persistencia del handle de la carpeta raíz ("zerochat") en IndexedDB para minimizar peticiones de permiso.
 * - Comprobación no intrusiva de permisos (queryPermission vs requestPermission solo con gesto de usuario).
 * - Creación recursiva de directorios y navegación jerárquica por rutas relativas.
 * - Lectura y escritura atómica de ficheros completos (Texto, JSON, Binario / ArrayBuffer, Uint8Array, Blob).
 * - Listado de directorios con metadatos (tamaño, fecha de modificación, tipo).
 * - Eliminación segura de ficheros y directorios recursivos.
 * - Motor de fallback en memoria virtual (MemoryFileSystem) transparente para tests unitarios y Node.js.
 */

(function (root, factory) {
  if (typeof exports === "object" && typeof module !== "undefined") {
    module.exports = factory();
  } else {
    root.ChatFileSystem = factory();
    root.LocalFS = root.ChatFileSystem; // Alias corto
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DB_NAME = "ZeroChat_FS_DB";
  const DB_VERSION = 1;
  const STORE_HANDLES = "handles";
  const ROOT_HANDLE_KEY = "zerochat_root_dir";

  // ==========================================================================
  // Clases de Error Personalizadas
  // ==========================================================================

  class FileSystemError extends Error {
    constructor(message, code = "FS_ERROR", details = {}) {
      super(message);
      this.name = "FileSystemError";
      this.code = code;
      this.details = details;
    }
  }

  class PermissionDeniedError extends FileSystemError {
    constructor(message = "Permiso denegado para acceder al sistema de archivos local.") {
      super(message, "PERMISSION_DENIED");
      this.name = "PermissionDeniedError";
    }
  }

  class NotFoundError extends FileSystemError {
    constructor(path, message = null) {
      super(message || `El archivo o directorio no existe: "${path}"`, "NOT_FOUND", { path });
      this.name = "NotFoundError";
    }
  }

  // ==========================================================================
  // Almacenamiento de Handles en IndexedDB
  // ==========================================================================

  class HandleStorage {
    static async openDB() {
      if (typeof indexedDB === "undefined") return null;
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_HANDLES)) {
            db.createObjectStore(STORE_HANDLES);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    static async saveHandle(key, handle) {
      const db = await this.openDB();
      if (!db) return false;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_HANDLES, "readwrite");
        const store = tx.objectStore(STORE_HANDLES);
        const req = store.put(handle, key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    }

    static async getHandle(key) {
      const db = await this.openDB();
      if (!db) return null;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_HANDLES, "readonly");
        const store = tx.objectStore(STORE_HANDLES);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    }

    static async removeHandle(key) {
      const db = await this.openDB();
      if (!db) return false;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_HANDLES, "readwrite");
        const store = tx.objectStore(STORE_HANDLES);
        const req = store.delete(key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    }
  }

  // ==========================================================================
  // Motor Virtual en Memoria (Fallback para Node.js y Entornos sin API Nativa)
  // ==========================================================================

  class MemoryFileSystemBackend {
    constructor() {
      this.rootName = "zerochat";
      this.files = new Map(); // path -> { content: Uint8Array|string, size: number, lastModified: number }
      this.directories = new Set([""]); // Set de rutas de directorios normalizadas
      this.hasGrantedPermission = true;
    }

    async verifyPermission() {
      return this.hasGrantedPermission;
    }

    async createDirectory(normalizedPath) {
      if (!normalizedPath) return true;
      const parts = normalizedPath.split("/");
      let current = "";
      for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        this.directories.add(current);
      }
      return true;
    }

    async writeFile(normalizedPath, data) {
      const parent = ChatFileSystemImpl.getParentPath(normalizedPath);
      if (parent) {
        await this.createDirectory(parent);
      }

      let contentBuffer;
      let size = 0;

      if (typeof data === "string") {
        contentBuffer = data;
        size = new TextEncoder().encode(data).length;
      } else if (data instanceof Uint8Array) {
        contentBuffer = data;
        size = data.byteLength;
      } else if (data instanceof ArrayBuffer) {
        contentBuffer = new Uint8Array(data);
        size = data.byteLength;
      } else if (typeof Blob !== "undefined" && data instanceof Blob) {
        const buf = await data.arrayBuffer();
        contentBuffer = new Uint8Array(buf);
        size = buf.byteLength;
      } else if (typeof data === "object" && data !== null) {
        const jsonStr = JSON.stringify(data, null, 2);
        contentBuffer = jsonStr;
        size = new TextEncoder().encode(jsonStr).length;
      } else {
        const str = String(data);
        contentBuffer = str;
        size = new TextEncoder().encode(str).length;
      }

      const now = Date.now();
      this.files.set(normalizedPath, {
        content: contentBuffer,
        size: size,
        lastModified: now
      });

      return { path: normalizedPath, size, lastModified: now, success: true };
    }

    async readFile(normalizedPath, format = "text") {
      const entry = this.files.get(normalizedPath);
      if (!entry) {
        throw new NotFoundError(normalizedPath);
      }

      const raw = entry.content;
      if (format === "json") {
        const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
        return JSON.parse(text);
      }
      if (format === "text") {
        return typeof raw === "string" ? raw : new TextDecoder().decode(raw);
      }
      if (format === "uint8Array") {
        return typeof raw === "string" ? new TextEncoder().encode(raw) : raw;
      }
      if (format === "arrayBuffer") {
        const u8 = typeof raw === "string" ? new TextEncoder().encode(raw) : raw;
        return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
      }
      if (format === "blob") {
        const u8 = typeof raw === "string" ? new TextEncoder().encode(raw) : raw;
        return new Blob([u8]);
      }

      return raw;
    }

    async deleteFile(normalizedPath) {
      if (!this.files.has(normalizedPath)) {
        throw new NotFoundError(normalizedPath);
      }
      this.files.delete(normalizedPath);
      return true;
    }

    async deleteDirectory(normalizedPath, recursive = true) {
      if (!this.directories.has(normalizedPath)) {
        throw new NotFoundError(normalizedPath);
      }

      const prefix = `${normalizedPath}/`;
      if (!recursive) {
        for (const f of this.files.keys()) {
          if (f.startsWith(prefix)) throw new FileSystemError(`El directorio no está vacío: "${normalizedPath}"`, "DIR_NOT_EMPTY");
        }
        for (const d of this.directories) {
          if (d.startsWith(prefix)) throw new FileSystemError(`El directorio no está vacío: "${normalizedPath}"`, "DIR_NOT_EMPTY");
        }
      }

      for (const f of Array.from(this.files.keys())) {
        if (f.startsWith(prefix) || f === normalizedPath) this.files.delete(f);
      }
      for (const d of Array.from(this.directories)) {
        if (d.startsWith(prefix) || d === normalizedPath) this.directories.delete(d);
      }
      return true;
    }

    async exists(normalizedPath) {
      if (!normalizedPath) return { exists: true, kind: "directory" };
      if (this.files.has(normalizedPath)) return { exists: true, kind: "file" };
      if (this.directories.has(normalizedPath)) return { exists: true, kind: "directory" };
      return { exists: false, kind: null };
    }

    async listDirectory(normalizedPath = "", recursive = false) {
      const results = [];
      const prefix = normalizedPath ? `${normalizedPath}/` : "";
      const visitedDirs = new Set();

      for (const d of this.directories) {
        if (d === normalizedPath || !d.startsWith(prefix)) continue;
        const rel = d.slice(prefix.length);
        const isDirectChild = !rel.includes("/");
        if (recursive || isDirectChild) {
          const dirPath = isDirectChild ? (normalizedPath ? `${normalizedPath}/${rel}` : rel) : d;
          if (!visitedDirs.has(dirPath)) {
            visitedDirs.add(dirPath);
            results.push({
              name: rel.split("/")[0],
              path: d,
              kind: "directory"
            });
          }
        }
      }

      for (const [fPath, meta] of this.files.entries()) {
        if (!fPath.startsWith(prefix)) continue;
        const rel = fPath.slice(prefix.length);
        const isDirectChild = !rel.includes("/");
        if (recursive || isDirectChild) {
          results.push({
            name: rel.split("/").pop(),
            path: fPath,
            kind: "file",
            size: meta.size,
            lastModified: meta.lastModified
          });
        }
      }

      return results;
    }

    async getFileStats(normalizedPath) {
      const entry = this.files.get(normalizedPath);
      if (!entry) throw new NotFoundError(normalizedPath);
      return {
        name: normalizedPath.split("/").pop(),
        path: normalizedPath,
        kind: "file",
        size: entry.size,
        lastModified: entry.lastModified
      };
    }
  }

  // ==========================================================================
  // Implementación Principal de ChatFileSystem
  // ==========================================================================

  class ChatFileSystemImpl {
    constructor() {
      this._rootHandle = null;
      this._memoryBackend = null;
      this._forceMemoryMode = false;
    }

    isSupported() {
      return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
    }

    useMemoryBackend(enable = true) {
      this._forceMemoryMode = enable;
      if (enable && !this._memoryBackend) {
        this._memoryBackend = new MemoryFileSystemBackend();
      }
      return this;
    }

    normalizePath(pathStr) {
      if (!pathStr || typeof pathStr !== "string") return "";
      const clean = pathStr.replace(/\\/g, "/").trim();
      const segments = clean.split("/").filter(Boolean);
      const stack = [];

      for (const seg of segments) {
        if (seg === ".") continue;
        if (seg === "..") {
          if (stack.length > 0) stack.pop();
        } else {
          stack.push(seg);
        }
      }
      return stack.join("/");
    }

    static getParentPath(normalizedPath) {
      const idx = normalizedPath.lastIndexOf("/");
      return idx > -1 ? normalizedPath.slice(0, idx) : "";
    }

    getParentPath(normalizedPath) {
      return ChatFileSystemImpl.getParentPath(normalizedPath);
    }

    static getBaseName(normalizedPath) {
      const idx = normalizedPath.lastIndexOf("/");
      return idx > -1 ? normalizedPath.slice(idx + 1) : normalizedPath;
    }

    getBaseName(normalizedPath) {
      return ChatFileSystemImpl.getBaseName(normalizedPath);
    }

    async verifyPermission(handle, readWrite = true, requestIfPrompt = false) {
      if (!handle) return false;
      const opts = { mode: readWrite ? "readwrite" : "read" };

      if (typeof handle.queryPermission === "function") {
        const state = await handle.queryPermission(opts);
        if (state === "granted") return true;

        if (requestIfPrompt && typeof handle.requestPermission === "function") {
          const reqState = await handle.requestPermission(opts);
          return reqState === "granted";
        }
        return false;
      }
      return true;
    }

    async selectRootDirectory(options = {}) {
      if (this._forceMemoryMode || !this.isSupported()) {
        if (!this._memoryBackend) this._memoryBackend = new MemoryFileSystemBackend();
        return { success: true, mode: "memory", name: "zerochat" };
      }

      try {
        const handle = await window.showDirectoryPicker({
          id: "zerochat_root_dir",
          mode: "readwrite",
          startIn: options.startIn || "documents",
          ...options
        });

        this._rootHandle = handle;
        await HandleStorage.saveHandle(ROOT_HANDLE_KEY, handle);
        return { success: true, mode: "native", name: handle.name, handle };
      } catch (err) {
        if (err.name === "AbortError") {
          return { success: false, aborted: true, message: "Selección cancelada por el usuario." };
        }
        throw new FileSystemError(`Error al seleccionar el directorio raíz: ${err.message}`, "PICKER_ERROR", { error: err });
      }
    }

    async getRootDirectory(requestIfPrompt = false) {
      if (this._forceMemoryMode || !this.isSupported()) {
        if (!this._memoryBackend) this._memoryBackend = new MemoryFileSystemBackend();
        return this._memoryBackend;
      }

      if (this._rootHandle) {
        const ok = await this.verifyPermission(this._rootHandle, true, requestIfPrompt);
        if (ok) return this._rootHandle;
      }

      const storedHandle = await HandleStorage.getHandle(ROOT_HANDLE_KEY);
      if (storedHandle) {
        const ok = await this.verifyPermission(storedHandle, true, requestIfPrompt);
        if (ok) {
          this._rootHandle = storedHandle;
          return storedHandle;
        }
      }

      return null;
    }

    async disconnectRootDirectory() {
      this._rootHandle = null;
      await HandleStorage.removeHandle(ROOT_HANDLE_KEY);
      if (this._memoryBackend) {
        this._memoryBackend = new MemoryFileSystemBackend();
      }
      return true;
    }

    async isConfigured() {
      if (this._forceMemoryMode || !this.isSupported()) {
        return !!this._memoryBackend;
      }
      const root = await this.getRootDirectory(false);
      return !!root;
    }

    async _getNativeDirHandle(rootHandle, dirPath, create = false) {
      const parts = dirPath.split("/").filter(Boolean);
      let current = rootHandle;

      for (const part of parts) {
        try {
          current = await current.getDirectoryHandle(part, { create });
        } catch (err) {
          if (err.name === "NotFoundError" || err.name === "TypeMismatchError") {
            throw new NotFoundError(dirPath, `Directorio no encontrado: "${part}" en ruta "${dirPath}"`);
          }
          throw err;
        }
      }
      return current;
    }

    async createDirectory(pathStr) {
      const normalized = this.normalizePath(pathStr);
      if (!normalized) return true;

      const root = await this.getRootDirectory(true);
      if (!root) throw new PermissionDeniedError();

      if (root instanceof MemoryFileSystemBackend || this._forceMemoryMode) {
        return root.createDirectory(normalized);
      }

      await this._getNativeDirHandle(root, normalized, true);
      return true;
    }

    async writeFile(pathStr, data, options = {}) {
      const normalized = this.normalizePath(pathStr);
      if (!normalized) throw new FileSystemError("Ruta de archivo no válida.", "INVALID_PATH");

      const root = await this.getRootDirectory(true);
      if (!root) throw new PermissionDeniedError();

      if (root instanceof MemoryFileSystemBackend || this._forceMemoryMode) {
        return root.writeFile(normalized, data);
      }

      const parentPath = this.getParentPath(normalized);
      const fileName = this.getBaseName(normalized);

      const dirHandle = parentPath ? await this._getNativeDirHandle(root, parentPath, true) : root;
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });

      let contentToWrite = data;
      if (typeof data === "object" && data !== null && !(data instanceof ArrayBuffer) && !(data instanceof Uint8Array) && !(typeof Blob !== "undefined" && data instanceof Blob)) {
        contentToWrite = JSON.stringify(data, null, 2);
      }

      const writable = await fileHandle.createWritable({ keepExistingData: false });
      try {
        await writable.write(contentToWrite);
        await writable.close();
      } catch (err) {
        try { await writable.abort(); } catch (_) {}
        throw err;
      }

      const file = await fileHandle.getFile();
      return {
        path: normalized,
        size: file.size,
        lastModified: file.lastModified,
        success: true
      };
    }

    async readFile(pathStr, options = "text") {
      const format = typeof options === "string" ? options : (options.format || "text");
      const normalized = this.normalizePath(pathStr);
      if (!normalized) throw new FileSystemError("Ruta de archivo no válida.", "INVALID_PATH");

      const root = await this.getRootDirectory(true);
      if (!root) throw new PermissionDeniedError();

      if (root instanceof MemoryFileSystemBackend || this._forceMemoryMode) {
        return root.readFile(normalized, format);
      }

      const parentPath = this.getParentPath(normalized);
      const fileName = this.getBaseName(normalized);

      let dirHandle;
      try {
        dirHandle = parentPath ? await this._getNativeDirHandle(root, parentPath, false) : root;
      } catch (err) {
        if (err instanceof NotFoundError) throw new NotFoundError(normalized);
        throw err;
      }

      let fileHandle;
      try {
        fileHandle = await dirHandle.getFileHandle(fileName);
      } catch (err) {
        if (err.name === "NotFoundError" || err.name === "TypeMismatchError") {
          throw new NotFoundError(normalized);
        }
        throw err;
      }

      const file = await fileHandle.getFile();

      if (format === "json") {
        const text = await file.text();
        return JSON.parse(text);
      }
      if (format === "text") {
        return await file.text();
      }
      if (format === "arrayBuffer") {
        return await file.arrayBuffer();
      }
      if (format === "uint8Array") {
        const ab = await file.arrayBuffer();
        return new Uint8Array(ab);
      }
      if (format === "blob") {
        return file;
      }

      return await file.text();
    }

    async deleteFile(pathStr) {
      const normalized = this.normalizePath(pathStr);
      if (!normalized) throw new FileSystemError("Ruta de archivo no válida.", "INVALID_PATH");

      const root = await this.getRootDirectory(true);
      if (!root) throw new PermissionDeniedError();

      if (root instanceof MemoryFileSystemBackend || this._forceMemoryMode) {
        return root.deleteFile(normalized);
      }

      const parentPath = this.getParentPath(normalized);
      const fileName = this.getBaseName(normalized);

      const dirHandle = parentPath ? await this._getNativeDirHandle(root, parentPath, false) : root;
      try {
        await dirHandle.removeEntry(fileName, { recursive: false });
        return true;
      } catch (err) {
        if (err.name === "NotFoundError") throw new NotFoundError(normalized);
        throw err;
      }
    }

    async deleteDirectory(pathStr, options = { recursive: true }) {
      const recursive = typeof options === "boolean" ? options : (options.recursive !== false);
      const normalized = this.normalizePath(pathStr);
      if (!normalized) throw new FileSystemError("No se puede eliminar la raíz del sistema de archivos.", "CANNOT_DELETE_ROOT");

      const root = await this.getRootDirectory(true);
      if (!root) throw new PermissionDeniedError();

      if (root instanceof MemoryFileSystemBackend || this._forceMemoryMode) {
        return root.deleteDirectory(normalized, recursive);
      }

      const parentPath = this.getParentPath(normalized);
      const dirName = this.getBaseName(normalized);

      const dirHandle = parentPath ? await this._getNativeDirHandle(root, parentPath, false) : root;
      try {
        await dirHandle.removeEntry(dirName, { recursive });
        return true;
      } catch (err) {
        if (err.name === "NotFoundError") throw new NotFoundError(normalized);
        throw err;
      }
    }

    async exists(pathStr) {
      const normalized = this.normalizePath(pathStr);
      const root = await this.getRootDirectory(true);
      if (!root) return { exists: false, kind: null };

      if (root instanceof MemoryFileSystemBackend || this._forceMemoryMode) {
        return root.exists(normalized);
      }

      if (!normalized) return { exists: true, kind: "directory" };

      const parentPath = this.getParentPath(normalized);
      const name = this.getBaseName(normalized);

      try {
        const dirHandle = parentPath ? await this._getNativeDirHandle(root, parentPath, false) : root;
        try {
          await dirHandle.getFileHandle(name);
          return { exists: true, kind: "file" };
        } catch (_) {}

        try {
          await dirHandle.getDirectoryHandle(name);
          return { exists: true, kind: "directory" };
        } catch (_) {}

        return { exists: false, kind: null };
      } catch (_) {
        return { exists: false, kind: null };
      }
    }

    async listDirectory(pathStr = "", options = {}) {
      const recursive = !!options.recursive;
      const normalized = this.normalizePath(pathStr);

      const root = await this.getRootDirectory(true);
      if (!root) throw new PermissionDeniedError();

      if (root instanceof MemoryFileSystemBackend || this._forceMemoryMode) {
        return root.listDirectory(normalized, recursive);
      }

      const targetDir = normalized ? await this._getNativeDirHandle(root, normalized, false) : root;
      const entries = [];

      async function scan(handle, currentRelPath) {
        for await (const entry of handle.values()) {
          const entryRelPath = currentRelPath ? `${currentRelPath}/${entry.name}` : entry.name;
          if (entry.kind === "file") {
            const file = await entry.getFile();
            entries.push({
              name: entry.name,
              path: entryRelPath,
              kind: "file",
              size: file.size,
              lastModified: file.lastModified
            });
          } else if (entry.kind === "directory") {
            entries.push({
              name: entry.name,
              path: entryRelPath,
              kind: "directory"
            });
            if (recursive) {
              await scan(entry, entryRelPath);
            }
          }
        }
      }

      await scan(targetDir, normalized);
      return entries;
    }

    async getFileStats(pathStr) {
      const normalized = this.normalizePath(pathStr);
      if (!normalized) throw new FileSystemError("Ruta de archivo no válida.", "INVALID_PATH");

      const root = await this.getRootDirectory(true);
      if (!root) throw new PermissionDeniedError();

      if (root instanceof MemoryFileSystemBackend || this._forceMemoryMode) {
        return root.getFileStats(normalized);
      }

      const parentPath = this.getParentPath(normalized);
      const fileName = this.getBaseName(normalized);

      const dirHandle = parentPath ? await this._getNativeDirHandle(root, parentPath, false) : root;
      const fileHandle = await dirHandle.getFileHandle(fileName);
      const file = await fileHandle.getFile();

      return {
        name: file.name,
        path: normalized,
        kind: "file",
        size: file.size,
        lastModified: file.lastModified,
        type: file.type || ""
      };
    }
  }

  // Instancia singleton
  const instance = new ChatFileSystemImpl();
  instance.ChatFileSystem = ChatFileSystemImpl;
  instance.FileSystemError = FileSystemError;
  instance.PermissionDeniedError = PermissionDeniedError;
  instance.NotFoundError = NotFoundError;
  instance.MemoryFileSystemBackend = MemoryFileSystemBackend;

  return instance;
});
