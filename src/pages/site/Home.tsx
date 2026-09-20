import { Link } from "react-router-dom";
import Header from "../../components/site/Header";
import Footer from "../../components/site/Footer";
import Button from "../../components/site/Button";
import SectionHeading from "../../components/site/SectionHeading";
import TreatmentCard from "../../components/site/TreatmentCard";
import CTASection from "../../components/site/CTASection";
import Gallery from "../../components/site/Gallery";
import ContactSection from "../../components/site/ContactSection";
import { useSeo } from "../../lib/seo";
import { BOOKING_URL, CONTACT, CONSULTATION_ROUTE, TREATMENT_CATEGORIES } from "../../config/site";
import heroWebp from "../../assets/brand/hero.webp";
import heroMobileWebp from "../../assets/brand/hero-mobile.webp";
import logoWhiteBorder from "../../assets/brand/logo-navy-white-border.png";

export default function Home() {
  useSeo({
    title: "Kaaya",
    description:
      "Kaaya — eyebrows, threading, tinting, waxing, henna, lash lift and extensions, and nails, at Bon Accord Shopping Centre, Aberdeen.",
    path: "/",
  });

  return (
    <>
      <Header />
      <main id="main-content" className="site-page">
        <section className="site-hero">
          <div className="site-hero__content">
            <span className="site-hero__eyebrow">Aberdeen · Bon Accord Shopping Centre</span>
            <h1 className="site-hero__title">
              Brows, beauty
              <br />
              and nails, done properly.
            </h1>
            <p className="site-hero__lede">
              Kaaya is Aberdeen's threading, tinting and nail studio — precise eyebrow shaping,
              lash lift and extensions, henna, and a full nail menu, from a team that does this
              every day.
            </p>
            <div className="site-hero__actions">
              <Button to={BOOKING_URL ?? CONTACT.phoneHref} external={!!BOOKING_URL}>
                Book Appointment
              </Button>
              <Button to={CONSULTATION_ROUTE} variant="secondary">
                Complete Consultation
              </Button>
            </div>
          </div>
          <div className="site-hero__media">
            <picture>
              <source media="(max-width: 640px)" srcSet={heroMobileWebp} />
              <img src={heroWebp} alt="Kaaya beauty styling — brows, lashes and nails" />
            </picture>
            <img src={logoWhiteBorder} alt="" aria-hidden="true" className="site-hero__media-logo" />
          </div>
        </section>

        <section className="site-section">
          <div className="site-container">
            <SectionHeading
              eyebrow="What we do"
              title="Treatments"
              body="Everything on the Kaaya menu — the full price list lives on the treatments page."
            />
            <div className="site-grid site-grid--3">
              {TREATMENT_CATEGORIES.slice(0, 6).map((cat) => (
                <TreatmentCard key={cat.slug} category={cat} />
              ))}
            </div>
            <p className="site-section__more">
              <Link to="/treatments" className="site-treatment-card__link">
                View the full treatment menu →
              </Link>
            </p>
          </div>
        </section>

        <section className="site-section site-section--sky">
          <div className="site-container">
            <SectionHeading eyebrow="Kaaya, in short" title="Why clients come to Kaaya" />
            <div className="site-grid site-grid--3">
              <div className="site-treatment-card site-treatment-card--flat">
                <h3 className="site-treatment-card__name">A focused menu</h3>
                <p className="site-treatment-card__summary">
                  Eyebrows, threading, tinting, waxing, henna, eyelash lift and extensions, nails,
                  manicures and pedicures — Kaaya's full service list, nothing padded out.
                </p>
              </div>
              <div className="site-treatment-card site-treatment-card--flat">
                <h3 className="site-treatment-card__name">Walk-in or booked</h3>
                <p className="site-treatment-card__summary">
                  Walk-in and appointment booking are both available, so you can fit Kaaya around
                  your day.
                </p>
              </div>
              <div className="site-treatment-card site-treatment-card--flat">
                <h3 className="site-treatment-card__name">Right in Bon Accord</h3>
                <p className="site-treatment-card__summary">
                  Based in Bon Accord Shopping Centre, Aberdeen — easy to reach, easy to find.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="site-section">
          <div className="site-container">
            <SectionHeading eyebrow="Gallery" title="A look at Kaaya" />
            <Gallery />
          </div>
        </section>

        <section className="site-section">
          <div className="site-container">
            <CTASection
              title="Ready to book?"
              body={`Call ${CONTACT.phone} or walk in — appointments and walk-ins are both welcome.`}
            />
          </div>
        </section>

        <section className="site-section site-section--tight">
          <div className="site-container">
            <SectionHeading eyebrow="Visit" title="Find Kaaya" center />
            <ContactSection />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
