import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { NAV_LINKS, CONSULTATION_ROUTE, BOOKING_URL, CONTACT } from "../../config/site";
import logoNavy from "../../assets/brand/logo-navy.png";
import Button from "./Button";

export default function Header() {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <a href="#main-content" className="site-skip-link">
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-container site-header__inner">
          <Link to="/" className="site-header__logo" aria-label="Kaaya home">
            <img src={logoNavy} alt="Kaaya" />
          </Link>

          <nav className="site-nav" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="site-nav__link"
                aria-current={location.pathname === link.to ? "page" : undefined}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="site-header__actions">
            <Link to={CONSULTATION_ROUTE} className="site-header__consult-link">
              Consultation
            </Link>
            <Button to={BOOKING_URL ?? CONTACT.phoneHref} external={!!BOOKING_URL}>
              Book Appointment
            </Button>
            <button
              type="button"
              className="site-header__menu-btn"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="site-mobile-nav"
              onClick={() => setOpen((v) => !v)}
            >
              <span />
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div id="site-mobile-nav" className="site-mobile-nav" role="dialog" aria-modal="true">
          {NAV_LINKS.map((link) => (
            <Link key={link.to} to={link.to} className="site-mobile-nav__link">
              {link.label}
            </Link>
          ))}
          <Link to={CONSULTATION_ROUTE} className="site-mobile-nav__link">
            Consultation
          </Link>

          <div className="site-mobile-nav__ctas">
            <Button to={BOOKING_URL ?? CONTACT.phoneHref} external={!!BOOKING_URL} block>
              Book Appointment
            </Button>
            <Button to="/contact" variant="secondary" block>
              Contact Kaaya
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
