"use client";

import { Provider } from 'react-redux';
import { store } from '../redux/store';
import GoogleOAuthProviderWrapper from '../components/GoogleOAuthProvider';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <GoogleOAuthProviderWrapper>
        {children}
      </GoogleOAuthProviderWrapper>
    </Provider>
  );
}
