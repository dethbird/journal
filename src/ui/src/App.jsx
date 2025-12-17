import React, { useEffect, useState } from 'react';

const CONNECT_PROVIDERS = [
  { id: 'spotify', name: 'Spotify', start: '/api/oauth/spotify/start' },
  { id: 'github', name: 'GitHub', start: '/api/oauth/github/start' },
];

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

const HomeView = ({ user, onLogout, onDisconnect }) => (
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
          <button className="button is-light" title="Logout" aria-label="Logout" onClick={onLogout}>
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
      <div className="mt-2">
        {CONNECT_PROVIDERS.map((p) => {
          const connected = (user.connectedAccounts || []).find((acc) => acc.provider === p.id);
          if (connected) {
            return (
              <div key={p.id} className="box">
                <div className="level">
                  <div className="level-left">
                    <div>
                      <p className="is-size-6 has-text-weight-semibold">{p.name}</p>
                      <p>{connected.displayName || connected.providerAccountId}</p>
                      {connected.scopes && <p className="is-size-7 has-text-grey">{connected.scopes}</p>}
                    </div>
                  </div>
                  <div className="level-right">
                    <div className="buttons">
                      <button
                        className="button is-light"
                        onClick={async () => {
                          try {
                            await onDisconnect(p.id);
                          } catch (e) {
                            /* ignore */
                          }
                        }}
                      >
                        <span className="icon">
                          <i className="fa-solid fa-unlink" />
                        </span>
                        <span>Disconnect</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div key={p.id} className="mt-2">
              <a className="button is-primary" href={p.start}>
                <span className="icon">
                  <i className={`fa-brands fa-${p.id}`} />
                </span>
                <span>Authorize {p.name}</span>
              </a>
            </div>
          );
        })}
      </div>
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
              onDisconnect={async (provider) => {
                try {
                  await fetch('/api/disconnect', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ provider }),
                  });
                } catch (e) {
                  /* ignore */
                }

                // refresh user
                setState({ loading: true, user: null, error: null });
                try {
                  const res = await fetch('/api/me', { credentials: 'include' });
                  if (res.ok) {
                    const data = await res.json();
                    setState({ loading: false, user: data, error: null });
                    return;
                  }
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
