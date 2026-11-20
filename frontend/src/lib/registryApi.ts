import axios from 'axios';
import { api, apiError } from './api';
import { credentialStorage } from './credential-storage';

const KEY = 'registry.accessToken';
export const registryToken = {
  get: async () => { localStorage.removeItem(KEY); return credentialStorage.get(KEY); },
  set: async (token: string) => { await credentialStorage.set(KEY, token); localStorage.removeItem(KEY); },
  clear: async () => { localStorage.removeItem(KEY); await credentialStorage.remove(KEY); },
};

export const registryApi = axios.create({ baseURL: api.defaults.baseURL, timeout: 30000 });
registryApi.interceptors.request.use(async (config) => {
  const token = await registryToken.get();
  if (token) config.headers['X-Registry-Token'] = token;
  return config;
});
export { api, apiError };
