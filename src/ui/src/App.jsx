import React, { useEffect, useState } from 'react';

const LoginView = () => (
  <div className="box">
    <p className="subtitle is-5 mb-3">You are not logged in.</p>
    <a className="button is-success" href="/api/oauth/spotify/start">
      Login with Spotify
    </a>
    <a className="button is-dark ml-2" href="/api/oauth/github/start">
      <span className="icon">
        <i className="fa-brands fa-github" />
      </span>
      <span>Login with GitHub</span>
    </a>
  </div>
);

const HomeView = ({ user, onLogout }) => (
  <div>
    <div className="level mb-4">
      <div className="level-left" />
      <div className="level-right">
        <div className="buttons">
          <button className="button is-light" title="Settings">
            <span className="icon">
              <i className="fa-solid fa-cog" />
            </span>
          </button>
          <button
            className="button is-light"
            title="Logout"
            aria-label="Logout"
            onClick={onLogout}
          >
            <span className="icon">
              <i className="fa-solid fa-right-from-bracket" />
            </span>
          </button>
        </div>
      </div>
    </div>
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
          {!state.loading && !state.error && state.user && (
            <HomeView
              user={state.user}
              onLogout={async () => {
                try {
                  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
                } catch (e) {
                  /* ignore */
                }
                setState({ loading: false, user: null, error: null });
              }}
            />
          )}
        </div>
      </div>
    </section>
  );
}

export default App;
