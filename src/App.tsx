import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./pages/site/Home";
import Treatments from "./pages/site/Treatments";
import About from "./pages/site/About";
import GalleryPage from "./pages/site/GalleryPage";
import Contact from "./pages/site/Contact";
import Book from "./pages/site/Book";
import NotFound from "./pages/site/NotFound";

// The consultation/staff module pulls in @supabase/supabase-js and zod —
// meaningful weight a marketing-page visitor never needs. Lazy-loading it
// keeps that cost off the brochure site's initial bundle.
const ConsultationForm = lazy(() => import("./pages/consultation/ConsultationForm"));
const ConsultationSubmitted = lazy(() => import("./pages/consultation/ConsultationSubmitted"));
const ClientConsultationView = lazy(() => import("./pages/consultation/ClientConsultationView"));
const StaffLogin = lazy(() => import("./pages/staff/StaffLogin"));
const StaffConsultationList = lazy(() => import("./pages/staff/StaffConsultationList"));
const StaffConsultationDetail = lazy(() => import("./pages/staff/StaffConsultationDetail"));

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/treatments" element={<Treatments />} />
        <Route path="/about" element={<About />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/book" element={<Book />} />

        <Route path="/consultation" element={<ConsultationForm />} />
        <Route path="/consultation/:id/submitted" element={<ConsultationSubmitted />} />
        <Route path="/c/:id" element={<ClientConsultationView />} />

        <Route path="/staff/login" element={<StaffLogin />} />
        <Route path="/staff" element={<StaffConsultationList />} />
        <Route path="/staff/consultations/:id" element={<StaffConsultationDetail />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
