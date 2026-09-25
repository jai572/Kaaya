import { z } from "zod";
import { contactDetailsSchema } from "./validation";

export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
export const timeOnlySchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Expected HH:MM");

export const availabilityQuerySchema = z.object({
  service_id: z.string().uuid(),
  location_id: z.string().uuid({ message: "Choose a location" }),
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
  location_id: z.string().uuid({ message: "Choose a location" }),
  start_at: z.string().datetime({ offset: true }),
});

export const linkAppointmentToConsultationSchema = z.object({
  consultation_id: z.string().uuid(),
  booking_reference: z.string().uuid(),
});

export const appointmentReferenceQuerySchema = z.object({
  booking_reference: z.string().uuid(),
});

export const clientCancelAppointmentSchema = z.object({
  booking_reference: z.string().uuid(),
  reason: z.string().trim().max(2000).optional(),
});

export const clientRequestRescheduleSchema = z.object({
  booking_reference: z.string().uuid(),
  new_start_at: z.string().datetime({ offset: true }),
  new_staff_member_id: z.string().uuid().optional(),
});

export const staffCancelAppointmentSchema = z.object({
  reason: z.string().trim().max(2000).optional(),
});

export const staffRescheduleAppointmentSchema = z.object({
  new_start_at: z.string().datetime({ offset: true }),
  new_staff_member_id: z.string().uuid().optional(),
  allow_overlap: z.boolean().optional(),
});

export const resolveChangeRequestSchema = z.object({
  decision: z.enum(["approve", "reject"]),
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
  booking_mode: z.enum(["both", "bookable_only", "walk_in_only"]).optional(),
});

export const updateServiceSchema = createServiceSchema.partial().extend({
  active: z.boolean().optional(),
});

const colourSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colour must be a hex value like #1b8580");

export const createStaffMemberSchema = z.object({
  staff_profile_id: z.string().uuid().nullable().optional(),
  display_name: z.string().trim().min(1),
  colour: colourSchema.nullable().optional(),
});

export const updateStaffMemberSchema = createStaffMemberSchema.partial().extend({
  active: z.boolean().optional(),
});

export const workingHoursBlockSchema = z
  .object({
    day_of_week: z.number().int().min(0).max(6),
    start_time: timeOnlySchema.nullable(),
    end_time: timeOnlySchema.nullable(),
    location_id: z.string().uuid().nullable().optional(),
  })
  .refine((b) => !(b.start_time && b.end_time) || !!b.location_id, { message: "Pick a location for each working day" })
  .refine((b) => !(b.start_time && b.end_time) || b.end_time > b.start_time, { message: "End time must be after start time" });

export const setStaffWorkingHoursSchema = z.object({
  blocks: z.array(workingHoursBlockSchema),
});

const optionalText = z
  .string()
  .trim()
  .max(200)
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

export const locationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: optionalText,
  email: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), { message: "Enter a valid email" }),
  active: z.boolean().optional(),
  display_order: z.number().int().optional(),
});

export const updateLocationSchema = locationSchema.partial();

export const setLocationHoursSchema = z.object({
  days: z.array(
    z
      .object({
        day_of_week: z.number().int().min(0).max(6),
        open_time: timeOnlySchema.nullable(),
        close_time: timeOnlySchema.nullable(),
      })
      .refine((d) => !(d.open_time && d.close_time) || d.close_time > d.open_time, {
        message: "Closing time must be after opening time",
      })
  ),
});

export const bookingSettingsSchema = z.object({
  client_booking_window_days: z.number().int().min(1).max(730),
});

export const setStaffServicesSchema = z.object({
  service_ids: z.array(z.string().uuid()),
});

export const createRotaExceptionSchema = z
  .object({
    staff_member_id: z.string().uuid(),
    from_date: dateOnlySchema,
    to_date: dateOnlySchema,
    kind: z.enum(["off", "working"]),
    location_id: z.string().uuid().nullable().optional(),
    start_time: timeOnlySchema.nullable().optional(),
    end_time: timeOnlySchema.nullable().optional(),
    reason: z.string().trim().max(200).nullable().optional(),
  })
  .refine((e) => e.to_date >= e.from_date, { message: "End date must be on or after start date" })
  .refine(
    (e) =>
      e.kind === "off" ||
      (!!e.location_id && !!e.start_time && !!e.end_time && (e.end_time as string) > (e.start_time as string)),
    { message: "Working days need a location and a start time before the end time" }
  );

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
        "manage_locations",
        "adjust_sales",
      ]),
      granted: z.boolean().nullable(), // null = clear the override, back to role default
    })
  ),
});

export const calendarQuerySchema = z
  .object({
    location_id: z.string().uuid({ message: "Choose a location" }),
    from: dateOnlySchema,
    to: dateOnlySchema,
  })
  .refine((q) => q.to >= q.from, { message: "End date must be on or after start date" });

export const staffCreateAppointmentsSchema = z.object({
  client_id: z.string().uuid(),
  location_id: z.string().uuid(),
  link_appointment_id: z.string().uuid().nullable().optional(),
  confirm_warnings: z.boolean().optional(),
  parts: z
    .array(
      z.object({
        staff_member_id: z.string().uuid(),
        start_at: z.string().datetime({ offset: true }),
        service_ids: z.array(z.string().uuid()).min(1, "Pick at least one treatment").max(12),
      })
    )
    .min(1)
    .max(6),
});

export const createTimeBlockSchema = z
  .object({
    staff_member_id: z.string().uuid(),
    location_id: z.string().uuid(),
    start_at: z.string().datetime({ offset: true }),
    end_at: z.string().datetime({ offset: true }),
    reason: z.enum(["break", "lunch", "personal", "training", "other"]),
    note: z.string().trim().max(200).nullable().optional(),
  })
  .refine((b) => Date.parse(b.end_at) > Date.parse(b.start_at), { message: "End time must be after start time" })
  .refine((b) => Date.parse(b.end_at) - Date.parse(b.start_at) <= 16 * 3600000, { message: "Blocked time can't be longer than a day" });

export const staffCreateClientSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(100),
  last_name: z.string().trim().max(100).default(""),
  phone: z.string().trim().min(5, "Phone number is required").max(40),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .nullable()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), { message: "Enter a valid email" }),
});

export const checkoutSchema = z
  .object({
    location_id: z.string().uuid(),
    client_id: z.string().uuid().nullable().optional(),
    appointment_ids: z.array(z.string().uuid()).max(10).default([]),
    items: z
      .array(
        z.object({
          service_id: z.string().uuid().nullable().optional(),
          appointment_id: z.string().uuid().nullable().optional(),
          staff_member_id: z.string().uuid().nullable().optional(),
          description: z.string().trim().min(1).max(200),
          quantity: z.number().int().min(1).max(50).default(1),
          unit_price_amount: z.number().int().min(0).max(1_000_000),
        })
      )
      .min(1, "Add at least one item")
      .max(40),
    discount_amount: z.number().int().min(0).default(0),
    payment_method: z.enum(["cash", "card", "voucher", "other"]),
    payment_note: z
      .string()
      .trim()
      .max(200)
      .nullable()
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .refine((c) => c.payment_method !== "voucher" || !!c.payment_note, { message: "Enter the voucher number" })
  .refine((c) => c.items.every((i) => !i.appointment_id || c.appointment_ids.includes(i.appointment_id)), {
    message: "Item belongs to an appointment that isn't being checked out",
  });

export const voidSaleSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason for voiding").max(300),
});

export const dailySalesQuerySchema = z.object({
  location_id: z.string().uuid({ message: "Choose a location" }),
  date: dateOnlySchema,
});
