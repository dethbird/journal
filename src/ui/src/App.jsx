import React, { useEffect, useState, useRef } from 'react';
import { useSwipeable } from 'react-swipeable';
import gsap from 'gsap';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import Digest from './components/Digest';
import Journal from './components/Journal';
import Settings from './components/Settings';
import { CONNECT_PROVIDERS } from './constants';
import logoFull from './assets/logo/logo-full.png';

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
      return data;
    } catch (err) {
      setStatus((s) => ({ ...s, loading: false }));
      setOperation({ running: false, error: err.message });
      return null;
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
        let data = null;
        try {
          data = await fetchStatus();
        } catch (e) {
          // fetchStatus handles its own errors
        }

        // choose delay: 1s while running, otherwise 15s
        const isRunning = !!(data?.currentRunning);
        const delay = isRunning ? 1000 : 15000;
        await sleep(delay);
      }
    };

    // start loop
    pollLoop();

    return () => { mounted = false; };
  }, []);

  const isRunning = !!status.currentRunning;

  return (
    <button
      className={`button is-small is-light${operation.running ? ' is-loading' : ''}${isRunning ? ' is-warning' : ''}`}
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
  const dayMonth = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const year = date.getFullYear();
  return { dayMonth, year };
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
  
  // Initialize offsetDays from localStorage if available
  const [offsetDays, setOffsetDays] = useState(() => {
    try {
      const stored = localStorage.getItem('digestOffsetDays');
      return stored !== null ? parseInt(stored, 10) : 0;
    } catch (e) {
      return 0;
    }
  });
  
  const [collectorStatus, setCollectorStatus] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [dateRange, setDateRange] = useState({ minDate: null, maxDate: null });
  const calendarRef = useRef(null);
  const leftButtonRef = useRef(null);
  const rightButtonRef = useRef(null);
  const previousOffsetRef = useRef(0);

  const [weather, setWeather] = useState(null);
  const cToF = (c) => {
    const n = Number(c);
    if (!Number.isFinite(n)) return '';
    return Math.round(((n * 9) / 5 + 32) * 10) / 10;
  };

  // Compute current selected date from offset
  const todayStart = startOfDay(new Date());
  const selectedDate = new Date(todayStart.getTime() + offsetDays * DAY_MS);
  const selectedDateISO = formatDateISO(selectedDate);
  const selectedDateLabel = formatDateLabel(selectedDate);

  // Persist offsetDays to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('digestOffsetDays', offsetDays.toString());
    } catch (e) {
      // Ignore localStorage errors
    }
  }, [offsetDays]);

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

  // Fetch date range for calendar
  useEffect(() => {
    if (!state.user) return;
    let cancelled = false;
    const loadDateRange = async () => {
      try {
        const res = await fetch('/api/events/date-range', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setDateRange({
            minDate: data.minDate ? new Date(data.minDate) : null,
            maxDate: data.maxDate ? new Date(data.maxDate) : null,
          });
        }
      } catch (err) {
        // ignore
      }
    };
    loadDateRange();
    return () => {
      cancelled = true;
    };
  }, [state.user]);

  // Close calendar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setShowCalendar(false);
      }
    };
    if (showCalendar) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCalendar]);

  // Keyboard navigation: Arrow keys to change days
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Don't intercept if user is typing in an input/textarea
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.isContentEditable) {
        return;
      }
      
      // Don't intercept if calendar is open
      if (showCalendar) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setOffsetDays((d) => d - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setOffsetDays((d) => Math.min(d + 1, 0));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCalendar]);

  // Jiggle animation for navigation buttons
  useEffect(() => {
    if (previousOffsetRef.current !== offsetDays) {
      const direction = offsetDays < previousOffsetRef.current ? 'left' : 'right';
      const buttonRef = direction === 'left' ? leftButtonRef : rightButtonRef;
      
      if (buttonRef.current) {
        gsap.fromTo(
          buttonRef.current,
          { rotation: 0 },
          {
            rotation: direction === 'left' ? -15 : 15,
            duration: 0.1,
            yoyo: true,
            repeat: 3,
            ease: 'power2.inOut',
          }
        );
      }
      
      previousOffsetRef.current = offsetDays;
    }
  }, [offsetDays]);

  // Swipe handlers for touch devices
  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => {
      // Swipe left = next day (increment offset, but not past today)
      setOffsetDays((d) => Math.min(d + 1, 0));
    },
    onSwipedRight: () => {
      // Swipe right = previous day (decrement offset)
      setOffsetDays((d) => d - 1);
    },
    trackMouse: false, // Don't track mouse as swipe (keyboard arrow keys handle that)
    trackTouch: true,
    delta: 50, // Minimum swipe distance (px)
    preventScrollOnSwipe: false, // Allow scrolling
    swipeDuration: 500, // Maximum swipe duration (ms)
  });

  return (
    <>
      <section className="hero is-fullheight has-background-light">
      <div className="hero-body">
        <div className="container">
          {state.loading && <p className="subtitle">Loading…</p>}
          {!state.loading && state.error && <p className="has-text-danger">{state.error}</p>}
          {!state.loading && !state.error && !state.user && <LoginView />}
          {!state.loading && !state.error && state.user && (
            <div>
              <div className="mb-4">
                {/* Three column header that stacks on mobile */}
                <div className="columns is-mobile is-multiline">
                  {/* Column 1: Header */}
                  <div className="column is-12-mobile is-4-tablet has-text-centered mb-1">
                    <img src={logoFull} alt="Evidence Journal" className="header-logo" style={{ marginBottom: '0.25rem' }} />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      <p className="is-size-7 has-text-grey mb-0">{state.user.displayName || 'friend'}</p>
                      <button
                        className="button is-small is-light"
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

                  {/* Column 2: Date selector with weather */}
                  <div className="column is-12-mobile is-4-tablet has-text-centered mb-1">
                    <div className="buttons is-centered" style={{ alignItems: 'center' }}>
                      <button
                        ref={leftButtonRef}
                        className="button is-medium is-dark"
                        onClick={() => setOffsetDays((d) => d - 1)}
                        title="Previous day"
                      >
                        <span className="icon">
                          <i className="fa-solid fa-chevron-left" />
                        </span>
                      </button>
                      <div style={{ position: 'relative' }}>
                        <button
                          className="button is-light"
                          onClick={() => setShowCalendar(!showCalendar)}
                          title="Click to open calendar"
                          style={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            alignItems: 'center',
                            padding: '0.5rem 1rem',
                            height: 'auto'
                          }}
                        >
                          <div style={{ fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.2 }}>
                            {selectedDateLabel.dayMonth}
                          </div>
                          <div style={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.2 }}>
                            {selectedDateLabel.year}
                          </div>
                        </button>
                        {showCalendar && (
                          <div
                            ref={calendarRef}
                            style={{
                              position: 'absolute',
                              top: '100%',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              marginTop: '0.5rem',
                              zIndex: 1000,
                              backgroundColor: 'white',
                              boxShadow: '0 0.5em 1em -0.125em rgba(10, 10, 10, 0.1), 0 0px 0 1px rgba(10, 10, 10, 0.02)',
                              borderRadius: '4px',
                              padding: '0.5rem',
                            }}
                          >
                            <Calendar
                              value={selectedDate}
                              onChange={(date) => {
                                const daysDiff = Math.floor((date.getTime() - todayStart.getTime()) / DAY_MS);
                                setOffsetDays(daysDiff);
                                setShowCalendar(false);
                              }}
                              minDate={dateRange.minDate}
                              maxDate={dateRange.maxDate || new Date()}
                              tileDisabled={({ date }) => {
                                if (!dateRange.minDate || !dateRange.maxDate) return true;
                                return date < dateRange.minDate || date > (dateRange.maxDate > new Date() ? new Date() : dateRange.maxDate);
                              }}
                            />
                          </div>
                        )}

                        {weather ? (
                          <div style={{ marginTop: '-0.25rem', textAlign: 'center' }}>
                            <p className="is-size-7 has-text-grey">{weather.weather_description} · {weather.temperature_c}°C ({cToF(weather.temperature_c)}°F)</p>
                          </div>
                        ) : null}
                      </div>
                      <button
                        ref={rightButtonRef}
                        className="button is-medium is-dark"
                        onClick={() => setOffsetDays((d) => Math.min(d + 1, 0))}
                        disabled={offsetDays >= 0}
                        title="Next day"
                      >
                        <span className="icon">
                          <i className="fa-solid fa-chevron-right" />
                        </span>
                      </button>
                    </div>
                    {/* weather moved into the date button container for tighter spacing */}
                  </div>

                  {/* Column 3: Navigation menu */}
                  <div className="column is-12-mobile is-4-tablet has-text-centered">
                    <div className="buttons is-centered">
                    <button
                      className={`button is-small ${path === '/' ? 'is-dark' : 'is-light'}`}
                      title="Digest"
                      aria-label="Digest"
                      aria-pressed={path === '/'}
                      onClick={(e) => {
                        e.preventDefault();
                        window.history.pushState({}, '', '/');
                        setPath('/');
                        setOffsetDays(0);
                        setShowCalendar(false);
                        try {
                          localStorage.removeItem('digestOffsetDays');
                        } catch (e) {
                          // Ignore localStorage errors
                        }
                      }}
                    >
                      <span className="icon">
                        <i className="fa-solid fa-house" />
                      </span>
                    </button>
                    <button
                      className={`button is-small ${path === '/journal' ? 'is-dark' : 'is-light'}`}
                      title="Journal"
                      aria-label="Journal"
                      aria-pressed={path === '/journal'}
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
                      className={`button is-small is-light${sendState.sending ? ' is-loading' : ''}`}
                      title="Send digest"
                      aria-label="Send digest"
                      onClick={async () => {
                        setSendState({ sending: true, message: null, error: null });
                        try {
                          // compute window for currently selected date
                          const todayStart = startOfDay(new Date());
                          const start = new Date(todayStart.getTime() + offsetDays * DAY_MS);
                          const end = offsetDays === 0 ? new Date() : new Date(start.getTime() + DAY_MS);

                          const res = await fetch('/api/digest/send', {
                            method: 'POST',
                            credentials: 'include',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ since: start.toISOString(), until: end.toISOString() }),
                          });
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
                      className={`button is-small ${path === '/settings' ? 'is-dark' : 'is-light'}`}
                      onClick={(e) => {
                        e.preventDefault();
                        window.history.pushState({}, '', '/settings');
                        setPath('/settings');
                      }}
                      title="Settings"
                      aria-pressed={path === '/settings'}
                    >
                      <span className="icon">
                        <i className="fa-solid fa-cog" />
                      </span>
                    </a>
                    </div>
                    
                    {/* Collection status - centered beneath navigation buttons */}
                    {!collectorStatus?.currentRunning && collectorStatus?.recentRuns?.[0] ? (
                      <p className="is-size-7 has-text-grey mt-2">
                        Last collection: {new Date(collectorStatus.recentRuns[0].finishedAt || collectorStatus.recentRuns[0].startedAt).toLocaleString()}
                        {collectorStatus.recentRuns[0].eventCount > 0 && ` (${collectorStatus.recentRuns[0].eventCount} events)`}
                      </p>
                    ) : collectorStatus?.currentRunning ? (
                      <p className="is-size-7 has-text-grey mt-2">
                        Collection running... (started {new Date(collectorStatus.currentRunning.startedAt).toLocaleTimeString()})
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Status messages */}
                {sendState.message ? <p className="help is-success has-text-centered">{sendState.message}</p> : null}
                {sendState.error ? <p className="help is-danger has-text-centered">{sendState.error}</p> : null}
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
                ) : (
                  <div {...swipeHandlers} style={{ touchAction: 'pan-y' }}>
                    {path === '/journal' ? (
                      <Journal date={selectedDateISO} dateLabel={`${selectedDateLabel.dayMonth}, ${selectedDateLabel.year}`} />
                    ) : (
                      <Digest offsetDays={offsetDays} onWeather={setWeather} />
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      </section>
    </>
    );
}

export default App;
