import type { Env } from "../env";
import { json, errorResponse } from "../lib/http";

// TEMPORARY, sandbox-only seeding helper — creates one bookable test
// service via Square's Catalog API so the booking flow can be tested
// end-to-end. Removed again right after use; never touches production
// Square (SQUARE_ENVIRONMENT must be "sandbox").
export async function seedSandboxCatalogItem(env: Env): Promise<Response> {
  if (env.SQUARE_ENVIRONMENT !== "sandbox") {
    return errorResponse("Refusing to seed catalog data outside sandbox", 400);
  }

  const base = "https://connect.squareupsandbox.com";
  const headers = {
    Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
    "Square-Version": "2026-09-16",
    "Content-Type": "application/json",
  };

  const teamRes = await fetch(`${base}/v2/bookings/team-member-booking-profiles?bookable_only=true`, { headers });
  const teamBody: any = await teamRes.json();
  if (!teamRes.ok) return errorResponse(JSON.stringify(teamBody), teamRes.status);
  const teamMemberId = teamBody.team_member_booking_profiles?.[0]?.team_member_id;
  if (!teamMemberId) return errorResponse("No bookable team member found in sandbox", 400);

  const catalogRes = await fetch(`${base}/v2/catalog/object`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      idempotency_key: crypto.randomUUID(),
      object: {
        type: "ITEM",
        id: "#claude-e2e-test-treatment",
        item_data: {
          name: "Claude E2E Test Treatment",
          product_type: "APPOINTMENTS_SERVICE",
          variations: [
            {
              type: "ITEM_VARIATION",
              id: "#claude-e2e-test-treatment-standard",
              item_variation_data: {
                item_id: "#claude-e2e-test-treatment",
                name: "Standard",
                pricing_type: "FIXED_PRICING",
                price_money: { amount: 2000, currency: "GBP" },
                service_duration: 1800000,
                team_member_ids: [teamMemberId],
              },
            },
          ],
        },
      },
    }),
  });
  const catalogBody: any = await catalogRes.json();
  if (!catalogRes.ok) return errorResponse(JSON.stringify(catalogBody), catalogRes.status);

  return json({ created: catalogBody.catalog_object, teamMemberId });
}
