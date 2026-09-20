import Header from "../../components/site/Header";
import Footer from "../../components/site/Footer";
import SectionHeading from "../../components/site/SectionHeading";
import Button from "../../components/site/Button";
import { useSeo } from "../../lib/seo";
import { BOOKING_URL, CONTACT } from "../../config/site";

export default function Book() {
  useSeo({
    title: "Book an Appointment | Kaaya Aberdeen",
    description:
      "Book a visit to Kaaya in Bon Accord Shopping Centre, Aberdeen. Call, message us on Facebook or visit us for a walk-in appointment.",
    path: "/book",
  });

  return (
    <>
      <Header />
      <main id="main-content" className="site-page">
        <section className="site-section site-section--tight">
          <div className="site-container site-container--narrow">
            <SectionHeading as="h1" eyebrow="Book" title="Book an appointment" />

            {BOOKING_URL ? (
              <Button to={BOOKING_URL} external block>
                Continue to booking
              </Button>
            ) : (
              <>
                <p className="site-lede">
                  Kaaya does not currently have an online booking link published. You can call us,
                  message us on Facebook, or visit us in Bon Accord Shopping Centre.
                </p>
                <div className="site-hero__actions">
                  <Button to={CONTACT.phoneHref}>Call {CONTACT.phone}</Button>
                  <Button to={CONTACT.facebookUrl} variant="secondary" external>
                    Message on Facebook
                  </Button>
                </div>
              </>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
