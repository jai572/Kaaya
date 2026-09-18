import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  PERSONAL_PROFILE_QUESTIONS,
  MEDICAL_ASSESSMENT_QUESTIONS,
  PATCH_TEST_QUESTIONS,
} from "@shared/questions";
import type { AnswerInput } from "@shared/types";
import { getTreatments, submitConsultation } from "../../lib/api";

type Treatment = {
  id: string;
  name: string;
};

type AnswersState = Record<string, { value: boolean | string; additional_info?: string }>;

const STEPS = ["intro", "profile", "medical", "treatment", "patch_test", "declaration", "signature"] as const;
type Step = (typeof STEPS)[number];

export default function ConsultationForm() {
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const step: Step = STEPS[stepIndex];

  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [selectedTreatmentIds, setSelectedTreatmentIds] = useState<string[]>([]);
  // Medical checkboxes default to false (unchecked = "No"/does not apply),
  // same as reading a paper form — a box that was never touched still means
  // something. Without this, a client with no conditions to report would
  // have to click all ~29 boxes just to make the Next button notice.
  const [answers, setAnswers] = useState<AnswersState>(() =>
    Object.fromEntries(MEDICAL_ASSESSMENT_QUESTIONS.map((q) => [q.key, { value: false }]))
  );
  const [legalName, setLegalName] = useState("");
  const [signatureTyped, setSignatureTyped] = useState("");
  const [signatureConfirmed, setSignatureConfirmed] = useState(false);
  const [consentWithoutPatchTest, setConsentWithoutPatchTest] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTreatments()
      .then((res) => setTreatments(res.treatments))
      .catch(() => setError("Could not load treatment list. Please refresh."));
  }, []);

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

  const profileComplete = PERSONAL_PROFILE_QUESTIONS.filter((q) => q.required).every(
    (q) => typeof answers[q.key]?.value === "string" && (answers[q.key]?.value as string).trim().length > 0
  );

  const medicalComplete = MEDICAL_ASSESSMENT_QUESTIONS.every((q) => typeof answers[q.key]?.value === "boolean");

  const treatmentComplete = selectedTreatmentIds.length > 0;

  const patchTestComplete = PATCH_TEST_QUESTIONS.every((q) => typeof answers[q.key]?.value === "boolean");

  const declarationComplete = consentWithoutPatchTest !== null;

  const signatureComplete = legalName.trim().length > 1 && signatureTyped.trim().length > 1 && signatureConfirmed;

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
        return declarationComplete;
      case "signature":
        return signatureComplete;
    }
  }, [step, profileComplete, medicalComplete, treatmentComplete, patchTestComplete, declarationComplete, signatureComplete]);

  async function handleSubmit() {
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
        signature: {
          method: "typed",
          legal_name: legalName.trim(),
          signature_value: signatureTyped.trim(),
          consent_without_patch_test: consentWithoutPatchTest ?? false,
        },
      });

      navigate(`/consultation/${result.consultation_id}/submitted`, {
        state: { accessToken: result.access_token },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function goNext() {
    if (step === "signature") {
      handleSubmit();
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
        <p>Client consultation</p>
      </div>

      <div className="kaaya-progress">
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
          {PERSONAL_PROFILE_QUESTIONS.map((q) => (
            <div className="kaaya-field" key={q.key}>
              <label htmlFor={q.key}>{q.label}{q.required ? " *" : ""}</label>
              <input
                id={q.key}
                type={q.kind === "email" ? "email" : q.kind === "tel" ? "tel" : "text"}
                value={(answers[q.key]?.value as string) ?? ""}
                onChange={(e) => setTextAnswer(q.key, e.target.value)}
              />
            </div>
          ))}
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
          {treatments.map((t) => (
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
          <div className="kaaya-field">
            <label>Do you consent to treatment without a patch test?</label>
            <div className="kaaya-yesno">
              <button type="button" aria-pressed={consentWithoutPatchTest === true} onClick={() => setConsentWithoutPatchTest(true)}>
                Yes
              </button>
              <button type="button" aria-pressed={consentWithoutPatchTest === false} onClick={() => setConsentWithoutPatchTest(false)}>
                No
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "signature" && (
        <div className="kaaya-card">
          <div className="kaaya-field">
            <label htmlFor="legal_name">Legal name</label>
            <input id="legal_name" type="text" value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </div>
          <div className="kaaya-field">
            <label htmlFor="signature_typed">Type your name to sign</label>
            <input
              id="signature_typed"
              type="text"
              value={signatureTyped}
              onChange={(e) => setSignatureTyped(e.target.value)}
              style={{ fontStyle: "italic" }}
            />
          </div>
          <label className="kaaya-checkbox-row">
            <input type="checkbox" checked={signatureConfirmed} onChange={(e) => setSignatureConfirmed(e.target.checked)} />
            <span>I confirm the typed name above is my signature and that I have read the declaration.</span>
          </label>
        </div>
      )}

      {error && <p className="kaaya-error">{error}</p>}

      <div className="kaaya-btn-row">
        {stepIndex > 0 && (
          <button className="kaaya-btn kaaya-btn--secondary" onClick={goBack} disabled={submitting}>
            Back
          </button>
        )}
        <button className="kaaya-btn" onClick={goNext} disabled={!canAdvance || submitting}>
          {submitting ? "Submitting…" : step === "signature" ? "Submit consultation" : "Continue"}
        </button>
      </div>
    </div>
  );
}
