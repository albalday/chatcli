/**
 * ZeroChat Local File System Module (ChatFileSystem)
 * 
 * Capa nativa para el acceso y persistencia en el sistema de archivos local
 * del usuario mediante la File System Access API estándar (window.showDirectoryPicker).
 *
 * Características:
 * - Persistencia del handle de la carpeta raíz ("zerochat") en IndexedDB para minimizar peticiones de permiso.
 * - Comprobación no intrusiva de permisos (queryPermission vs requestPermission con interacción de usuario).
 * - Creación recursiva de directorios y navegación jerárquica por rutas relativas.
 * - Lectura y escritura atómica de ficheros completos (Texto, JSON, Binario / ArrayBuffer, Uint8Array, Blob).
 * - Listado de directorios con metadatos (tamaño, fecha de modificación, tipo).
 * - Eliminación segura de ficheros y directorios recursivos.
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
  // Implementación de ChatFileSystem
  // ==========================================================================

  class ChatFileSystemImpl {
    constructor() {
      this._rootHandle = null;
      this._opfsRootHandle = null;
    }

    isSupported() {
      if (typeof window === "undefined") return true; // Para entornos de test en Node.js
      return (
        typeof window.showDirectoryPicker === "function" ||
        this.isOpfsSupported()
      );
    }

    isOpfsSupported() {
      return (
        typeof navigator !== "undefined" &&
        !!navigator.storage &&
        typeof navigator.storage.getDirectory === "function"
      );
    }

    isFirefoxOrOpfsOnly() {
      if (typeof window === "undefined") return false;
      const isPickerSupported = typeof window.showDirectoryPicker === "function";
      return !isPickerSupported && this.isOpfsSupported();
    }

    getStorageMode() {
      if (this.isFirefoxOrOpfsOnly()) return "opfs";
      if (typeof window !== "undefined" && typeof window.showDirectoryPicker === "function") return "native";
      return "none";
    }

    async getOpfsRoot() {
      if (this._opfsRootHandle) return this._opfsRootHandle;
      if (!this.isOpfsSupported()) return null;
      try {
        const opfs = await navigator.storage.getDirectory();
        // Directorio raíz siempre fijo 'zerochat'
        const zerochatDir = await opfs.getDirectoryHandle("zerochat", { create: true });
        this._opfsRootHandle = zerochatDir;
        return zerochatDir;
      } catch (err) {
        console.warn("[ChatFileSystem] Error al inicializar directorio OPFS:", err);
        return null;
      }
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
      if (this.isFirefoxOrOpfsOnly()) {
        const opfsRoot = await this.getOpfsRoot();
        if (opfsRoot) {
          this._rootHandle = opfsRoot;
          return { success: true, mode: "opfs", name: "zerochat", handle: opfsRoot };
        }
      }

      if (typeof window !== "undefined" && typeof window.showDirectoryPicker === "function") {
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

      throw new FileSystemError("El acceso al sistema de archivos no está disponible en este navegador.", "NOT_SUPPORTED");
    }

    async getRootDirectory(requestIfPrompt = false) {
      if (this._rootHandle) {
        const ok = await this.verifyPermission(this._rootHandle, true, requestIfPrompt);
        if (ok) return this._rootHandle;
      }

      if (this.isFirefoxOrOpfsOnly()) {
        const opfsRoot = await this.getOpfsRoot();
        if (opfsRoot) {
          this._rootHandle = opfsRoot;
          return opfsRoot;
        }
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

    async setRootDirectoryHandle(handle) {
      this._rootHandle = handle;
      if (handle) {
        await HandleStorage.saveHandle(ROOT_HANDLE_KEY, handle);
      }
      return true;
    }

    async disconnectRootDirectory() {
      this._rootHandle = null;
      this._opfsRootHandle = null;
      await HandleStorage.removeHandle(ROOT_HANDLE_KEY);
      return true;
    }

    async isConfigured() {
      if (this.isFirefoxOrOpfsOnly()) {
        return true;
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

      await this._getNativeDirHandle(root, normalized, true);
      return true;
    }

    async writeFile(pathStr, data, options = {}) {
      const normalized = this.normalizePath(pathStr);
      if (!normalized) throw new FileSystemError("Ruta de archivo no válida.", "INVALID_PATH");

      const root = await this.getRootDirectory(true);
      if (!root) throw new PermissionDeniedError();

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

  return instance;
});
