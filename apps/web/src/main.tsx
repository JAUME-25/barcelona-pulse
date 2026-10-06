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
import { detectLang, LANG_PARAM, setLang } from './i18n';
import { LanguageRoot } from './i18n/LanguageRoot';
import { readParam } from './shared/url';
import './styles/global.css';

applyTheme(document.documentElement);

// El idioma, antes de pintar nada: el de la URL o, si no, el del navegador.
const lang = detectLang(readParam(LANG_PARAM), navigator.languages);
setLang(lang);
document.documentElement.lang = lang;

const root = document.getElementById('root');
if (root === null) throw new Error('Falta el elemento #root');

createRoot(root).render(
  <StrictMode>
    <LanguageRoot>{(current) => <App key={current} />}</LanguageRoot>
  </StrictMode>,
);
