import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_SPORTS = new Set(["strength_training", "hyrox", "crossfit", "bootcamp"]);

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase configuration.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request) {
  try {
    const sportId = new URL(request.url).searchParams.get("sport_id") || "";
    if (!ALLOWED_SPORTS.has(sportId)) {
      return NextResponse.json({ error: "Unsupported workout sport." }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const [exerciseResult, structureResult] = await Promise.all([
      supabase
        .from("workout_catalog_exercises")
        .select("id,strength_exercise_id,name,sports,category,primary_muscle_group,equipment,metric_type,default_reps,default_distance_m,default_duration_seconds,sort_order,active")
        .contains("sports", [sportId])
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("workout_sport_structures")
        .select("id,sport_id,code,name,description,config,sort_order,active")
        .eq("sport_id", sportId)
        .eq("active", true)
        .order("sort_order", { ascending: true }),
    ]);

    if (exerciseResult.error) throw exerciseResult.error;
    if (structureResult.error) throw structureResult.error;

    return NextResponse.json({
      sport_id: sportId,
      exercises: exerciseResult.data || [],
      structures: structureResult.data || [],
    });
  } catch (error) {
    console.error("Workout catalog API error", error);
    return NextResponse.json(
      { error: error?.message || "Could not load the workout catalog." },
      { status: 500 }
    );
  }
}
