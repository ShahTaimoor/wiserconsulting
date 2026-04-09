"use client";

import React, { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { register } from "@/redux/slices/auth/authSlice";
import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const Register: React.FC = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formErrors, setFormErrors] = useState<{[key: string]: string}>({});
  
  const dispatch = useAppDispatch();
  const { loading, error, success } = useAppSelector((state) => state.auth);
  const router = useRouter();

  const validateForm = () => {
    const errors: {[key: string]: string} = {};
    
    if (!name.trim()) {
      errors.name = "Name is required";
    } else if (name.trim().length < 2) {
      errors.name = "Name must be at least 2 characters";
    }
    
    if (!email.trim()) {
      errors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      errors.email = "Please enter a valid email address";
    }
    
    if (!password) {
      errors.password = "Password is required";
    } else if (password.length < 6) {
      errors.password = "Password must be at least 6 characters";
    }
    
    if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    const result = await dispatch(register({ name, email, password }));

    if (register.fulfilled.match(result)) {
      setTimeout(() => router.push("/"), 1000);
    }
  };

  const passwordRequirements = [
    { met: password.length >= 6, text: "At least 6 characters" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black overflow-hidden relative">
      {/* Animated gradient circle background */}
      <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-gradient-to-tl from-purple-500 via-pink-500 to-orange-400 opacity-20 blur-3xl animate-pulse" />
      <div className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 opacity-15 blur-2xl animate-pulse" />

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 lg:px-8">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 relative">
          <div className="hidden lg:block absolute inset-y-0 left-1/2 w-px bg-slate-700/60" />
          {/* Left Column - Form */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="flex flex-col justify-center rounded-[2rem] border border-slate-800/90 bg-slate-950/80 p-8 shadow-2xl shadow-slate-950/20"
          >
            <div className="flex items-center gap-3 mb-8">
              <Link
                href="/"
                className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-slate-800/50 hover:bg-slate-700 transition-colors text-white"
                title="Back to website"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <h1 className="text-4xl lg:text-5xl font-bold text-white whitespace-nowrap">Create Account.</h1>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              {/* Name Field */}
              <div>
                <input
                  id="name"
                  type="text"
                  required
                  className={`w-full px-4 py-3 bg-transparent border rounded-lg focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-white placeholder-slate-400 transition-all ${
                    formErrors.name ? 'border-red-500 focus:ring-red-500' : 'border-slate-600'
                  }`}
                  placeholder="Full Name*"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                {formErrors.name && (
                  <p className="text-sm text-red-400 mt-1">{formErrors.name}</p>
                )}
              </div>

              {/* Email Field */}
              <div>
                <input
                  id="email"
                  type="email"
                  required
                  className={`w-full px-4 py-3 bg-transparent border rounded-lg focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-white placeholder-slate-400 transition-all ${
                    formErrors.email ? 'border-red-500 focus:ring-red-500' : 'border-slate-600'
                  }`}
                  placeholder="Email Address*"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {formErrors.email && (
                  <p className="text-sm text-red-400 mt-1">{formErrors.email}</p>
                )}
              </div>

              {/* Password Field */}
              <div>
                <input
                  id="password"
                  type="password"
                  required
                  className={`w-full px-4 py-3 bg-transparent border rounded-lg focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-white placeholder-slate-400 transition-all ${
                    formErrors.password ? 'border-red-500 focus:ring-red-500' : 'border-slate-600'
                  }`}
                  placeholder="Password*"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {formErrors.password && (
                  <p className="text-sm text-red-400 mt-1">{formErrors.password}</p>
                )}
              </div>

              {/* Confirm Password Field */}
              <div>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  className={`w-full px-4 py-3 bg-transparent border rounded-lg focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-white placeholder-slate-400 transition-all ${
                    formErrors.confirmPassword ? 'border-red-500 focus:ring-red-500' : 'border-slate-600'
                  }`}
                  placeholder="Confirm Password*"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                {formErrors.confirmPassword && (
                  <p className="text-sm text-red-400 mt-1">{formErrors.confirmPassword}</p>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

              {/* Success Message */}
              {success && (
                <div className="p-3 bg-green-500/20 border border-green-500/50 rounded-lg">
                  <p className="text-sm text-green-300">{success}</p>
                </div>
              )}

              {/* Create Account Button */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-lg bg-white text-slate-900 font-semibold shadow-lg hover:shadow-xl hover:bg-slate-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Account"
                )}
              </motion.button>
            </form>

            {/* Login Link */}
            <p className="mt-8 text-sm text-slate-400">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-white hover:text-purple-400 transition-colors font-semibold"
              >
                Sign in
              </Link>
            </p>
          </motion.div>

          {/* Right Column - Social Login */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex flex-col justify-center rounded-[2rem] border border-slate-800/90 bg-slate-950/80 p-8 shadow-2xl shadow-slate-950/20"
          >
            <div className="space-y-4">
              <p className="text-slate-300 text-center mb-6">Sign up with your social account</p>

              {/* Google Signup */}
              <button className="w-full px-4 py-3 border border-slate-600 rounded-lg text-white hover:border-purple-500 hover:text-purple-400 transition-all flex items-center justify-center gap-2">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Sign up with Google
              </button>

              {/* Twitter Signup */}
              <button className="w-full px-4 py-3 border border-slate-600 rounded-lg text-white hover:border-purple-500 hover:text-purple-400 transition-all flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.953 4.57a10 10 0 002.856-9.835-9.993 9.993 0 03-14.46 3.55 1.001 1.001 0 10-.066-1.457 7.456 7.456 0 00-10.823 1.72c-2.096 2.466-2.033 6.16.188 8.133A1.001 1.001 0 003 15.5v-1.5c0-5.523 4.477-10 10-10s10 4.477 10 10-4.477 10-10 10H3a1 1 0 100 2h10c6.627 0 12-5.373 12-12 0-.563-.047-1.12-.135-1.67.06-.264.06-.534 0-.801z" />
                </svg>
                Sign up with Twitter
              </button>

              {/* Facebook Signup */}
              <button className="w-full px-4 py-3 border border-slate-600 rounded-lg text-white hover:border-purple-500 hover:text-purple-400 transition-all flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
                Sign up with Facebook
              </button>
            </div>

            {/* Terms */}
            <p className="mt-8 text-xs text-slate-500 text-center">
              By signing up, you agree to our{" "}
              <Link href="/terms" className="text-slate-300 hover:text-slate-200 underline">
                Terms of Service
              </Link>
              {" "}and{" "}
              <Link href="/privacy" className="text-slate-300 hover:text-slate-200 underline">
                Privacy Policy
              </Link>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Register;
