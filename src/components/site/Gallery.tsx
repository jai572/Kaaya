import heroGalleryWebp from "../../assets/gallery/hero-gallery.webp";
import shopCounterWebp from "../../assets/gallery/shop-counter.webp";
import shopInteriorWebp from "../../assets/gallery/shop-interior.webp";
import stationWebp from "../../assets/gallery/station.webp";
import browBeforeAfterWebp from "../../assets/gallery/brow-before-after.webp";
import nailsWebp from "../../assets/gallery/nails.webp";
import festiveNailsWebp from "../../assets/gallery/festive-nails.webp";
import laminationBeforeAfterWebp from "../../assets/gallery/lamination-before-after.webp";
import hennaWebp from "../../assets/gallery/henna.webp";

// Row 1: Eyebrow - Henna - Nails
// Row 2: Nails - Hero - Eyebrow
// Row 3: Nail bars - Main location - Nail table
const IMAGES: { src: string; alt: string }[] = [
  { src: browBeforeAfterWebp, alt: "Eyebrow threading before and after at Kaaya" },
  { src: hennaWebp, alt: "Henna hand design by Kaaya" },
  { src: nailsWebp, alt: "Gel nails with a French tip finish by Kaaya" },
  { src: festiveNailsWebp, alt: "Festive nail art by Kaaya" },
  { src: heroGalleryWebp, alt: "Kaaya - eyebrow and beauty styling" },
  { src: laminationBeforeAfterWebp, alt: "Brow lamination before and after at Kaaya" },
  { src: shopInteriorWebp, alt: "Inside Kaaya at Bon Accord Shopping Centre" },
  { src: shopCounterWebp, alt: "Kaaya's counter at Bon Accord Shopping Centre, Aberdeen" },
  { src: stationWebp, alt: "A treatment station at Kaaya" },
];

export default function Gallery() {
  return (
    <div className="site-gallery">
      {IMAGES.map((image) => (
        <div className="site-gallery__item" key={image.src}>
          <img src={image.src} alt={image.alt} loading="lazy" />
        </div>
      ))}
    </div>
  );
}
