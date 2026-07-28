import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.jsx';
import MarketplacePage from './pages/MarketplacePage.jsx';
import DocsPage from './pages/DocsPage.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/marketplace" element={<MarketplacePage />} />
      <Route path="/docs" element={<DocsPage />} />
    </Routes>
  </BrowserRouter>
);
