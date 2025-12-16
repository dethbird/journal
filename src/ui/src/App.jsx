import React, { useState, useEffect } from 'react';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function fetchMe() {
      try {
        const res = await fetch('/api/me', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch');
        const json = await res.json();
        if (mounted) setUser(json.user || null);
      } catch (e) {
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchMe();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="page">
      <header>
        <p className="eyebrow">Journal</p>
        <h1>{loading ? 'Loading…' : user ? `Hello, ${user.displayName || user.email}` : 'Hello, world.'}</h1>
        <p className="lede">Evidence-first journaling. API and collector share this server.</p>
      </header>
      <section className="card">
        <h2>Next steps</h2>
        <ul>
          <li>Wire the API endpoints at <code>/api</code> into this UI.</li>
          <li>Add collectors (GitHub, IMAP) to populate events.</li>
          <li>
            <a className="btn" href="/api/auth/github/login">Login with GitHub</a>
          </li>
          <li>Render a day view and calendar with highlights.</li>
        </ul>
      </section>
    </div>
  );
}
