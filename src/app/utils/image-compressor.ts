/** Resize a photo so the longest edge is at most `maxEdge` px and encode as JPEG. */
export async function compressImageFile(file: Blob, maxEdge = 1600, quality = 0.75): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > maxEdge ? maxEdge / longest : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not compress the photo');
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) {
      throw new Error('Could not compress the photo');
    }
    return blob;
  } finally {
    bitmap.close();
  }
}
