import { Injectable } from '@angular/core';

const DB_NAME = 'design_consult_media_db';
const STORE = 'media';

@Injectable({
  providedIn: 'root',
})
export class MediaStorageService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  async saveBlob(id: string, blob: Blob): Promise<void> {
    const db = await this.open();
    await this.request(db, 'readwrite', (store) => store.put(blob, id));
  }

  async getBlob(id: string): Promise<Blob | null> {
    const db = await this.open();
    const result = await this.request<Blob | undefined>(db, 'readonly', (store) => store.get(id));
    return result ?? null;
  }

  async deleteBlob(id: string): Promise<void> {
    const db = await this.open();
    await this.request(db, 'readwrite', (store) => store.delete(id));
  }

  private open(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB is not available'));
    }
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Failed to open media database'));
      });
    }
    return this.dbPromise;
  }

  private request<T>(
    db: IDBDatabase,
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Media database request failed'));
    });
  }
}
