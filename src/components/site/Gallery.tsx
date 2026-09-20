import heroWebp from "../../assets/brand/hero.webp";

export default function Gallery() {
  return (
    <div className="site-gallery">
      <div className="site-gallery__item">
        <img src={heroWebp} alt="Kaaya - eyebrow and beauty styling" loading="lazy" />
      </div>
    </div>
  );
}
