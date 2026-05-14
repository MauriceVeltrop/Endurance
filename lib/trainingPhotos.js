// Supabase Storage helper for training teaser photos.
// Create a public bucket named "training-photos" in Supabase Storage.
// Suggested policy: authenticated users may upload to their own folder.

export const TRAINING_PHOTO_BUCKET = "training-photos";

export function isLikelyImageUrl(value) {
  if (!value || typeof value !== "string") return false;
  const url = value.trim();
  if (!url) return false;

  if (url.startsWith("data:image/")) return true;
  if (url.startsWith("blob:")) return true;
  if (url.startsWith("/")) return true;

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    return true;
  } catch {
    return false;
  }
}

function safeFileName(name) {
  const base = String(name || "training-photo")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return base || "training-photo";
}

export async function uploadTrainingPhoto({ supabase, userId, file }) {
  if (!supabase) throw new Error("Supabase client missing.");
  if (!userId) throw new Error("User is not signed in.");
  if (!file) return "";

  if (!file.type?.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }

  const maxSizeMb = 8;
  if (file.size > maxSizeMb * 1024 * 1024) {
    throw new Error(`Training photo is too large. Max ${maxSizeMb} MB.`);
  }

  const extension = safeFileName(file.name).split(".").pop() || "jpg";
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;

  const { error } = await supabase.storage
    .from(TRAINING_PHOTO_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/jpeg",
    });

  if (error) throw error;

  const { data } = supabase.storage.from(TRAINING_PHOTO_BUCKET).getPublicUrl(path);
  return data?.publicUrl || "";
}
