import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // Make sure this is here
import BookingFormApp from './App.jsx';

<main className="print:hidden max-w-6xl mx-auto px-4 py-6 space-y-6">…</main>

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BookingFormApp />
  </React.StrictMode>
);
