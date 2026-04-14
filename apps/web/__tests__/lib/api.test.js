/**
 * @jest-environment jsdom
 */

import { apiFetch, getToken, getUser, saveAuth, clearAuth, isAdmin, API_URL } from '../../lib/api';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: jest.fn((key) => store[key] || null),
    setItem: jest.fn((key, value) => { store[key] = value; }),
    removeItem: jest.fn((key) => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

beforeEach(() => {
  localStorageMock.clear();
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

describe('API_URL', () => {
  it('defaults to http://localhost:4000', () => {
    expect(API_URL).toBe('http://localhost:4000');
  });
});

describe('saveAuth / getToken / getUser / clearAuth', () => {
  it('saves and retrieves token', () => {
    saveAuth('my-token', { id: '1', email: 'a@b.com', role: 'user' });
    expect(getToken()).toBe('my-token');
  });

  it('saves and retrieves user', () => {
    saveAuth('tk', { id: '1', email: 'a@b.com', role: 'user' });
    expect(getUser()).toEqual({ id: '1', email: 'a@b.com', role: 'user' });
  });

  it('clearAuth removes token and user', () => {
    saveAuth('tk', { id: '1', email: 'a@b.com', role: 'user' });
    clearAuth();
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
  });
});

describe('isAdmin', () => {
  it('returns true for admin role', () => {
    saveAuth('tk', { id: '1', email: 'a@b.com', role: 'admin' });
    expect(isAdmin()).toBe(true);
  });

  it('returns false for non-admin role', () => {
    saveAuth('tk', { id: '1', email: 'a@b.com', role: 'user' });
    expect(isAdmin()).toBe(false);
  });

  it('returns false when no user stored', () => {
    expect(isAdmin()).toBe(false);
  });
});

describe('apiFetch', () => {
  it('makes GET request with auth header', async () => {
    saveAuth('my-jwt', { id: '1', email: 'a@b.com', role: 'user' });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ jobs: [] }),
    });

    const data = await apiFetch('/jobs');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/jobs',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-jwt',
          'Content-Type': 'application/json',
        }),
      })
    );
    expect(data).toEqual({ jobs: [] });
  });

  it('makes POST request with body', async () => {
    saveAuth('tk', { id: '1', email: 'a@b.com', role: 'user' });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: 'job-1', status: 'pending' }),
    });

    const data = await apiFetch('/jobs', {
      method: 'POST',
      body: JSON.stringify({ type: 'test' }),
    });

    expect(data.id).toBe('job-1');
  });

  it('throws on non-ok response', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: 'invalid token' }),
    });

    await expect(apiFetch('/me')).rejects.toThrow('invalid token');
  });

  it('throws with status code when no error message', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => '{}',
    });

    await expect(apiFetch('/me')).rejects.toThrow('request failed (500)');
  });

  it('works without auth token', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ ok: true }),
    });

    await apiFetch('/health');

    const call = global.fetch.mock.calls[0];
    expect(call[1].headers.Authorization).toBeUndefined();
  });
});
