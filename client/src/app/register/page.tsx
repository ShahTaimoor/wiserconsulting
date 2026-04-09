"use client";

import React, { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { register } from "@/redux/slices/auth/authSlice";
import GoogleLoginButton from "@/components/GoogleLoginButton";
import { motion } from "framer-motion";
import { Mail, Lock, User, ArrowRight, UserPlus, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";

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
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
        >
          {/* Header */}
          <div className="bg-slate-900 px-8 py-8 text-center">
            <div className="w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-4">
              <UserPlus className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">
              Create Your Account
            </h2>
            <p className="text-slate-300 text-sm">
              Join WISER CONSULTING and start your visa journey today
            </p>
          </div>

          {/* Form */}
          <form className="p-8 space-y-5" onSubmit={handleSubmit}>
            {/* Name Field */}
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <User className="w-4 h-4" />
                Full Name
              </label>
              <div className="relative">
                <input
                  id="name"
                  type="text"
                  required
                  className={`w-full px-4 py-3 pl-11 border rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 bg-white text-slate-900 placeholder-slate-400 transition-all ${
                    formErrors.name ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 'border-slate-300'
                  }`}
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              </div>
              {formErrors.name && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <XCircle className="w-4 h-4" />
                  {formErrors.name}
                </p>
              )}
            </div>
            
            {/* Email Field */}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email Address
              </label>
              <div className="relative">
                <input
                  id="email"
                  type="email"
                  required
                  className={`w-full px-4 py-3 pl-11 border rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 bg-white text-slate-900 placeholder-slate-400 transition-all ${
                    formErrors.email ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 'border-slate-300'
                  }`}
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              </div>
              {formErrors.email && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <XCircle className="w-4 h-4" />
                  {formErrors.email}
                </p>
              )}
            </div>
            
            {/* Password Field */}
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  className={`w-full px-4 py-3 pl-11 pr-11 border rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 bg-white text-slate-900 placeholder-slate-400 transition-all ${
                    formErrors.password ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 'border-slate-300'
                  }`}
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm font-medium"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {password && (
                <div className="space-y-1 mt-2">
                  {passwordRequirements.map((req, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {req.met ? (
                        <CheckCircle2 className="w-3 h-3 text-green-600" />
                      ) : (
                        <XCircle className="w-3 h-3 text-slate-400" />
                      )}
                      <span className={req.met ? "text-green-600" : "text-slate-400"}>
                        {req.text}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {formErrors.password && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <XCircle className="w-4 h-4" />
                  {formErrors.password}
                </p>
              )}
            </div>
            
            {/* Confirm Password Field */}
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  className={`w-full px-4 py-3 pl-11 pr-11 border rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 bg-white text-slate-900 placeholder-slate-400 transition-all ${
                    formErrors.confirmPassword ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 'border-slate-300'
                  }`}
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm font-medium"
                >
                  {showConfirmPassword ? "Hide" : "Show"}
                </button>
              </div>
              {confirmPassword && password === confirmPassword && (
                <p className="text-sm text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  Passwords match
                </p>
              )}
              {formErrors.confirmPassword && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <XCircle className="w-4 h-4" />
                  {formErrors.confirmPassword}
                </p>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600 text-center">{error}</p>
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-600 text-center">{success}</p>
              </div>
            )}

            {/* Submit Button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-lg bg-slate-900 text-white font-semibold shadow-lg hover:shadow-xl hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  Create Account
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </motion.button>
          </form>

          {/* Divider */}
          <div className="px-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-slate-500">Or continue with</span>
              </div>
            </div>
          </div>

          {/* Google Login */}
          <div className="p-8 pt-6">
            <GoogleLoginButton />
          </div>

          {/* Footer */}
          <div className="px-8 pb-8 text-center">
            <p className="text-sm text-slate-600">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-semibold text-slate-900 hover:text-slate-700 transition-colors underline underline-offset-2"
              >
                Login here
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Register;
