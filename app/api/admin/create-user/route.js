import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase service role configuration.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase anon configuration.");
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return NextResponse.json({ error: "Missing admin session token." }, { status: 401 });
    }

    const anon = getAnonClient();
    const { data: sessionData, error: sessionError } = await anon.auth.getUser(token);

    if (sessionError || !sessionData?.user?.id) {
      return NextResponse.json({ error: "Invalid admin session." }, { status: 401 });
    }

    const admin = getAdminClient();

    const { data: adminProfile, error: adminProfileError } = await admin
      .from("profiles")
      .select("id, role, blocked")
      .eq("id", sessionData.user.id)
      .maybeSingle();

    if (adminProfileError) throw adminProfileError;

    if (!adminProfile || adminProfile.blocked || !["admin", "moderator"].includes(adminProfile.role)) {
      return NextResponse.json({ error: "Not allowed to create users." }, { status: 403 });
    }

    const body = await request.json();
    const firstName = String(body.first_name || "").trim();
    const lastName = String(body.last_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const role = String(body.role || "user").trim();
    const temporaryPassword = String(body.temporary_password || "").trim();

    if (!firstName) return NextResponse.json({ error: "First name is required." }, { status: 400 });
    if (!lastName) return NextResponse.json({ error: "Last name is required." }, { status: 400 });
    if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });
    if (temporaryPassword.length < 8) {
      return NextResponse.json({ error: "Temporary password must be at least 8 characters." }, { status: 400 });
    }

    const allowedRoles = adminProfile.role === "admin"
      ? ["user", "organizer", "moderator", "admin"]
      : ["user", "organizer"];

    if (!allowedRoles.includes(role)) {
      return NextResponse.json({ error: "You cannot assign that role." }, { status: 403 });
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        name: `${firstName} ${lastName}`.trim(),
      },
    });

    if (createError) throw createError;

    const userId = created?.user?.id;

    if (!userId) {
      throw new Error("User was created without an id.");
    }

    const { error: profileError } = await admin
      .from("profiles")
      .upsert({
        id: userId,
        first_name: firstName,
        last_name: lastName,
        name: `${firstName} ${lastName}`.trim(),
        email,
        role,
        onboarding_completed: false,
        blocked: false,
      }, { onConflict: "id" });

    if (profileError) throw profileError;

    await admin
      .from("admin_user_invites")
      .upsert({
        first_name: firstName,
        last_name: lastName,
        email,
        role,
        status: "accepted",
        invited_by: sessionData.user.id,
        accepted_user_id: userId,
        accepted_at: new Date().toISOString(),
      }, { onConflict: "email" });

    return NextResponse.json({
      ok: true,
      user: {
        id: userId,
        email,
        first_name: firstName,
        last_name: lastName,
        name: `${firstName} ${lastName}`.trim(),
        role,
      },
    });
  } catch (error) {
    console.error("Admin create user failed", error);
    return NextResponse.json(
      { error: error?.message || "Could not create user." },
      { status: 500 }
    );
  }
}
