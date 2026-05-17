import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const allowedRoles = ["user", "organizer", "moderator", "admin"];

function json(status, body) {
  return NextResponse.json(body, { status });
}

async function findAuthUserByEmail(adminClient, email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  for (let page = 1; page <= 10; page += 1) {
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

async function saveInviteRecord(adminClient, payload) {
  const { data: existingInvite, error: lookupError } = await adminClient
    .from("admin_user_invites")
    .select("id")
    .eq("email", payload.email)
    .maybeSingle();

  if (lookupError) throw lookupError;

  if (existingInvite?.id) {
    const { error } = await adminClient
      .from("admin_user_invites")
      .update(payload)
      .eq("id", existingInvite.id);

    if (error) throw error;

    return;
  }

  const { error } = await adminClient
    .from("admin_user_invites")
    .insert(payload);

  if (error) throw error;
}

export async function POST(request) {
  try {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return json(500, {
        error: "Missing Supabase environment variables. Add SUPABASE_SERVICE_ROLE_KEY in Vercel and redeploy.",
      });
    }

    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) {
      return json(401, { error: "Not authenticated." });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();

    if (authError || !authData?.user?.id) {
      return json(401, { error: "Invalid session." });
    }

    const requesterId = authData.user.id;

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: requesterProfile, error: requesterError } = await adminClient
      .from("profiles")
      .select("id,role,blocked")
      .eq("id", requesterId)
      .maybeSingle();

    if (requesterError) throw requesterError;

    if (!requesterProfile || requesterProfile.blocked) {
      return json(403, { error: "No admin access." });
    }

    if (!["admin", "moderator"].includes(requesterProfile.role)) {
      return json(403, { error: "Only admins and moderators can create users." });
    }

    const body = await request.json();

    const firstName = String(body.first_name || "").trim();
    const lastName = String(body.last_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.temporary_password || "");
    const requestedRole = String(body.role || "user").trim();

    if (!firstName || !lastName || !email || !password) {
      return json(400, {
        error: "First name, last name, email and temporary password are required.",
      });
    }

    if (password.length < 8) {
      return json(400, { error: "Temporary password must be at least 8 characters." });
    }

    if (!allowedRoles.includes(requestedRole)) {
      return json(400, { error: "Invalid role." });
    }

    if (requesterProfile.role === "moderator" && !["user", "organizer"].includes(requestedRole)) {
      return json(403, { error: "Moderators can only create users or organizers." });
    }

    const fullName = `${firstName} ${lastName}`;
    let authUser = null;
    let createdNewAuthUser = false;

    const existingAuthUser = await findAuthUserByEmail(adminClient, email);

    if (existingAuthUser?.id) {
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

    if (!createdId) {
      return json(500, { error: "Auth user was not created or found." });
    }

    const { error: profileError } = await adminClient
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
      );

    if (profileError) throw profileError;

    await saveInviteRecord(adminClient, {
      first_name: firstName,
      last_name: lastName,
      email,
      role: requestedRole,
      status: "accepted",
      invited_by: requesterId,
      accepted_user_id: createdId,
      accepted_at: new Date().toISOString(),
    });

    return json(200, {
      id: createdId,
      email,
      role: requestedRole,
      created_new_auth_user: createdNewAuthUser,
      message: createdNewAuthUser
        ? "User created with temporary password."
        : "Existing auth user updated and profile saved.",
    });
  } catch (error) {
    console.error("Admin create user error", error);

    return json(500, {
      error: error?.message || "Could not create user.",
    });
  }
}
