import type { SupabaseClient } from "@supabase/supabase-js";
import { toDayOfWeek } from "./availability";
import { effectiveShift, type RotaExceptionLike } from "./rota";

export type Shift = { startTime: string; endTime: string };

export interface LocationDay {
  location: { id: string; name: string; active: boolean } | null;
  shifts: Map<string, Shift | null>;
}

/** Each staff member's online-bookable hours at one location on one date:
 * regular rota, overridden by any dated exception, trimmed to the
 * location's opening hours. Three queries regardless of staff count. */
export async function loadShifts(
  admin: SupabaseClient,
  params: { staffMemberIds: string[]; locationId: string; dateIso: string }
): Promise<LocationDay> {
  const { staffMemberIds, locationId, dateIso } = params;
  const dayOfWeek = toDayOfWeek(dateIso);

  const [locationRes, openingRes, regularRes, exceptionRes] = await Promise.all([
    admin.from("locations").select("id, name, active").eq("id", locationId).maybeSingle(),
    admin.from("location_hours").select("open_time, close_time").eq("location_id", locationId).eq("day_of_week", dayOfWeek).maybeSingle(),
    staffMemberIds.length
      ? admin
          .from("staff_working_hours")
          .select("staff_member_id, start_time, end_time, location_id")
          .in("staff_member_id", staffMemberIds)
          .eq("day_of_week", dayOfWeek)
      : Promise.resolve({ data: [], error: null }),
    staffMemberIds.length
      ? admin
          .from("rota_exceptions")
          .select("staff_member_id, date, kind, location_id, start_time, end_time")
          .in("staff_member_id", staffMemberIds)
          .eq("date", dateIso)
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const res of [locationRes, openingRes, regularRes, exceptionRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const shifts = new Map<string, Shift | null>();
  for (const id of staffMemberIds) {
    const regular = (regularRes.data ?? []).find((r: { staff_member_id: string }) => r.staff_member_id === id) ?? null;
    const exception = ((exceptionRes.data ?? []) as (RotaExceptionLike & { staff_member_id: string })[]).find((e) => e.staff_member_id === id) ?? null;
    shifts.set(id, effectiveShift({ locationId, regular, exception, opening: openingRes.data ?? null }));
  }

  return { location: locationRes.data ?? null, shifts };
}

export async function getBookingWindowDays(admin: SupabaseClient): Promise<number> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "client_booking_window_days").maybeSingle();
  return typeof data?.value === "number" ? data.value : 90;
}
