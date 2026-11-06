// main.jsx — ponto de entrada do React.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import './estilos/style.css';
import './estilos/components.css';
import './estilos/app.css';
import './estilos/background.css';
import './estilos/cookie-banner.css';
import './estilos/react.css';
import './estilos/expansao.css';
import './estilos/adequacao.css';

import App from './App';
import { AuthProvider } from './contexto/AuthContext';
import { ToastProvider } from './contexto/ToastContext';
import { ConfirmarProvider } from './contexto/ConfirmarContext';
import { aplicarTema } from './util/tema';

// Aplica o tema salvo antes de desenhar a tela (sem "piscar" do escuro para o claro)
aplicarTema();

createRoot(document.getElementById('raiz')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ConfirmarProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ConfirmarProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
);
