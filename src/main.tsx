import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
import './theme.css';
import { applyTheme, readThemePreference } from './theme';
applyTheme(readThemePreference());
createRoot(document.getElementById('root')!).render(<App/>);
