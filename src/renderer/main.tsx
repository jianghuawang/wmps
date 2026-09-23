import { createRoot } from 'react-dom/client';
import './i18n';
import App from './App';
import './styles.css';
import './fallback.css';

createRoot(document.getElementById('root')!).render(<App/>);
