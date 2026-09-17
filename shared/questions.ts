import type { QuestionDef } from "./types";

// Single source of truth for the consultation questions, shared by the
// client-facing form (rendering) and the Worker API (server-side validation).
// This mirrors the Shape Blink & Brow source consultation. Do not add medical
// questions here that aren't part of that source document.

export const PERSONAL_PROFILE_QUESTIONS: QuestionDef[] = [
  { key: "first_name", label: "First name", section: "personal_profile", kind: "text", required: true },
  { key: "last_name", label: "Last name", section: "personal_profile", kind: "text", required: true },
  { key: "email", label: "Email address", section: "personal_profile", kind: "email", required: true },
  { key: "phone", label: "Phone number", section: "personal_profile", kind: "tel", required: true },
  { key: "address", label: "Home address", section: "personal_profile", kind: "text", required: false },
];

export const MEDICAL_ASSESSMENT_QUESTIONS: QuestionDef[] = [
  { key: "heart_condition", label: "Heart condition", section: "medical_assessment", kind: "boolean", required: true },
  { key: "thrombosis_phlebitis", label: "Thrombosis / phlebitis", section: "medical_assessment", kind: "boolean", required: true },
  { key: "pacemaker", label: "Pacemaker", section: "medical_assessment", kind: "boolean", required: true },
  { key: "blood_pressure_high", label: "High blood pressure", section: "medical_assessment", kind: "boolean", required: true },
  { key: "blood_pressure_low", label: "Low blood pressure", section: "medical_assessment", kind: "boolean", required: true },
  { key: "varicose_veins", label: "Varicose veins", section: "medical_assessment", kind: "boolean", required: true },
  { key: "hepatitis", label: "Hepatitis", section: "medical_assessment", kind: "boolean", required: true },
  { key: "diabetes", label: "Diabetes", section: "medical_assessment", kind: "boolean", required: true },
  { key: "epilepsy", label: "Epilepsy", section: "medical_assessment", kind: "boolean", required: true },
  { key: "hormone_imbalance", label: "Hormone imbalance", section: "medical_assessment", kind: "boolean", required: true },
  { key: "thyroid_issues", label: "Thyroid issues", section: "medical_assessment", kind: "boolean", required: true },
  { key: "pregnant", label: "Pregnant", section: "medical_assessment", kind: "boolean", required: true },
  { key: "postnatal", label: "Postnatal", section: "medical_assessment", kind: "boolean", required: true },
  { key: "skin_problems", label: "Skin problems", section: "medical_assessment", kind: "boolean", required: true },
  { key: "psoriasis_eczema", label: "Psoriasis / eczema", section: "medical_assessment", kind: "boolean", required: true },
  { key: "recent_major_surgery", label: "Recent major surgery", section: "medical_assessment", kind: "boolean", required: true },
  { key: "cosmetic_laser_surgery", label: "Cosmetic laser surgery", section: "medical_assessment", kind: "boolean", required: true },
  { key: "adhesive_allergy", label: "Adhesive allergy", section: "medical_assessment", kind: "boolean", required: true },
  { key: "latex_allergy", label: "Latex allergy", section: "medical_assessment", kind: "boolean", required: true },
  { key: "contact_lenses", label: "Contact lenses", section: "medical_assessment", kind: "boolean", required: true },
  { key: "eye_conjunctivitis", label: "Eye disorder: conjunctivitis", section: "medical_assessment", kind: "boolean", required: true },
  { key: "eye_blepharitis", label: "Eye disorder: blepharitis", section: "medical_assessment", kind: "boolean", required: true },
  { key: "hayfever", label: "Hayfever", section: "medical_assessment", kind: "boolean", required: true },
  { key: "adverse_reaction_essential_oil", label: "Adverse reaction to essential oil", section: "medical_assessment", kind: "boolean", required: true },
  { key: "asthma_breathing_difficulty", label: "Asthma / breathing difficulty", section: "medical_assessment", kind: "boolean", required: true },
  { key: "cataract", label: "Cataract", section: "medical_assessment", kind: "boolean", required: true },
  { key: "dry_eyes", label: "Dry eyes", section: "medical_assessment", kind: "boolean", required: true },
  { key: "eyelid_surgery", label: "Eyelid surgery", section: "medical_assessment", kind: "boolean", required: true },
  { key: "watery_eyes", label: "Watery eyes", section: "medical_assessment", kind: "boolean", required: true },
  {
    key: "previous_negative_reaction",
    label: "Previous negative reaction to tint, colour, tattoo, nail extension, adhesive or sticky plaster?",
    section: "medical_assessment",
    kind: "boolean",
    required: true,
    allowAdditionalInfo: true,
  },
];

export const PATCH_TEST_QUESTIONS: QuestionDef[] = [
  { key: "visited_before", label: "Have you been to our salon?", section: "salon_patch_test", kind: "boolean", required: true },
  { key: "patch_test_done", label: "Have you had a patch test done?", section: "salon_patch_test", kind: "boolean", required: true },
];

export const ALL_QUESTIONS: QuestionDef[] = [
  ...PERSONAL_PROFILE_QUESTIONS,
  ...MEDICAL_ASSESSMENT_QUESTIONS,
  ...PATCH_TEST_QUESTIONS,
];

export const REQUIRED_ANSWER_KEYS = ALL_QUESTIONS.filter((q) => q.required).map((q) => q.key);
