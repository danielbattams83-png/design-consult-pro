export function dataUrlToBlob(dataUrl: string): Blob {
  const marker = ';base64,';
  const markerAt = dataUrl.indexOf(marker);
  const commaAt = dataUrl.indexOf(',');
  const base64 = dataUrl.startsWith('data:') && markerAt !== -1
    ? dataUrl.slice(markerAt + marker.length)
    : dataUrl.startsWith('data:') && commaAt !== -1
      ? dataUrl.slice(commaAt + 1)
      : dataUrl;
  const mimeMatch = /^data:([^;,]+)/.exec(dataUrl);
  const mime = mimeMatch?.[1] || 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}
