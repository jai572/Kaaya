import heroWebp from "../../assets/brand/hero.webp";

// Only one real Kaaya image was supplied (the leaflet hero photo). The rest
// of the grid is left as clearly-labelled placeholders rather than stock
// photography standing in for Kaaya's actual work — see the final report.
const PLACEHOLDER_COUNT = 5;

export default function Gallery() {
  return (
    <div className="site-gallery">
      <div className="site-gallery__item">
        <img src={heroWebp} alt="Kaaya — eyebrow and beauty styling" loading="lazy" />
      </div>
      {Array.from({ length: PLACEHOLDER_COUNT }).map((_, i) => (
        <div className="site-gallery__item" key={i}>
          <div className="site-gallery__placeholder">Salon photo coming soon</div>
        </div>
      ))}
    </div>
  );
}
