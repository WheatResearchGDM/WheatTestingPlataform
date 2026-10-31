'use client';

import { useEffect, useRef, useState } from 'react';
import { readActivityPhotos } from '../lib/activityPhotos';

export function PhotoCapture() {
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [cameraFiles, setCameraFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<{ name: string; url: string }[]>([]);
  useEffect(() => {
    const form = gallery.current?.form;
    const reset = () => { setGalleryFiles([]); setCameraFiles([]); };
    form?.addEventListener('reset', reset);
    return () => form?.removeEventListener('reset', reset);
  }, []);
  useEffect(() => {
    const images = [...galleryFiles, ...cameraFiles].map((file) => ({ name: file.name, url: URL.createObjectURL(file) }));
    setPreviews(images);
    return () => images.forEach((image) => URL.revokeObjectURL(image.url));
  }, [galleryFiles, cameraFiles]);
  return <section className="record-photo-capture" aria-label="Fotos do registro"><h2>Fotos do campo</h2><p>Opcional · até 8 fotos. As imagens ficam salvas neste navegador, vinculadas ao registro.</p><div className="photo-source-actions"><label><span aria-hidden="true">◎</span> Tirar foto<input ref={camera} name="cameraPhoto" type="file" accept="image/*" capture="environment" onChange={(event) => setCameraFiles(Array.from(event.target.files ?? []))} /></label><label><span aria-hidden="true">▧</span> Escolher da galeria<input ref={gallery} name="photos" type="file" accept="image/*" multiple onChange={(event) => setGalleryFiles(Array.from(event.target.files ?? []))} /></label></div>{previews.length > 0 && <><div className="record-photo-grid">{previews.map((image, index) => <figure key={image.url}><img src={image.url} alt={`Foto selecionada ${index + 1}: ${image.name}`} /><figcaption>{image.name}</figcaption></figure>)}</div><button className="text-button" type="button" onClick={() => { if (gallery.current) gallery.current.value = ''; if (camera.current) camera.current.value = ''; setGalleryFiles([]); setCameraFiles([]); }}>Limpar fotos selecionadas</button></>}</section>;
}

export function ActivityPhotoGallery({ ids }: { ids: string[] }) {
  const [photos, setPhotos] = useState<{ id: string; name: string; url: string }[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    let urls: string[] = [];
    void readActivityPhotos(ids).then((items) => {
      if (disposed) return;
      const images = items.map((item) => ({ id: item.id, name: item.name, url: URL.createObjectURL(item.blob) }));
      urls = images.map((item) => item.url); setPhotos(images);
      if (items.length !== ids.length) setError('Algumas fotos não estão armazenadas neste aparelho.');
    }).catch((failure) => { if (!disposed) setError(String(failure.message)); });
    return () => { disposed = true; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [ids]);
  return <div>{error && <p role="status">{error}</p>}<div className="record-photo-grid">{photos.map((photo) => <figure key={photo.id}><a href={photo.url} download={photo.name}><img src={photo.url} alt={photo.name} loading="lazy" /><figcaption>Baixar {photo.name}</figcaption></a></figure>)}</div></div>;
}
