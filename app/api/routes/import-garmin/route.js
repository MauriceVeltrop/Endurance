import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_GPX_BYTES = 10 * 1024 * 1024;
const GARMIN_HOSTS = new Set(["connect.garmin.com", "share.garmin.com"]);

function isGarminHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return GARMIN_HOSTS.has(host) || host.endsWith(".garmin.com");
}

function looksLikeGpx(text) {
  return /<gpx\b/i.test(String(text || ""));
}

function extractIds(url, html = "") {
  const source = `${url || ""}\n${html || ""}`;
  const activityMatch = source.match(/(?:activity\/|activityId["':=\s]+)(\d{5,})/i);
  const courseMatch = source.match(/(?:course\/|courseId["':=\s]+)(\d{5,})/i);

  return {
    activityId: activityMatch?.[1] || "",
    courseId: courseMatch?.[1] || "",
  };
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "application/gpx+xml,text/xml,application/xml,text/html;q=0.8,*/*;q=0.5",
        "user-agent": "EnduranceRouteImporter/1.0",
      },
    });

    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_GPX_BYTES) throw new Error("Garmin response is too large.");

    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_GPX_BYTES) throw new Error("Garmin response is too large.");

    return { response, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function tryGpxUrl(url) {
  try {
    const { response, text } = await fetchText(url);
    if (!response.ok || !looksLikeGpx(text)) return null;
    return text;
  } catch {
    return null;
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const rawUrl = String(body?.url || "").trim();
    if (!rawUrl) {
      return NextResponse.json({ error: "Paste a Garmin link first." }, { status: 400 });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return NextResponse.json({ error: "This is not a valid URL." }, { status: 400 });
    }

    if (parsedUrl.protocol !== "https:" || !isGarminHost(parsedUrl.hostname)) {
      return NextResponse.json({ error: "Only secure Garmin links are accepted." }, { status: 400 });
    }

    const initial = await fetchText(parsedUrl.toString());
    const finalUrl = initial.response.url || parsedUrl.toString();

    if (looksLikeGpx(initial.text)) {
      return new NextResponse(initial.text, {
        status: 200,
        headers: {
          "content-type": "application/gpx+xml; charset=utf-8",
          "content-disposition": 'attachment; filename="garmin-route.gpx"',
        },
      });
    }

    const { activityId, courseId } = extractIds(finalUrl, initial.text);
    const candidates = [];

    if (activityId) {
      candidates.push(
        `https://connect.garmin.com/modern/proxy/download-service/export/gpx/activity/${activityId}`,
        `https://connect.garmin.com/proxy/download-service/export/gpx/activity/${activityId}`
      );
    }

    if (courseId) {
      candidates.push(
        `https://connect.garmin.com/modern/proxy/course-service/course/gpx/${courseId}`,
        `https://connect.garmin.com/proxy/course-service/course/gpx/${courseId}`
      );
    }

    for (const candidate of candidates) {
      const gpx = await tryGpxUrl(candidate);
      if (gpx) {
        return new NextResponse(gpx, {
          status: 200,
          headers: {
            "content-type": "application/gpx+xml; charset=utf-8",
            "content-disposition": 'attachment; filename="garmin-route.gpx"',
          },
        });
      }
    }

    return NextResponse.json(
      {
        error:
          "This Garmin link does not expose a public GPX file. Make the Garmin activity or course public, or download the GPX from Garmin and upload the file manually.",
      },
      { status: 422 }
    );
  } catch (error) {
    console.error("Garmin route import error", error);
    return NextResponse.json(
      { error: error?.message || "The Garmin route could not be imported." },
      { status: 500 }
    );
  }
}
