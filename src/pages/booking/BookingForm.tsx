import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getBookableServices,
  getAvailability,
  getBookingTeamMembers,
  lookupOrCreateBookingCustomer,
  createBookingAppointment,
  type BookableService,
  type TeamMember,
  type AvailabilitySlot,
} from "../../lib/api";

const STEPS = ["service", "date", "time", "contact", "summary"] as const;
type Step = (typeof STEPS)[number];

function formatMoney(amount: number | null, currency: string | null): string {
  if (amount == null || !currency) return "Price on request";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount / 100);
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return "";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function BookingForm() {
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const step: Step = STEPS[stepIndex];

  const [services, setServices] = useState<BookableService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [selectedVariationId, setSelectedVariationId] = useState<string | null>(null);

  const [date, setDate] = useState(todayIso());

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedTeamMemberId, setSelectedTeamMemberId] = useState<string | null>(null); // null = any
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

  const selectedService = services.find((s) => s.squareVariationId === selectedVariationId) ?? null;

  useEffect(() => {
    if (!selectedVariationId) return;
    getBookingTeamMembers(selectedVariationId)
      .then((res) => setTeamMembers(res.teamMembers))
      .catch(() => setTeamMembers([]));
  }, [selectedVariationId]);

  // Availability is always fetched for "any available therapist" — picking a
  // specific one just filters these same slots client-side, no extra round
  // trip, since each slot Square returns already names a concrete therapist.
  useEffect(() => {
    if (step !== "time" || !selectedVariationId) return;
    setSlotsLoading(true);
    setSlotsError(null);
    setSelectedSlot(null);
    getAvailability(selectedVariationId, date)
      .then((res) => setSlots(res.slots))
      .catch(() => setSlotsError("Could not load availability. Please try a different date."))
      .finally(() => setSlotsLoading(false));
  }, [step, selectedVariationId, date]);

  const visibleSlots = selectedTeamMemberId ? slots.filter((s) => s.teamMemberId === selectedTeamMemberId) : slots;
  const slotTeamMemberIds = useMemo(() => new Set(slots.map((s) => s.teamMemberId)), [slots]);
  const availableTeamMembers = teamMembers.filter((m) => slotTeamMemberIds.has(m.id));

  const contactComplete =
    contact.first_name.trim().length > 0 &&
    contact.last_name.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()) &&
    contact.phone.trim().length >= 5;

  const canAdvance = (() => {
    switch (step) {
      case "service":
        return !!selectedVariationId;
      case "date":
        return !!date;
      case "time":
        return !!selectedSlot;
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
      const { client_id, square_customer_id } = await lookupOrCreateBookingCustomer(contact);
      const { appointment_id, square_booking_id, summary } = await createBookingAppointment({
        client_id,
        square_customer_id,
        square_service_id: selectedService.squareItemId,
        square_service_variation_id: selectedService.squareVariationId,
        team_member_id: selectedSlot.teamMemberId,
        start_at: selectedSlot.startAt,
      });

      navigate(`/book/${appointment_id}/confirmed`, {
        state: {
          appointmentId: appointment_id,
          squareBookingId: square_booking_id,
          clientId: client_id,
          contact,
          summary,
        },
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
            <p>No bookable treatments are available online right now — please call to book.</p>
          )}
          {!servicesLoading &&
            !servicesError &&
            services.map((s) => (
              <div
                key={s.squareVariationId}
                className="kaaya-treatment-option"
                data-selected={selectedVariationId === s.squareVariationId}
                onClick={() => setSelectedVariationId(s.squareVariationId)}
              >
                <input type="radio" checked={selectedVariationId === s.squareVariationId} readOnly />
                <span>
                  {s.serviceName} — {s.variationName}
                  <br />
                  <small style={{ color: "var(--kaaya-text-muted)" }}>
                    {formatMoney(s.priceAmount, s.priceCurrency)}
                    {s.durationMinutes ? ` · ${formatDuration(s.durationMinutes)}` : ""}
                  </small>
                </span>
              </div>
            ))}
        </div>
      )}

      {step === "date" && (
        <div className="kaaya-card">
          <div className="kaaya-field">
            <label htmlFor="booking-date">Choose a date</label>
            <input id="booking-date" type="date" min={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
      )}

      {step === "time" && (
        <div className="kaaya-card">
          {teamMembers.length > 1 && (
            <div className="kaaya-field">
              <label>Therapist</label>
              <div className="kaaya-yesno">
                <button
                  type="button"
                  aria-pressed={selectedTeamMemberId === null}
                  onClick={() => setSelectedTeamMemberId(null)}
                >
                  Any available
                </button>
                {availableTeamMembers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={selectedTeamMemberId === m.id}
                    onClick={() => setSelectedTeamMemberId(m.id)}
                  >
                    {m.displayName}
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
              const member = teamMembers.find((m) => m.id === slot.teamMemberId);
              const time = new Date(slot.startAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
              return (
                <div
                  key={`${slot.teamMemberId}-${slot.startAt}`}
                  className="kaaya-list-row"
                  data-selected={selectedSlot === slot}
                  onClick={() => setSelectedSlot(slot)}
                  style={{ cursor: "pointer" }}
                >
                  <strong>{time}</strong>
                  {member && (
                    <span style={{ marginLeft: 8, color: "var(--kaaya-text-muted)" }}>{member.displayName}</span>
                  )}
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
                <td>
                  {selectedService.serviceName} — {selectedService.variationName}
                </td>
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
                <th>Therapist</th>
                <td>{teamMembers.find((m) => m.id === selectedSlot.teamMemberId)?.displayName ?? "Assigned by Kaaya"}</td>
              </tr>
              <tr>
                <th>Duration</th>
                <td>{formatDuration(selectedService.durationMinutes)}</td>
              </tr>
              <tr>
                <th>Price</th>
                <td>{formatMoney(selectedService.priceAmount, selectedService.priceCurrency)}</td>
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
