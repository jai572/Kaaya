import { useEffect } from "react";

type SeoOptions = {
  title: string;
  description: string;
  path: string;
};

const SITE_NAME = "Kaaya";
// Placeholder base URL — Cloudflare dev origin until the real domain is
// migrated (see brief section 18). Swap once the production domain is live.
const SITE_ORIGIN = "https://kaaya.jb-38f.workers.dev";

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

// Minimal per-route SEO: page title, meta description, canonical URL and
// Open Graph tags. Deliberately not a dependency (react-helmet etc.) —
// this is the entire requirement, a hook is enough.
export function useSeo({ title, description, path }: SeoOptions) {
  useEffect(() => {
    const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
    document.title = fullTitle;

    setMeta("name", "description", description);

    const url = `${SITE_ORIGIN}${path}`;
    setLink("canonical", url);

    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", url);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", SITE_NAME);

    setMeta("name", "twitter:card", "summary");
    setMeta("name", "twitter:title", fullTitle);
    setMeta("name", "twitter:description", description);
  }, [title, description, path]);
}
