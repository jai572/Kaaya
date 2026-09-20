import Header from "../../components/site/Header";
import Footer from "../../components/site/Footer";
import SectionHeading from "../../components/site/SectionHeading";
import ContactSection from "../../components/site/ContactSection";
import Button from "../../components/site/Button";
import { useSeo } from "../../lib/seo";
import { BOOKING_URL, CONTACT, CONSULTATION_ROUTE } from "../../config/site";

export default function Contact() {
  useSeo({
    title: "Contact",
    description: "Contact Kaaya — phone, email, and location at Bon Accord Shopping Centre, Aberdeen.",
    path: "/contact",
  });

  return (
    <>
      <Header />
      <main id="main-content" className="site-page">
        <section className="site-section site-section--tight">
          <div className="site-container">
            <SectionHeading eyebrow="Get in touch" title="Contact Kaaya" />
            <ContactSection />

            <div className="site-hero__actions site-section__more">
              <Button to={BOOKING_URL ?? CONTACT.phoneHref} external={!!BOOKING_URL}>
                Book Appointment
              </Button>
              <Button to={CONSULTATION_ROUTE} variant="secondary">
                Complete Consultation
              </Button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
