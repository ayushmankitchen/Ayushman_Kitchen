import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error) { console.error("Application render failed", error); }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">The page could not be displayed</h1>
        <p>Please reload and try again. पेज दोबारा खोलें।</p>
        <button className="rounded bg-emerald-800 px-6 py-3 text-white" onClick={() => window.location.reload()}>
          Reload page
        </button>
      </main>
    );
  }
}
