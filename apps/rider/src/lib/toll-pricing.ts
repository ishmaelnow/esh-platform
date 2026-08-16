import type { TollCatalogRow } from "@esh-platform/maps";
import type { createServiceSupabaseClient } from "@esh-platform/supabase";

type ServiceClient = ReturnType<typeof createServiceSupabaseClient>;

type CatalogRecord = {
  authority_code: string;
  authority_name: string;
  facility_id: string;
  facility_code: string;
  facility_name: string;
  facility_type: string;
  alias_text: string;
  mapbox_type: string | null;
  rate_id: string;
  vehicle_class: string;
  payment_method: string;
  direction: string;
  amount_minor: number;
  currency_code: string;
  effective_from: string;
  effective_to: string | null;
  source_url: string;
  source_reference: string | null;
};

export async function loadTollCatalog(service: ServiceClient): Promise<TollCatalogRow[]> {
  const { data, error } = await service.from("toll_pricing_catalog").select(
    "authority_code,authority_name,facility_id,facility_code,facility_name,facility_type,alias_text,mapbox_type,rate_id,vehicle_class,payment_method,direction,amount_minor,currency_code,effective_from,effective_to,source_url,source_reference",
  );
  if (error) throw new Error("Toll pricing catalog is temporarily unavailable.");
  return ((data ?? []) as CatalogRecord[]).map((row) => ({
    authorityCode: row.authority_code,
    authorityName: row.authority_name,
    facilityId: row.facility_id,
    facilityCode: row.facility_code,
    facility: row.facility_name,
    facilityType: row.facility_type,
    aliasText: row.alias_text,
    mapboxType: row.mapbox_type,
    rateId: row.rate_id,
    vehicleClass: row.vehicle_class,
    paymentMethod: row.payment_method,
    direction: row.direction,
    amountMinor: row.amount_minor,
    currencyCode: row.currency_code,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    sourceUrl: row.source_url,
    sourceReference: row.source_reference,
  }));
}
