import { defineConfig } from 'vite';
import { qaBuildEnabled } from './config/qa-build.mjs';

export default defineConfig((context) => {
  const qa = qaBuildEnabled(context, process.env);
  return {
    define: { __QA_BUILD__: JSON.stringify(qa) },
    build: { outDir: qa ? 'dist-qa' : 'dist' },
  };
});
