import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const allowedRoles = ["user", "organizer", "moderator", "admin"];

function json(status, body) {
  return NextResponse.json(body, { status });
}

function decodeJwtPayload(token) {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(normalized, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function isModernSecretKey(token) {
  return typeof token === "string" && token.startsWith("sb_secret_");
}

function getProjectRefFromUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host.split(".")[0] || null;
  } catch {
    return null;
  }
}

function createUserClient(token) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

function createServiceClient() {
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
    },
  });
}

async function findAuthUserByEmail(adminClient, email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 100,
    });

    if (error) throw error;

    const user = (data?.users || []).find(
      (item) => String(item.email || "").trim().toLowerCase() === normalizedEmail
    );

    if (user) return user;
    if (!data?.users?.length || data.users.length < 100) return null;
  }

  return null;
}

async function saveInviteRecordNonBlocking(adminClient, payload) {
  try {
    const { data: rows, error: lookupError } = await adminClient
      .from("admin_user_invites")
      .select("id")
      .eq("email", payload.email)
      .limit(20);

    if (lookupError) throw lookupError;

    const ids = (rows || []).map((row) => row.id).filter(Boolean);

    if (ids.length) {
      const { error } = await adminClient
        .from("admin_user_invites")
        .update(payload)
        .in("id", ids);

      if (error) throw error;

      return { ok: true, action: `updated ${ids.length} invite row(s)` };
    }

    const { error } = await adminClient
      .from("admin_user_invites")
      .insert(payload);

    if (error) throw error;

    return { ok: true, action: "inserted invite row" };
  } catch (error) {
    console.warn("Invite record skipped", error);
    return {
      ok: false,
      warning: error?.message || "Invite record could not be saved, but auth/profile may still be created.",
    };
  }
}

