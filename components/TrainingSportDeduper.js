"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const NORMALIZED_RUNNING_LABEL = "(trail)running";

function normalizeLabel(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function dedupeRunningChoice() {
  const headings = Array.from(document.querySelectorAll("h1, h2, h3"));
  const chooseSportHeading = headings.find(
    (heading) => normalizeLabel(heading.textContent) === "choose sport"
  );

  const section = chooseSportHeading?.closest("section");
  if (!section) return;

  const runningButtons = Array.from(section.querySelectorAll("button")).filter(
    (button) => normalizeLabel(button.textContent) === NORMALIZED_RUNNING_LABEL
  );

  runningButtons.forEach((button, index) => {
    if (index === 0) {
      button.hidden = false;
      button.removeAttribute("aria-hidden");
      button.disabled = false;
      return;
    }

    button.hidden = true;
    button.setAttribute("aria-hidden", "true");
    button.disabled = true;
  });
}

export default function TrainingSportDeduper() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/trainings/new") return undefined;

    dedupeRunningChoice();

    const observer = new MutationObserver(() => dedupeRunningChoice());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
