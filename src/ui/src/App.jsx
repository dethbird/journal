import React from 'react';

export default function App() {
  return (
    <div className="page">
      <header>
        <p className="eyebrow">Journal</p>
        <h1>Hello, world.</h1>
        <p className="lede">Evidence-first journaling. API and collector share this server.</p>
      </header>
      <section className="card">
        <h2>Next steps</h2>
        <ul>
          <li>Wire the API endpoints at <code>/api</code> into this UI.</li>
          <li>Add collectors (GitHub, IMAP) to populate events.</li>
          <li>Render a day view and calendar with highlights.</li>
        </ul>
      </section>
    </div>
  );
}
