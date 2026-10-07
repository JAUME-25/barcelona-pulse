import '@fontsource/barlow-semi-condensed/latin-400.css';
import '@fontsource/barlow-semi-condensed/latin-500.css';
import '@fontsource/barlow-semi-condensed/latin-600.css';
import '@fontsource/barlow-semi-condensed/latin-700.css';
import '@fontsource/barlow-semi-condensed/latin-ext-400.css';
import '@fontsource/barlow-semi-condensed/latin-ext-600.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '../app/ErrorBoundary';
import { applyTheme } from '../app/theme';
import { detectLang, LANG_PARAM, setLang } from '../i18n';
import { LanguageRoot } from '../i18n/LanguageRoot';
import { readParam } from '../shared/url';
import '../styles/global.css';
import { ContractPage } from './ContractPage';

// La página del contrato de la API (/contrato.html): el mismo tema, fuentes e idiomas que la
// aplicación, sin el mapa.
applyTheme(document.documentElement);

const lang = detectLang(readParam(LANG_PARAM), navigator.languages);
setLang(lang);
document.documentElement.lang = lang;

const root = document.getElementById('root');
if (root === null) throw new Error('Falta el elemento #root');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <LanguageRoot>{(current) => <ContractPage key={current} />}</LanguageRoot>
    </ErrorBoundary>
  </StrictMode>,
);
