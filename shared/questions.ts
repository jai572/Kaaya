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

// Same questions (same keys) as the Shape Blink & Brow source, reworded in
// everyday salon language and grouped so the list is quicker to read.
export const MEDICAL_ASSESSMENT_QUESTIONS: QuestionDef[] = [
  { key: "heart_condition", label: "A heart condition", section: "medical_assessment", kind: "boolean", required: true, group: "General health" },
  { key: "pacemaker", label: "A pacemaker", section: "medical_assessment", kind: "boolean", required: true, group: "General health" },
  { key: "blood_pressure_high", label: "High blood pressure", section: "medical_assessment", kind: "boolean", required: true, group: "General health" },
  { key: "blood_pressure_low", label: "Low blood pressure", section: "medical_assessment", kind: "boolean", required: true, group: "General health" },
  { key: "thrombosis_phlebitis", label: "Blood clots (thrombosis) or phlebitis", section: "medical_assessment", kind: "boolean", required: true, group: "General health" },
  { key: "varicose_veins", label: "Varicose veins", section: "medical_assessment", kind: "boolean", required: true, group: "General health" },
  { key: "diabetes", label: "Diabetes", section: "medical_assessment", kind: "boolean", required: true, group: "General health" },
  { key: "epilepsy", label: "Epilepsy", section: "medical_assessment", kind: "boolean", required: true, group: "General health" },
  { key: "hepatitis", label: "Hepatitis", section: "medical_assessment", kind: "boolean", required: true, group: "General health" },
  { key: "hormone_imbalance", label: "A hormone imbalance", section: "medical_assessment", kind: "boolean", required: true, group: "General health" },
  { key: "thyroid_issues", label: "A thyroid condition", section: "medical_assessment", kind: "boolean", required: true, group: "General health" },
  { key: "asthma_breathing_difficulty", label: "Asthma or breathing difficulties", section: "medical_assessment", kind: "boolean", required: true, group: "General health" },
  { key: "hayfever", label: "Hay fever", section: "medical_assessment", kind: "boolean", required: true, group: "General health" },
  { key: "pregnant", label: "I'm pregnant", section: "medical_assessment", kind: "boolean", required: true, group: "Pregnancy & recent procedures" },
  { key: "postnatal", label: "I've recently had a baby", section: "medical_assessment", kind: "boolean", required: true, group: "Pregnancy & recent procedures" },
  { key: "recent_major_surgery", label: "Major surgery recently", section: "medical_assessment", kind: "boolean", required: true, group: "Pregnancy & recent procedures" },
  { key: "cosmetic_laser_surgery", label: "Cosmetic or laser treatment recently", section: "medical_assessment", kind: "boolean", required: true, group: "Pregnancy & recent procedures" },
  { key: "skin_problems", label: "A skin condition in the treatment area", section: "medical_assessment", kind: "boolean", required: true, group: "Skin" },
  { key: "psoriasis_eczema", label: "Psoriasis or eczema", section: "medical_assessment", kind: "boolean", required: true, group: "Skin" },
  { key: "adhesive_allergy", label: "Allergic to adhesive or glue", section: "medical_assessment", kind: "boolean", required: true, group: "Allergies & reactions" },
  { key: "latex_allergy", label: "Allergic to latex", section: "medical_assessment", kind: "boolean", required: true, group: "Allergies & reactions" },
  { key: "adverse_reaction_essential_oil", label: "Reacted to essential oils before", section: "medical_assessment", kind: "boolean", required: true, group: "Allergies & reactions" },
  { key: "contact_lenses", label: "I wear contact lenses", section: "medical_assessment", kind: "boolean", required: true, group: "Eyes" },
  { key: "eye_conjunctivitis", label: "Conjunctivitis", section: "medical_assessment", kind: "boolean", required: true, group: "Eyes" },
  { key: "eye_blepharitis", label: "Blepharitis", section: "medical_assessment", kind: "boolean", required: true, group: "Eyes" },
  { key: "dry_eyes", label: "Dry eyes", section: "medical_assessment", kind: "boolean", required: true, group: "Eyes" },
  { key: "watery_eyes", label: "Watery eyes", section: "medical_assessment", kind: "boolean", required: true, group: "Eyes" },
  { key: "cataract", label: "Cataracts", section: "medical_assessment", kind: "boolean", required: true, group: "Eyes" },
  { key: "eyelid_surgery", label: "Eyelid surgery", section: "medical_assessment", kind: "boolean", required: true, group: "Eyes" },
  {
    key: "previous_negative_reaction",
    label: "Reacted before to a tint, colour, tattoo, nail product, adhesive or plaster",
    section: "medical_assessment",
    kind: "boolean",
    required: true,
    allowAdditionalInfo: true,
    group: "Allergies & reactions",
  },
];

export const PATCH_TEST_QUESTIONS: QuestionDef[] = [
  { key: "visited_before", label: "Have you been to Kaaya before?", section: "salon_patch_test", kind: "boolean", required: true },
  { key: "patch_test_done", label: "Have you had a patch test with us for this treatment?", section: "salon_patch_test", kind: "boolean", required: true },
];

export const ALL_QUESTIONS: QuestionDef[] = [
  ...PERSONAL_PROFILE_QUESTIONS,
  ...MEDICAL_ASSESSMENT_QUESTIONS,
  ...PATCH_TEST_QUESTIONS,
];

export const REQUIRED_ANSWER_KEYS = ALL_QUESTIONS.filter((q) => q.required).map((q) => q.key);
