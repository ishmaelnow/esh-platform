"use client";
import { useEffect, useState } from "react";

type TenantOption = { tenant_slug: string; display_name: string };

export default function TransportApplicationDirectory() {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  useEffect(() => {
    void fetch("/api/applications/transport/tenants")
      .then((response) => response.json())
      .then((data: { tenants?: TenantOption[] }) => setTenants(data.tenants ?? []));
  }, []);
  return (
    <main className="auth-shell">
      <section className="panel">
        <h1>Apply to drive</h1>
        <p>Select the transportation company you want to apply to.</p>
        <div className="content-stack">
          {tenants.map((tenant) => (
            <a
              className="primary-button"
              href={`/apply/driver/${tenant.tenant_slug}`}
              key={tenant.tenant_slug}
            >
              {tenant.display_name}
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
