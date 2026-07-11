"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

function isRouteCreatePath(pathname) {
  return String(pathname || "").replace(/\/+$/, "") === "/routes/new";
}

function findUploadMount() {
  const uploadLabel = Array.from(document.querySelectorAll("label.create-route-upload")).find((label) =>
    /upload gpx file/i.test(label.textContent || "")
  );

  if (!uploadLabel) return null;

  let mount = uploadLabel.parentElement?.querySelector("[data-garmin-route-importer='true']");
  if (!mount) {
    mount = document.createElement("div");
    mount.setAttribute("data-garmin-route-importer", "true");
    uploadLabel.insertAdjacentElement("afterend", mount);
  }

  return { mount, uploadLabel };
}

export default function GarminRouteImporter() {
  const pathname = usePathname();
  const active = isRouteCreatePath(pathname);
  const [mountTarget, setMountTarget] = useState(null);
  const [uploadLabel, setUploadLabel] = useState(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!active) {
      setMountTarget(null);
      setUploadLabel(null);
      return undefined;
    }

    let frame = 0;
    const resolveMount = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const result = findUploadMount();
        if (result?.mount) {
          setMountTarget(result.mount);
          setUploadLabel(result.uploadLabel);
        }
      });
    };

    resolveMount();
    const observer = new MutationObserver(resolveMount);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [active]);

  async function importGarminLink() {
    if (!url.trim() || busy || !uploadLabel) return;

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/routes/import-garmin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "The Garmin route could not be imported.");
      }

      const gpxText = await response.text();
      const file = new File([gpxText], "garmin-route.gpx", { type: "application/gpx+xml" });
      const fileInput = uploadLabel.querySelector('input[type="file"]');

      if (!fileInput) throw new Error("The GPX upload field could not be found.");

      const transfer = new DataTransfer();
      transfer.items.add(file);
      fileInput.files = transfer.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));

      setMessage("Garmin route imported as GPX. Review the route details before saving.");
    } catch (error) {
      console.error("Garmin link import failed", error);
      setMessage(error?.message || "The Garmin route could not be imported.");
    } finally {
      setBusy(false);
    }
  }

  if (!active || !mountTarget) return null;

  return createPortal(
    <section className="garmin-route-importer" aria-label="Import Garmin route link">
      <div className="garmin-route-importer-heading">
        <strong>Or paste a Garmin link</strong>
        <span>Public Garmin activity or course links are converted to GPX.</span>
      </div>

      <div className="garmin-route-importer-row">
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://connect.garmin.com/..."
          aria-label="Garmin route link"
        />
        <button type="button" onClick={importGarminLink} disabled={busy || !url.trim()}>
          {busy ? "Importing..." : "Import link"}
        </button>
      </div>

      {message ? <p className="garmin-route-importer-message">{message}</p> : null}
    </section>,
    mountTarget
  );
}
