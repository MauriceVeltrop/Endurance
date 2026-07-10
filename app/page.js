import Link from "next/link";
import styles from "./home.module.css";

const FEATURES = [
  {
    number: "01",
    title: "Find training partners",
    text: "Discover athletes nearby who match your sport, pace and availability.",
  },
  {
    number: "02",
    title: "Plan sessions and routes",
    text: "Create trainings, draw or import routes and keep every detail in one place.",
  },
  {
    number: "03",
    title: "Build your community",
    text: "Connect through verified profiles, teams, invitations and direct chat.",
  },
];

export default function HomePage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <img src="/logo-endurance.png" alt="Endurance" className={styles.logo} />
          <Link href="/login" className={styles.headerLink}>
            Sign in
          </Link>
        </header>

        <section className={styles.hero}>
          <div>
            <p className={styles.kicker}>Verified social training platform</p>
            <h1 className={styles.title}>
              Train together.
              <br />
              <span className={styles.titleAccent}>Perform better.</span>
            </h1>
            <p className={styles.subtitle}>
              Find athletes, plan sessions and share routes in one training-first community.
            </p>

            <div className={styles.actions}>
              <Link href="/login" className={styles.primary}>
                Get started
              </Link>
              <a href="#features" className={styles.secondary}>
                Explore the platform
              </a>
            </div>

            <div className={styles.trustRow} aria-label="Platform highlights">
              <span>Verified profiles</span>
              <span>Sport-specific routes</span>
              <span>Local training teams</span>
            </div>
          </div>

          <div className={styles.visual} aria-label="Endurance sports preview">
            <div className={styles.photoMain}>
              <img src="/route-images/running.jpg" alt="Athlete training outdoors" />
            </div>
            <div className={styles.photoSmall}>
              <img src="/route-images/road-cycling.jpg" alt="Road cyclist training" />
            </div>
            <div className={styles.floatingCard}>
              <div className={styles.floatingLabel}>Training nearby</div>
              <div className={styles.floatingTitle}>(Trail)Running • Landgraaf</div>
              <div className={styles.floatingMeta}>Team session · route ready · athletes wanted</div>
            </div>
          </div>
        </section>

        <section id="features" className={styles.features}>
          <div className={styles.sectionKicker}>Built around training</div>
          <h2 className={styles.sectionTitle}>Everything needed to turn an idea into a shared session.</h2>

          <div className={styles.featureGrid}>
            {FEATURES.map((feature) => (
              <article key={feature.number} className={styles.featureCard}>
                <div className={styles.featureNumber}>{feature.number}</div>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>

          <div className={styles.footerCta}>
            <div>
              <strong>I want to train. Who joins?</strong>
              <span>Create your profile and start building your training network.</span>
            </div>
            <Link href="/login" className={styles.footerButton}>
              Open Endurance
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
