import { Link } from "react-router-dom";
import { NAV_LINKS, CONTACT, CONSULTATION_ROUTE, BUSINESS_NAME } from "../../config/site";
import logoWhite from "../../assets/brand/logo-white.png";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-container">
        <div className="site-footer__grid">
          <div>
            <img src={logoWhite} alt={BUSINESS_NAME} className="site-footer__logo" />
            <p className="site-footer__tagline">
              Eyebrows, threading, tinting, waxing, henna, lashes and nails at Bon Accord
              Shopping Centre, Aberdeen.
            </p>
          </div>

          <div>
            <div className="site-footer__heading">Explore</div>
            <ul className="site-footer__links">
              {NAV_LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to}>{link.label}</Link>
                </li>
              ))}
              <li>
                <Link to={CONSULTATION_ROUTE}>Consultation</Link>
              </li>
            </ul>
          </div>

          <div>
            <div className="site-footer__heading">Contact</div>
            <ul className="site-footer__links">
              <li>
                <a href={CONTACT.phoneHref}>{CONTACT.phone}</a>
              </li>
              <li>
                <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
              </li>
              <li>
                <span>
                  {CONTACT.addressLine1}, {CONTACT.addressLine2}
                </span>
              </li>
              <li>
                <a href={CONTACT.facebookUrl} target="_blank" rel="noopener noreferrer">
                  Facebook
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="site-footer__bottom">
          <span>© {new Date().getFullYear()} {BUSINESS_NAME}</span>
          <span>Bon Accord Shopping Centre, Aberdeen</span>
        </div>
      </div>
    </footer>
  );
}
