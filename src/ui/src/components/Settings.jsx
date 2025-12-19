import React, { useEffect, useState } from 'react';
import { CONNECT_PROVIDERS } from '../constants';

const formatDateTime = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString();
  } catch (e) {
    return value;
  }
};

function ConnectedAccountRow({ provider, connected, onDisconnect }) {
  return (
    <div className="box">
      <div className="level">
        <div className="level-left">
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

export default function Settings({ user, onDisconnect }) {
  const connectedAccounts = user?.connectedAccounts || [];
  const googleConnected = connectedAccounts.some((acc) => acc.provider === 'google');
  const [googleClientId, setGoogleClientId] = useState(null);

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
      <div className="box">
        <p className="is-size-5 has-text-weight-semibold">Connected accounts</p>
        <div className="mt-2">
          {CONNECT_PROVIDERS.map((p) => {
            const connected = connectedAccounts.find((acc) => acc.provider === p.id);
            if (connected) return <ConnectedAccountRow key={p.id} provider={p} connected={connected} onDisconnect={onDisconnect} />;

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

      <GoogleTimelineSettingsForm connected={googleConnected} googleClientId={googleClientId} />
      <EmailDeliverySettingsForm />
      <EmailBookmarkSettingsForm />
    </div>
  );
}
