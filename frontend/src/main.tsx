import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { ConfirmProvider } from '@/components/ui';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        // Never retry auth / permission failures.
        const status = error?.response?.status;
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 2;
      },
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ConfirmProvider>
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
