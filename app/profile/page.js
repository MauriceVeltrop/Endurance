"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "../../components/AppHeader";
import { supabase } from "../../lib/supabase";

export default function ProfilePage() {
  const router = useRouter();

  useEffect(() => {
    openOwnProfile();
  }, []);

  async function openOwnProfile() {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user?.id) {
      router.replace("/login");
      return;
    }

    router.replace(`/profile/${user.id}`);
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <AppHeader compact />
        <section style={styles.card}>Opening your profile...</section>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top right, rgba(228,239,22,0.12), transparent 30%), linear-gradient(180deg, #07100b 0%, #050505 65%, #020202 100%)",
    color: "white",
    padding: "16px 12px 56px",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  shell: {
    width: "100%",
    maxWidth: 980,
    margin: "0 auto",
    display: "grid",
    gap: 16,
  },
  card: {
    borderRadius: 28,
    padding: 20,
    background: "linear-gradient(145deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))",
    border: "1px solid rgba(255,255,255,0.12)",
  },
};
