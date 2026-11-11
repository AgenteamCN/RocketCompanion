import React from 'react';
import ReactDOM from 'react-dom/client';
import { setCrossClientSyncEnabled } from './stores/crossClientSync';
import UITunerApp from './UITunerApp';
import '../styles/ui-tuner.css';

setCrossClientSyncEnabled(true);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <UITunerApp />
  </React.StrictMode>
);
