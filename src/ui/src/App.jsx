import React, { useEffect, useState } from 'react';
import Digest from './components/Digest';
import Journal from './components/Journal';
import Settings from './components/Settings';
import { CONNECT_PROVIDERS } from './constants';

const CollectorControls = ({ onStatusChange }) => {
  const [status, setStatus] = useState({ loading: true, canStart: false, currentRunning: null, recentRuns: [] });
  const [operation, setOperation] = useState({ running: false, error: null });

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/collector/status', { credentials: 'include' });
      if (!res.ok) throw new Error(`Status check failed (${res.status})`);
      const data = await res.json();
      setStatus({ ...data, loading: false });
      setOperation({ running: false, error: null });
      if (onStatusChange) onStatusChange(data);
    } catch (err) {
      setStatus({ ...status, loading: false });
      setOperation({ running: false, error: err.message });
    }
  };

  const startCollector = async () => {
    try {
      setOperation({ running: true, error: null });
      const res = await fetch('/api/collector/start', { 
        method: 'POST', 
        credentials: 'include' 
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Start failed (${res.status})`);
      }
      setTimeout(fetchStatus, 500);
    } catch (err) {
      setOperation({ running: false, error: err.message });
    }
  };

  const cancelCollector = async () => {
    try {
      setOperation({ running: true, error: null });
      const res = await fetch('/api/collector/cancel', { 
        method: 'POST', 
        credentials: 'include' 
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Cancel failed (${res.status})`);
      }
      setTimeout(fetchStatus, 500);
    } catch (err) {
      setOperation({ running: false, error: err.message });
    }
  };

  useEffect(() => {
    let mounted = true;

    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

    const pollLoop = async () => {
      while (mounted) {
        try {
          await fetchStatus();
        } catch (e) {
          // ignore - fetchStatus will set error state
        }

        // choose delay: 1s while running, otherwise 15s
        const delay = (status && status.currentRunning) ? 1000 : 15000;
        await sleep(delay);
      }
    };

    // start loop
    pollLoop();

    return () => { mounted = false; };
  }, [status && status.currentRunning]);

  const isRunning = !!status.currentRunning;

  return (
    <button
      className={`button is-light${operation.running ? ' is-loading' : ''}${isRunning ? ' is-warning' : ''}`}
      onClick={isRunning ? cancelCollector : startCollector}
      disabled={(!status.canStart && !isRunning) || operation.running || status.loading}
      title={isRunning ? 'Stop collection' : 'Start data collection'}
      aria-label={isRunning ? 'Stop collection' : 'Start collection'}
    >
      <span className="icon">
        <i className={`fa-solid ${isRunning ? 'fa-stop' : 'fa-play'}`} />
      </span>
    </button>
  );
};

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const formatDateLabel = (date) => {
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
};

const formatDateISO = (date) => {
  // Return YYYY-MM-DD in local time
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

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
    <a className="button is-primary ml-2" href="/api/oauth/google/start">
      <span className="icon">
        <i className="fa-brands fa-google" />
      </span>
      <span>Login with Google</span>
    </a>
  </div>
);

// Home header + routing will render Digest or Settings below

