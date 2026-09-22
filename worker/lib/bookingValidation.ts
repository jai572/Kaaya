import { z } from "zod";
import { contactDetailsSchema } from "./validation";

export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
export const timeOnlySchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Expected HH:MM");

export const availabilityQuerySchema = z.object({
  service_id: z.string().uuid(),
  date: dateOnlySchema,
  staff_member_id: z.string().uuid().optional(),
});

export const lookupOrCreateCustomerSchema = z.object({
  contact: contactDetailsSchema,
});

export const createAppointmentSchema = z.object({
  client_id: z.string().uuid(),
  service_id: z.string().uuid(),
  staff_member_id: z.string().uuid(),
  start_at: z.string().datetime({ offset: true }),
});

export const linkAppointmentToConsultationSchema = z.object({
  consultation_id: z.string().uuid(),
  booking_reference: z.string().uuid(),
});

export const createServiceSchema = z.object({
  name: z.string().trim().min(1),
  category_slug: z.string().trim().min(1),
  treatment_id: z.string().uuid().nullable().optional(),
  tint_product_type: z.enum(["hair_dye", "other"]).nullable().optional(),
  eyelash_safe: z.boolean().nullable().optional(),
  price_amount: z.number().int().nonnegative(),
  price_currency: z.string().trim().length(3).default("GBP"),
  price_is_from: z.boolean().optional(),
  duration_minutes: z.number().int().positive().nullable().optional(),
  display_order: z.number().int().optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const updateServiceSchema = createServiceSchema.partial().extend({
  active: z.boolean().optional(),
});

export const createStaffMemberSchema = z.object({
  staff_profile_id: z.string().uuid().nullable().optional(),
  display_name: z.string().trim().min(1),
});

export const updateStaffMemberSchema = createStaffMemberSchema.partial().extend({
  active: z.boolean().optional(),
});

export const workingHoursBlockSchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_time: timeOnlySchema.nullable(),
  end_time: timeOnlySchema.nullable(),
});

export const setStaffWorkingHoursSchema = z.object({
  blocks: z.array(workingHoursBlockSchema),
});

export const setServiceStaffCapabilitySchema = z.object({
  staff_member_ids: z.array(z.string().uuid()),
});

export const setStaffPermissionsSchema = z.object({
  overrides: z.array(
    z.object({
      feature_key: z.enum([
        "manage_services",
        "manage_staff_members",
        "manage_service_capability",
        "view_all_bookings",
        "manage_all_bookings",
        "view_revenue",
      ]),
      granted: z.boolean().nullable(), // null = clear the override, back to role default
    })
  ),
});
