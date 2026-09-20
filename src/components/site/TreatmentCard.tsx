import type { TreatmentCategory } from "../../config/site";
import { Link } from "react-router-dom";

type Props = {
  category: TreatmentCategory;
};

export default function TreatmentCard({ category }: Props) {
  const fromPrice = category.items[0]?.price;

  return (
    <div className="site-treatment-card">
      <h3 className="site-treatment-card__name">{category.name}</h3>
      <p className="site-treatment-card__summary">{category.summary}</p>
      <div className="site-treatment-card__meta">
        {category.patchTestRequired ? (
          <span className="site-badge">Patch test required</span>
        ) : (
          <span />
        )}
        <Link to={`/treatments#${category.slug}`} className="site-treatment-card__link">
          {fromPrice ? `From ${fromPrice}` : "See prices"} →
        </Link>
      </div>
    </div>
  );
}
