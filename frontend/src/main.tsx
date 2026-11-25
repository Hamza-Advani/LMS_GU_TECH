import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';
import { LOGO_URL } from './lib/brand';

if (LOGO_URL) document.querySelector<HTMLLinkElement>('link[rel=icon]')?.setAttribute('href', LOGO_URL);

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } });
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><ErrorBoundary><BrowserRouter><App /></BrowserRouter></ErrorBoundary></QueryClientProvider></React.StrictMode>);
