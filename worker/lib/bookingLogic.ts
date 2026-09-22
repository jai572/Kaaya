// Pure logic pulled out of the booking routes so it can be unit-tested
// without a real Square or Supabase connection.

export interface ServiceMappingRow {
  square_variation_id: string;
  treatment_id: string;
  tint_product_type: "hair_dye" | "other" | null;
  eyelash_safe: boolean | null;
}

// Joins Square's live catalog data with whichever Kaaya screening treatment
// (if any) staff have mapped each variation to. Square stays authoritative
// for the variation fields themselves — this only decorates them.
export function attachServiceMappings<T extends { squareVariationId: string }>(
  variations: T[],
  mappings: ServiceMappingRow[]
): (T & { mapping: ServiceMappingRow | null })[] {
  const byVariation = new Map(mappings.map((m) => [m.square_variation_id, m]));
  return variations.map((v) => ({ ...v, mapping: byVariation.get(v.squareVariationId) ?? null }));
}

// What gets snapshotted onto the appointments row at booking time — a
// point-in-time record of what was actually booked, distinct from treating
// it as an ongoing source of truth (Square stays that).
export function buildServiceNameSnapshot(serviceName: string, variationName: string): string {
  return variationName ? `${serviceName} - ${variationName}` : serviceName;
}
