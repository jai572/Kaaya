import type { ReactNode } from "react";
import { BOOKING_URL, CONTACT, CONSULTATION_ROUTE, SHOW_CONSULTATION } from "../../config/site";
import Button from "./Button";

type Props = {
  title?: string;
  body?: ReactNode;
};

export default function CTASection({ title, body }: Props) {
  return (
    <section className="site-section site-section--tight">
      <div className="site-container">
        <div className={`site-cta-band${title ? "" : " site-cta-band--center-actions"}`}>
          {title && (
            <div>
              <h2>{title}</h2>
              {body && <p>{body}</p>}
            </div>
          )}
          <div className="site-cta-band__actions">
            <Button to={BOOKING_URL ?? CONTACT.phoneHref} external={!!BOOKING_URL} variant="ghost-light">
              Book Appointment
            </Button>
            {SHOW_CONSULTATION && (
              <Button to={CONSULTATION_ROUTE} variant="ghost-light">
                Complete Consultation
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
