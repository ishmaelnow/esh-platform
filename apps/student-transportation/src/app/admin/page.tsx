import { StaffPortal } from "../../components/StaffPortal";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const { section } = await searchParams;
  return (
    <StaffPortal
      initialSection={
        section === "enrollment" || section === "administration" ? section : "requests"
      }
    />
  );
}
