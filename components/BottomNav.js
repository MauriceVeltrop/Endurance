"use client";

import { usePathname, useRouter } from "next/navigation";

const items = [
  { href: "/trainings", label: "Train", icon: "⚡" },
  { href: "/trainings/new", label: "Create", icon: "+" },
  { href: "/profile", label: "Profile", icon: "◉" },
];

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <nav style={styles.nav} aria-label="Primary navigation">
      {items.map((item) => {
        const active = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href + "/"));
        return (
          <button
            key={item.href}
            type="button"
            onClick={() => router.push(item.href)}
            style={active ? styles.itemActive : styles.item}
            aria-current={active ? "page" : undefined}
          >
            <span style={active ? styles.iconActive : styles.icon}>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

const base = {
  border: 0,
  cursor: "pointer",
  fontWeight: 950,
  fontFamily: "inherit",
};

const styles = {
  nav: {
    position: "fixed",
    left: "50%",
    bottom: 14,
    transform: "translateX(-50%)",
    zIndex: 30,
    width: "min(420px, calc(100vw - 28px))",
    minHeight: 66,
    padding: 7,
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 6,
    borderRadius: 26,
    background: "linear-gradient(145deg, rgba(18,24,18,0.90), rgba(5,7,5,0.82))",
    border: "1px solid rgba(255,255,255,0.13)",
    boxShadow: "0 18px 60px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.06)",
    backdropFilter: "blur(22px)",
  },
  item: {
    ...base,
    borderRadius: 20,
    background: "transparent",
    color: "rgba(255,255,255,0.62)",
    display: "grid",
    placeItems: "center",
    gap: 2,
    fontSize: 11,
    letterSpacing: "-0.01em",
  },
  itemActive: {
    ...base,
    borderRadius: 20,
    background: "rgba(228,239,22,0.13)",
    color: "#e4ef16",
    display: "grid",
    placeItems: "center",
    gap: 2,
    fontSize: 11,
    letterSpacing: "-0.01em",
    border: "1px solid rgba(228,239,22,0.22)",
  },
  icon: { fontSize: 17, lineHeight: 1 },
  iconActive: { fontSize: 18, lineHeight: 1 },
};
