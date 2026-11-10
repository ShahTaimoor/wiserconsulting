"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { login, clearError } from "@/redux/slices/auth/authSlice";
import { cn } from "@/lib/utils";
import { isAdminRole } from "@/utils/authRole";
import { ArrowLeft } from "lucide-react";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();
  const dispatch = useAppDispatch();
  
  const { loading, error, user } = useAppSelector((state) => state.auth);

  useEffect(() => {
    if (user) {
      if (isAdminRole(user.role)) {
        router.push("/admin/users"); // Redirect admin to admin panel
      } else {
        router.push("/"); // Redirect regular user to home
      }
    }
    return () => {
      dispatch(clearError());
    };
  }, [user, router, dispatch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    dispatch(login({ email, password }));
  };

  return (
    <form 
      className={cn("flex flex-col gap-6", className)} 
      onSubmit={handleSubmit}
      {...props}
    >
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900">Login to your account</h1>
              <p className="text-sm md:text-base text-slate-500">Enter your email below to login to your account</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-md text-sm">
            {error}
          </div>
        )}
        
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-sm font-medium text-slate-900">
            Email
          </label>
          <input
            id="email"
            type="email"
            placeholder="m@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-slate-900">
              Password
            </label>
          </div>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900/90 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Logging in..." : "Login"}
        </button>
      </div>

      <p className="text-center text-sm text-slate-500">
        Don&apos;t have an account?{" "}
        <a href="/register" className="font-semibold text-slate-900 underline underline-offset-4 hover:text-slate-700 cursor-pointer">
          Sign up
        </a>
      </p>
    </form>
  );
}
