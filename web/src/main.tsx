import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './ui/estilos.css';
import { cssDosTemas } from './ui/tema';

const temas = document.createElement('style');
temas.textContent = cssDosTemas();
document.head.appendChild(temas);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
