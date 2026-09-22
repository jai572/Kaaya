import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getBookableServices,
  getAvailability,
  getBookingStaff,
  lookupOrCreateBookingCustomer,
  createBookingAppointment,
  type BookableService,
  type StaffMember,
  type AvailabilitySlot,
} from "../../lib/api";
import { formatMoney, formatDuration, todayIso, filterSlotsByStaffMember } from "../../lib/bookingFormat";

const STEPS = ["service", "date", "time", "contact", "summary"] as const;
type Step = (typeof STEPS)[number];

export default function BookingForm() {
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const step: Step = STEPS[stepIndex];

  const [services, setServices] = useState<BookableService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);

  const [date, setDate] = useState(todayIso());

  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedStaffMemberId, setSelectedStaffMemberId] = useState<string | null>(null); // null = any
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);

  const [contact, setContact] = useState({ first_name: "", last_name: "", email: "", phone: "" });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBookableServices()
      .then((res) => setServices(res.services))
      .catch(() => setServicesError("Could not load treatments. Please try again."))
      .finally(() => setServicesLoading(false));
  }, []);

  const selectedService = services.find((s) => s.id === selectedServiceId) ?? null;
  const bookableOnline = !!selectedService?.duration_minutes;

  useEffect(() => {
    if (!selectedServiceId) return;
    getBookingStaff(selectedServiceId)
      .then((res) => setStaffMembers(res.staff))
      .catch(() => setStaffMembers([]));
  }, [selectedServiceId]);

  // Availability is always fetched for "any available staff member" — picking
  // a specific one just filters these same slots client-side, no extra round
  // trip, since each slot already names a concrete staff member.
  useEffect(() => {
    if (step !== "time" || !selectedServiceId || !bookableOnline) return;
    setSlotsLoading(true);
    setSlotsError(null);
    setSelectedSlot(null);
    getAvailability(selectedServiceId, date)
      .then((res) => setSlots(res.slots))
      .catch(() => setSlotsError("Could not load availability. Please try a different date."))
      .finally(() => setSlotsLoading(false));
  }, [step, selectedServiceId, date, bookableOnline]);

  const visibleSlots = filterSlotsByStaffMember(slots, selectedStaffMemberId);
  const slotStaffMemberIds = useMemo(() => new Set(slots.map((s) => s.staffMemberId)), [slots]);
  const availableStaffMembers = staffMembers.filter((m) => slotStaffMemberIds.has(m.id));

  const contactComplete =
    contact.first_name.trim().length > 0 &&
    contact.last_name.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()) &&
    contact.phone.trim().length >= 5;

  const canAdvance = (() => {
    switch (step) {
      case "service":
        return !!selectedServiceId;
      case "date":
        return bookableOnline && !!date;
      case "time":
        return bookableOnline && !!selectedSlot;
      case "contact":
        return contactComplete;
      case "summary":
        return true;
    }
  })();

  async function handleConfirm() {
    if (!selectedService || !selectedSlot) return;
    setSubmitting(true);
    setError(null);
    try {
      const { client_id } = await lookupOrCreateBookingCustomer(contact);
      const { appointment_id, booking_reference, summary } = await createBookingAppointment({
        client_id,
        service_id: selectedService.id,
        staff_member_id: selectedSlot.staffMemberId,
        start_at: selectedSlot.startAt,
      });

      navigate(`/book/${appointment_id}/confirmed`, {
        state: { appointmentId: appointment_id, bookingReference: booking_reference, clientId: client_id, contact, summary },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function goNext() {
    if (step === "summary") {
      handleConfirm();
      return;
    }
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  function goBack() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  return (
    <div className="kaaya-shell">
      <div className="kaaya-header">
        <h1>Kaaya</h1>
        <p>Book an appointment</p>
      </div>

      <p style={{ textAlign: "center", color: "var(--kaaya-text-muted)", fontSize: "0.85rem", marginTop: 0 }}>
        Step {stepIndex + 1} of {STEPS.length}
      </p>
      <div
        className="kaaya-progress"
        role="progressbar"
        aria-valuenow={stepIndex + 1}
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
      >
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={
              "kaaya-progress__step " +
              (i < stepIndex ? "kaaya-progress__step--done" : i === stepIndex ? "kaaya-progress__step--current" : "")
            }
          />
        ))}
      </div>

      {step === "service" && (
        <div className="kaaya-card">
          <p style={{ color: "var(--kaaya-text-muted)", marginTop: 0 }}>Choose a treatment.</p>
          {servicesLoading && <p>Loading treatments…</p>}
          {servicesError && <p className="kaaya-error">{servicesError}</p>}
          {!servicesLoading && !servicesError && services.length === 0 && (
            <p>No treatments are available online right now — please call to book.</p>
          )}
          {!servicesLoading &&
            !servicesError &&
            services.map((s) => (
              <div
                key={s.id}
                className="kaaya-treatment-option"
                data-selected={selectedServiceId === s.id}
                onClick={() => setSelectedServiceId(s.id)}
              >
                <input type="radio" checked={selectedServiceId === s.id} readOnly />
                <span>
                  {s.name}
                  <br />
                  <small style={{ color: "var(--kaaya-text-muted)" }}>
                    {s.price_is_from ? "from " : ""}
                    {formatMoney(s.price_amount, s.price_currency)}
                    {s.duration_minutes ? ` · ${formatDuration(s.duration_minutes)}` : " · call to book"}
                  </small>
                </span>
              </div>
            ))}
        </div>
      )}

      {step === "date" && (
        <div className="kaaya-card">
          {!bookableOnline ? (
            <p>
              This treatment isn't available for online time-slot booking yet — please call or WhatsApp to book it
              directly.
            </p>
          ) : (
            <div className="kaaya-field">
              <label htmlFor="booking-date">Choose a date</label>
              <input id="booking-date" type="date" min={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          )}
        </div>
      )}

      {step === "time" && bookableOnline && (
        <div className="kaaya-card">
          {staffMembers.length > 1 && (
            <div className="kaaya-field">
              <label>Staff member</label>
              <div className="kaaya-yesno">
                <button
                  type="button"
                  aria-pressed={selectedStaffMemberId === null}
                  onClick={() => setSelectedStaffMemberId(null)}
                >
                  Any available
                </button>
                {availableStaffMembers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={selectedStaffMemberId === m.id}
                    onClick={() => setSelectedStaffMemberId(m.id)}
                  >
                    {m.display_name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {slotsLoading && <p>Loading availability…</p>}
          {slotsError && <p className="kaaya-error">{slotsError}</p>}
          {!slotsLoading && !slotsError && visibleSlots.length === 0 && (
            <p>No availability on this date. Try a different date.</p>
          )}
          {!slotsLoading &&
            !slotsError &&
            visibleSlots.map((slot) => {
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
        </div>
      )}

      {step === "contact" && (
        <div className="kaaya-card">
          <div className="kaaya-field">
            <label htmlFor="booking-first-name">First name</label>
            <input
              id="booking-first-name"
              type="text"
              value={contact.first_name}
              onChange={(e) => setContact((c) => ({ ...c, first_name: e.target.value }))}
            />
          </div>
          <div className="kaaya-field">
            <label htmlFor="booking-last-name">Last name</label>
            <input
              id="booking-last-name"
              type="text"
              value={contact.last_name}
              onChange={(e) => setContact((c) => ({ ...c, last_name: e.target.value }))}
            />
          </div>
          <div className="kaaya-field">
            <label htmlFor="booking-email">Email</label>
            <input
              id="booking-email"
              type="email"
              value={contact.email}
              onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
            />
          </div>
          <div className="kaaya-field">
            <label htmlFor="booking-phone">Mobile</label>
            <input
              id="booking-phone"
              type="tel"
              value={contact.phone}
              onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
            />
          </div>
        </div>
      )}

      {step === "summary" && selectedService && selectedSlot && (
        <div className="kaaya-card">
          <h2 style={{ marginTop: 0 }}>Booking summary</h2>
          <table className="kaaya-table">
            <tbody>
              <tr>
                <th>Treatment</th>
                <td>{selectedService.name}</td>
              </tr>
              <tr>
                <th>Date &amp; time</th>
                <td>
                  {new Date(selectedSlot.startAt).toLocaleString("en-GB", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
              </tr>
              <tr>
                <th>Staff member</th>
                <td>{selectedSlot.staffMemberName}</td>
              </tr>
              <tr>
                <th>Duration</th>
                <td>{formatDuration(selectedService.duration_minutes)}</td>
              </tr>
              <tr>
                <th>Price</th>
                <td>
                  {selectedService.price_is_from ? "from " : ""}
                  {formatMoney(selectedService.price_amount, selectedService.price_currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {error && (
        <p className="kaaya-error" role="alert" aria-live="assertive">
          {error}
        </p>
      )}

      <div className="kaaya-btn-row">
        {stepIndex > 0 && (
          <button className="kaaya-btn kaaya-btn--secondary" onClick={goBack} disabled={submitting}>
            Back
          </button>
        )}
        <button className="kaaya-btn" onClick={goNext} disabled={!canAdvance || submitting}>
          {submitting ? "Please wait…" : step === "summary" ? "Confirm booking" : "Continue"}
        </button>
      </div>
    </div>
  );
}
