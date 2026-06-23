const DB_NAME = 'audit-image-lib';
const DB_VERSION = 2;
const STORE_NAME = 'images';

class ImageLibrary {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (e.oldVersion < 1) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('addedAt', 'addedAt', { unique: false });
        }
        if (e.oldVersion >= 1 && e.oldVersion < 2) {
          const tx = e.target.transaction;
          const store = tx.objectStore(STORE_NAME);
          if (!store.indexNames.contains('libType')) {
            store.createIndex('libType', 'libType', { unique: false });
          }
          store.openCursor().onsuccess = (ev) => {
            const cursor = ev.target.result;
            if (cursor) {
              const record = cursor.value;
              if (!record.libType) {
                record.libType = 'unclassified';
                cursor.update(record);
              }
              cursor.continue();
            }
          };
        }
      };
      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async addImage(file, libType = 'unclassified') {
    const id = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const base64 = await this._fileToBase64(file);
    const pHash = await this._computePHash(base64);
    const record = {
      id,
      name: file.name,
      base64,
      pHash,
      libType,
      addedAt: Date.now()
    };
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.add(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteImage(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getAllImages() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getCount() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getImagesByType(type) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('libType');
      const request = index.getAll(type);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ── helpers ──────────────────────────────────────────────

  _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  _computePHash(base64) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const hash = this._pHashFromImage(img);
        resolve(hash);
      };
      img.src = base64;
    });
  }

  _pHashFromImage(img) {
    const size = 8;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    const imageData = ctx.getImageData(0, 0, size, size);
    const pixels = [];
    for (let i = 0; i < imageData.data.length; i += 4) {
      const gray = 0.299 * imageData.data[i] + 0.587 * imageData.data[i + 1] + 0.114 * imageData.data[i + 2];
      pixels.push(gray);
    }
    const mean = pixels.reduce((a, b) => a + b, 0) / pixels.length;
    let hash = '';
    for (const p of pixels) {
      hash += p >= mean ? '1' : '0';
    }
    return hash;
  }

  hammingDistance(hash1, hash2) {
    if (hash1.length !== hash2.length) return Infinity;
    let dist = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) dist++;
    }
    return dist;
  }
}

window.ImageLibrary = ImageLibrary;
