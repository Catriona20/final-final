import axios, { AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';
const AUTH_STORAGE_KEY = '@patient_app_user_session';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 25000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: Attach JWT Bearer Token if present
apiClient.interceptors.request.use(
  async (reqConfig) => {
    try {
      const sessionData = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      if (sessionData) {
        const parsed = JSON.parse(sessionData);
        if (parsed.token) {
          reqConfig.headers.Authorization = `Bearer ${parsed.token}`;
        }
      }
    } catch (e) {
      // Ignore async storage error
    }
    return reqConfig;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Extract response data and handle network errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'Network request failed';
    return Promise.reject(new Error(message));
  }
);
