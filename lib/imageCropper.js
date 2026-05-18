export const CROP_PRESETS = {
  avatar: {
    label: "Profile photo",
    aspectRatio: 1,
    outputWidth: 900,
    outputHeight: 900,
    mimeType: "image/jpeg",
    quality: 0.92,
  },
  trainingHero: {
    label: "Training photo",
    aspectRatio: 16 / 9,
    outputWidth: 1600,
    outputHeight: 900,
    mimeType: "image/jpeg",
    quality: 0.9,
  },
};

export function createObjectUrl(file) {
  if (!file) return "";
  return URL.createObjectURL(file);
}

export function revokeObjectUrl(url) {
  if (url?.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

export function dataUrlToFile(dataUrl, fileName = "cropped-image.jpg") {
  const [meta, base64] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);base64/)?.[1] || "image/jpeg";
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    array[i] = binary.charCodeAt(i);
  }

  return new File([array], fileName, { type: mime });
}

export async function cropImageToFile({
  image,
  crop,
  zoom = 1,
  preset = CROP_PRESETS.avatar,
  fileName = "cropped-image.jpg",
}) {
  if (!image) throw new Error("Image missing.");

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const outputWidth = preset.outputWidth || 900;
  const outputHeight = preset.outputHeight || 900;
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;

  const sourceWidth = crop.width / zoom;
  const sourceHeight = crop.height / zoom;
  const sourceX = Math.max(0, crop.x + (crop.width - sourceWidth) / 2);
  const sourceY = Math.max(0, crop.y + (crop.height - sourceHeight) / 2);

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    Math.min(sourceWidth, naturalWidth - sourceX),
    Math.min(sourceHeight, naturalHeight - sourceY),
    0,
    0,
    outputWidth,
    outputHeight
  );

  const dataUrl = canvas.toDataURL(preset.mimeType || "image/jpeg", preset.quality ?? 0.9);
  return dataUrlToFile(dataUrl, fileName);
}
