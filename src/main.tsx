import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./styles/theme.css";
import "./styles/site.css";

const rootEl = document.getElementById("root")!;
// index.html's safety-net message may already be in #root if this script
// was slow to arrive; it must not survive underneath the real app. The flag
// stops it being injected later while a lazy page chunk is still loading
// (React leaves #root empty during that Suspense).
(window as unknown as { __kaayaMounted?: boolean }).__kaayaMounted = true;
rootEl.replaceChildren();

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
