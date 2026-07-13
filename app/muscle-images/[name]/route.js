export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DRIVE_IMAGES = {
  chest: "1kdEuG4eUX04bnsiS2AdAh9XZJag2Yba9",
  back: "16HvS1vLxayFI65t2fOfS8qIPLAR6KzJl",
  shoulders: "1T8kwGp4ku6iGOreDZ6yWcTGjHbHXgINu",
  biceps: "1tI4Qf2_UZtu0ulRwAVcNZO2pYQaAbGKc",
  triceps: "1Ii2rYyaq-lD7KBgAQwNzyxfTzXs-J14P",
  legs: "1uw96Wv4oncah7wpDJxyRFKL3B6hlOvpP",
  core: "11oV9e2uI7dMJmzU0w5kiISxTuv0WT3Z8",
};

export async function GET(_request, { params }) {
  const resolved = await params;
  const name = String(resolved?.name || "")
    .toLowerCase()
    .replace(/\.png$/, "");
  const fileId = DRIVE_IMAGES[name];

  if (!fileId) {
    return new Response("Not found", { status: 404 });
  }

  const sourceUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
  const sourceResponse = await fetch(sourceUrl, {
    redirect: "follow",
    cache: "no-store",
    headers: {
      Accept: "image/png,image/*;q=0.9,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0 Endurance/1.0",
    },
  });

  if (!sourceResponse.ok) {
    return new Response("Image unavailable", { status: 502 });
  }

  const contentType = sourceResponse.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    return new Response("Invalid image response", { status: 502 });
  }

  const image = await sourceResponse.arrayBuffer();

  return new Response(image, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
