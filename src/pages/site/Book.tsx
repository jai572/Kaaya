import Header from "../../components/site/Header";
import Footer from "../../components/site/Footer";
import SectionHeading from "../../components/site/SectionHeading";
import Button from "../../components/site/Button";
import { useSeo } from "../../lib/seo";
import { BOOKING_URL, CONTACT, APP_LINKS } from "../../config/site";

export default function Book() {
  useSeo({
    title: "Book an Appointment",
    description: "Book an appointment at Kaaya — by phone, walk-in, or the Kaaya Brow Bar app.",
    path: "/book",
  });

  return (
    <>
      <Header />
      <main id="main-content" className="site-page">
        <section className="site-section site-section--tight">
          <div className="site-container site-container--narrow">
            <SectionHeading eyebrow="Book" title="Book an appointment" />

            {BOOKING_URL ? (
              <Button to={BOOKING_URL} external block>
                Continue to booking
              </Button>
            ) : (
              <>
                <p className="site-lede">
                  Kaaya doesn't have an online booking link published yet — walk-in and phone
                  bookings are both available today.
                </p>
                <div className="site-hero__actions">
                  <Button to={CONTACT.phoneHref}>Call {CONTACT.phone}</Button>
                  <Button to={CONTACT.facebookUrl} variant="secondary" external>
                    Message on Facebook
                  </Button>
                </div>
                <p className="site-note site-section__more">
                  Kaaya also has a booking app — {APP_LINKS.name} — but no store link was supplied
                  for this build. Once Kaaya provides a Square (or other) booking URL, set{" "}
                  <code>BOOKING_URL</code> in <code>src/config/site.ts</code> and every Book
                  Appointment button on the site updates automatically.
                </p>
              </>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
