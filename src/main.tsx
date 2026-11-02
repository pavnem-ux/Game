import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { AlphaApp } from './gameplay-ui/AlphaApp';
import { CrashGuard } from './gameplay-ui/CrashGuard';
import { installGlobalErrorHandlers } from './gameplay-ui/crash-state';
import './ui/styles.css';
const prototype = new URLSearchParams(location.search).has('prototype');
// Task 08.5: the alpha gets an error boundary + global handlers (the prototype is unchanged).
if (!prototype) installGlobalErrorHandlers();
createRoot(document.getElementById('root')!).render(
  prototype ? (
    <App />
  ) : (
    <CrashGuard>
      <AlphaApp />
    </CrashGuard>
  ),
);
