import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./pages/site/Home";
import Treatments from "./pages/site/Treatments";
import About from "./pages/site/About";
import GalleryPage from "./pages/site/GalleryPage";
import Contact from "./pages/site/Contact";
import NotFound from "./pages/site/NotFound";

// The consultation/staff/booking modules pull in @supabase/supabase-js and
// zod — meaningful weight a marketing-page visitor never needs. Lazy-loading
// them keeps that cost off the brochure site's initial bundle.
const ConsultationForm = lazy(() => import("./pages/consultation/ConsultationForm"));
const ConsultationSubmitted = lazy(() => import("./pages/consultation/ConsultationSubmitted"));
const ClientConsultationView = lazy(() => import("./pages/consultation/ClientConsultationView"));
const StaffLogin = lazy(() => import("./pages/staff/StaffLogin"));
const StaffConsultationList = lazy(() => import("./pages/staff/StaffConsultationList"));
const StaffConsultationDetail = lazy(() => import("./pages/staff/StaffConsultationDetail"));
const StaffServices = lazy(() => import("./pages/staff/StaffServices"));
const StaffMembers = lazy(() => import("./pages/staff/StaffMembers"));
const StaffBookings = lazy(() => import("./pages/staff/StaffBookings"));
const StaffPermissions = lazy(() => import("./pages/staff/StaffPermissions"));
const BookingForm = lazy(() => import("./pages/booking/BookingForm"));
const BookingConfirmed = lazy(() => import("./pages/booking/BookingConfirmed"));

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/treatments" element={<Treatments />} />
        <Route path="/about" element={<About />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/book" element={<BookingForm />} />
        <Route path="/book/:appointmentId/confirmed" element={<BookingConfirmed />} />

        <Route path="/consultation" element={<ConsultationForm />} />
        <Route path="/consultation/:id/submitted" element={<ConsultationSubmitted />} />
        <Route path="/c/:id" element={<ClientConsultationView />} />

        <Route path="/staff/login" element={<StaffLogin />} />
        <Route path="/staff" element={<StaffConsultationList />} />
        <Route path="/staff/consultations/:id" element={<StaffConsultationDetail />} />
        <Route path="/staff/services" element={<StaffServices />} />
        <Route path="/staff/staff-members" element={<StaffMembers />} />
        <Route path="/staff/bookings" element={<StaffBookings />} />
        <Route path="/staff/permissions" element={<StaffPermissions />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
