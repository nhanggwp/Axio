import { sessionMeta, sessionMetaSchema, sessionRecordSchema, type SessionMeta, type SessionRecord } from "./model";
let connection: Promise<IDBDatabase> | undefined;
function database() {
  return connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("axio-editor-sessions", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("meta", { keyPath: "id" });
      request.result.createObjectStore("records", { keyPath: "id" });
    };
    request.onerror = () => { connection = undefined; reject(request.error); };
    request.onblocked = () => { connection = undefined; reject(new Error("Hãy đóng tab Axio cũ rồi thử mở bộ nhớ phiên lại.")); };
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); connection = undefined; };
      resolve(request.result);
    };
  });
}
export async function listSessions(): Promise<SessionMeta[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("meta").objectStore("meta").getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result.map((item) => sessionMetaSchema.parse(item)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  });
}
export async function readSession(id: string): Promise<SessionRecord> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("records").objectStore("records").get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const parsed = sessionRecordSchema.safeParse(request.result);
      if (!parsed.success) reject(new Error("Phiên không còn tồn tại hoặc dữ liệu phiên không hợp lệ."));
      else resolve(parsed.data);
    };
  });
}
export async function writeSession(record: SessionRecord, expected: number, remove?: SessionMeta): Promise<SessionRecord> {
  const db = await database();
  const next = sessionRecordSchema.parse({ ...record, version: expected + 1 });
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["meta", "records"], "readwrite");
    const meta = tx.objectStore("meta"), records = tx.objectStore("records");
    let conflict: Error | undefined;
    const fail = () => { conflict = new Error("Phiên đã thay đổi ở tab khác. Hãy nhân bản phiên để giữ các thay đổi hiện tại."); tx.abort(); };
    const put = () => {
      try { meta.put(sessionMeta(next)); records.put(next); if (remove) { meta.delete(remove.id); records.delete(remove.id); } }
      catch (error) { conflict = error instanceof Error ? error : new Error("Không thể lưu phiên."); tx.abort(); }
    };
    const get = meta.get(next.id);
    get.onsuccess = () => {
      if ((get.result?.version ?? 0) !== expected || (!get.result && expected !== 0)) return fail();
      if (!remove) { put(); return; }
      const old = meta.get(remove.id);
      old.onsuccess = () => { if (old.result?.version !== remove.version) fail(); else put(); };
    };
    tx.oncomplete = () => resolve(next);
    tx.onabort = () => reject(conflict ?? tx.error ?? new Error("Không thể lưu phiên vào trình duyệt."));
    tx.onerror = () => {};
  });
}
export async function deleteSession(meta: SessionMeta) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["meta", "records"], "readwrite");
    let conflict = false;
    const get = tx.objectStore("meta").get(meta.id);
    get.onsuccess = () => {
      if (get.result?.version !== meta.version) { conflict = true; tx.abort(); return; }
      tx.objectStore("meta").delete(meta.id); tx.objectStore("records").delete(meta.id);
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(new Error(conflict ? "Phiên đã thay đổi ở tab khác. Hãy mở lại danh sách phiên." : "Không thể xóa phiên."));
    tx.onerror = () => {};
  });
}
