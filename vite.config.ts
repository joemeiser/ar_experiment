import { defineConfig, type PluginOption } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// ============================================================================
// GITHUB PAGES BASE PATH — THE ONE PLACE TO CHANGE IT
//
// Must match your repository name exactly, with a leading and trailing slash.
// Site is served at https://joemeiser.github.io/ar_experiment/
// If you rename the repo, change this and redeploy. Nothing else depends on it.
// ============================================================================
export const REPO_NAME = 'ar_experiment';

export default defineConfig(({ mode }) => {
  const plugins: PluginOption[] = [];
  // `npm run dev:https` -> self-signed HTTPS so phones on the LAN can grant
  // camera / GPS / orientation (all require a secure context).
  if (mode === 'https') plugins.push(basicSsl());

  return {
    base: `/${REPO_NAME}/`,
    plugins,
    build: {
      target: 'es2022',
      sourcemap: true,
      chunkSizeWarningLimit: 1000, // three.js alone is ~500 kB; one chunk is fine here
    },
    server: {
      host: true, // listen on LAN so a phone can reach the dev server
    },
  };
});
