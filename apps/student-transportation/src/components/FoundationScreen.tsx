import Link from "next/link";

export function FoundationScreen({
  audience,
}: {
  audience?: "guardian" | "school" | "operator" | "admin";
}) {
  const enrollmentAvailable =
    !audience && process.env.NEXT_PUBLIC_STUDENT_ENROLLMENT_ENABLED === "true";
  const heading =
    audience === "guardian"
      ? "For parents"
      : audience === "school"
        ? "For schools"
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
            {audience === "guardian"
              ? "Parent access will be limited to tracking their own child’s ride. Tracking is not available yet; parents cannot enroll students here."
              : enrollmentAvailable
                ? "Enrollment is available to authorized school administrators. Transportation requests remain unavailable."
                : "Enrollment and transportation requests are not available. No student information is collected here."}
          </p>
        </div>
        {!audience ? (
          <nav aria-label="Student Transportation entry">
            <Link href="/school">
              Schools <span aria-hidden="true">→</span>
            </Link>
            <Link href="/guardian">
              Parent tracking <span aria-hidden="true">→</span>
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
