import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  PERSONAL_PROFILE_QUESTIONS,
  MEDICAL_ASSESSMENT_QUESTIONS,
  MANUFACTURER_QUESTIONS,
  PATCH_TEST_QUESTIONS,
} from "@shared/questions";
import type { AnswerInput, ClientDecision, QuestionDef, TreatmentFlag } from "@shared/types";
import { DECLARATION_TEXT, requiredDeclarations, type DeclarationKey } from "@shared/declarations";
import {
  getTreatments,
  getAppointmentByReference,
  submitConsultation,
  finalizeConsultation,
  linkAppointmentToConsultation,
  type ClientFlag,
} from "../../lib/api";
import SignaturePad from "../../components/SignaturePad";
import { groupServicesByCategory } from "../../lib/bookingFormat";

type Treatment = {
  id: string;
  name: string;
};

type ServiceOption = {
  id: string;
  name: string;
  category_slug: string;
  treatment_id: string;
  extra_treatment_ids?: string[] | null;
};
type TreatmentDef = { id: string } & Partial<Record<TreatmentFlag, boolean>>;

const HEALTH_QUESTIONS = [...MEDICAL_ASSESSMENT_QUESTIONS, ...MANUFACTURER_QUESTIONS];

function isAsked(q: QuestionDef, activeFlags: Set<TreatmentFlag>): boolean {
  return !q.showFor || q.showFor.some((f) => activeFlags.has(f));
}

type AnswersState = Record<string, { value: boolean | string; additional_info?: string }>;

const STEPS = [
  "intro",
  "profile",
  "treatment",
  "medical",
  "patch_test",
  "declaration",
  "review_flags",
  "signature",
] as const;
type Step = (typeof STEPS)[number];

const SEVERITY_RANK: Record<ClientFlag["severity"], number> = { HIGH: 3, MEDIUM: 2, INFORMATION: 1 };

const OUTCOME_LABEL: Record<ClientFlag["outcome"], string> = {
  stop: "Can't go ahead today. ",
  doctor: "Needs your doctor's OK. ",
  warn: "",
};

function groupFlagsByTreatment(flags: ClientFlag[], treatments: Treatment[]) {
  const perTreatment = treatments.map((t) => ({
    treatment: t,
    flags: flags.filter((f) => f.treatment_ids.includes(t.id)),
  }));
  const general = flags.filter((f) => f.treatment_ids.length === 0);
  return { perTreatment, general };
}

