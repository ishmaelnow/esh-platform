import Link from "next/link";

export function FoundationScreen({ audience }: { audience?: "guardian" | "operator" | "admin" }) {
  const enrollmentAvailable =
    !audience && process.env.NEXT_PUBLIC_STUDENT_ENROLLMENT_ENABLED === "true";
  const heading =
    audience === "guardian"
      ? "For families"
      : audience === "operator"
        ? "For operators"
        : audience === "admin"
          ? "Administration"
          : "School journeys, thoughtfully planned";
  return (
    <main>
      <header>
        <Link href="/" aria-label="ESH Student Transportation home">
          ESH <span>Student Transportation</span>
        </Link>
      </header>
      <section aria-labelledby="page-title">
        <p className="eyebrow">Student Transportation</p>
        <h1 id="page-title">{heading}</h1>
        <p className="intro">
          A dedicated service for families, schools and authorized transportation teams.
        </p>
        <div className="notice" role="status">
          <h2>Not open for bookings yet</h2>
          <p>
            {enrollmentAvailable
              ? "Enrollment is available by invitation through Families. Transportation requests remain unavailable."
              : "Enrollment and transportation requests are not available. No student information is collected here."}
          </p>
        </div>
        {!audience ? (
          <nav aria-label="Student Transportation entry">
            <Link href="/guardian">
              Families <span aria-hidden="true">→</span>
            </Link>
            <Link href="/operator">
              Operators <span aria-hidden="true">→</span>
            </Link>
            <Link href="/admin">
              Administration <span aria-hidden="true">→</span>
            </Link>
          </nav>
        ) : (
          <Link className="back" href="/">
            ← Home
          </Link>
        )}
      </section>
      <footer>ESH Student Transportation</footer>
    </main>
  );
}
