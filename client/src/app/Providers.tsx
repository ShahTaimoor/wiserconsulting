"use client";

import { Provider } from 'react-redux';
import { Toaster } from 'sonner';
import { store } from '../redux/store';
import GoogleOAuthProviderWrapper from '../components/GoogleOAuthProvider';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <GoogleOAuthProviderWrapper>
        {children}
        <Toaster position="top-right" />
      </GoogleOAuthProviderWrapper>
    </Provider>
  );
}
