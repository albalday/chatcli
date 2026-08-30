/**
 * Mock para pruebas unitarias de FileSystemDirectoryHandle conforme a la especificación W3C
 */

function createMockDirectoryHandle(name = "zerochat") {
  const directories = new Map(); // name -> mockDir
  const files = new Map(); // name -> { content: Uint8Array|string, size: number, lastModified: number }

  const dirHandle = {
    name: name,
    kind: "directory",

    async queryPermission() {
      return "granted";
    },

    async requestPermission() {
      return "granted";
    },

    async getDirectoryHandle(dirName, options = {}) {
      if (directories.has(dirName)) {
        return directories.get(dirName);
      }
      if (options.create) {
        const subDir = createMockDirectoryHandle(dirName);
        directories.set(dirName, subDir);
        return subDir;
      }
      const err = new Error(`Directory "${dirName}" not found`);
      err.name = "NotFoundError";
      throw err;
    },

    async getFileHandle(fileName, options = {}) {
      if (files.has(fileName)) {
        const fileEntry = files.get(fileName);
        return createMockFileHandle(fileName, fileEntry);
      }
      if (options.create) {
        const fileEntry = { content: new Uint8Array(0), size: 0, lastModified: Date.now() };
        files.set(fileName, fileEntry);
        return createMockFileHandle(fileName, fileEntry);
      }
      const err = new Error(`File "${fileName}" not found`);
      err.name = "NotFoundError";
      throw err;
    },

    async removeEntry(entryName, options = {}) {
      if (files.has(entryName)) {
        files.delete(entryName);
        return;
      }
      if (directories.has(entryName)) {
        directories.delete(entryName);
        return;
      }
      const err = new Error(`Entry "${entryName}" not found`);
      err.name = "NotFoundError";
      throw err;
    },

    async *values() {
      for (const [dName, dHandle] of directories.entries()) {
        yield dHandle;
      }
      for (const [fName, fEntry] of files.entries()) {
        yield createMockFileHandle(fName, fEntry);
      }
    }
  };

  return dirHandle;
}

function createMockFileHandle(name, fileEntry) {
  return {
    name: name,
    kind: "file",

    async getFile() {
      const u8 = typeof fileEntry.content === "string" ? new TextEncoder().encode(fileEntry.content) : fileEntry.content;
      return {
        name: name,
        size: fileEntry.size,
        lastModified: fileEntry.lastModified,
        type: "application/octet-stream",
        async text() {
          return typeof fileEntry.content === "string" ? fileEntry.content : new TextDecoder().decode(fileEntry.content);
        },
        async arrayBuffer() {
          return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
        }
      };
    },

    async createWritable() {
      let chunks = [];
      return {
        async write(data) {
          if (typeof data === "string") {
            const u8 = new TextEncoder().encode(data);
            chunks.push(u8);
            fileEntry.content = data;
            fileEntry.size = u8.byteLength;
          } else if (data instanceof Uint8Array) {
            chunks.push(data);
            fileEntry.content = data;
            fileEntry.size = data.byteLength;
          } else if (data instanceof ArrayBuffer) {
            const u8 = new Uint8Array(data);
            chunks.push(u8);
            fileEntry.content = u8;
            fileEntry.size = u8.byteLength;
          } else {
            const str = String(data);
            const u8 = new TextEncoder().encode(str);
            fileEntry.content = str;
            fileEntry.size = u8.byteLength;
          }
          fileEntry.lastModified = Date.now();
        },
        async close() {
          return true;
        },
        async abort() {
          return true;
        }
      };
    }
  };
}

module.exports = { createMockDirectoryHandle };