export async function POST(request) {
  const servicePayload = supabaseServiceRoleKey ? decodeJwtPayload(supabaseServiceRoleKey) : null;

  const debug = {
    stage: "start",
    env: {
      has_url: Boolean(supabaseUrl),
      has_anon_key: Boolean(supabaseAnonKey),
      has_service_role_key: Boolean(supabaseServiceRoleKey),
      service_role_claim: servicePayload?.role || null,
      service_key_ref: servicePayload?.ref || null,
      service_key_type: isModernSecretKey(supabaseServiceRoleKey) ? "sb_secret" : "jwt",
      expected_project_ref: getProjectRefFromUrl(supabaseUrl),
    },
  };

  try {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return json(500, {
        error: "Missing Supabase environment variables. Add SUPABASE_SERVICE_ROLE_KEY in Vercel and redeploy.",
        debug,
      });
    }

    const usesModernSecretKey = isModernSecretKey(supabaseServiceRoleKey);

    if (!usesModernSecretKey && servicePayload?.role !== "service_role") {
      return json(500, {
        error:
          "SUPABASE_SERVICE_ROLE_KEY is not valid. Use either the new Supabase Secret key starting with sb_secret_ or the legacy JWT service_role key.",
        debug,
      });
    }

    const expectedProjectRef = getProjectRefFromUrl(supabaseUrl);
    if (
      !usesModernSecretKey &&
      servicePayload?.ref &&
      expectedProjectRef &&
      servicePayload.ref !== expectedProjectRef
    ) {
      return json(500, {
        error:
          `SUPABASE_SERVICE_ROLE_KEY does not belong to this Supabase project. Key ref is ${servicePayload.ref}, but URL ref is ${expectedProjectRef}. Copy the key from the same Supabase project as NEXT_PUBLIC_SUPABASE_URL and redeploy.`,
        debug,
      });
    }

    debug.stage = "read_session";
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) {
      return json(401, { error: "Not authenticated.", debug });
    }

    const userClient = createUserClient(token);

    const { data: authData, error: authError } = await userClient.auth.getUser();

    if (authError || !authData?.user?.id) {
      return json(401, {
        error: authError?.message || "Invalid session.",
        debug,
      });
    }

    const requesterId = authData.user.id;
    debug.requester_id = requesterId;

    const adminClient = createServiceClient();

    debug.stage = "service_role_smoke_test";
    const { error: smokeError } = await adminClient
      .from("profiles")
      .select("id", { count: "exact", head: true });

    if (smokeError) {
      return json(500, {
        error:
          `Admin secret smoke test failed on profiles: ${smokeError.message || smokeError.code || "403/unknown"}. Check that SUPABASE_SERVICE_ROLE_KEY is the Secret key starting with sb_secret_ from project ${getProjectRefFromUrl(supabaseUrl)} and redeploy.`,
        debug: {
          ...debug,
          smoke_error: {
            code: smokeError.code,
            message: smokeError.message,
            details: smokeError.details,
            hint: smokeError.hint,
          },
        },
      });
    }

    debug.stage = "check_requester_role";
    const { data: requesterProfile, error: requesterError } = await adminClient
      .from("profiles")
      .select("id,role,blocked,email")
      .eq("id", requesterId)
      .maybeSingle();

    if (requesterError) throw requesterError;

    debug.requester_role = requesterProfile?.role || null;

    if (!requesterProfile || requesterProfile.blocked) {
      return json(403, { error: "No admin access.", debug });
    }

    if (!["admin", "moderator"].includes(requesterProfile.role)) {
      return json(403, { error: "Only admins and moderators can create users.", debug });
    }

    debug.stage = "validate_payload";
    const body = await request.json();

    const firstName = String(body.first_name || "").trim();
    const lastName = String(body.last_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.temporary_password || "");
    const requestedRole = String(body.role || "user").trim();

    if (!firstName || !lastName || !email || !password) {
      return json(400, {
        error: "First name, last name, email and temporary password are required.",
        debug,
      });
    }

    if (password.length < 8) {
      return json(400, { error: "Temporary password must be at least 8 characters.", debug });
    }

    if (!allowedRoles.includes(requestedRole)) {
      return json(400, { error: "Invalid role.", debug });
    }

    if (requesterProfile.role === "moderator" && !["user", "organizer"].includes(requestedRole)) {
      return json(403, { error: "Moderators can only create users or organizers.", debug });
    }

    const fullName = `${firstName} ${lastName}`;
    let authUser = null;
    let createdNewAuthUser = false;

    debug.stage = "find_existing_auth_user";
    const existingAuthUser = await findAuthUserByEmail(adminClient, email);

    if (existingAuthUser?.id) {
      debug.stage = "update_existing_auth_user";
      const { data: updatedUser, error: updateAuthError } =
        await adminClient.auth.admin.updateUserById(existingAuthUser.id, {
          password,
          email_confirm: true,
          user_metadata: {
            ...(existingAuthUser.user_metadata || {}),
            first_name: firstName,
            last_name: lastName,
            name: fullName,
          },
        });

      if (updateAuthError) throw updateAuthError;

      authUser = updatedUser?.user || existingAuthUser;
    } else {
      debug.stage = "create_auth_user";
      const { data: createdUser, error: createError } =
        await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            first_name: firstName,
            last_name: lastName,
            name: fullName,
          },
        });

      if (createError) throw createError;

      authUser = createdUser?.user;
      createdNewAuthUser = true;
    }

    const createdId = authUser?.id;
    debug.created_auth_user_id = createdId || null;
    debug.created_new_auth_user = createdNewAuthUser;

    if (!createdId) {
      return json(500, { error: "Auth user was not created or found.", debug });
    }

    debug.stage = "upsert_profile";
    const { data: savedProfile, error: profileError } = await adminClient
      .from("profiles")
      .upsert(
        {
          id: createdId,
          first_name: firstName,
          last_name: lastName,
          name: fullName,
          email,
          role: requestedRole,
          onboarding_completed: false,
          blocked: false,
        },
        { onConflict: "id" }
      )
      .select("id,email,role,name")
      .maybeSingle();

    if (profileError) {
      return json(500, {
        error: `Profile save failed: ${profileError.message}`,
        debug: {
          ...debug,
          profile_error: {
            code: profileError.code,
            message: profileError.message,
            details: profileError.details,
            hint: profileError.hint,
          },
        },
      });
    }

    debug.saved_profile_id = savedProfile?.id || null;

    if (!savedProfile?.id) {
      return json(500, {
        error: "Auth user exists, but profile was not saved.",
        debug,
      });
    }

    debug.stage = "save_invite_record";
    const inviteResult = await saveInviteRecordNonBlocking(adminClient, {
      first_name: firstName,
      last_name: lastName,
      email,
      role: requestedRole,
      status: "accepted",
      invited_by: requesterId,
      accepted_user_id: createdId,
      accepted_at: new Date().toISOString(),
    });

    debug.invite_record = inviteResult;
    debug.stage = "done";

    return json(200, {
      id: createdId,
      email,
      role: requestedRole,
      created_new_auth_user: createdNewAuthUser,
      warning: inviteResult.ok ? null : inviteResult.warning,
      message: createdNewAuthUser
        ? "User created with temporary password."
        : "Existing auth user updated and profile saved.",
      debug,
    });
  } catch (error) {
    console.error("Admin create user error", error);

    return json(500, {
      error: error?.message || "Could not create user.",
      debug,
    });
  }
}
