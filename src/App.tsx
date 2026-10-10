import { Suspense } from "react";
import { lazyWithReload } from "./lib/lazyWithReload";
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
const ConsultationForm = lazyWithReload(() => import("./pages/consultation/ConsultationForm"));
const ConsultationSubmitted = lazyWithReload(() => import("./pages/consultation/ConsultationSubmitted"));
const ClientConsultationView = lazyWithReload(() => import("./pages/consultation/ClientConsultationView"));
const StaffLogin = lazyWithReload(() => import("./pages/staff/StaffLogin"));
const StaffLayout = lazyWithReload(() => import("./components/staff/StaffLayout"));
const StaffConsultationList = lazyWithReload(() => import("./pages/staff/StaffConsultationList"));
const StaffConsultationDetail = lazyWithReload(() => import("./pages/staff/StaffConsultationDetail"));
const StaffServices = lazyWithReload(() => import("./pages/staff/StaffServices"));
const StaffMembers = lazyWithReload(() => import("./pages/staff/StaffMembers"));
const StaffFiles = lazyWithReload(() => import("./pages/staff/StaffFiles"));
const StaffFileDetail = lazyWithReload(() => import("./pages/staff/StaffFileDetail"));
const StaffRota = lazyWithReload(() => import("./pages/staff/StaffRota"));
const StaffLocations = lazyWithReload(() => import("./pages/staff/StaffLocations"));
const StaffBookings = lazyWithReload(() => import("./pages/staff/StaffBookings"));
const StaffCalendar = lazyWithReload(() => import("./pages/staff/calendar/StaffCalendar"));
const StaffSales = lazyWithReload(() => import("./pages/staff/StaffSales"));
const StaffPermissions = lazyWithReload(() => import("./pages/staff/StaffPermissions"));
const StaffClientRecord = lazyWithReload(() => import("./pages/staff/StaffClientRecord"));
const BookingForm = lazyWithReload(() => import("./pages/booking/BookingForm"));
const BookingConfirmed = lazyWithReload(() => import("./pages/booking/BookingConfirmed"));
const ManageBooking = lazyWithReload(() => import("./pages/booking/ManageBooking"));

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
        <Route path="/book/:appointmentId/manage" element={<ManageBooking />} />

        <Route path="/consultation" element={<ConsultationForm />} />
        <Route path="/consultation/:id/submitted" element={<ConsultationSubmitted />} />
        <Route path="/c/:id" element={<ClientConsultationView />} />

        <Route path="/staff/login" element={<StaffLogin />} />
        <Route path="/staff" element={<StaffLayout />}>
          <Route index element={<StaffConsultationList />} />
          <Route path="consultations/:id" element={<StaffConsultationDetail />} />
          <Route path="services" element={<StaffServices />} />
          <Route path="staff-members" element={<StaffMembers />} />
          <Route path="rota" element={<StaffRota />} />
          <Route path="locations" element={<StaffLocations />} />
          <Route path="calendar" element={<StaffCalendar />} />
          <Route path="sales" element={<StaffSales />} />
          <Route path="bookings" element={<StaffBookings />} />
          <Route path="permissions" element={<StaffPermissions />} />
          <Route path="clients/:clientId" element={<StaffClientRecord />} />
          <Route path="files" element={<StaffFiles />} />
          <Route path="files/:staffMemberId" element={<StaffFileDetail />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