export default function ConsultationForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [stepIndex, setStepIndex] = useState(0);
  const step: Step = STEPS[stepIndex];

  // Arrives from the booking confirmation page — pre-fills the profile step
  // (still editable) and lets the consultation be associated with the
  // correct appointment once submitted.
  const appointmentId = searchParams.get("appointment_id");
  const bookingReference = searchParams.get("booking_reference");

  const [services, setServices] = useState<ServiceOption[]>([]);
  const [treatmentDefs, setTreatmentDefs] = useState<TreatmentDef[]>([]);
  const [treatmentsLoading, setTreatmentsLoading] = useState(true);
  const [treatmentsError, setTreatmentsError] = useState<string | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [forMinor, setForMinor] = useState(false);
  const [guardianName, setGuardianName] = useState("");
  const [guardianRelationship, setGuardianRelationship] = useState("");
  const [ticked, setTicked] = useState<Set<DeclarationKey>>(new Set());
  // Medical checkboxes default to false (unchecked = "No"/does not apply),
  // same as reading a paper form — a box that was never touched still means
  // something. Without this, a client with no conditions to report would
  // have to click all ~29 boxes just to make the Next button notice.
  const [answers, setAnswers] = useState<AnswersState>(() =>
    Object.fromEntries(HEALTH_QUESTIONS.map((q) => [q.key, { value: false }]))
  );
  const [legalName, setLegalName] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signatureConfirmed, setSignatureConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touchedProfileFields, setTouchedProfileFields] = useState<Set<string>>(new Set());

  // Populated once phase 1 (submitConsultation) responds.
  const [consultationId, setConsultationId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [flags, setFlags] = useState<ClientFlag[]>([]);
  const [selectedTreatmentRecords, setSelectedTreatmentRecords] = useState<Treatment[]>([]);
  const [decision, setDecision] = useState<ClientDecision | null>(null);

  useEffect(() => {
    loadTreatments();
    // Coming from a booking: tick the booked treatment and open its section.
    if (appointmentId && bookingReference) {
      Promise.all([getAppointmentByReference(appointmentId, bookingReference), getTreatments()])
        .then(([booking, list]) => {
          const booked = list.services.find((s) => s.id === booking.appointment.service_id);
          if (!booked) return;
          setSelectedServiceIds((prev) => (prev.includes(booked.id) ? prev : [...prev, booked.id]));
          const group = groupServicesByCategory([booked])[0]?.slug;
          if (group) setOpenGroups((prev) => new Set(prev).add(group));
        })
        .catch(() => {
          // Not essential — the client can still pick the treatment themselves.
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const prefill: Record<string, string> = {
      first_name: searchParams.get("first_name") ?? "",
      last_name: searchParams.get("last_name") ?? "",
      email: searchParams.get("email") ?? "",
      phone: searchParams.get("phone") ?? "",
    };
    if (!Object.values(prefill).some((v) => v.length > 0)) return;
    setAnswers((prev) => {
      const next = { ...prev };
      for (const [key, value] of Object.entries(prefill)) {
        if (value) next[key] = { value };
      }
      return next;
    });
    // Only ever runs from the initial query params, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadTreatments() {
    setTreatmentsLoading(true);
    setTreatmentsError(null);
    getTreatments()
      .then((res) => {
        setServices(res.services);
        setTreatmentDefs(res.treatments as TreatmentDef[]);
      })
      .catch(() => setTreatmentsError("Could not load the treatment list."))
      .finally(() => setTreatmentsLoading(false));
  }

  function setTextAnswer(key: string, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: { value } }));
  }

  function setBoolAnswer(key: string, value: boolean) {
    setAnswers((prev) => ({ ...prev, [key]: { value, additional_info: prev[key]?.additional_info } }));
  }

  function setAdditionalInfo(key: string, info: string) {
    setAnswers((prev) => ({ ...prev, [key]: { value: prev[key]?.value ?? false, additional_info: info } }));
  }

  function toggleService(id: string) {
    setSelectedServiceIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  function toggleGroup(slug: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function toggleDeclaration(key: DeclarationKey) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const profileFieldErrors: Record<string, string> = {};
  for (const q of PERSONAL_PROFILE_QUESTIONS) {
    const value = (answers[q.key]?.value as string) ?? "";
    if (q.required && value.trim().length === 0) {
      profileFieldErrors[q.key] = "This field is required.";
    } else if (q.key === "email" && value.trim().length > 0 && !EMAIL_PATTERN.test(value.trim())) {
      profileFieldErrors[q.key] = "Enter a valid email address.";
    } else if (q.key === "phone" && value.trim().length > 0 && value.trim().length < 6) {
      profileFieldErrors[q.key] = "Enter a valid phone number.";
    }
  }
  const guardianComplete = !forMinor || (guardianName.trim().length > 1 && guardianRelationship.trim().length > 1);
  const profileComplete = Object.keys(profileFieldErrors).length === 0 && guardianComplete;

  // Which treatment types the chosen services involve: drives which extra
  // questions are asked (unasked ones count as "No").
  const activeFlags = useMemo(() => {
    const flagsOn = new Set<TreatmentFlag>();
    const byId = new Map(treatmentDefs.map((t) => [t.id, t]));
    for (const service of services.filter((s) => selectedServiceIds.includes(s.id))) {
      for (const id of [service.treatment_id, ...(service.extra_treatment_ids ?? [])]) {
        const t = byId.get(id);
        if (!t) continue;
        for (const [key, value] of Object.entries(t)) if (value === true) flagsOn.add(key as TreatmentFlag);
      }
    }
    return flagsOn;
  }, [services, treatmentDefs, selectedServiceIds]);
  const askedHealth = HEALTH_QUESTIONS.filter((q) => isAsked(q, activeFlags));
  const healthGroups = [...new Set(askedHealth.map((q) => q.group ?? "Other"))];
  const needsPatchTest = activeFlags.has("requires_patch_test");
  const askedPatch = PATCH_TEST_QUESTIONS.filter((q) => q.key === "visited_before" || needsPatchTest);
  const answerOf = (q: QuestionDef, asked: QuestionDef[]) =>
    asked.includes(q) ? ((answers[q.key]?.value as boolean) ?? false) : false;

  const medicalComplete = askedHealth.every((q) => typeof answers[q.key]?.value === "boolean");
  const treatmentComplete = selectedServiceIds.length > 0;
  const patchTestComplete = askedPatch
    .filter((q) => q.key !== "patch_test_changes" || answers.patch_test_done?.value === true)
    .every((q) => typeof answers[q.key]?.value === "boolean");
  const reviewFlagsComplete = decision !== null;
  const declarationKeys = decision
    ? requiredDeclarations({
        decision,
        doctorFlagged: flags.some((f) => f.outcome === "doctor"),
        hasGuardian: forMinor,
      })
    : [];
  // Shown under the button so a client knows why they can't submit yet.
  const signatureMissing = [
    declarationKeys.some((k) => !ticked.has(k)) && "tick every statement",
    !signatureConfirmed && "tick the electronic signature box",
    legalName.trim().length <= 1 && "type your full name",
    !signatureDataUrl && "sign in the box",
  ].filter((m): m is string => !!m);
  const signatureComplete =
    legalName.trim().length > 1 &&
    signatureConfirmed &&
    !!signatureDataUrl &&
    declarationKeys.every((k) => ticked.has(k));
  const serviceGroups = groupServicesByCategory(services);

  const canAdvance = useMemo(() => {
    switch (step) {
      case "intro":
        return true;
      case "profile":
        return profileComplete;
      case "medical":
        return medicalComplete;
      case "treatment":
        return treatmentComplete;
      case "patch_test":
        return patchTestComplete;
      case "declaration":
        return true;
      case "review_flags":
        return reviewFlagsComplete;
      case "signature":
        return signatureComplete;
    }
  }, [step, profileComplete, medicalComplete, treatmentComplete, patchTestComplete, reviewFlagsComplete, signatureComplete]);

  // Phase 1: submit answers + treatments, get back the flags to review.
  async function handleInitialSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const answerList: AnswerInput[] = [
        ...HEALTH_QUESTIONS.map((q) => ({
          question_key: q.key,
          answer_value: answerOf(q, askedHealth),
          additional_info: askedHealth.includes(q) ? answers[q.key]?.additional_info ?? null : null,
        })),
        ...PATCH_TEST_QUESTIONS.map((q) => ({
          question_key: q.key,
          answer_value:
            q.key === "patch_test_changes" && answers.patch_test_done?.value !== true ? false : answerOf(q, askedPatch),
        })),
      ];

      const result = await submitConsultation({
        client: {
          first_name: answers.first_name?.value as string,
          last_name: answers.last_name?.value as string,
          email: answers.email?.value as string,
          phone: answers.phone?.value as string,
          address: (answers.address?.value as string) || undefined,
        },
        answers: answerList,
        service_ids: selectedServiceIds,
        guardian: forMinor ? { name: guardianName.trim(), relationship: guardianRelationship.trim() } : null,
      });

      setConsultationId(result.consultation_id);
      setAccessToken(result.access_token);
      setFlags(result.flags);
      setSelectedTreatmentRecords(result.treatments);
      setStepIndex(STEPS.indexOf("review_flags"));

      // Non-blocking: a failure here is logged but never blocks the
      // consultation flow itself — worst case, staff reconcile manually.
      if (appointmentId && bookingReference) {
        linkAppointmentToConsultation(appointmentId, result.consultation_id, bookingReference).catch((linkError) =>
          console.error("Could not link appointment to consultation", linkError)
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Phase 2: acknowledgement + decision + signature. Locks the consultation.
  async function handleFinalize() {
    if (!consultationId || !accessToken || !decision || !signatureDataUrl) return;
    setSubmitting(true);
    setError(null);
    try {
      await finalizeConsultation(consultationId, accessToken, {
        decision,
        acknowledged_flag_ids: flags.map((f) => f.id),
        declarations: declarationKeys.filter((k) => ticked.has(k)),
        signature: { method: "drawn", legal_name: legalName.trim(), signature_value: signatureDataUrl },
        device_info: { user_agent: navigator.userAgent, screen: `${screen.width}x${screen.height}` },
      });

      navigate(`/consultation/${consultationId}/submitted`, {
        state: { accessToken, decision },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function goNext() {
    if (step === "declaration") {
      handleInitialSubmit();
      return;
    }
    if (step === "signature") {
      handleFinalize();
      return;
    }
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  function goBack() {
    // Once phase 1 has run, going back to re-edit answers would desync the
    // flags already computed from them — keep review/signature self-contained
    // instead of allowing a stale-data edge case.
    if (step === "review_flags" || step === "signature") return;
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  const { perTreatment, general } = groupFlagsByTreatment(flags, selectedTreatmentRecords);
  const blockedIds = new Set(flags.filter((f) => f.outcome === "stop").flatMap((f) => f.treatment_ids));
  const blockedTreatments = selectedTreatmentRecords.filter((t) => blockedIds.has(t.id));
  const allBlocked = selectedTreatmentRecords.length > 0 && blockedTreatments.length === selectedTreatmentRecords.length;

  return (
    <div className="kaaya-shell">
      <div className="kaaya-header">
        <h1>Kaaya</h1>
        <p>Client consultation</p>
      </div>

      <p style={{ textAlign: "center", color: "var(--kaaya-text-muted)", fontSize: "0.85rem", marginTop: 0 }}>
        Step {stepIndex + 1} of {STEPS.length}
      </p>
      <div className="kaaya-progress" role="progressbar" aria-valuenow={stepIndex + 1} aria-valuemin={1} aria-valuemax={STEPS.length}>
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

      {step === "intro" && (
        <div className="kaaya-card">
          <p>Before your treatment we ask a few quick questions about your health and any allergies.</p>
          <p>
            It takes about 3 minutes. Please answer honestly: we rely on what you tell us to look after you, and
            you're responsible for letting us know about anything that could affect your treatment.
          </p>
          <p style={{ color: "var(--kaaya-text-muted)", fontSize: "0.9rem" }}>
            Your answers are kept private and only seen by the Kaaya team.
          </p>
        </div>
      )}

      {step === "profile" && (
        <div className="kaaya-card">
          <p style={{ color: "var(--kaaya-text-muted)", marginTop: 0, fontSize: "0.85rem" }}>* Required</p>
          {PERSONAL_PROFILE_QUESTIONS.map((q) => {
            const fieldError = touchedProfileFields.has(q.key) ? profileFieldErrors[q.key] : undefined;
            return (
              <div className="kaaya-field" key={q.key}>
                <label htmlFor={q.key}>
                  {q.label}
                  {q.required ? " *" : ""}
                </label>
                <input
                  id={q.key}
                  type={q.kind === "email" ? "email" : q.kind === "tel" ? "tel" : "text"}
                  value={(answers[q.key]?.value as string) ?? ""}
                  onChange={(e) => setTextAnswer(q.key, e.target.value)}
                  onBlur={() => setTouchedProfileFields((prev) => new Set(prev).add(q.key))}
                  aria-invalid={!!fieldError}
                  aria-describedby={fieldError ? `${q.key}-error` : undefined}
                />
                {fieldError && (
                  <p id={`${q.key}-error`} className="kaaya-error" role="alert">
                    {fieldError}
                  </p>
                )}
              </div>
            );
          })}
          <label className="kaaya-checkbox-row">
            <input type="checkbox" checked={forMinor} onChange={(e) => setForMinor(e.target.checked)} />
            <span>The person having the treatment is under 16 (a parent or guardian must complete this form)</span>
          </label>
          {forMinor && (
            <>
              <p style={{ color: "var(--kaaya-text-muted)", fontSize: "0.85rem" }}>
                Enter the client's name above, and your own details here.
              </p>
              <div className="kaaya-field">
                <label htmlFor="guardian_name">Parent or guardian's full name *</label>
                <input id="guardian_name" type="text" value={guardianName} onChange={(e) => setGuardianName(e.target.value)} />
              </div>
              <div className="kaaya-field">
                <label htmlFor="guardian_relationship">Relationship to the client *</label>
                <input
                  id="guardian_relationship"
                  type="text"
                  placeholder="e.g. Mother"
                  value={guardianRelationship}
                  onChange={(e) => setGuardianRelationship(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
      )}

      {step === "medical" && (
        <div className="kaaya-card">
          <p style={{ color: "var(--kaaya-text-muted)", marginTop: 0 }}>
            Tick anything that applies to you now or recently. Leave the rest unticked.
          </p>
          {healthGroups.map((group) => (
            <div key={group} className="kaaya-question-group">
              <h3 className="kaaya-question-group__title">{group}</h3>
          {askedHealth.filter((q) => (q.group ?? "Other") === group).map((q) => {
            const checked = (answers[q.key]?.value as boolean) ?? false;
            return (
              <div key={q.key}>
                <label className="kaaya-checkbox-row">
                  <input type="checkbox" checked={checked} onChange={(e) => setBoolAnswer(q.key, e.target.checked)} />
                  <span>{q.label}</span>
                </label>
                {q.allowAdditionalInfo && checked && (
                  <div className="kaaya-field" style={{ marginLeft: 34 }}>
                    <label htmlFor={`${q.key}-info`}>What happened?</label>
                    <textarea
                      id={`${q.key}-info`}
                      value={answers[q.key]?.additional_info ?? ""}
                      onChange={(e) => setAdditionalInfo(q.key, e.target.value)}
                    />
                  </div>
                )}
              </div>
            );
          })}
            </div>
          ))}
        </div>
      )}

      {step === "treatment" && (
        <div className="kaaya-card">
          <p style={{ color: "var(--kaaya-text-muted)", marginTop: 0 }}>
            Tap a treatment type, then tick everything you're having today.
          </p>
          {treatmentsLoading && <p>Loading treatments…</p>}
          {treatmentsError && (
            <div>
              <p className="kaaya-error">{treatmentsError}</p>
              <button type="button" className="kaaya-btn kaaya-btn--secondary" onClick={loadTreatments}>
                Try again
              </button>
            </div>
          )}
          {!treatmentsLoading &&
            !treatmentsError &&
            serviceGroups.map((group) => {
              const open = openGroups.has(group.slug);
              const count = group.services.filter((s) => selectedServiceIds.includes(s.id)).length;
              return (
                <div key={group.slug} className="kaaya-accordion">
                  <button
                    type="button"
                    className="kaaya-accordion__head"
                    aria-expanded={open}
                    onClick={() => toggleGroup(group.slug)}
                  >
                    <span>{group.label}</span>
                    <span className="kaaya-accordion__meta">
                      {count > 0 && <span className="kaaya-accordion__count">{count} selected</span>}
                      <span aria-hidden="true">{open ? "−" : "+"}</span>
                    </span>
                  </button>
                  {open && (
                    <div className="kaaya-accordion__body">
                      {group.services.map((s) => (
                        <label key={s.id} className="kaaya-treatment-option" data-selected={selectedServiceIds.includes(s.id)}>
                          <input
                            type="checkbox"
                            checked={selectedServiceIds.includes(s.id)}
                            onChange={() => toggleService(s.id)}
                          />
                          <span>{s.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {step === "patch_test" && (
        <div className="kaaya-card">
          {needsPatchTest && (
            <p style={{ color: "var(--kaaya-text-muted)", marginTop: 0 }}>
              Some of your treatments need a patch test with us at least 48 hours before. It stays valid for 6 months.
            </p>
          )}
          {askedPatch
            .filter((q) => q.key !== "patch_test_changes" || answers.patch_test_done?.value === true)
            .map((q) => (
            <div className="kaaya-field" key={q.key}>
              <label>{q.label}</label>
              <div className="kaaya-yesno">
                <button
                  type="button"
                  aria-pressed={answers[q.key]?.value === true}
                  onClick={() => setBoolAnswer(q.key, true)}
                >
                  Yes
                </button>
                <button
                  type="button"
                  aria-pressed={answers[q.key]?.value === false}
                  onClick={() => setBoolAnswer(q.key, false)}
                >
                  No
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {step === "declaration" && (
        <div className="kaaya-card">
          <p>
            Please check your answers before you continue. If you've left something out, go back and add it now:
            we can only plan your treatment around what you tell us.
          </p>
          <p style={{ color: "var(--kaaya-text-muted)", fontSize: "0.9rem" }}>
            Next, we'll show you anything you should know about your chosen treatment before you sign.
          </p>
        </div>
      )}

      {step === "review_flags" && (
        <div className="kaaya-card">
          <h2 style={{ marginTop: 0 }}>Things to know</h2>
          {flags.length > 0 ? (
            <p>Based on your answers, please read the following before deciding whether to go ahead.</p>
          ) : (
            <p>Nothing in your answers needs extra attention for the treatment you've chosen.</p>
          )}
          {blockedTreatments.length > 0 && (
            <div className="kaaya-notice kaaya-notice--stop">
              <strong>Can't go ahead today:</strong> {blockedTreatments.map((t) => t.name).join(", ")}.{" "}
              {allBlocked
                ? "We're sorry. The reasons are below, and we'll happily help you choose something else."
                : "Your other treatments can still go ahead."}
            </div>
          )}

          {perTreatment.map(({ treatment, flags: treatmentFlags }) =>
            treatmentFlags.length > 0 ? (
              <div key={treatment.id} style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>{treatment.name}</h3>
                <p style={{ marginTop: 0, fontSize: "0.9rem" }}>You told us:</p>
                <ul style={{ marginTop: 0, paddingLeft: 20 }}>
                  {treatmentFlags.map((f) => (
                    <li key={f.id} style={{ marginBottom: 4 }}>
                      {f.client_answer_summary}
                    </li>
                  ))}
                </ul>
                {[...treatmentFlags]
                  .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
                  .map((f) => (
                    <div key={f.id} className={`kaaya-flag-review kaaya-flag-review--${f.severity}`}>
                      {f.outcome !== "warn" && <strong className="kaaya-flag-outcome">{OUTCOME_LABEL[f.outcome]}</strong>}
                      {f.client_message ?? f.explanation}
                    </div>
                  ))}
              </div>
            ) : null
          )}

          {general.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Other information</h3>
              {general.map((f) => (
                <div key={f.id} className={`kaaya-flag-review kaaya-flag-review--${f.severity}`}>
                  {f.outcome !== "warn" && <strong className="kaaya-flag-outcome">{OUTCOME_LABEL[f.outcome]}</strong>}
                  {f.client_message ?? f.explanation}
                </div>
              ))}
            </div>
          )}

          <div className="kaaya-notice">
            <strong>Please note:</strong> your therapist may adapt or decline a treatment if they think it isn't
            right for you on the day.
          </div>

          {!allBlocked && (
            <div
              className="kaaya-decision-option"
              data-selected={decision === "continue"}
              onClick={() => setDecision("continue")}
            >
              <input type="radio" checked={decision === "continue"} readOnly />
              <span>
                {blockedTreatments.length > 0
                  ? "I've read this and choose to go ahead with the treatments that can go ahead."
                  : "I've read this and choose to go ahead with my treatment."}
              </span>
            </div>
          )}
          <div
            className="kaaya-decision-option"
            data-selected={decision === "decline"}
            onClick={() => setDecision("decline")}
          >
            <input type="radio" checked={decision === "decline"} readOnly />
            <span>{allBlocked ? "I understand." : "I'd rather not go ahead for now."}</span>
          </div>
        </div>
      )}

      {step === "signature" && (
        <div className="kaaya-card">
          <h2 style={{ marginTop: 0 }}>Sign your form</h2>
          <p style={{ marginTop: 0, color: "var(--kaaya-text-muted)", fontSize: "0.9rem" }}>
            You can change your mind and stop at any time, before or during your treatment.
          </p>
          <p>Please tick each statement:</p>
          {declarationKeys.map((key) => (
            <label key={key} className="kaaya-checkbox-row">
              <input type="checkbox" checked={ticked.has(key)} onChange={() => toggleDeclaration(key)} />
              <span>{DECLARATION_TEXT[key]}</span>
            </label>
          ))}
          <label className="kaaya-checkbox-row">
            <input type="checkbox" checked={signatureConfirmed} onChange={(e) => setSignatureConfirmed(e.target.checked)} />
            <span>I agree that my electronic signature below counts as my signature on this form.</span>
          </label>
          <div className="kaaya-field">
            <label htmlFor="legal_name">{forMinor ? "Parent or guardian's full name" : "Your full name"}</label>
            <input id="legal_name" type="text" value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </div>
          <div className="kaaya-field">
            <label>Sign below with your finger, stylus or mouse.</label>
            <SignaturePad onChange={setSignatureDataUrl} />
          </div>
        </div>
      )}

      {step === "signature" && signatureMissing.length > 0 && (
        <p className="kaaya-hint" role="status">
          To submit, please {signatureMissing.join(", ")}.
        </p>
      )}

      {error && (
        <p className="kaaya-error" role="alert" aria-live="assertive">
          {error}
        </p>
      )}

      <div className="kaaya-btn-row">
        {stepIndex > 0 && step !== "review_flags" && step !== "signature" && (
          <button className="kaaya-btn kaaya-btn--secondary" onClick={goBack} disabled={submitting}>
            Back
          </button>
        )}
        <button className="kaaya-btn" onClick={goNext} disabled={!canAdvance || submitting}>
          {submitting
            ? "Please wait…"
            : step === "declaration"
              ? "Continue"
              : step === "signature"
                ? "Submit & Sign"
                : "Continue"}
        </button>
      </div>
    </div>
  );
}
