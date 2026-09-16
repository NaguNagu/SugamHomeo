"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <main className="loading-state"><div><span className="loading-mark">!</span><h2>Something went wrong</h2><p className="subheading">Your records are safe. Please try the page again.</p><button className="primary-button" onClick={() => reset()}>Try again</button></div></main>; }
