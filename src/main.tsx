import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { createHttpClient } from './client/http';

createRoot(document.getElementById('root')!).render(
  <App client={createHttpClient()} mode="local" />,
);
