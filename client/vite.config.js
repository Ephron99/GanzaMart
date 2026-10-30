import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The storefront runs on 5173 and calls the API on 5000 across origins; the API's
// CORS allow-list is exactly this URL (server/.env → CLIENT_URL).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,      // fail loudly instead of silently moving to 5174 and breaking CORS
    // host stays unset on purpose: binding the dev server to 0.0.0.0 would expose
    // it to the whole network, and the API only allows http://localhost:5173 anyway.
  },
  build: {
    outDir: 'dist',
    sourcemap: true,       // stack traces in production builds stay readable
  },
});
