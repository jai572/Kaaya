import Header from "../../components/site/Header";
import Footer from "../../components/site/Footer";
import SectionHeading from "../../components/site/SectionHeading";
import CTASection from "../../components/site/CTASection";
import { useSeo } from "../../lib/seo";
import { TREATMENT_CATEGORIES } from "../../config/site";

export default function Treatments() {
  useSeo({
    title: "Beauty Treatments & Prices | Kaaya Aberdeen",
    description:
      "View Kaaya's beauty treatment menu and prices in Aberdeen, including threading, brows, tinting, waxing, lashes, henna and nails.",
    path: "/treatments",
  });

  return (
    <>
      <Header />
      <main id="main-content" className="site-page">
        <section className="site-section site-section--tight">
          <div className="site-container">
            <SectionHeading
              as="h1"
              eyebrow="Menu"
              title="Treatments & prices"
              body="The full Kaaya price list. Treatments marked “patch test required” need a patch test at least 48 hours before your appointment."
            />

            <nav className="site-treatment-jump" aria-label="Jump to category">
              {TREATMENT_CATEGORIES.map((cat) => (
                <a key={cat.slug} href={`#${cat.slug}`}>
                  {cat.name}
                </a>
              ))}
            </nav>

            {TREATMENT_CATEGORIES.map((cat) => (
              <div className="site-treatment-category" id={cat.slug} key={cat.slug}>
                <div className="site-treatment-category__head">
                  <h2 className="site-treatment-category__title">{cat.name}</h2>
                  {cat.patchTestRequired && (
                    <span className="site-badge">Patch test required, 48 hours before</span>
                  )}
                </div>
                <table className="site-price-table">
                  <tbody>
                    {cat.items.map((item) => (
                      <tr key={item.name}>
                        <td>{item.name}</td>
                        <td>{item.price}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            <p className="site-note">
              Nail add-ons - glitter Shellac, glitter powder and nail art - are charged extra, as
              printed on the Kaaya price list.
            </p>
          </div>
        </section>

        <section className="site-section site-section--tight">
          <div className="site-container">
            <CTASection />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
