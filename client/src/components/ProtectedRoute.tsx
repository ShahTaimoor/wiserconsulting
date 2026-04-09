'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAppSelector } from '@/redux/hooks';

interface ProtectedRouteProps {
  children: ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAppSelector((state) => state.auth); // ✅ Redux state instead of localStorage

  const [isLoading, setIsLoading] = useState(true);

  // Small loading spinner before auth state is determined
  useEffect(() => {
    setIsLoading(false);
  }, []);

  // ✅ Role helpers
  const isAdmin = (role: string | number | undefined): boolean =>
    role === 1 || role === '1' || role === 'admin';

  const isRegularUser = (role: string | number | undefined): boolean =>
    role === 0 || role === '0' || role === 'user';

  // Public routes (accessible without login)
  const publicPaths = ['/login', '/register'];
  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  // 🔒 Not logged in & trying to access protected route → redirect to login
  if (!user && !isPublicPath) {
    router.replace('/login');
    return null;
  }

  // 🚫 Regular user trying to access admin route → redirect to home
  if (isRegularUser(user?.role) && pathname.startsWith('/admin')) {
    router.replace('/');
    return null;
  }

  // ✅ Already logged in but on login/register page → redirect properly
  if (user && isPublicPath) {
    if (isAdmin(user?.role)) {
      router.replace('/admin/products');
    } else {
      router.replace('/');
    }
    return null;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
