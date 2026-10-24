export const MATERIAL_ACCEPT = '.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.gif';
const MAX_SIZE = 10 * 1024 * 1024;

export async function validateMaterialFile(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const starts = (...signature: number[]) => signature.every((value, index) => bytes[index] === value);
  const valid = extension === 'pdf' ? starts(37, 80, 68, 70, 45)
    : extension === 'docx' ? starts(80, 75, 3, 4)
    : extension === 'doc' ? starts(208, 207, 17, 224, 161, 177, 26, 225)
    : extension === 'png' ? starts(137, 80, 78, 71, 13, 10, 26, 10)
    : ['jpg', 'jpeg'].includes(extension ?? '') ? starts(255, 216, 255)
    : extension === 'gif' ? starts(71, 73, 70, 56)
    : extension === 'webp' ? starts(82, 73, 70, 70) && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80
    : false;
  if (!valid) throw new Error('Choose a valid PDF, Word document (.doc or .docx), or PNG, JPG, WebP, or GIF image.');
  if (file.size > MAX_SIZE) throw new Error('Choose a file smaller than 10 MB.');
}

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('classsync-material-files', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('File storage is unavailable in this browser.'));
  });
}

export async function materialFile(id: string, action: 'read' | 'save' | 'delete' = 'read', file?: File): Promise<File | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('files', action === 'read' ? 'readonly' : 'readwrite');
      const store = transaction.objectStore('files');
      const request = action === 'read' ? store.get(id) : action === 'save' ? store.put(file, id) : store.delete(id);
      transaction.oncomplete = () => resolve(action === 'read' ? request.result : undefined);
      transaction.onabort = transaction.onerror = () => reject(new Error('Unable to save or access this file. Check available browser storage.'));
    });
  } finally { db.close(); }
}
