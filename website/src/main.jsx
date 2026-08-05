import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.jsx';
import MarketplacePage from './pages/MarketplacePage.jsx';
import ModelsPage from './pages/ModelsPage.jsx';
import DocsPage from './pages/DocsPage.jsx';
import ModelPage from './pages/ModelPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import './styles/index.css';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/marketplace" element={<MarketplacePage />} />
      <Route path="/models" element={<ModelsPage />} />
      <Route path="/model" element={<ModelPage />} />
      <Route path="/docs" element={<DocsPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/sign-in" element={<LoginPage />} />
      <Route path="/register" element={<LoginPage />} />
    </Routes>
  </BrowserRouter>
);
