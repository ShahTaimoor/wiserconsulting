// src/features/auth/authService.ts
export interface User {
    _id: string;
    name: string;
    email: string;
    role?: number; // Change from string to number to match backend
    phone?: string;
    address?: string;
    city?: string;
  }
  
  export interface LoginResponse {
    success: boolean;
    message?: string;
    user?: User;
    token?: string;
  }
  
  export interface RegisterResponse {
    success: boolean;
    message?: string;
    user?: {
      _id: string;
      name: string;
      email: string;
    };
  }
  
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
  
  // ✅ Login request
 // ✅ Login request
export const loginUser = async (email: string, password: string): Promise<LoginResponse> => {
  const response = await fetch(`${API_URL}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Login failed');
  }

  const responseData = await response.json();

  // Extract user and token from data object (backend wraps in data property)
  const user = responseData.data?.user || responseData.user;
  const token = responseData.data?.token || responseData.token;

  // Store user + token in localStorage
  if (user && token) {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
  }

  // Return in expected format
  return {
    success: responseData.success,
    message: responseData.message,
    user,
    token
  };
};

  
  // ✅ Register request
  export const registerUser = async (name: string, email: string, password: string): Promise<RegisterResponse> => {
    const res = await fetch(`${API_URL}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
  
    const data: RegisterResponse = await res.json();
    if (!res.ok) throw new Error(data.message || "Registration failed");
  
    return data;
  };

  // ✅ Google OAuth login
  export interface GoogleLoginResponse {
    success: boolean;
    user?: User;
    token?: string;
    message?: string;
  }

  export const googleLogin = async (accessToken: string): Promise<GoogleLoginResponse> => {
    const response = await fetch(`${API_URL}/auth/google/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        access_token: accessToken,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Authentication failed');
    }

    const responseData = await response.json();

    // Extract user and token from data object (backend wraps in data property)
    let user = responseData.data?.user || responseData.user;
    const token = responseData.data?.token || responseData.token;

    // Handle Google auth response which uses 'id' instead of '_id'
    if (user && user.id && !user._id) {
      user = { ...user, _id: user.id };
      delete user.id;
    }

    // Store user + token in localStorage
    if (user && token) {
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('token', token);
    }

    // Return in expected format
    return {
      success: responseData.success,
      message: responseData.message,
      user,
      token
    };
  };
  