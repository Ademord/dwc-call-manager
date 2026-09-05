import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { createMemoryClient } from './client/memory';

createRoot(document.getElementById('root')!).render(
  <App client={createMemoryClient()} mode="portable" />,
);
