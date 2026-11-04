import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { incidentFinding, joinResponse, pairFinding } from './fixtures';

export const handlers = [
  http.get('/api/findings/:id', ({ params }) => {
    if (params.id === '1') {
      return HttpResponse.json(pairFinding);
    }
    if (params.id === '2') {
      return HttpResponse.json(incidentFinding);
    }
    return HttpResponse.json({ message: 'Finding not found' }, { status: 404 });
  }),
  http.post('/api/public/join', () => HttpResponse.json(joinResponse)),
];

export const server = setupServer(...handlers);
