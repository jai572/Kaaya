import Header from "../../components/site/Header";
import Footer from "../../components/site/Footer";
import SectionHeading from "../../components/site/SectionHeading";
import Gallery from "../../components/site/Gallery";
import CTASection from "../../components/site/CTASection";
import { useSeo } from "../../lib/seo";

export default function GalleryPage() {
  useSeo({
    title: "Kaaya Gallery | Brows, Lashes, Henna & Nails in Aberdeen",
    description: "See Kaaya's work across brows, lashes, henna and nails at Bon Accord Shopping Centre in Aberdeen.",
    path: "/gallery",
  });

  return (
    <>
      <Header />
      <main id="main-content" className="site-page">
        <section className="site-section site-section--tight">
          <div className="site-container">
            <SectionHeading
              as="h1"
              eyebrow="Gallery"
              title="A look at Kaaya"
              body="A look at Kaaya's work across brows, lashes, henna and nails."
            />
            <Gallery />
          </div>
        </section>

        <section className="site-section site-section--tight">
          <div className="site-container">
            <CTASection title="Ready to book your visit?" />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
