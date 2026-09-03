// Cloudflare Worker for Haoku (Workers + Static Assets model).
//
// The Vite build in `dist/` is served through the ASSETS binding configured in
// wrangler.jsonc. Haoku is a single-page app with no server side: every request
// falls through to the static files, and unknown paths get index.html.

export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
