import { redirect } from "next/navigation";

export default async function LegacyTransportDriverApplication({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  redirect(`/apply/driver/${encodeURIComponent(tenantSlug)}`);
}
