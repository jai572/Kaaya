import heroWebp from "../../assets/brand/hero.webp";
import shopCounterWebp from "../../assets/gallery/shop-counter.webp";
import shopInteriorWebp from "../../assets/gallery/shop-interior.webp";
import stationWebp from "../../assets/gallery/station.webp";
import browBeforeAfterWebp from "../../assets/gallery/brow-before-after.webp";
import nailsWebp from "../../assets/gallery/nails.webp";
import laminationBeforeAfterWebp from "../../assets/gallery/lamination-before-after.webp";
import hennaWebp from "../../assets/gallery/henna.webp";

const IMAGES: { src: string; alt: string }[] = [
  { src: browBeforeAfterWebp, alt: "Eyebrow threading before and after at Kaaya" },
  { src: laminationBeforeAfterWebp, alt: "Brow lamination before and after at Kaaya" },
  { src: nailsWebp, alt: "Gel nails with a French tip finish by Kaaya" },
  { src: hennaWebp, alt: "Henna hand design by Kaaya" },
  { src: heroWebp, alt: "Kaaya - eyebrow and beauty styling" },
  { src: shopCounterWebp, alt: "Kaaya's counter at Bon Accord Shopping Centre, Aberdeen" },
  { src: shopInteriorWebp, alt: "Inside Kaaya at Bon Accord Shopping Centre" },
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
