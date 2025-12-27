import React, { useEffect, useState } from 'react';
import { CONNECT_PROVIDERS } from '../constants';
import { FINANCE_INSTITUTIONS, getDefaultFilename } from '../financeConfigs';
import githubIcon from '../assets/github.ico';
import spotifyIcon from '../assets/spotify.ico';
import steamIcon from '../assets/steam.ico';
import googleIcon from '../assets/google.ico';

const PROVIDER_ICONS = {
  github: githubIcon,
  spotify: spotifyIcon,
  steam: steamIcon,
  google: googleIcon,
};

const formatDateTime = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString();
  } catch (e) {
    return value;
  }
};

function ConnectedAccountRow({ provider, connected, onDisconnect }) {
  const iconSrc = PROVIDER_ICONS[provider.id];
  
  return (
    <div className="box">
      <div className="level">
        <div className="level-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {iconSrc && (
              <img 
                src={iconSrc} 
                alt={provider.name} 
                className="section-icon"
                style={{ width: '32px', height: '32px' }}
              />
            )}
            <div>
              <p className="is-size-6 has-text-weight-semibold">{provider.name}</p>
              <p>{connected.displayName || connected.providerAccountId}</p>
              {connected.scopes && (
                <div className="scope-tags">
                  {connected.scopes
                    .split(/\s+/)
                    .filter(Boolean)
                    .map((s, i) => (
                      <span key={i} className="scope-tag is-size-7 has-text-grey">
                        {s}
                      </span>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="level-right">
          <div className="buttons">
            <button
              className="button is-light"
              onClick={async () => {
                try {
                  await onDisconnect(provider.id);
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

function EmailBookmarkSettingsForm() {
  const [settings, setSettings] = useState({
    host: '',
    port: 993,
    secure: true,
    mailbox: 'INBOX',
    processedMailbox: 'INBOX/Processed',
    username: '',
    password: '',
    passwordPresent: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/email-bookmark/settings', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.settings) {
            setSettings((prev) => ({ ...prev, ...data.settings, password: '' }));
          }
        }
      } catch (e) {
        // ignore load errors for now
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const payload = { ...settings };
      if (!payload.password) delete payload.password;
      const res = await fetch('/api/email-bookmark/settings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed (${res.status})`);
      }
      const data = await res.json();
      if (data.settings) {
        setSettings((prev) => ({ ...prev, ...data.settings, password: '' }));
      }
      setMessage('Saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 2500);
    }
  };

  if (loading) return <p className="subtitle">Loading email settings…</p>;

  return (
    <div className="box mt-4">
      <p className="is-size-5 has-text-weight-semibold">Email bookmarks</p>
      <form className="mt-3" onSubmit={handleSubmit}>
        <div className="columns is-multiline">
          <div className="column is-half">
            <label className="label">Host</label>
            <input
              className="input"
              value={settings.host}
              onChange={(e) => setSettings({ ...settings, host: e.target.value })}
              required
            />
          </div>
          <div className="column is-one-quarter">
            <label className="label">Port</label>
            <input
              className="input"
              type="number"
              value={settings.port}
              onChange={(e) => setSettings({ ...settings, port: Number(e.target.value) })}
              required
            />
          </div>
          <div className="column is-one-quarter">
            <label className="label">Secure</label>
            <label className="checkbox mt-2">
              <input
                type="checkbox"
                checked={settings.secure}
                onChange={(e) => setSettings({ ...settings, secure: e.target.checked })}
              />{' '}
              Use TLS/SSL
            </label>
          </div>
          <div className="column is-half">
            <label className="label">Mailbox</label>
            <input
              className="input"
              value={settings.mailbox}
              onChange={(e) => setSettings({ ...settings, mailbox: e.target.value })}
            />
          </div>
          <div className="column is-half">
            <label className="label">Processed mailbox</label>
            <input
              className="input"
              value={settings.processedMailbox}
              onChange={(e) => setSettings({ ...settings, processedMailbox: e.target.value })}
            />
          </div>
          <div className="column is-half">
            <label className="label">Username</label>
            <input
              className="input"
              value={settings.username}
              onChange={(e) => setSettings({ ...settings, username: e.target.value })}
              required
            />
          </div>
          <div className="column is-half">
            <label className="label">Password {settings.passwordPresent ? '(leave blank to keep existing)' : ''}</label>
            <input
              className="input"
              type="password"
              value={settings.password}
              onChange={(e) => setSettings({ ...settings, password: e.target.value })}
              placeholder={settings.passwordPresent ? '••••••••' : ''}
            />
          </div>
        </div>
        <div className="field is-grouped">
          <div className="control">
            <button className={`button is-primary${saving ? ' is-loading' : ''}`} type="submit">
              Save
            </button>
          </div>
          {message && <p className="help is-success">{message}</p>}
          {error && <p className="help is-danger">{error}</p>}
        </div>
      </form>
    </div>
  );
}

function EmailDeliverySettingsForm() {
  const [settings, setSettings] = useState({
    provider: 'smtp',
    fromEmail: '',
    fromName: '',
    digestSubject: 'Your Daily Digest',
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    replyTo: '',
    enabled: true,
    lastSentAt: null,
    passwordPresent: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/email-delivery', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
            if (data.settings)
              setSettings((prev) => ({ ...prev, ...data.settings, password: '', passwordPresent: !!data.settings.passwordPresent }));
        }
      } catch (e) {
        // ignore initial load failure
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const payload = { ...settings };
      if (!payload.password) delete payload.password;
      const res = await fetch('/api/email-delivery', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed (${res.status})`);
      }
      const data = await res.json();
      if (data.settings) setSettings((prev) => ({ ...prev, ...data.settings }));
      setMessage('Saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 2500);
    }
  };

  if (loading) return <p className="subtitle">Loading email delivery…</p>;

  return (
    <div className="box mt-4">
      <p className="is-size-5 has-text-weight-semibold">Email delivery</p>
      <form className="mt-3" onSubmit={handleSubmit}>
        <div className="columns is-multiline">
          <div className="column is-half">
            <label className="label">From email</label>
            <input className="input" type="email" value={settings.fromEmail} onChange={(e) => setSettings({ ...settings, fromEmail: e.target.value })} required />
          </div>
          <div className="column is-half">
            <label className="label">From name</label>
            <input className="input" value={settings.fromName} onChange={(e) => setSettings({ ...settings, fromName: e.target.value })} />
          </div>

          <div className="column is-half">
            <label className="label">Digest subject</label>
            <input className="input" value={settings.digestSubject} onChange={(e) => setSettings({ ...settings, digestSubject: e.target.value })} />
          </div>

          <div className="column is-half">
            <label className="label">Host</label>
            <input className="input" value={settings.host} onChange={(e) => setSettings({ ...settings, host: e.target.value })} />
          </div>
          <div className="column is-one-quarter">
            <label className="label">Port</label>
            <input className="input" type="number" value={settings.port} onChange={(e) => setSettings({ ...settings, port: Number(e.target.value) })} />
          </div>
          <div className="column is-one-quarter">
            <label className="label">Secure</label>
            <label className="checkbox mt-2">
              <input type="checkbox" checked={settings.secure} onChange={(e) => setSettings({ ...settings, secure: e.target.checked })} /> Use TLS/SSL
            </label>
          </div>

          <div className="column is-half">
            <label className="label">Username</label>
            <input className="input" value={settings.username} onChange={(e) => setSettings({ ...settings, username: e.target.value })} />
          </div>
          <div className="column is-half">
            <label className="label">Password {settings.passwordPresent ? '(leave blank to keep existing)' : ''}</label>
            <input className="input" type="password" value={settings.password} onChange={(e) => setSettings({ ...settings, password: e.target.value })} placeholder={settings.passwordPresent ? '••••••••' : ''} />
          </div>

          <div className="column is-half">
            <label className="label">Reply-To</label>
            <input className="input" value={settings.replyTo} onChange={(e) => setSettings({ ...settings, replyTo: e.target.value })} />
          </div>

          <div className="column is-one-quarter">
            <label className="label">Enabled</label>
            <label className="checkbox mt-2">
              <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />{' '}
              Send digest emails
            </label>
          </div>

          {settings.lastSentAt ? (
            <div className="column is-full">
              <p className="is-size-7 has-text-grey">Last sent: {formatDateTime(settings.lastSentAt)}</p>
            </div>
          ) : null}
        </div>
        <div className="field is-grouped">
          <div className="control">
            <button className={`button is-primary${saving ? ' is-loading' : ''}`} type="submit">
              Save
            </button>
          </div>
          {message && <p className="help is-success">{message}</p>}
          {error && <p className="help is-danger">{error}</p>}
        </div>
      </form>
    </div>
  );
}

function GoogleTimelineSettingsForm({ connected, googleClientId }) {
  const [state, setState] = useState({
    loading: true,
    saving: false,
    picking: false,
    driveFolderId: null,
    folderName: null,
    driveFileName: 'Timeline.json',
    message: null,
    error: null,
  });

  useEffect(() => {
    const load = async () => {
      if (!connected) {
        setState((prev) => ({ ...prev, loading: false, error: 'Connect Google to configure Timeline import.' }));
        return;
      }
      try {
        const res = await fetch('/api/google-timeline/settings', { credentials: 'include' });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed to load settings (${res.status})`);
        }
        const data = await res.json();
        setState((prev) => ({
          ...prev,
          driveFolderId: data.settings?.driveFolderId || null,
          driveFileName: data.settings?.driveFileName || 'Timeline.json',
          loading: false,
          error: null,
        }));
      } catch (e) {
        setState((prev) => ({ ...prev, loading: false, error: e.message }));
      }
    };
    load();
  }, [connected]);

  const openPicker = async () => {
    if (!googleClientId) {
      setState((prev) => ({ ...prev, error: 'Google client ID not configured' }));
      return;
    }

    setState((prev) => ({ ...prev, picking: true, error: null }));

    try {
      // Get access token from server
      const tokenRes = await fetch('/api/google/access-token', { credentials: 'include' });
      if (!tokenRes.ok) {
        const body = await tokenRes.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to get access token');
      }
      const { accessToken } = await tokenRes.json();

      // Load Google Picker API
      await new Promise((resolve, reject) => {
        if (window.google?.picker) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://apis.google.com/js/api.js';
        script.onload = () => {
          window.gapi.load('picker', { callback: resolve, onerror: reject });
        };
        script.onerror = reject;
        document.body.appendChild(script);
      });

      // Create and show picker for folder selection
      const view = new window.google.picker.DocsView()
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true)
        .setMimeTypes('application/vnd.google-apps.folder');

      const picker = new window.google.picker.PickerBuilder()
        .setAppId(googleClientId.split('-')[0]) // App ID is before the dash in client ID
        .setOAuthToken(accessToken)
        .addView(view)
        .setCallback((data) => {
          if (data.action === window.google.picker.Action.PICKED) {
            const doc = data.docs[0];
            setState((prev) => ({
              ...prev,
              driveFolderId: doc.id,
              folderName: doc.name,
              picking: false,
            }));
          } else if (data.action === window.google.picker.Action.CANCEL) {
            setState((prev) => ({ ...prev, picking: false }));
          }
        })
        .build();

      picker.setVisible(true);
    } catch (err) {
      setState((prev) => ({ ...prev, picking: false, error: err.message }));
    }
  };

  const handleSave = async () => {
    if (!state.driveFolderId) {
      setState((prev) => ({ ...prev, error: 'Please select a folder first' }));
      return;
    }

    setState((prev) => ({ ...prev, saving: true, message: null, error: null }));
    try {
      const res = await fetch('/api/google-timeline/settings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveFolderId: state.driveFolderId, driveFileName: state.driveFileName }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed (${res.status})`);
      }
      const data = await res.json();
      setState((prev) => ({
        ...prev,
        saving: false,
        message: 'Saved',
        driveFolderId: data.settings?.driveFolderId || prev.driveFolderId,
        driveFileName: data.settings?.driveFileName || prev.driveFileName,
      }));
      setTimeout(() => setState((prev) => ({ ...prev, message: null })), 2500);
    } catch (err) {
      setState((prev) => ({ ...prev, saving: false, error: err.message }));
    }
  };

  if (state.loading) return <p className="subtitle">Loading Google timeline settings…</p>;

  return (
    <div className="box mt-4">
      <p className="is-size-5 has-text-weight-semibold">Google Timeline import</p>
      {!connected && <p className="help is-danger mt-2">Connect Google to edit these settings.</p>}
      <div className="mt-3">
        <div className="field">
          <label className="label">Google Drive folder</label>
          <div className="control">
            <div className="is-flex is-align-items-center gap-half">
              <span className={state.driveFolderId ? 'tag is-success is-medium' : 'tag is-warning is-medium'}>
                {state.driveFolderId ? (state.folderName || 'Folder selected') : 'No folder selected'}
              </span>
              <button
                type="button"
                className={`button is-info${state.picking ? ' is-loading' : ''}`}
                onClick={openPicker}
                disabled={!connected || state.picking}
              >
                <span className="icon">
                  <i className="fa-solid fa-folder-open" />
                </span>
                <span>Choose from Drive</span>
              </button>
            </div>
            {state.driveFolderId && (
              <p className="help has-text-grey">Folder ID: {state.driveFolderId}</p>
            )}
          </div>
        </div>
        <div className="field mt-3">
          <label className="label">Timeline filename</label>
          <div className="control">
            <input
              type="text"
              className="input"
              value={state.driveFileName}
              onChange={(e) => setState((prev) => ({ ...prev, driveFileName: e.target.value }))}
              placeholder="Timeline.json"
              disabled={!connected}
            />
          </div>
          <p className="help">The collector will search for the most recent file with this name in the selected folder.</p>
        </div>
        <div className="field is-grouped mt-4">
          <div className="control">
            <button
              type="button"
              className={`button is-primary${state.saving ? ' is-loading' : ''}`}
              onClick={handleSave}
              disabled={!connected || !state.driveFolderId}
            >
              Save
            </button>
          </div>
          {state.message && <p className="help is-success">{state.message}</p>}
          {state.error && <p className="help is-danger">{state.error}</p>}
        </div>
      </div>
    </div>
  );
}

function TrelloSettingsForm() {
  const [state, setState] = useState({
    loading: true,
    saving: false,
    loadingBoards: false,
    configured: false,
    memberId: '',
    trackedBoardIds: [],
    trackedListNames: ['Done', 'Doing', 'Applied'],
    enabled: true,
    boards: [],
    message: null,
    error: null,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/trello/settings', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setState((prev) => ({
            ...prev,
            loading: false,
            configured: data.configured,
            memberId: data.settings?.memberId || '',
            trackedBoardIds: data.settings?.trackedBoardIds || [],
            trackedListNames: data.settings?.trackedListNames?.length ? data.settings.trackedListNames : ['Done', 'Doing', 'Applied'],
            enabled: data.settings?.enabled ?? true,
          }));
        } else {
          setState((prev) => ({ ...prev, loading: false }));
        }
      } catch (e) {
        setState((prev) => ({ ...prev, loading: false, error: e.message }));
      }
    };
    load();
  }, []);

  const handleFetchBoards = async () => {
    setState((prev) => ({ ...prev, loadingBoards: true, error: null }));
    try {
      const res = await fetch('/api/trello/boards', { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to fetch boards (${res.status})`);
      }
      const data = await res.json();
      setState((prev) => ({ ...prev, loadingBoards: false, boards: data.boards || [] }));
    } catch (err) {
      setState((prev) => ({ ...prev, loadingBoards: false, error: err.message }));
    }
  };

  const handleToggleBoard = (boardId) => {
    setState((prev) => {
      const tracked = prev.trackedBoardIds.includes(boardId)
        ? prev.trackedBoardIds.filter((id) => id !== boardId)
        : [...prev.trackedBoardIds, boardId];
      return { ...prev, trackedBoardIds: tracked };
    });
  };

  const handleListNamesChange = (e) => {
    const names = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
    setState((prev) => ({ ...prev, trackedListNames: names }));
  };

  const handleSave = async () => {
    setState((prev) => ({ ...prev, saving: true, message: null, error: null }));
    try {
      const res = await fetch('/api/trello/settings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: state.memberId || null,
          trackedBoardIds: state.trackedBoardIds,
          trackedListNames: state.trackedListNames,
          enabled: state.enabled,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed (${res.status})`);
      }
      setState((prev) => ({ ...prev, saving: false, message: 'Saved' }));
      setTimeout(() => setState((prev) => ({ ...prev, message: null })), 2500);
    } catch (err) {
      setState((prev) => ({ ...prev, saving: false, error: err.message }));
    }
  };

  if (state.loading) return <p className="subtitle">Loading Trello settings…</p>;

  return (
    <div className="box mt-4">
      <p className="is-size-5 has-text-weight-semibold">Trello integration</p>
      {!state.configured && (
        <p className="help is-warning mt-2">
          Add TRELLO_API_KEY and TRELLO_TOKEN to your .env file to enable Trello integration.
          <br />
          <a href="https://trello.com/power-ups/admin" target="_blank" rel="noreferrer">
            Get your API key here
          </a>
        </p>
      )}

      <div className="mt-3">
        <div className="field">
          <label className="label">Trello Member ID (optional)</label>
          <div className="control">
            <input
              type="text"
              className="input"
              value={state.memberId}
              onChange={(e) => setState((prev) => ({ ...prev, memberId: e.target.value }))}
              placeholder="e.g. dethbird (leave blank for 'me')"
            />
          </div>
          <p className="help">Your Trello username or member ID. Leave blank to use the authenticated user.</p>
        </div>

        <div className="field mt-3">
          <label className="label">Tracked list names</label>
          <div className="control">
            <input
              type="text"
              className="input"
              value={state.trackedListNames.join(', ')}
              onChange={handleListNamesChange}
              placeholder="Done, Doing, Applied"
            />
          </div>
          <p className="help">Comma-separated list of column/list names to track card movements into.</p>
        </div>

        <div className="field mt-3">
          <label className="label">Tracked boards</label>
          <div className="control">
            <button
              type="button"
              className={`button is-info is-small${state.loadingBoards ? ' is-loading' : ''}`}
              onClick={handleFetchBoards}
              disabled={!state.configured || state.loadingBoards}
            >
              <span className="icon">
                <i className="fa-solid fa-rotate" />
              </span>
              <span>Fetch boards from Trello</span>
            </button>
          </div>
          {state.boards.length > 0 && (
            <div className="mt-2">
              {state.boards.map((board) => (
                <div key={board.id} className="is-flex is-align-items-center mb-1">
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={state.trackedBoardIds.includes(board.id)}
                      onChange={() => handleToggleBoard(board.id)}
                      className="mr-2"
                    />
                    <a href={board.url} target="_blank" rel="noreferrer">{board.name}</a>
                  </label>
                </div>
              ))}
            </div>
          )}
          {state.trackedBoardIds.length > 0 && state.boards.length === 0 && (
            <p className="help has-text-grey mt-1">{state.trackedBoardIds.length} board(s) selected</p>
          )}
        </div>

        <div className="field mt-3">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={state.enabled}
              onChange={(e) => setState((prev) => ({ ...prev, enabled: e.target.checked }))}
            />{' '}
            Enable Trello collector
          </label>
        </div>

        <div className="field is-grouped mt-4">
          <div className="control">
            <button
              type="button"
              className={`button is-primary${state.saving ? ' is-loading' : ''}`}
              onClick={handleSave}
            >
              Save
            </button>
          </div>
          {state.message && <p className="help is-success">{state.message}</p>}
          {state.error && <p className="help is-danger">{state.error}</p>}
        </div>
      </div>
    </div>
  );
}

