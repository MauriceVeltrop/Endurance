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
    outputWidth: 1080,
    outputHeight: 1920,
    mimeType: "image/jpeg",
    quality: 0.9,
  },
};

export function createObjectUrl(file) {
  if (!file) return "";
  return URL.createObjectURL(file);
}

export function revokeObjectUrl(url) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}
