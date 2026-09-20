import Header from "../../components/site/Header";
import Footer from "../../components/site/Footer";
import SectionHeading from "../../components/site/SectionHeading";
import Gallery from "../../components/site/Gallery";
import CTASection from "../../components/site/CTASection";
import { useSeo } from "../../lib/seo";

export default function GalleryPage() {
  useSeo({
    title: "Gallery",
    description: "A look at Kaaya's work — brows, lashes, henna and nails.",
    path: "/gallery",
  });

  return (
    <>
      <Header />
      <main id="main-content" className="site-page">
        <section className="site-section site-section--tight">
          <div className="site-container">
            <SectionHeading
              eyebrow="Gallery"
              title="A look at Kaaya"
              body="Only one image from Kaaya's own material was supplied for this build — the rest are marked as placeholders rather than filled with stock photography."
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
