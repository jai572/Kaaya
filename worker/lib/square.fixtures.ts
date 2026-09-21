import type {
  SquareClient,
  SquareBookableVariation,
  SquareTeamMember,
  SquareAvailabilitySlot,
  SquareCustomer,
  SquareBooking,
} from "./square";

// Fixture data used only when env.SQUARE_MOCK_MODE === "true" (local dev,
// via .dev.vars — never wrangler.jsonc/production). Lets the whole booking
// flow be built and manually walked through before real Square credentials
// exist. Availability is computed relative to "now" so it always looks live.

const TINT_ITEM_ID = "fixture-item-tinting";
const LASH_ITEM_ID = "fixture-item-lashes";

const VARIATIONS: SquareBookableVariation[] = [
  {
    squareItemId: TINT_ITEM_ID,
    squareVariationId: "fixture-variation-tint-eyebrow",
    serviceName: "Tinting",
    variationName: "Eyebrow",
    priceAmount: 900,
    priceCurrency: "GBP",
    durationMinutes: 15,
    version: 1,
    teamMemberIds: ["fixture-team-nina", "fixture-team-priya"],
  },
  {
    squareItemId: TINT_ITEM_ID,
    squareVariationId: "fixture-variation-tint-eyelash",
    serviceName: "Tinting",
    variationName: "Eyelash",
    priceAmount: 1400,
    priceCurrency: "GBP",
    durationMinutes: 20,
    version: 1,
    teamMemberIds: ["fixture-team-nina"],
  },
  {
    squareItemId: LASH_ITEM_ID,
    squareVariationId: "fixture-variation-lash-lift",
    serviceName: "Eyelash Lift & Curl with Tint",
    variationName: "Standard",
    priceAmount: 4000,
    priceCurrency: "GBP",
    durationMinutes: 45,
    version: 1,
    teamMemberIds: ["fixture-team-priya"],
  },
];

const TEAM_MEMBERS: SquareTeamMember[] = [
  { id: "fixture-team-nina", displayName: "Nina" },
  { id: "fixture-team-priya", displayName: "Priya" },
];

const FIXTURE_CUSTOMER_EMAIL = "returning.customer@example.com";
const FIXTURE_CUSTOMER: SquareCustomer = {
  id: "fixture-customer-1",
  givenName: "Jamie",
  familyName: "Returning",
  emailAddress: FIXTURE_CUSTOMER_EMAIL,
  phoneNumber: "+447700900000",
};

let mockCustomerSeq = 0;
let mockBookingSeq = 0;

export function createMockSquareClient(): SquareClient {
  return {
    async listBookableServices() {
      return VARIATIONS;
    },

    async listTeamMembers(serviceVariationId) {
      if (!serviceVariationId) return TEAM_MEMBERS;
      const variation = VARIATIONS.find((v) => v.squareVariationId === serviceVariationId);
      const allowed = new Set(variation?.teamMemberIds ?? []);
      return TEAM_MEMBERS.filter((m) => allowed.has(m.id));
    },

    async searchAvailability({ serviceVariationId, date, teamMemberId }) {
      const variation = VARIATIONS.find((v) => v.squareVariationId === serviceVariationId);
      if (!variation) return [];
      const candidateTeamMembers = teamMemberId
        ? variation.teamMemberIds.filter((id) => id === teamMemberId)
        : variation.teamMemberIds;

      const slots: SquareAvailabilitySlot[] = [];
      for (const memberId of candidateTeamMembers) {
        for (const hour of [10, 11, 14, 15, 16]) {
          slots.push({
            startAt: `${date}T${String(hour).padStart(2, "0")}:00:00Z`,
            locationId: "fixture-location",
            teamMemberId: memberId,
            serviceVariationId,
            serviceVariationVersion: variation.version,
            durationMinutes: variation.durationMinutes ?? 30,
          });
        }
      }
      return slots;
    },

    async searchCustomerByEmail(email) {
      return email.toLowerCase() === FIXTURE_CUSTOMER_EMAIL ? FIXTURE_CUSTOMER : null;
    },

    async createCustomer(input) {
      mockCustomerSeq += 1;
      return {
        id: `fixture-customer-new-${mockCustomerSeq}`,
        givenName: input.givenName,
        familyName: input.familyName,
        emailAddress: input.emailAddress,
        phoneNumber: input.phoneNumber,
      };
    },

    async createBooking(input) {
      mockBookingSeq += 1;
      return {
        id: `fixture-booking-${mockBookingSeq}`,
        status: "ACCEPTED",
        startAt: input.startAt,
      } satisfies SquareBooking;
    },

    async getServiceVariation(variationId) {
      const variation = VARIATIONS.find((v) => v.squareVariationId === variationId);
      if (!variation) throw new Error(`Unknown fixture variation: ${variationId}`);
      return variation;
    },
  };
}
