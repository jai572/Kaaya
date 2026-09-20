type Props = {
  eyebrow?: string;
  title: string;
  body?: string;
  center?: boolean;
  as?: "h1" | "h2" | "h3";
};

export default function SectionHeading({ eyebrow, title, body, center, as = "h2" }: Props) {
  const Tag = as;
  return (
    <div className={`site-section-heading${center ? " site-section-heading--center" : ""}`}>
      {eyebrow && <span className="site-section-heading__eyebrow">{eyebrow}</span>}
      <Tag className="site-section-heading__title">{title}</Tag>
      {body && <p className="site-section-heading__body">{body}</p>}
    </div>
  );
}
