import Header from "../../components/site/Header";
import Footer from "../../components/site/Footer";
import SectionHeading from "../../components/site/SectionHeading";
import CTASection from "../../components/site/CTASection";
import { useSeo } from "../../lib/seo";
import { CORE_SERVICES, CONTACT, BUSINESS_DESCRIPTION } from "../../config/site";

export default function About() {
  useSeo({
    title: "About",
    description:
      "Kaaya is an established Brow Bar in Aberdeen, highly experienced in threading, tinting, waxing, lashes and nails — in Bon Accord Shopping Centre.",
    path: "/about",
  });

  return (
    <>
      <Header />
      <main id="main-content" className="site-page">
        <section className="site-section site-section--tight">
          <div className="site-container site-container--narrow">
            <SectionHeading eyebrow="About Kaaya" title="An established Brow Bar in Aberdeen" />
            {BUSINESS_DESCRIPTION.split("\n\n").map((paragraph) => (
              <p className="site-lede" key={paragraph.slice(0, 24)}>
                {paragraph}
              </p>
            ))}

            <div className="site-note">
              Team and founder profiles aren't in the source material supplied for this build —
              send over that copy and photos and this section can name the people behind Kaaya.
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
