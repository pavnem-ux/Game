import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { AlphaApp } from './gameplay-ui/AlphaApp';
import './ui/styles.css';
createRoot(document.getElementById('root')!).render(
  new URLSearchParams(location.search).has('prototype') ? <App /> : <AlphaApp />,
);
