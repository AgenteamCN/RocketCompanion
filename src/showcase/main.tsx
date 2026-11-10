import React from 'react';
import ReactDOM from 'react-dom/client';
import { setCrossClientSyncEnabled } from './stores/crossClientSync';
import ShowcaseApp from './ShowcaseApp';
import '../styles/showcase.css';

setCrossClientSyncEnabled(true);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ShowcaseApp />
  </React.StrictMode>
);
