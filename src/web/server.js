import Fastify from 'fastify';

const server = Fastify({ logger: true });

server.get('/', async () => ({
  html: `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Journal UI</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }
          h1 { color: #38bdf8; }
          p { max-width: 40rem; }
        </style>
      </head>
      <body>
        <h1>Journal – Evidence First</h1>
        <p>Connect an API, collector, and digest generator to see your timeline here.</p>
        <p>Use <code>/api</code> endpoints for the data layer and systemd timers for collectors.</p>
      </body>
    </html>`
});

const startServer = async () => {
  const port = Number(process.env.WEB_PORT) || 4200;
  await server.listen({ port });
  server.log.info(`Web UI listening on ${port}`);
};

if (process.env.NODE_ENV !== 'test') {
  startServer().catch((error) => {
    server.log.error(error);
    process.exit(1);
  });
}

export default server;