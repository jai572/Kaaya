import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// A blank white screen with no visible error is the worst failure mode for a
// production app — this guarantees a crash is at least visible on-page,
// not just in a browser console nobody's looking at.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Unhandled error", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="kaaya-shell">
          <div className="kaaya-card">
            <h2 style={{ marginTop: 0 }}>Something went wrong</h2>
            <p>Please refresh the page. If this keeps happening, contact Kaaya.</p>
            <p style={{ color: "var(--kaaya-text-muted)", fontSize: "0.85rem" }}>{this.state.error.message}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
