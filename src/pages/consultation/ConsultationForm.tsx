import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  PERSONAL_PROFILE_QUESTIONS,
  MEDICAL_ASSESSMENT_QUESTIONS,
  PATCH_TEST_QUESTIONS,
} from "@shared/questions";
import type { AnswerInput, ClientDecision } from "@shared/types";
import { getTreatments, submitConsultation, finalizeConsultation, type ClientFlag } from "../../lib/api";
import SignaturePad from "../../components/SignaturePad";

type Treatment = {
  id: string;
  name: string;
};

type AnswersState = Record<string, { value: boolean | string; additional_info?: string }>;

const STEPS = [
  "intro",
  "profile",
  "medical",
  "treatment",
  "patch_test",
  "declaration",
  "review_flags",
  "signature",
] as const;
type Step = (typeof STEPS)[number];

const SEVERITY_RANK: Record<ClientFlag["severity"], number> = { HIGH: 3, MEDIUM: 2, INFORMATION: 1 };

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
  const [stepIndex, setStepIndex] = useState(0);
  const step: Step = STEPS[stepIndex];

  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [treatmentsLoading, setTreatmentsLoading] = useState(true);
  const [treatmentsError, setTreatmentsError] = useState<string | null>(null);
  const [selectedTreatmentIds, setSelectedTreatmentIds] = useState<string[]>([]);
  // Medical checkboxes default to false (unchecked = "No"/does not apply),
  // same as reading a paper form — a box that was never touched still means
  // something. Without this, a client with no conditions to report would
  // have to click all ~29 boxes just to make the Next button notice.
  const [answers, setAnswers] = useState<AnswersState>(() =>
    Object.fromEntries(MEDICAL_ASSESSMENT_QUESTIONS.map((q) => [q.key, { value: false }]))
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
    getTreatments()
      .then((res) => setTreatments(res.treatments))
      .catch(() => setTreatmentsError("Could not load the treatment list."))
      .finally(() => setTreatmentsLoading(false));
  }, []);

  function retryLoadTreatments() {
    setTreatmentsLoading(true);
    setTreatmentsError(null);
    getTreatments()
      .then((res) => setTreatments(res.treatments))
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

  function toggleTreatment(id: string) {
    setSelectedTreatmentIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
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
  const profileComplete = Object.keys(profileFieldErrors).length === 0;

  const medicalComplete = MEDICAL_ASSESSMENT_QUESTIONS.every((q) => typeof answers[q.key]?.value === "boolean");
  const treatmentComplete = selectedTreatmentIds.length > 0;
  const patchTestComplete = PATCH_TEST_QUESTIONS.every((q) => typeof answers[q.key]?.value === "boolean");
  const reviewFlagsComplete = decision !== null;
  const signatureComplete = legalName.trim().length > 1 && signatureConfirmed && !!signatureDataUrl;

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
        ...MEDICAL_ASSESSMENT_QUESTIONS.map((q) => ({
          question_key: q.key,
          answer_value: (answers[q.key]?.value as boolean) ?? false,
          additional_info: answers[q.key]?.additional_info ?? null,
        })),
        ...PATCH_TEST_QUESTIONS.map((q) => ({
          question_key: q.key,
          answer_value: (answers[q.key]?.value as boolean) ?? false,
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
        treatment_ids: selectedTreatmentIds,
      });

      setConsultationId(result.consultation_id);
      setAccessToken(result.access_token);
      setFlags(result.flags);
      setSelectedTreatmentRecords(result.treatments);
      setStepIndex(STEPS.indexOf("review_flags"));
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
          <p>
            Please provide accurate information so our team can review your treatment safely and appropriately.
          </p>
          <p>This should take about 5 minutes. Your information is kept confidential and reviewed by Kaaya staff before your appointment.</p>
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
        </div>
      )}

      {step === "medical" && (
        <div className="kaaya-card">
          <p style={{ color: "var(--kaaya-text-muted)", marginTop: 0 }}>
            Please tick anything that applies to you. This helps our team review your treatment safely.
          </p>
          {MEDICAL_ASSESSMENT_QUESTIONS.map((q) => {
            const checked = (answers[q.key]?.value as boolean) ?? false;
            return (
              <div key={q.key}>
                <label className="kaaya-checkbox-row">
                  <input type="checkbox" checked={checked} onChange={(e) => setBoolAnswer(q.key, e.target.checked)} />
                  <span>{q.label}</span>
                </label>
                {q.allowAdditionalInfo && checked && (
                  <div className="kaaya-field" style={{ marginLeft: 34 }}>
                    <label htmlFor={`${q.key}-info`}>Please provide details</label>
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
      )}

      {step === "treatment" && (
        <div className="kaaya-card">
          <p style={{ color: "var(--kaaya-text-muted)", marginTop: 0 }}>Select all treatments you'd like to discuss.</p>
          {treatmentsLoading && <p>Loading treatments…</p>}
          {treatmentsError && (
            <div>
              <p className="kaaya-error">{treatmentsError}</p>
              <button type="button" className="kaaya-btn kaaya-btn--secondary" onClick={retryLoadTreatments}>
                Try again
              </button>
            </div>
          )}
          {!treatmentsLoading &&
            !treatmentsError &&
            treatments.map((t) => (
              <div
                key={t.id}
                className="kaaya-treatment-option"
                data-selected={selectedTreatmentIds.includes(t.id)}
                onClick={() => toggleTreatment(t.id)}
              >
                <input type="checkbox" checked={selectedTreatmentIds.includes(t.id)} readOnly />
                <span>{t.name}</span>
              </div>
            ))}
        </div>
      )}

      {step === "patch_test" && (
        <div className="kaaya-card">
          {PATCH_TEST_QUESTIONS.map((q) => (
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
            I hereby confirm that all information provided is accurate and truthful. I understand that withholding
            medical details can lead to adverse reactions. I consent to the chosen treatment being performed by
            Kaaya.
          </p>
          <p style={{ color: "var(--kaaya-text-muted)", fontSize: "0.9rem" }}>
            Next, Kaaya will review your answers against the selected treatment(s) and show you anything relevant
            before you sign.
          </p>
        </div>
      )}

      {step === "review_flags" && (
        <div className="kaaya-card">
          <h2 style={{ marginTop: 0 }}>Before you finish</h2>
          {flags.length > 0 ? (
            <p>
              We have identified information in your consultation that may affect whether your selected
              treatment(s) can be carried out.
            </p>
          ) : (
            <p>We didn't identify anything that needs your attention for the treatment(s) you've selected.</p>
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
                      {f.explanation}
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
                  {f.explanation}
                </div>
              ))}
            </div>
          )}

          <div className="kaaya-notice">
            <strong>Important:</strong> Completing this consultation does not guarantee that the treatment will be
            carried out. A treatment may need to be postponed or declined if required checks have not been
            completed, or if our treatment policy requires this.
          </div>

          <div
            className="kaaya-decision-option"
            data-selected={decision === "continue"}
            onClick={() => setDecision("continue")}
          >
            <input type="radio" checked={decision === "continue"} readOnly />
            <span>I understand the information above and would like to continue with my appointment.</span>
          </div>
          <div
            className="kaaya-decision-option"
            data-selected={decision === "decline"}
            onClick={() => setDecision("decline")}
          >
            <input type="radio" checked={decision === "decline"} readOnly />
            <span>I do not wish to continue with my appointment at this time.</span>
          </div>
        </div>
      )}

      {step === "signature" && (
        <div className="kaaya-card">
          <h2 style={{ marginTop: 0 }}>Electronic Signature</h2>
          <p>
            I confirm that I have personally completed this consultation and that the information I have provided
            is accurate and complete.
          </p>
          <p style={{ color: "var(--kaaya-text-muted)", fontSize: "0.9rem" }}>
            I understand that my electronic signature is being used to confirm this consultation and the
            information provided.
          </p>
          <label className="kaaya-checkbox-row">
            <input type="checkbox" checked={signatureConfirmed} onChange={(e) => setSignatureConfirmed(e.target.checked)} />
            <span>I confirm</span>
          </label>
          <div className="kaaya-field">
            <label htmlFor="legal_name">Legal name</label>
            <input id="legal_name" type="text" value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </div>
          <div className="kaaya-field">
            <label>Please sign below using your finger, stylus or mouse.</label>
            <SignaturePad onChange={setSignatureDataUrl} />
          </div>
        </div>
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
