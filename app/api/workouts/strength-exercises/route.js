import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase configuration.");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function GET() {
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("strength_exercises")
      .select("id,name,primary_muscle_group,equipment,image_url,active")
      .eq("active", true)
      .order("primary_muscle_group", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ exercises: data || [] });
  } catch (error) {
    console.error("Strength exercises API error", error);
    return NextResponse.json(
      { error: error?.message || "Could not load strength exercises." },
      { status: 500 }
    );
  }
}