function UserGeneralSettings() {
  const [settings, setSettings] = useState({
    timezone: 'UTC',
    displayName: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  // List of common timezones
  const timezones = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Anchorage',
    'Pacific/Honolulu',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Moscow',
    'Asia/Dubai',
    'Asia/Kolkata',
    'Asia/Shanghai',
    'Asia/Tokyo',
    'Asia/Seoul',
    'Australia/Sydney',
    'Pacific/Auckland',
  ];

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/user/settings', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setSettings({
            timezone: data.timezone || 'UTC',
            displayName: data.displayName || '',
          });
        }
      } catch (e) {
        console.error('Failed to load user settings', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/user/settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed (${res.status})`);
      }
      const data = await res.json();
      setSettings({
        timezone: data.timezone || 'UTC',
        displayName: data.displayName || '',
      });
      setMessage('Settings saved successfully');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 2500);
    }
  };

  if (loading) return <p className="subtitle">Loading settings…</p>;

  return (
    <div className="box">
      <p className="is-size-5 has-text-weight-semibold">General Settings</p>
      <form className="mt-3" onSubmit={handleSubmit}>
        <div className="field">
          <label className="label">Display Name</label>
          <div className="control">
            <input
              className="input"
              type="text"
              value={settings.displayName}
              onChange={(e) => setSettings({ ...settings, displayName: e.target.value })}
              placeholder="Your name"
            />
          </div>
        </div>

        <div className="field">
          <label className="label">Timezone</label>
          <div className="control">
            <div className="select is-fullwidth">
              <select
                value={settings.timezone}
                onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
              >
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="help">
            Used for Steam snapshots and other daily collection activities. Data is stored in UTC.
          </p>
        </div>

        <div className="field is-grouped">
          <div className="control">
            <button className={`button is-primary${saving ? ' is-loading' : ''}`} type="submit">
              Save
            </button>
          </div>
          {message && <p className="help is-success">{message}</p>}
          {error && <p className="help is-danger">{error}</p>}
        </div>
      </form>
    </div>
  );
}

function FinanceSourcesForm({ connected, googleClientId }) {
  const [state, setState] = useState({
    loading: true,
    sources: [],
    editingSourceId: null,
    editForm: {
      driveFolderId: null,
      folderName: null,
      driveFileName: 'activity.csv',
      institutionId: 'generic_csv',
      institutionName: '',
      enabled: true,
    },
    picking: false,
    saving: false,
    message: null,
    error: null,
  });

  useEffect(() => {
    const load = async () => {
      if (!connected) {
        setState((prev) => ({ ...prev, loading: false, error: 'Connect Google to configure finance sources.' }));
        return;
      }
      try {
        const res = await fetch('/api/finance-sources', { credentials: 'include' });
        if (!res.ok) {
          throw new Error('Failed to load finance sources');
        }
        const data = await res.json();
        setState((prev) => ({ ...prev, loading: false, sources: data.sources || [] }));
      } catch (err) {
        setState((prev) => ({ ...prev, loading: false, error: err.message }));
      }
    };
    load();
  }, [connected]);

  const openPicker = async () => {
    if (!googleClientId) {
      setState((prev) => ({ ...prev, error: 'Google client ID not configured' }));
      return;
    }

    setState((prev) => ({ ...prev, picking: true, error: null }));

    try {
      // Get access token from server
      const tokenRes = await fetch('/api/google/access-token', { credentials: 'include' });
      if (!tokenRes.ok) {
        const body = await tokenRes.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to get access token');
      }
      const { accessToken } = await tokenRes.json();

      // Load Google Picker API
      await new Promise((resolve, reject) => {
        if (window.google?.picker) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://apis.google.com/js/api.js';
        script.onload = () => {
          window.gapi.load('picker', { callback: resolve, onerror: reject });
        };
        script.onerror = reject;
        document.body.appendChild(script);
      });

      // Create and show picker for folder selection
      const view = new window.google.picker.DocsView()
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true)
        .setMimeTypes('application/vnd.google-apps.folder');

      const picker = new window.google.picker.PickerBuilder()
        .setAppId(googleClientId.split('-')[0])
        .setOAuthToken(accessToken)
        .addView(view)
        .setCallback((data) => {
          if (data.action === window.google.picker.Action.PICKED) {
            const doc = data.docs[0];
            setState((prev) => ({
              ...prev,
              editForm: {
                ...prev.editForm,
                driveFolderId: doc.id,
                folderName: doc.name,
              },
              picking: false,
            }));
          } else if (data.action === window.google.picker.Action.CANCEL) {
            setState((prev) => ({ ...prev, picking: false }));
          }
        })
        .build();

      picker.setVisible(true);
    } catch (err) {
      setState((prev) => ({ ...prev, picking: false, error: err.message }));
    }
  };

  const handleInstitutionChange = (institutionId) => {
    const defaultFilename = getDefaultFilename(institutionId);
    const institution = FINANCE_INSTITUTIONS.find((i) => i.id === institutionId);
    setState((prev) => ({
      ...prev,
      editForm: {
        ...prev.editForm,
        institutionId,
        institutionName: institution?.name || '',
        driveFileName: defaultFilename,
      },
    }));
  };

  const handleAddNew = () => {
    setState((prev) => ({
      ...prev,
      editingSourceId: 'new',
      editForm: {
        driveFolderId: null,
        folderName: null,
        driveFileName: 'activity.csv',
        institutionId: 'generic_csv',
        institutionName: 'Generic CSV',
        nickname: '',
        enabled: true,
      },
    }));
  };

  const handleEdit = (source) => {
    setState((prev) => ({
      ...prev,
      editingSourceId: source.id,
      editForm: {
        driveFolderId: source.driveFolderId,
        folderName: source.folderName || null,
        driveFileName: source.driveFileName,
        institutionId: source.institutionId,
        institutionName: source.institutionName,
        nickname: source.nickname || '',
        enabled: source.enabled,
      },
    }));
  };

  const handleCancelEdit = () => {
    setState((prev) => ({
      ...prev,
      editingSourceId: null,
      editForm: {
        driveFolderId: null,
        folderName: null,
        driveFileName: 'activity.csv',
        institutionId: 'generic_csv',
        institutionName: '',
        nickname: '',
        enabled: true,
      },
    }));
  };

  const handleSave = async () => {
    if (!state.editForm.driveFolderId) {
      setState((prev) => ({ ...prev, error: 'Please select a folder first' }));
      return;
    }

    setState((prev) => ({ ...prev, saving: true, message: null, error: null }));
    try {
      const institution = FINANCE_INSTITUTIONS.find((i) => i.id === state.editForm.institutionId);
      const payload = {
        id: state.editingSourceId,
        driveFolderId: state.editForm.driveFolderId,
        driveFileName: state.editForm.driveFileName,
        institutionId: state.editForm.institutionId,
        institutionName: institution?.name || state.editForm.institutionName,
        nickname: state.editForm.nickname || null,
        parserFormat: institution?.parserFormat || 'generic_csv',
        enabled: state.editForm.enabled,
      };

      const res = await fetch('/api/finance-sources', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to save finance source');
      }

      const data = await res.json();
      
      // Reload sources
      const listRes = await fetch('/api/finance-sources', { credentials: 'include' });
      if (listRes.ok) {
        const listData = await listRes.json();
        setState((prev) => ({
          ...prev,
          saving: false,
          message: 'Saved',
          editingSourceId: null,
          sources: listData.sources || [],
        }));
      } else {
        setState((prev) => ({
          ...prev,
          saving: false,
          message: 'Saved',
          editingSourceId: null,
        }));
      }

      setTimeout(() => setState((prev) => ({ ...prev, message: null })), 2500);
    } catch (err) {
      setState((prev) => ({ ...prev, saving: false, error: err.message }));
    }
  };

  const handleDelete = async (sourceId) => {
    if (!confirm('Are you sure you want to delete this finance source?')) return;
    
    try {
      const res = await fetch(`/api/finance-sources/${sourceId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to delete finance source');
      }

      setState((prev) => ({
        ...prev,
        sources: prev.sources.filter((s) => s.id !== sourceId),
        message: 'Deleted',
      }));
      setTimeout(() => setState((prev) => ({ ...prev, message: null })), 2500);
    } catch (err) {
      setState((prev) => ({ ...prev, error: err.message }));
    }
  };

  if (state.loading) return <p className="subtitle">Loading finance sources…</p>;

  return (
    <div>
      <div className="box">
        <div className="level">
          <div className="level-left">
            <div>
              <p className="is-size-5 has-text-weight-semibold">Finance Data Sources</p>
              <p className="help">Configure spreadsheet sources for financial data collection from Google Drive</p>
            </div>
          </div>
          <div className="level-right">
            <button
              type="button"
              className="button is-primary"
              onClick={handleAddNew}
              disabled={!connected || state.editingSourceId}
            >
              <span className="icon">
                <i className="fa-solid fa-plus" />
              </span>
              <span>Add Source</span>
            </button>
          </div>
        </div>

        {!connected && <p className="help is-danger mt-2">Connect Google to add finance sources.</p>}
        
        {state.message && <p className="help is-success mt-2">{state.message}</p>}
        {state.error && <p className="help is-danger mt-2">{state.error}</p>}
      </div>

      {/* Existing Sources List */}
      {state.sources.length > 0 && (
        <div className="mt-4">
          {state.sources.map((source) => (
            <div key={source.id} className="box">
              <div className="level">
                <div className="level-left">
                  <div>
                    <p className="has-text-weight-semibold">
                      {source.institutionName}
                      {source.nickname && <span className="has-text-grey"> • {source.nickname}</span>}
                    </p>
                    <p className="is-size-7 has-text-grey">
                      {source.driveFileName} • Folder: {source.folderName || source.driveFolderId}
                    </p>
                    <span className={`tag is-small ${source.enabled ? 'is-success' : 'is-warning'}`}>
                      {source.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
                <div className="level-right">
                  <div className="buttons">
                    <button
                      type="button"
                      className="button is-small is-info"
                      onClick={() => handleEdit(source)}
                      disabled={state.editingSourceId}
                    >
                      <span className="icon is-small">
                        <i className="fa-solid fa-edit" />
                      </span>
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      className="button is-small is-danger"
                      onClick={() => handleDelete(source.id)}
                      disabled={state.editingSourceId}
                    >
                      <span className="icon is-small">
                        <i className="fa-solid fa-trash" />
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit/Add Form */}
      {state.editingSourceId && (
        <div className="box mt-4">
          <p className="is-size-5 has-text-weight-semibold mb-3">
            {state.editingSourceId === 'new' ? 'Add Finance Source' : 'Edit Finance Source'}
          </p>

          <div className="field">
            <label className="label">Institution / Parser Type</label>
            <div className="control">
              <div className="select is-fullwidth">
                <select
                  value={state.editForm.institutionId}
                  onChange={(e) => handleInstitutionChange(e.target.value)}
                  disabled={!connected}
                >
                  {FINANCE_INSTITUTIONS.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name} ({inst.description})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="field mt-3">
            <label className="label">Nickname <span className="has-text-danger">*</span></label>
            <div className="control">
              <input
                type="text"
                className="input"
                value={state.editForm.nickname || ''}
                onChange={(e) => setState((prev) => ({
                  ...prev,
                  editForm: { ...prev.editForm, nickname: e.target.value },
                }))}
                placeholder="e.g., Personal Card, Business Card, ...1234"
                disabled={!connected}
              />
            </div>
            <p className="help">Required - A friendly name to differentiate multiple accounts from the same institution</p>
          </div>

          <div className="field mt-3">
            <label className="label">Google Drive folder</label>
            <div className="control">
              <div className="is-flex is-align-items-center gap-half">
                <span className={state.editForm.driveFolderId ? 'tag is-success is-medium' : 'tag is-warning is-medium'}>
                  {state.editForm.driveFolderId ? (state.editForm.folderName || 'Folder selected') : 'No folder selected'}
                </span>
                <button
                  type="button"
                  className={`button is-info${state.picking ? ' is-loading' : ''}`}
                  onClick={openPicker}
                  disabled={!connected || state.picking}
                >
                  <span className="icon">
                    <i className="fa-solid fa-folder-open" />
                  </span>
                  <span>Choose from Drive</span>
                </button>
              </div>
              {state.editForm.driveFolderId && (
                <p className="help has-text-grey">Folder ID: {state.editForm.driveFolderId}</p>
              )}
            </div>
          </div>

          <div className="field mt-3">
            <label className="label">Filename</label>
            <div className="control">
              <input
                type="text"
                className="input"
                value={state.editForm.driveFileName}
                onChange={(e) => setState((prev) => ({
                  ...prev,
                  editForm: { ...prev.editForm, driveFileName: e.target.value },
                }))}
                placeholder="activity.csv"
                disabled={!connected}
              />
            </div>
            <p className="help">The collector will search for the most recent file with this name in the selected folder.</p>
          </div>

          <div className="field mt-3">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={state.editForm.enabled}
                onChange={(e) => setState((prev) => ({
                  ...prev,
                  editForm: { ...prev.editForm, enabled: e.target.checked },
                }))}
                disabled={!connected}
              />
              <span className="ml-2">Enabled</span>
            </label>
          </div>

          <div className="field is-grouped mt-4">
            <div className="control">
              <button
                type="button"
                className={`button is-primary${state.saving ? ' is-loading' : ''}`}
                onClick={handleSave}
                disabled={!connected || !state.editForm.driveFolderId || !state.editForm.nickname?.trim()}
              >
                Save
              </button>
            </div>
            <div className="control">
              <button
                type="button"
                className="button is-light"
                onClick={handleCancelEdit}
                disabled={state.saving}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {state.sources.length === 0 && !state.editingSourceId && (
        <div className="box mt-4 has-text-centered has-text-grey">
          <p className="is-size-6">No finance sources configured yet.</p>
          <p className="is-size-7 mt-2">Click "Add Source" to get started.</p>
        </div>
      )}
    </div>
  );
}

export default function Settings({ user, onDisconnect }) {
  const connectedAccounts = user?.connectedAccounts || [];
  const googleConnected = connectedAccounts.some((acc) => acc.provider === 'google');
  const [googleClientId, setGoogleClientId] = useState(null);
  const [activeTab, setActiveTab] = useState('general');

  useEffect(() => {
    const loadClientId = async () => {
      try {
        const res = await fetch('/api/google/client-id', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setGoogleClientId(data.clientId);
        }
      } catch (e) {
        // ignore
      }
    };
    loadClientId();
  }, []);

  return (
    <div>
      <h1 className="title is-3">Settings</h1>
      
      <div className="tabs is-boxed">
        <ul>
          <li className={activeTab === 'general' ? 'is-active' : ''}>
            <a onClick={() => setActiveTab('general')}>
              <span className="icon is-small"><i className="fa-solid fa-user" /></span>
              <span>General</span>
            </a>
          </li>
          <li className={activeTab === 'accounts' ? 'is-active' : ''}>
            <a onClick={() => setActiveTab('accounts')}>
              <span className="icon is-small"><i className="fa-solid fa-link" /></span>
              <span>Connected Accounts</span>
            </a>
          </li>
          <li className={activeTab === 'google' ? 'is-active' : ''}>
            <a onClick={() => setActiveTab('google')}>
              <span className="icon is-small"><i className="fa-brands fa-google" /></span>
              <span>Google Timeline</span>
            </a>
          </li>
          <li className={activeTab === 'trello' ? 'is-active' : ''}>
            <a onClick={() => setActiveTab('trello')}>
              <span className="icon is-small"><i className="fa-brands fa-trello" /></span>
              <span>Trello</span>
            </a>
          </li>
          <li className={activeTab === 'email-delivery' ? 'is-active' : ''}>
            <a onClick={() => setActiveTab('email-delivery')}>
              <span className="icon is-small"><i className="fa-solid fa-envelope" /></span>
              <span>Email Delivery</span>
            </a>
          </li>
          <li className={activeTab === 'email-bookmarks' ? 'is-active' : ''}>
            <a onClick={() => setActiveTab('email-bookmarks')}>
              <span className="icon is-small"><i className="fa-solid fa-bookmark" /></span>
              <span>Email Bookmarks</span>
            </a>
          </li>
          <li className={activeTab === 'finance' ? 'is-active' : ''}>
            <a onClick={() => setActiveTab('finance')}>
              <span className="icon is-small"><i className="fa-solid fa-money-bill" /></span>
              <span>Finance</span>
            </a>
          </li>
        </ul>
      </div>

      {activeTab === 'general' && <UserGeneralSettings />}
      
      {activeTab === 'accounts' && (
        <div className="box">
          <p className="is-size-5 has-text-weight-semibold mb-4">Connected accounts</p>
          <div className="mt-2">
            {CONNECT_PROVIDERS.map((p) => {
              const connected = connectedAccounts.find((acc) => acc.provider === p.id);
              if (connected) return <ConnectedAccountRow key={p.id} provider={p} connected={connected} onDisconnect={onDisconnect} />;

              const iconSrc = PROVIDER_ICONS[p.id];
              
              return (
                <div key={p.id} className="mt-2">
                  <a className="button is-primary" href={p.start}>
                    {iconSrc ? (
                      <span className="icon">
                        <img 
                          src={iconSrc} 
                          alt={p.name} 
                          style={{ width: '20px', height: '20px', objectFit: 'cover' }}
                        />
                      </span>
                    ) : (
                      <span className="icon">
                        <i className={`fa-brands fa-${p.id}`} />
                      </span>
                    )}
                    <span>Authorize {p.name}</span>
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'google' && <GoogleTimelineSettingsForm connected={googleConnected} googleClientId={googleClientId} />}
      {activeTab === 'trello' && <TrelloSettingsForm />}
      {activeTab === 'email-delivery' && <EmailDeliverySettingsForm />}
      {activeTab === 'email-bookmarks' && <EmailBookmarkSettingsForm />}
      {activeTab === 'finance' && <FinanceSourcesForm connected={googleConnected} googleClientId={googleClientId} />}
    </div>
  );
}
