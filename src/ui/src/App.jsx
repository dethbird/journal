import React, { useEffect, useState } from 'react';

const LoginView = () => (
  <div className="box">
    <p className="subtitle is-5 mb-3">You are not logged in.</p>
    <a className="button is-success" href="/api/oauth/spotify/start">
      Login with Spotify
    </a>
  </div>
);

const HomeView = ({ user }) => (
  <div>
    <p className="subtitle is-6 has-text-grey">Monolith server</p>
    <h1 className="title is-2">Hello, {user.displayName || 'friend'}</h1>
    <p className="subtitle is-5">
      You are logged in. Fastify is serving this React app at <code>/</code>.
    </p>
    <div className="box">
      <p className="is-size-5 has-text-weight-semibold">Connected accounts</p>
      {user.connectedAccounts?.length ? (
        <ul className="mt-2">
          {user.connectedAccounts.map((acc) => (
            <li key={acc.id}>
              <strong>{acc.provider}</strong> – {acc.displayName || acc.providerAccountId}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2">No connected accounts.</p>
      )}
    </div>
  </div>
);

function App() {
  const [state, setState] = useState({ loading: true, user: null, error: null });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/me', { credentials: 'include' });
        if (res.status === 401) {
          if (!cancelled) setState({ loading: false, user: null, error: null });
          return;
        }
        if (!res.ok) {
          throw new Error(`Failed to load user (${res.status})`);
        }
        const data = await res.json();
        if (!cancelled) setState({ loading: false, user: data, error: null });
      } catch (err) {
        if (!cancelled) setState({ loading: false, user: null, error: err.message });
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="hero is-fullheight has-background-light">
      <div className="hero-body">
        <div className="container">
          {state.loading && <p className="subtitle">Loading…</p>}
          {!state.loading && state.error && <p className="has-text-danger">{state.error}</p>}
          {!state.loading && !state.error && !state.user && <LoginView />}
          {!state.loading && !state.error && state.user && <HomeView user={state.user} />}
        </div>
      </div>
    </section>
  );
}

export default App;
