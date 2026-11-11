import React from 'react';
import ReactDOM from 'react-dom/client';
import EntryHubApp from './EntryHubApp';
import '../styles/ui-tuner.css';

ReactDOM.createRoot(document.getElementById('entry-root')!).render(
  <React.StrictMode>
    <EntryHubApp />
  </React.StrictMode>
);
