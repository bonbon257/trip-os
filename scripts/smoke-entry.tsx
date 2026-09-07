import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { App } from '@/app/App';

export function render(route: string) {
  const el = document.getElementById('root')!;
  createRoot(el).render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  );
}
