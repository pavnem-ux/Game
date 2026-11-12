import { defineConfig } from 'vite';
import { buildDefines } from './config/build-info.mjs';
import { qaBuildEnabled } from './config/qa-build.mjs';

export default defineConfig((context) => {
  const qa = qaBuildEnabled(context, process.env);
  return {
    define: { __QA_BUILD__: JSON.stringify(qa), ...buildDefines(process.env) },
    build: {
      outDir: qa ? 'dist-qa' : 'dist',
      // Task 16: last two versions of Chrome/Edge, Firefox, Safari (macOS + iOS), Chrome Android.
      target: ['es2020', 'chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'],
    },
  };
});
