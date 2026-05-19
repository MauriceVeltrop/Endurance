// components/BottomNav.js
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BottomNav({ unreadCount = 0 }) {
  const pathname = usePathname();

  const items = [
    { href: "/trainings", label: "Trainings", icon: "⌁" },
    { href: "/routes", label: "Routes", icon: "◇" },
    { href: "/workouts", label: "Workouts", icon: "✦" },
    { href: "/team", label: "Team", icon: "👥" },
    { href: "/notifications", label: "Inbox", icon: "✉" },
  ];

  return (
    <nav className="endurance-bottom-nav" aria-label="Primary navigation">
      {items.map((item) => {
        const active = pathname?.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className={active ? "active" : ""}>
            <span className="nav-icon">
              {item.icon}
              {item.href === "/notifications" && unreadCount > 0 && (
                <strong className="nav-badge">{unreadCount}</strong>
              )}
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
