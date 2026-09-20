// Central source of truth for public-site content taken from the Kaaya
// leaflet. Nothing here is invented — if a fact isn't in the leaflet, the
// field says so explicitly instead of guessing.

export const BUSINESS_NAME = "Kaaya";

// Kaaya's own long-standing Facebook page description (eye.brow.threading.aberdeen) —
// live there for years, so treated as verified brand copy rather than invented.
export const BUSINESS_DESCRIPTION = `We are an established Brow Bar in Aberdeen, highly experienced in all aspects of Threading — an ancient art of eyebrow shaping and unwanted hair removal — and we aim to satisfy all your hair & beauty needs. We provide treatments for facial threading, eyebrow/eyelash tinting, eyelash extensions, face waxing, manicure/pedicure and henna body tattoos.

We are conveniently located right in the middle of Aberdeen city-centre shopping mall, Bon Accord.`;

export const CONTACT = {
  phone: "07378 454500",
  phoneHref: "tel:+447378454500",
  email: "info@kaaya-clinic.com",
  addressLine1: "Bon Accord Shopping Centre",
  addressLine2: "Aberdeen",
  facebookHandle: "eye.brow.threading.aberdeen",
  facebookUrl: "https://facebook.com/eye.brow.threading.aberdeen",
  // Not stated anywhere in the supplied leaflet. Do not invent hours —
  // surface this to staff/owner and replace once confirmed.
  openingHours: null as string[] | null,
};

// No Square (or any) online booking URL appears in the supplied leaflet —
// only "walk-in & appointment booking is available", a phone number, and
// the "Kaaya Brow Bar" app. BOOKING_URL is the single place this gets
// wired up once a real link exists; every CTA reads from here rather than
// hard-coding a URL. Swapping Square for Kaaya's own /book later is a
// one-line change in this file.
export const BOOKING_URL: string | null = null;

export const APP_LINKS = {
  name: "Kaaya Brow Bar",
  // Store URLs not supplied in the leaflet (it just shows Apple/Android
  // badges with no visible link text). Left null rather than guessed.
  ios: null as string | null,
  android: null as string | null,
};

export type TreatmentCategory = {
  slug: string;
  name: string;
  summary: string;
  patchTestRequired?: boolean;
  items: {
    name: string;
    price: string;
    note?: string;
  }[];
};

// Prices and treatment names are transcribed directly from the leaflet's
// price list. "From" prices are kept as printed.
export const TREATMENT_CATEGORIES: TreatmentCategory[] = [
  {
    slug: "eyebrows-threading-waxing",
    name: "Eyebrows, Threading & Waxing",
    summary: "Precision eyebrow shaping and facial threading or waxing.",
    items: [
      { name: "Eyebrow Shaping - Threading", price: "£10" },
      { name: "Eyebrow Shaping - Wax", price: "£11" },
      { name: "Upper / Lower Lips - Threading", price: "£6" },
      { name: "Upper / Lower Lips - Wax", price: "£6" },
      { name: "Forehead - Threading", price: "£6" },
      { name: "Forehead - Wax", price: "£6" },
      { name: "Chin - Threading", price: "£6" },
      { name: "Chin - Wax", price: "£6" },
      { name: "Sides Of Face - Threading", price: "from £10" },
      { name: "Sides Of Face - Wax", price: "£10" },
      { name: "Neck - Threading", price: "£7" },
      { name: "Neck - Wax", price: "£7" },
      { name: "Full Face With Eyebrow Shape - Threading", price: "£37" },
      { name: "Full Face With Eyebrow Shape - Wax", price: "£39" },
    ],
  },
  {
    slug: "tinting",
    name: "Tinting",
    summary: "Eyebrow and eyelash tinting, including henna and hybrid formulas.",
    patchTestRequired: true,
    items: [
      { name: "Tinting - Eyebrow", price: "£9" },
      { name: "Tinting - Eyelash", price: "£14" },
      { name: "Tinting - Eyebrow & Eyelash", price: "£21" },
      { name: "Henna Brow Tint - Eyebrow", price: "£20" },
      { name: "Henna Brow Tint - Eyelash", price: "£24" },
      { name: "Henna Brow Tint - Eyebrow & Eyelash", price: "£29" },
      { name: "Hybrid Tint - Eyebrow", price: "£15" },
      { name: "Hybrid Tint - Eyelash", price: "£20" },
      { name: "Hybrid Tint - Eyebrow & Eyelash", price: "£30" },
    ],
  },
  {
    slug: "brows-lashes",
    name: "Brow Lamination & Lash Lift",
    summary: "Shaped, lifted brows and lashes.",
    patchTestRequired: true,
    items: [
      { name: "Brow Lamination", price: "£35" },
      { name: "Eyelash Lift & Curl with Tint", price: "£40" },
    ],
  },
  {
    slug: "eyelash-extensions",
    name: "Eyelash Extensions",
    summary: "Strip and cluster lash extensions.",
    items: [
      { name: "Strip Lashes", price: "£10" },
      { name: "Cluster Lashes", price: "£26" },
      { name: "Extension Removal", price: "from £10" },
    ],
  },
  {
    slug: "henna-glitter-tattoos",
    name: "Henna & Glitter Tattoos",
    summary: "Henna and glitter body art.",
    items: [
      { name: "Henna Tattoos", price: "from £5" },
      { name: "Glitter Tattoos", price: "from £3" },
    ],
  },
  {
    slug: "nails",
    name: "Nails",
    summary: "File and polish, Shellac, and Biab, for fingers and toes.",
    items: [
      { name: "File & Polish - Fingers (Vinylux)", price: "£19" },
      { name: "File & Polish - Fingers (Shellac)", price: "£25" },
      { name: "File & Polish - Fingers (Shellac French)", price: "£29" },
      { name: "File & Polish - Toes (Vinylux)", price: "£23" },
      { name: "File & Polish - Toes (Shellac)", price: "£29" },
      { name: "File & Polish - Toes (Shellac French)", price: "£33" },
      { name: "Manicure (Vinylux)", price: "£29" },
      { name: "Manicure (Shellac)", price: "£33" },
      { name: "Manicure (Shellac French)", price: "£37" },
      { name: "Mini Manicure (No Nail Polish)", price: "£16" },
      { name: "Mirror / Matt / Ceramic / Holographic Nails", price: "£30" },
      { name: "Biab - Extra Strength Polish", price: "£38" },
      { name: "Biab - Infill", price: "£37" },
      { name: "Biab - Redo", price: "£42" },
      { name: "Nail Polish Removal", price: "from £3" },
      { name: "Gel Removal", price: "from £12" },
      { name: "Acrylic / Extension Removal", price: "from £15" },
    ],
  },
];

// Short list used on the homepage — the leaflet's own top-line summary of
// what Kaaya offers.
export const CORE_SERVICES = [
  "Eyebrows",
  "Threading",
  "Tinting",
  "Waxing",
  "Henna",
  "Eyelash Lift & Curl",
  "Eyelash Extension",
  "Nails",
  "Manicures",
  "Pedicures",
];

export const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/treatments", label: "Treatments" },
  { to: "/about", label: "About" },
  { to: "/gallery", label: "Gallery" },
  { to: "/contact", label: "Contact" },
];

export const CONSULTATION_ROUTE = "/consultation";
