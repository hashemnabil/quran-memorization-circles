import axios from 'axios';
import { api, apiError } from './api';

const KEY = 'registry.accessToken';
export const registryToken = {
  get: () => localStorage.getItem(KEY),
  set: (token: string) => localStorage.setItem(KEY, token),
  clear: () => localStorage.removeItem(KEY),
};

export const registryApi = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', timeout: 30000 });
registryApi.interceptors.request.use((config) => {
  const token = registryToken.get();
  if (token) config.headers['X-Registry-Token'] = token;
  return config;
});
export { api, apiError };
