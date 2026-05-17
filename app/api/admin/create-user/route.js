import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ADMIN_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ROLE_OPTIONS = ["user", "organizer", "moderator", "admin"];

function json(status, body) {
  return NextResponse.json(body, { status });
}

function isSbSecretKey(key) {
  return typeof key === "string" && key.startsWith("sb_secret_");
}

function isLegacyJwtKey(key) {
  return typeof key === "string" && key.startsWith("eyJ");
}

function adminHeaders(extra = {}) {
  const headers = {
    apikey: ADMIN_KEY,
    "Content-Type": "application/json",
    ...extra,
  };

  if (isLegacyJwtKey(ADMIN_KEY)) {
    headers.Authorization = `Bearer ${ADMIN_KEY}`;
  }

  return headers;
}

function createUserClient(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

function createLegacyAdminClient() {
  return createClient(SUPABASE_URL, ADMIN_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    cache: "no-store",
    ...options,
  });

  const text = await res.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!res.ok) {
    throw new Error(`${options.label || "Supabase request"} failed (${res.status}): ${text || res.statusText}`);
  }

  return payload;
}

async function getRequesterProfile(requesterId) {
  const rows = await apiFetch(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(requesterId)}&select=id,role,blocked,email`,
    {
      method: "GET",
      headers: adminHeaders(),
      label: "Read requester profile",
    }
  );

  return Array.isArray(rows) ? rows[0] : null;
}

async function listAuthUsers() {
  return apiFetch("/auth/v1/admin/users?page=1&per_page=1000", {
    method: "GET",
    headers: adminHeaders(),
    label: "List auth users",
  });
}

async function findAuthUserByEmail(email) {
  const payload = await listAuthUsers();
  const users = payload?.users || [];

  return (
    users.find(
      (user) => String(user.email || "").trim().toLowerCase() === email
    ) || null
  );
}

async function createAuthUser({ email, password, firstName, lastName, fullName }) {
  return apiFetch("/auth/v1/admin/users", {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        name: fullName,
      },
    }),
    label: "Create auth user",
  });
}

async function updateAuthUser({ id, password, firstName, lastName, fullName }) {
  return apiFetch(`/auth/v1/admin/users/${id}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify({
      password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        name: fullName,
      },
    }),
    label: "Update auth user",
  });
}

async function saveProfile(profile) {
  return apiFetch("/rest/v1/profiles?on_conflict=id", {
    method: "POST",
    headers: adminHeaders({
      Prefer: "resolution=merge-duplicates,return=representation",
    }),
    body: JSON.stringify(profile),
    label: "Save profile",
  });
}

async function saveInvite(invite) {
  try {
    const rows = await apiFetch(
      `/rest/v1/admin_user_invites?email=eq.${encodeURIComponent(invite.email)}&select=id`,
      {
        method: "GET",
        headers: adminHeaders(),
        label: "Find invite",
      }
    );

    const ids = Array.isArray(rows) ? rows.map((row) => row.id).filter(Boolean) : [];

    if (ids.length) {
      await apiFetch(`/rest/v1/admin_user_invites?id=in.(${ids.join(",")})`, {
        method: "PATCH",
        headers: adminHeaders({ Prefer: "return=minimal" }),
        body: JSON.stringify(invite),
        label: "Update invite",
      });
    } else {
      await apiFetch("/rest/v1/admin_user_invites", {
        method: "POST",
        headers: adminHeaders({ Prefer: "return=minimal" }),
        body: JSON.stringify(invite),
        label: "Insert invite",
      });
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, warning: error?.message || "Invite record could not be saved." };
  }
}

