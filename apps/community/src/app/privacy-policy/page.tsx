import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | ESH Community",
  description: "Privacy information for ESH Community.",
};

export default function CommunityPrivacyPolicy() {
  return (
    <main className="community-shell policy-shell">
      <nav className="community-top-nav" aria-label="Privacy policy navigation">
        <a className="community-wordmark" href="/">
          <span aria-hidden="true">C</span>
          <strong>ESH Community</strong>
        </a>
        <a className="secondary policy-home-link" href="/">Return to Community</a>
      </nav>
      <article className="community-card policy-card">
        <p className="eyebrow">ESH Community</p>
        <h1>Community Privacy Policy</h1>
        <p className="policy-updated">Last updated: September 6, 2026</p>
        <p>This policy explains how ESH Community handles information when you browse public Community information, request membership, or participate as an approved member.</p>
        <h2>Information we handle</h2>
        <ul>
          <li>Account and sign-in information, including your email address used for passwordless sign-in links.</li>
          <li>Membership requests and the name, locality, and reason you choose to provide.</li>
          <li>Member profile information, profile photos, interests, skills, links, and services you choose to add.</li>
          <li>Posts, announcements, media, feedback, and other content you submit.</li>
          <li>Technical information needed to secure, operate, and improve the service.</li>
        </ul>
        <h2>How information is used</h2>
        <p>We use this information to provide sign-in, review membership, display content according to its visibility setting, operate Community features, prevent abuse, respond to requests, and maintain the security and reliability of the service.</p>
        <h2>Visibility and sharing</h2>
        <p>Public posts and profile items marked public may be visible to anyone. Member-only content is limited according to Community access controls. We do not make your email address public as part of your Community profile. Information may be shared with service providers that help operate ESH Platform, subject to appropriate safeguards.</p>
        <h2>Your choices</h2>
        <p>You can update or remove profile information and profile items through Community controls. You can request help with access or deletion through the contact process in the <a href="https://fairfareride.com/privacy-policy">ESH company privacy policy</a>.</p>
        <h2>Company policy and contact</h2>
        <p>This Community policy supplements the ESH company privacy policy. For additional details, rights, retention information, and privacy contact options, review the <a href="https://fairfareride.com/privacy-policy">ESH company privacy policy</a>.</p>
      </article>
    </main>
  );
}
