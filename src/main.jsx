import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import BookingFormApp from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BookingFormApp />
  </React.StrictMode>
);

function SubmitButton({ step, locked, onSubmit }) {
  if (step === 4 && !locked) {
    return (
      <button
        onClick={onSubmit}
        className="px-4 py-2 rounded-xl bg-brand-dark text-white"
      >
        Generate QR & Submit
      </button>
    );
  }

  if (step === 4 && locked) {
    return (
      <span className="px-3 py-2 rounded-xl bg-neutral-200 text-neutral-600">
        Locked
      </span>
    );
  }

  return null;
}
