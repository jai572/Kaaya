import Header from "../../components/site/Header";
import Footer from "../../components/site/Footer";
import SectionHeading from "../../components/site/SectionHeading";
import CTASection from "../../components/site/CTASection";
import { useSeo } from "../../lib/seo";
import { CORE_SERVICES, CONTACT } from "../../config/site";

export default function About() {
  useSeo({
    title: "About",
    description: "About Kaaya — Aberdeen's threading, tinting and nail studio in Bon Accord Shopping Centre.",
    path: "/about",
  });

  return (
    <>
      <Header />
      <main id="main-content" className="site-page">
        <section className="site-section site-section--tight">
          <div className="site-container site-container--narrow">
            <SectionHeading eyebrow="About Kaaya" title="A focused beauty studio in the heart of Aberdeen" />
            <p className="site-lede">
              Kaaya is based in {CONTACT.addressLine1}, {CONTACT.addressLine2}, offering eyebrow
              shaping, threading, tinting, waxing, henna, eyelash lift and extensions, and a full
              nail menu — with both walk-in and appointment booking available.
            </p>

            <div className="site-note">
              Kaaya's founding story and team profiles aren't in the source material supplied for
              this build. This section is intentionally left short rather than filled with
              invented history — send over the story/team copy and photos and this becomes a full
              About page.
            </div>
          </div>
        </section>

        <section className="site-section site-section--sky">
          <div className="site-container">
            <SectionHeading eyebrow="On the menu" title="What Kaaya offers" />
            <ul className="site-grid site-grid--3 site-plain-list">
              {CORE_SERVICES.map((service) => (
                <li key={service} className="site-treatment-card site-treatment-card--flat">
                  {service}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="site-section site-section--tight">
          <div className="site-container">
            <CTASection title="Come and see us" body={`${CONTACT.addressLine1}, ${CONTACT.addressLine2}.`} />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
