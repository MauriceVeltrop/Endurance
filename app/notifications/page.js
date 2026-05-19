// app/notifications/page.js
"use client";

import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import NotificationCenter from "@/components/NotificationCenter";

export default function NotificationsPage() {
  return (
    <main className="endurance-page">
      <AppHeader active="notifications" />

      <section className="endurance-shell page-hero compact">
        <p className="eyebrow">Inbox</p>
        <h1>Notifications</h1>
        <p>Training invites, team activity and important updates in one place.</p>
      </section>

      <section className="endurance-shell">
        <NotificationCenter />
      </section>

      <BottomNav />
    </main>
  );
}
