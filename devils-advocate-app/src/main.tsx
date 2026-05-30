import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './config/firebase'; // Initialize Firebase on app startup
import { AuthProvider } from './contexts/AuthContext';
import App from './App';
import { ErrorBoundary } from './ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
