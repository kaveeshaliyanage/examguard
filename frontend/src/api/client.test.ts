import { describe, expect, it } from 'vitest';
import { ApiError, isExamList, request } from './client';
import { server } from '../test/server';
import { http, HttpResponse } from 'msw';

describe('api client', () => {
  it('fails with a shape error when the payload does not match the documented type', async () => {
    server.use(
      http.get('/api/exams', () =>
        HttpResponse.json({ items: [{ id: 'not-a-number' }] }),
      ),
    );

    await expect(request('/exams', { validate: isExamList })).rejects.toMatchObject({
      name: 'ApiError',
      kind: 'shape',
      status: 200,
    });
    await expect(request('/exams', { validate: isExamList })).rejects.toBeInstanceOf(ApiError);
  });
});
