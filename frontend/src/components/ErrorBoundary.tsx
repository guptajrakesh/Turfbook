import { Component, type ErrorInfo, type ReactNode } from "react";

type State = { error: Error | null };

/** Shows what broke (and a way out) instead of a blank page. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("TurfTime crashed:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // A redeploy replaces the code chunks an open tab still points at; a reload fetches the new ones.
    const staleChunk = /dynamically imported module|Loading chunk|Importing a module script failed/i.test(error.message);
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="card w-full max-w-md space-y-4 p-6 text-center">
          <p className="eyebrow">Foul on the pitch</p>
          <h1 className="display text-5xl">Something broke</h1>
          <p className="text-sm text-chalk-dim">
            {staleChunk ? "A new version of TurfTime is out. Reload to get it." : "This page hit an error. Reloading usually fixes it."}
          </p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-pitch-950 p-3 text-left text-xs text-flag">{error.message}</pre>
          <div className="grid grid-cols-2 gap-2">
            <a href="/" className="btn-ghost">Home</a>
            <button className="btn-lime" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      </div>
    );
  }
}
