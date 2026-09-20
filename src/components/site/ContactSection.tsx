import { CONTACT } from "../../config/site";

export default function ContactSection() {
  return (
    <div className="site-contact-grid">
      <div className="site-contact-list">
        <div>
          <div className="site-contact-item__label">Phone</div>
          <div className="site-contact-item__value">
            <a href={CONTACT.phoneHref}>{CONTACT.phone}</a>
          </div>
        </div>

        <div>
          <div className="site-contact-item__label">Email</div>
          <div className="site-contact-item__value">
            <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
          </div>
        </div>

        <div>
          <div className="site-contact-item__label">Address</div>
          <div className="site-contact-item__value">
            {CONTACT.addressLine1}
            <br />
            {CONTACT.addressLine2}
          </div>
        </div>

        <div>
          <div className="site-contact-item__label">Opening hours</div>
          <div className="site-contact-item__value">
            {CONTACT.openingHours ? (
              CONTACT.openingHours.map((line) => <div key={line}>{line}</div>)
            ) : (
              <span className="site-contact-item__empty">Not yet published — call ahead to confirm.</span>
            )}
          </div>
        </div>

        <div>
          <div className="site-contact-item__label">Facebook</div>
          <div className="site-contact-item__value">
            <a href={CONTACT.facebookUrl} target="_blank" rel="noopener noreferrer">
              {CONTACT.facebookHandle}
            </a>
          </div>
        </div>
      </div>

      <div className="site-map-frame">
        <iframe
          title="Kaaya location — Bon Accord Shopping Centre, Aberdeen"
          loading="lazy"
          src="https://www.google.com/maps?q=Bon+Accord+Shopping+Centre+Aberdeen&output=embed"
        />
      </div>
    </div>
  );
}
