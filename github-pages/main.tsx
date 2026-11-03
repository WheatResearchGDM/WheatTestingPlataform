import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../app/globals.css';
import '../app/design-system.css';
import '../app/mobile.css';
import '../app/field-layout.css';
import Home from '../app/page';
import ApplicationBoundary from '../components/ApplicationBoundary';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Elemento raiz da aplicação não encontrado.');
}

createRoot(root).render(
  <StrictMode>
    <ApplicationBoundary><Home /></ApplicationBoundary>
  </StrictMode>,
);
