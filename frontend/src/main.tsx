import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import OfflineStatus from './components/OfflineStatus';
import { ConfirmProvider } from '@/components/ui';
import { queryClient } from '@/lib/queryClient';
import './index.css';

// Capacitor APKs ship the built web assets locally. Do not register the PWA
// service worker inside the native WebView: it can interfere with startup and
// plugin bridge injection. The browser build still uses the service worker.
if (!Capacitor.isNativePlatform() && import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/service-worker.js').catch(() => {
      // The app remains usable online if service workers are unavailable.
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ConfirmProvider>
          <OfflineStatus />
          <App />
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 3500,
              style: {
                direction: 'rtl',
                fontFamily: 'Cairo, sans-serif',
                fontSize: '14px',
                borderRadius: '12px',
                background: '#fff',
                color: '#1e293b',
                boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
              },
              success: { iconTheme: { primary: '#1d7c55', secondary: '#fff' } },
              error: { iconTheme: { primary: '#dc2626', secondary: '#fff' } },
            }}
          />
        </ConfirmProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
