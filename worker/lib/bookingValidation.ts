import { z } from "zod";
import { contactDetailsSchema } from "./validation";

export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const availabilityQuerySchema = z.object({
  service_variation_id: z.string().min(1),
  date: dateOnlySchema,
  team_member_id: z.string().min(1).optional(),
});

export const lookupOrCreateCustomerSchema = z.object({
  contact: contactDetailsSchema,
});

export const createAppointmentSchema = z.object({
  client_id: z.string().uuid(),
  square_customer_id: z.string().min(1),
  square_service_id: z.string().min(1),
  square_service_variation_id: z.string().min(1),
  team_member_id: z.string().min(1),
  start_at: z.string().datetime({ offset: true }),
});

export const linkAppointmentToConsultationSchema = z.object({
  consultation_id: z.string().uuid(),
  square_booking_id: z.string().min(1),
});

export const createServiceMappingSchema = z.object({
  square_item_id: z.string().min(1),
  square_variation_id: z.string().min(1),
  treatment_id: z.string().uuid(),
  tint_product_type: z.enum(["hair_dye", "other"]).nullable().optional(),
  eyelash_safe: z.boolean().nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const updateServiceMappingSchema = createServiceMappingSchema.partial().extend({
  active: z.boolean().optional(),
});
