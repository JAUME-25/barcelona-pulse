import '@fontsource/barlow-semi-condensed/latin-400.css';
import '@fontsource/barlow-semi-condensed/latin-500.css';
import '@fontsource/barlow-semi-condensed/latin-600.css';
import '@fontsource/barlow-semi-condensed/latin-700.css';
import '@fontsource/barlow-semi-condensed/latin-ext-400.css';
import '@fontsource/barlow-semi-condensed/latin-ext-600.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { applyTheme } from './app/theme';
import './styles/global.css';

applyTheme(document.documentElement);

const root = document.getElementById('root');
if (root === null) throw new Error('Falta el elemento #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