function App() {
  const [state, setState] = useState({ loading: true, user: null, error: null });
  const [path, setPath] = useState(window.location.pathname || '/');
  const [sendState, setSendState] = useState({ sending: false, message: null, error: null });
  const [offsetDays, setOffsetDays] = useState(0);
  const [collectorStatus, setCollectorStatus] = useState(null);

  // Compute current selected date from offset
  const todayStart = startOfDay(new Date());
  const selectedDate = new Date(todayStart.getTime() + offsetDays * DAY_MS);
  const selectedDateISO = formatDateISO(selectedDate);
  const selectedDateLabel = formatDateLabel(selectedDate);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname || '/');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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
            <div>
              <div className="level mb-4">
                <div className="level-left">
                  <div>
                    <p className="subtitle is-6 has-text-grey">Evidence Journal</p>
                    <h1 className="title is-2">Hello, {state.user.displayName || 'friend'}</h1>
                    {sendState.message ? <p className="help is-success">{sendState.message}</p> : null}
                    {sendState.error ? <p className="help is-danger">{sendState.error}</p> : null}
                    {collectorStatus?.recentRuns?.[0] && !collectorStatus.currentRunning && (
                      <p className="help is-info">
                        Last collection: {new Date(collectorStatus.recentRuns[0].finishedAt || collectorStatus.recentRuns[0].startedAt).toLocaleString()}
                        {collectorStatus.recentRuns[0].eventCount > 0 && ` (${collectorStatus.recentRuns[0].eventCount} events)`}
                      </p>
                    )}
                    {collectorStatus?.currentRunning && (
                      <p className="help is-warning">
                        Collection running... (started {new Date(collectorStatus.currentRunning.startedAt).toLocaleTimeString()})
                      </p>
                    )}
                  </div>
                </div>
                <div className="level-right">
                  <div className="buttons">
                    <button
                      className="button is-small"
                      onClick={() => setOffsetDays((d) => d - 1)}
                      title="Previous day"
                    >
                      <span className="icon">
                        <i className="fa-solid fa-chevron-left" />
                      </span>
                    </button>
                    <span className="button is-static is-small">{selectedDateLabel}</span>
                    <button
                      className="button is-small"
                      onClick={() => setOffsetDays((d) => Math.min(d + 1, 0))}
                      disabled={offsetDays >= 0}
                      title="Next day"
                    >
                      <span className="icon">
                        <i className="fa-solid fa-chevron-right" />
                      </span>
                    </button>
                    <span className="mx-2" />
                    <button
                      className="button is-light"
                      title="Digest"
                      aria-label="Digest"
                      onClick={(e) => {
                        e.preventDefault();
                        window.history.pushState({}, '', '/');
                        setPath('/');
                      }}
                    >
                      <span className="icon">
                        <i className="fa-solid fa-house" />
                      </span>
                    </button>
                    <button
                      className="button is-light"
                      title="Journal"
                      aria-label="Journal"
                      onClick={(e) => {
                        e.preventDefault();
                        window.history.pushState({}, '', '/journal');
                        setPath('/journal');
                      }}
                    >
                      <span className="icon">
                        <i className="fa-solid fa-pen-to-square" />
                      </span>
                    </button>
                    <CollectorControls onStatusChange={setCollectorStatus} />
                    <button
                      className={`button is-light${sendState.sending ? ' is-loading' : ''}`}
                      title="Send digest"
                      aria-label="Send digest"
                      onClick={async () => {
                        setSendState({ sending: true, message: null, error: null });
                        try {
                          const res = await fetch('/api/digest/send', { method: 'POST', credentials: 'include' });
                          if (!res.ok) {
                            const body = await res.json().catch(() => ({}));
                            throw new Error(body.error || `Send failed (${res.status})`);
                          }
                          setSendState({ sending: false, message: 'Sent!', error: null });
                          setTimeout(() => setSendState((prev) => ({ ...prev, message: null })), 2500);
                        } catch (err) {
                          setSendState({ sending: false, message: null, error: err.message });
                        }
                      }}
                    >
                      <span className="icon">
                        <i className="fa-solid fa-envelope" />
                      </span>
                    </button>
                    <a
                      href="/settings"
                      className="button is-light"
                      onClick={(e) => {
                        e.preventDefault();
                        window.history.pushState({}, '', '/settings');
                        setPath('/settings');
                      }}
                      title="Settings"
                    >
                      <span className="icon">
                        <i className="fa-solid fa-cog" />
                      </span>
                    </a>
                    <button
                      className="button is-light"
                      title="Logout"
                      aria-label="Logout"
                      onClick={async () => {
                        try {
                          await fetch('/api/logout', { method: 'POST', credentials: 'include' });
                        } catch (e) {
                          /* ignore */
                        }
                        setState({ loading: false, user: null, error: null });
                        // navigate home
                        window.history.pushState({}, '', '/');
                        setPath('/');
                      }}
                    >
                      <span className="icon">
                        <i className="fa-solid fa-right-from-bracket" />
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              <div>
                {path === '/settings' ? (
                  <Settings
                    user={state.user}
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
                ) : path === '/journal' ? (
                  <Journal date={selectedDateISO} dateLabel={selectedDateLabel} />
                ) : (
                  <div>
                    <Digest offsetDays={offsetDays} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default App;
