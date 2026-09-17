import { Routes, Route } from "react-router-dom";
import ConsultationForm from "./pages/consultation/ConsultationForm";
import ConsultationSubmitted from "./pages/consultation/ConsultationSubmitted";
import ClientConsultationView from "./pages/consultation/ClientConsultationView";
import StaffLogin from "./pages/staff/StaffLogin";
import StaffConsultationList from "./pages/staff/StaffConsultationList";
import StaffConsultationDetail from "./pages/staff/StaffConsultationDetail";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ConsultationForm />} />
      <Route path="/consultation/:id/submitted" element={<ConsultationSubmitted />} />
      <Route path="/c/:id" element={<ClientConsultationView />} />

      <Route path="/staff/login" element={<StaffLogin />} />
      <Route path="/staff" element={<StaffConsultationList />} />
      <Route path="/staff/consultations/:id" element={<StaffConsultationDetail />} />
    </Routes>
  );
}
