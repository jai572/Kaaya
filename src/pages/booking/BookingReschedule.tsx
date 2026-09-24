import { useEffect, useState } from "react";
import { getAvailability, clientRequestReschedule, type AvailabilitySlot } from "../../lib/api";
import { todayIso } from "../../lib/bookingFormat";

interface BookingRescheduleProps {
  appointmentId: string;
  bookingReference: string;
  serviceId: string;
  locationId: string | null;
  onDone: (result: { status: "rescheduled" | "pending_staff_approval" }) => void;
  onCancel: () => void;
}

export default function BookingReschedule({ appointmentId, bookingReference, serviceId, locationId, onDone, onCancel }: BookingRescheduleProps) {
  const [date, setDate] = useState(todayIso());
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedSlot(null);
    if (!locationId) {
      setSlots([]);
      setSlotsError("This booking has no location on record. Please contact us to change it.");
      return;
    }
    setSlotsLoading(true);
    setSlotsError(null);
    getAvailability(serviceId, locationId, date)
      .then((res) => setSlots(res.slots))
      .catch(() => setSlotsError("Could not load availability. Please try a different date."))
      .finally(() => setSlotsLoading(false));
  }, [serviceId, locationId, date]);

  async function confirm() {
    if (!selectedSlot) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await clientRequestReschedule(appointmentId, bookingReference, selectedSlot.startAt, selectedSlot.staffMemberId);
      onDone({ status: res.status === "rescheduled" ? "rescheduled" : "pending_staff_approval" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not request a reschedule. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="kaaya-card">
      <p style={{ color: "var(--kaaya-text-muted)", marginTop: 0 }}>Choose a new date and time.</p>

      <div className="kaaya-field">
        <label htmlFor="reschedule-date">New date</label>
        <input id="reschedule-date" type="date" min={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {slotsLoading && <p>Loading availability…</p>}
      {slotsError && <p className="kaaya-error">{slotsError}</p>}
      {!slotsLoading && !slotsError && slots.length === 0 && <p>No availability on this date. Try a different date.</p>}
      {!slotsLoading &&
        !slotsError &&
        slots.map((slot) => {
          const time = new Date(slot.startAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
          return (
            <div
              key={`${slot.staffMemberId}-${slot.startAt}`}
              className="kaaya-list-row"
              data-selected={selectedSlot === slot}
              onClick={() => setSelectedSlot(slot)}
              style={{ cursor: "pointer" }}
            >
              <strong>{time}</strong>
              <span style={{ marginLeft: 8, color: "var(--kaaya-text-muted)" }}>{slot.staffMemberName}</span>
            </div>
          );
        })}

      {error && <p className="kaaya-error">{error}</p>}

      <div className="kaaya-btn-row">
        <button type="button" className="kaaya-btn kaaya-btn--secondary" onClick={onCancel} disabled={submitting}>
          Back
        </button>
        <button type="button" className="kaaya-btn" onClick={confirm} disabled={!selectedSlot || submitting}>
          {submitting ? "Requesting…" : "Confirm new time"}
        </button>
      </div>
    </div>
  );
}
