"use client";

import React, { useState, FormEvent, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { register, login } from "@/redux/slices/auth/authSlice";
import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useCarriedNext } from "@/hooks/useTouristVisaEntry";
import { carriedNext, nextQuery } from "@/utils/safeRedirect";

const Register: React.FC = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});

  const dispatch = useAppDispatch();
  const { loading, error, success, user } = useAppSelector((state) => state.auth);
  const router = useRouter();

  // Step 8i: while the Tourist Visa form is open, a valid ?next=/tourist-visa is carried to the sign-in link and used after success.
  // Closed, still loading or failed: carriedNext is null and the page is exactly as it was.
  const { open, next } = useCarriedNext();
  const redirected = useRef(false);

  // Redirect to home (or, while the form is open, to the carried next) after login
  useEffect(() => {
    if (user && user._id && !redirected.current) {
      redirected.current = true;
      router.push(carriedNext(open, window.location.search) ?? "/");
    }
  }, [user, router, open]);

  const validateForm = () => {
    const errors: { [key: string]: string } = {};

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
      await dispatch(login({ email, password }));
    }
  };

  const passwordRequirements = [
    { met: password.length >= 6, text: "At least 6 characters" },
  ];

  return (
    <div className="grid min-h-svh lg:grid-cols-2 bg-white text-slate-900">
      <div className="flex flex-col p-4 md:p-6 lg:p-8">
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <form className="flex flex-col gap-4 md:gap-5" onSubmit={handleSubmit}>
              <div className="flex items-center gap-4 mb-1">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Link>
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl md:text-2xl font-bold text-slate-900">Create your account</h1>
                  <p className="text-xs md:text-sm text-slate-500">
                    Fill in the form below to create your account
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="name" className="text-sm font-medium text-slate-900">
                    Full Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    required
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={`flex h-10 w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 ${formErrors.name ? 'border-red-500 focus:ring-red-500' : 'border-slate-200'}`}
                  />
                  {formErrors.name && (
                    <p className="text-[11px] text-red-500">{formErrors.name}</p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="email" className="text-sm font-medium text-slate-900">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    placeholder="m@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`flex h-10 w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 ${formErrors.email ? 'border-red-500 focus:ring-red-500' : 'border-slate-200'}`}
                  />
                  {formErrors.email && (
                    <p className="text-[11px] text-red-500">{formErrors.email}</p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="password" className="text-sm font-medium text-slate-900">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`flex h-10 w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 ${formErrors.password ? 'border-red-500 focus:ring-red-500' : 'border-slate-200'}`}
                  />
                  {formErrors.password && (
                    <p className="text-[11px] text-red-500">{formErrors.password}</p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="confirmPassword" className="text-sm font-medium text-slate-900">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    required
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`flex h-10 w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 ${formErrors.confirmPassword ? 'border-red-500 focus:ring-red-500' : 'border-slate-200'}`}
                  />
                  {formErrors.confirmPassword && (
                    <p className="text-[11px] text-red-500">{formErrors.confirmPassword}</p>
                  )}
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                    <p className="text-sm text-green-600">{success}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex h-10 mt-2 items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900/90 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Creating Account..." : "Create Account"}
                </button>
              </div>

              <p className="text-center text-sm text-slate-500">
                Already have an account?{" "}
                <Link href={`/login${nextQuery(next)}`} className="font-semibold text-slate-900 underline underline-offset-4 hover:text-slate-700 cursor-pointer">
                  Sign in
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>
      <div className="relative hidden lg:block border-l border-slate-200 bg-slate-50">
        <img
          src="/register-image.png"
          alt="Register Background"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
    </div>
  );
};

export default Register;
