import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element is missing');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
