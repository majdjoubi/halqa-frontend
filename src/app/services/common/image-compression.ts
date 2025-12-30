export type SupportedOutputMime = 'image/webp' | 'image/jpeg';

export interface ImageCompressionOptions {
  maxWidth: number;
  maxHeight: number;
  quality: number; // 0..1
  outputMime: SupportedOutputMime;
}

function clampQuality(value: number): number {
  if (Number.isNaN(value)) return 0.82;
  return Math.min(1, Math.max(0.1, value));
}

function computeTargetSize(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  if (srcWidth <= 0 || srcHeight <= 0) {
    return { width: maxWidth, height: maxHeight };
  }

  const widthRatio = maxWidth / srcWidth;
  const heightRatio = maxHeight / srcHeight;
  const ratio = Math.min(1, widthRatio, heightRatio);

  return {
    width: Math.max(1, Math.round(srcWidth * ratio)),
    height: Math.max(1, Math.round(srcHeight * ratio)),
  };
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  // createImageBitmap is widely supported and avoids DOM image decoding.
  return await createImageBitmap(file);
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: SupportedOutputMime,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode image'));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });
}

/**
 * Compresses an image file client-side via Canvas.
 * Returns the original file on any failure.
 */
export async function compressImageFile(
  file: File,
  options: ImageCompressionOptions
): Promise<File> {
  try {
    if (!file.type.startsWith('image/')) return file;

    // Avoid wasting CPU for tiny files.
    if (file.size <= 200 * 1024) return file;

    const quality = clampQuality(options.quality);
    const bitmap = await loadBitmap(file);

    const { width, height } = computeTargetSize(
      bitmap.width,
      bitmap.height,
      options.maxWidth,
      options.maxHeight
    );

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, width, height);

    // Prefer requested mime, fallback to jpeg if encoding fails.
    let blob: Blob;
    try {
      blob = await canvasToBlob(canvas, options.outputMime, quality);
    } catch {
      blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    }

    const outputExt = options.outputMime === 'image/webp' ? 'webp' : 'jpg';
    const safeBaseName = (file.name || 'profile')
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '_');

    const outName = `${safeBaseName}.${outputExt}`;

    // If the "compressed" blob is larger, keep original.
    if (blob.size >= file.size) return file;

    return new File([blob], outName, { type: blob.type, lastModified: Date.now() });
  } catch {
    return file;
  }
}

export async function compressProfileImage(file: File): Promise<File> {
  // Profile images: small, fast, and consistent.
  return compressImageFile(file, {
    maxWidth: 512,
    maxHeight: 512,
    quality: 0.82,
    outputMime: 'image/webp',
  });
}
