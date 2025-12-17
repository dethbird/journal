import React from 'react';
import { CONNECT_PROVIDERS } from '../constants';

function ConnectedAccountRow({ provider, connected, onDisconnect }) {
  return (
    <div className="box">
      <div className="level">
        <div className="level-left">
          <div>
            <p className="is-size-6 has-text-weight-semibold">{provider.name}</p>
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

export default function Settings({ user, onDisconnect }) {
  const connectedAccounts = user?.connectedAccounts || [];

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
    </div>
  );
}
