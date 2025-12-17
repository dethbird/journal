import React from 'react';

function App() {
  return (
    <section className="hero is-fullheight has-background-light">
      <div className="hero-body">
        <div className="container">
          <p className="subtitle is-6 has-text-grey">Monolith server</p>
          <h1 className="title is-2">Hello, World</h1>
          <p className="subtitle is-5">
            Fastify is serving this React app at <code>/</code>. OAuth callback and API endpoints will live here too.
          </p>
          <div className="buttons mb-4">
            <a className="button is-success" href="/api/oauth/spotify/start">
              Authorize Spotify
            </a>
          </div>
          <div className="box">
            <p className="is-size-5 has-text-weight-semibold">Next steps</p>
            <ul className="mt-2">
              <li>Wire a provider-specific OAuth flow in the backend.</li>
              <li>Add API routes and database access.</li>
              <li>Hook up the UI to the API.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

export default App;
