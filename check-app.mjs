#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const results = [];

function pass(name, details = "") {
  results.push({ status: "PASS", name, details });
}

function warn(name, details = "") {
  results.push({ status: "WARN", name, details });
}

function fail(name, details = "") {
  results.push({ status: "FAIL", name, details });
}

function read(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8");
}

function includesAny(text, needles) {
  return needles.some((needle) => text.includes(needle));
}

async function runStaticChecks() {
  const packageJsonText = read("package.json");
  if (!packageJsonText) {
    fail("package.json exists", "Missing package.json");
    return;
  }

  const packageJson = JSON.parse(packageJsonText);
  if (packageJson.scripts?.build) pass("Build script exists", packageJson.scripts.build);
  else fail("Build script exists", "Add a build script to package.json");

  const login = read("app/login/page.js");
  if (!login) fail("Login page exists", "Missing app/login/page.js");
  else {
    if (login.includes("getNextAuthPath") && login.includes("/onboarding")) {
      pass("Login redirects incomplete users to onboarding");
    } else {
      fail("Login redirects incomplete users to onboarding", "Expected getNextAuthPath and /onboarding redirect logic.");
    }
  }

  const trainings = read("app/trainings/page.js");
  if (!trainings) fail("Trainings page exists", "Missing app/trainings/page.js");
  else {
    if (trainings.includes("onboarding_completed") && trainings.includes("router.replace(\"/onboarding\")")) {
      pass("Trainings page protects onboarding");
    } else {
      fail("Trainings page protects onboarding", "Expected onboarding_completed check before loading feed.");
    }

    if (
      includesAny(trainings, ["24 * 60 * 60 * 1000", "86400000"]) &&
      includesAny(trainings, ["final_starts_at", "starts_at", "flexible_date"])
    ) {
      pass("Training feed hides sessions older than 24 hours");
    } else {
      warn("Training feed hides sessions older than 24 hours", "Could not detect 24-hour old-session filter in app/trainings/page.js.");
    }
  }

  const onboarding = read("app/onboarding/page.js");
  if (!onboarding) fail("Onboarding page exists", "Missing app/onboarding/page.js");
  else {
    if (onboarding.includes("location") && includesAny(onboarding, ["City", "region", "plaats", "Location"])) {
      pass("Onboarding contains location field");
    } else {
      fail("Onboarding contains location field", "Location/city field not detected.");
    }

    if (includesAny(onboarding, ["!location", "location.trim", "City / region is required", "Location is required"])) {
      pass("Onboarding requires location");
    } else {
      warn("Onboarding requires location", "Could not detect required-location validation.");
    }
  }

  const cropper = read("lib/imageCropper.js");
  if (!cropper) warn("Avatar cropper exists", "Missing lib/imageCropper.js");
  else {
    const avatarBlock = cropper.match(/avatar:\s*{[\s\S]*?}/)?.[0] || "";
    if (avatarBlock.includes("aspectRatio: 1") && avatarBlock.includes("outputWidth: 900") && avatarBlock.includes("outputHeight: 900")) {
      pass("Avatar crop exports square image");
    } else {
      fail("Avatar crop exports square image", "Avatar should use aspectRatio 1 and equal outputWidth/outputHeight.");
    }
  }

  const supabase = read("lib/supabase.js");
  if (!supabase) fail("Supabase client exists", "Missing lib/supabase.js");
  else {
    if (supabase.includes("NEXT_PUBLIC_SUPABASE_URL") && supabase.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY")) {
      pass("Supabase client reads public env vars");
    } else {
      fail("Supabase client reads public env vars", "Expected NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    }
  }
}

async function runSupabaseChecks() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    warn("Supabase live checks", "Skipped. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to run database checks.");
    return;
  }

  let createClient;
  try {
    ({ createClient } = await import("@supabase/supabase-js"));
  } catch (error) {
    warn("Supabase live checks", "Skipped. Run npm install first to install @supabase/supabase-js.");
    return;
  }

  const supabase = createClient(url, anonKey);
  const coreTables = [
    "sports",
    "profiles",
    "user_sports",
    "training_sessions",
    "session_participants",
    "training_invites",
    "training_visibility_members",
    "routes",
    "workouts",
    "notifications",
  ];

  for (const table of coreTables) {
    const { error } = await supabase.from(table).select("*", { count: "exact", head: true });
    if (error) warn(`Supabase table access: ${table}`, error.message);
    else pass(`Supabase table access: ${table}`);
  }

  const { data: publicSessions, error: publicError } = await supabase
    .from("training_sessions")
    .select("id,visibility")
    .eq("visibility", "public")
    .limit(1);

  if (publicError) warn("Public training_sessions query", publicError.message);
  else pass("Public training_sessions query", `${publicSessions?.length || 0} row(s) returned`);
}

function printResults() {
  console.log("\nEndurance app check\n===================");

  for (const item of results) {
    const icon = item.status === "PASS" ? "✅" : item.status === "WARN" ? "⚠️" : "❌";
    console.log(`${icon} ${item.status} ${item.name}${item.details ? ` — ${item.details}` : ""}`);
  }

  const failures = results.filter((item) => item.status === "FAIL");
  const warnings = results.filter((item) => item.status === "WARN");

  console.log("\nSummary");
  console.log(`PASS: ${results.filter((item) => item.status === "PASS").length}`);
  console.log(`WARN: ${warnings.length}`);
  console.log(`FAIL: ${failures.length}`);

  if (failures.length) {
    console.log("\nResult: failed. Fix FAIL items before deploy.");
    process.exitCode = 1;
  } else {
    console.log("\nResult: OK. Warnings may still need review.");
  }
}

await runStaticChecks();
await runSupabaseChecks();
printResults();
