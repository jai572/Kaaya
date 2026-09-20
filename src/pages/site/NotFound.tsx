import Header from "../../components/site/Header";
import Footer from "../../components/site/Footer";
import Button from "../../components/site/Button";
import { useSeo } from "../../lib/seo";

export default function NotFound() {
  useSeo({
    title: "Page not found",
    description: "This page doesn't exist on the Kaaya website.",
    path: typeof window !== "undefined" ? window.location.pathname : "/404",
  });

  return (
    <>
      <Header />
      <main id="main-content" className="site-page">
        <section className="site-section site-section--tight">
          <div className="site-container site-container--narrow site-notfound">
            <h1 className="site-notfound__title">Page not found</h1>
            <p className="site-lede site-notfound__body">
              That page doesn't exist — it may have moved, or the link may be out of date.
            </p>
            <Button to="/">Back to Kaaya home</Button>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