export async function POST(request) {
  const debug = {
    stage: "start",
    key_type: isSbSecretKey(ADMIN_KEY)
      ? "sb_secret"
      : isLegacyJwtKey(ADMIN_KEY)
        ? "legacy_jwt"
        : "unknown",
  };

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !ADMIN_KEY) {
      return json(500, { error: "Missing Supabase environment variables.", debug });
    }

    if (!isSbSecretKey(ADMIN_KEY) && !isLegacyJwtKey(ADMIN_KEY)) {
      return json(500, {
        error: "SUPABASE_SERVICE_ROLE_KEY must start with sb_secret_ or eyJ.",
        debug,
      });
    }

    debug.stage = "verify_session";
    const token = (request.headers.get("authorization") || "").replace("Bearer ", "").trim();

    if (!token) {
      return json(401, { error: "Not authenticated.", debug });
    }

    const userClient = createUserClient(token);
    const { data: userData, error: userError } = await userClient.auth.getUser();

    if (userError || !userData?.user?.id) {
      return json(401, { error: userError?.message || "Invalid session.", debug });
    }

    const requesterId = userData.user.id;
    debug.requester_id = requesterId;

    debug.stage = "requester_profile";
    const requesterProfile = isLegacyJwtKey(ADMIN_KEY)
      ? await createLegacyAdminClient()
          .from("profiles")
          .select("id,role,blocked,email")
          .eq("id", requesterId)
          .maybeSingle()
          .then(({ data, error }) => {
            if (error) throw new Error(`Read requester profile failed: ${error.message}`);
            return data;
          })
      : await getRequesterProfile(requesterId);

    if (!requesterProfile || requesterProfile.blocked) {
      return json(403, { error: "No admin access.", debug });
    }

    if (!["admin", "moderator"].includes(requesterProfile.role)) {
      return json(403, { error: "Only admins and moderators can create users.", debug });
    }

    debug.requester_role = requesterProfile.role;
    debug.stage = "validate_payload";

    const body = await request.json();
    const firstName = String(body.first_name || "").trim();
    const lastName = String(body.last_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.temporary_password || "");
    const role = String(body.role || "user").trim();
    const fullName = `${firstName} ${lastName}`.trim();

    if (!firstName || !lastName || !email || !password) {
      return json(400, { error: "First name, last name, email and temporary password are required.", debug });
    }

    if (password.length < 8) {
      return json(400, { error: "Temporary password must be at least 8 characters.", debug });
    }

    if (!ROLE_OPTIONS.includes(role)) {
      return json(400, { error: "Invalid role.", debug });
    }

    if (requesterProfile.role === "moderator" && !["user", "organizer"].includes(role)) {
      return json(403, { error: "Moderators can only create users or organizers.", debug });
    }

    debug.stage = "auth_user";
    const existingAuthUser = await findAuthUserByEmail(email);

    let authUser;
    let createdNewAuthUser = false;

    if (existingAuthUser?.id) {
      authUser = await updateAuthUser({
        id: existingAuthUser.id,
        password,
        firstName,
        lastName,
        fullName,
      });
    } else {
      authUser = await createAuthUser({
        email,
        password,
        firstName,
        lastName,
        fullName,
      });
      createdNewAuthUser = true;
    }

    const userId = authUser?.id || authUser?.user?.id;

    if (!userId) {
      return json(500, { error: "Auth user was not created or found.", debug });
    }

    debug.created_user_id = userId;
    debug.stage = "profile_save";

    await saveProfile({
      id: userId,
      first_name: firstName,
      last_name: lastName,
      name: fullName,
      email,
      role,
      onboarding_completed: false,
      blocked: false,
    });

    debug.stage = "invite_save";

    const inviteResult = await saveInvite({
      first_name: firstName,
      last_name: lastName,
      email,
      role,
      status: "accepted",
      invited_by: requesterId,
      accepted_user_id: userId,
      accepted_at: new Date().toISOString(),
    });

    debug.invite = inviteResult;
    debug.stage = "done";

    return json(200, {
      id: userId,
      email,
      role,
      created_new_auth_user: createdNewAuthUser,
      warning: inviteResult.ok ? null : inviteResult.warning,
      message: createdNewAuthUser
        ? "User created with temporary password."
        : "Existing user updated and profile saved.",
      debug,
    });
  } catch (error) {
    console.error("Admin create user route error", error);

    return json(500, {
      error: error?.message || "Could not create user.",
      debug,
    });
  }
}
