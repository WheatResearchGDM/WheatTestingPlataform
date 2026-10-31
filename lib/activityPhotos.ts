type StoredPhoto = { id: string; activityId: number; name: string; blob: Blob };
let database: Promise<IDBDatabase> | undefined;

function openDatabase() {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('field-wheat-photos-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('photos', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(new Error('Não foi possível abrir o armazenamento de fotos.')); };
  });
  return database;
}

async function resizePhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) throw new Error('Escolha imagens de até 20 MB por foto.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar a foto.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Não foi possível preparar a foto.')), 'image/jpeg', .82));
  } catch { throw new Error('Não foi possível ler uma das imagens. Tente uma foto em JPG ou PNG.'); }
  finally { URL.revokeObjectURL(url); }
}

export async function saveActivityPhotos(activityId: number, files: File[]) {
  if (!files.length) return [];
  if (files.length > 8) throw new Error('Anexe no máximo 8 fotos por registro.');
  // Process sequentially to keep memory use low on phones.
  const photos: StoredPhoto[] = [];
  for (let index = 0; index < files.length; index++) photos.push({
    id: `${activityId}-${index}`, activityId, name: files[index].name.replace(/\.[^.]+$/, '') + '.jpg', blob: await resizePhoto(files[index]),
  });
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('photos', 'readwrite');
    photos.forEach((photo) => transaction.objectStore('photos').put(photo));
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(new Error('Sem espaço para salvar as fotos neste aparelho. Libere espaço e tente novamente.'));
  });
  return photos.map((photo) => photo.id);
}

export async function readActivityPhotos(ids: string[]) {
  if (!ids.length) return [];
  const db = await openDatabase();
  return new Promise<StoredPhoto[]>((resolve, reject) => {
    const transaction = db.transaction('photos', 'readonly');
    const photos: StoredPhoto[] = [];
    ids.forEach((id) => {
      const request = transaction.objectStore('photos').get(id);
      request.onsuccess = () => { if (request.result) photos.push(request.result as StoredPhoto); };
    });
    transaction.oncomplete = () => resolve(photos);
    transaction.onerror = () => reject(new Error('Não foi possível recuperar as fotos neste aparelho.'));
  });
}

export async function deleteActivityPhotos(ids: string[]) {
  if (!ids.length) return;
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('photos', 'readwrite');
    ids.forEach((id) => transaction.objectStore('photos').delete(id));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
