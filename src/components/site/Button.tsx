import { Link } from "react-router-dom";
import type { ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost-light";

type CommonProps = {
  children: ReactNode;
  variant?: Variant;
  block?: boolean;
  className?: string;
};

type ButtonAsLink = CommonProps & {
  to: string;
  external?: false;
};

type ButtonAsExternalLink = CommonProps & {
  to: string;
  external: true;
};

type ButtonAsButton = CommonProps & {
  to?: undefined;
  onClick?: () => void;
  type?: "button" | "submit";
};

type ButtonProps = ButtonAsLink | ButtonAsExternalLink | ButtonAsButton;

function classes(variant: Variant, block: boolean | undefined, extra?: string) {
  return [
    "site-btn",
    `site-btn--${variant}`,
    block ? "site-btn--block" : "",
    extra ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

export default function Button(props: ButtonProps) {
  const variant = props.variant ?? "primary";
  const cls = classes(variant, props.block, props.className);

  if (props.to && "external" in props && props.external) {
    return (
      <a href={props.to} className={cls} target="_blank" rel="noopener noreferrer">
        {props.children}
      </a>
    );
  }

  if (props.to) {
    return (
      <Link to={props.to} className={cls}>
        {props.children}
      </Link>
    );
  }

  const { onClick, type = "button", children } = props as ButtonAsButton;
  return (
    <button type={type} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}
