"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { login, clearError } from "@/redux/slices/auth/authSlice";
import { cn } from "@/lib/utils";
import { isAdminRole } from "@/utils/authRole";
import { nextQuery, postLoginDestination } from "@/utils/safeRedirect";
import { useCarriedNext } from "@/hooks/useTouristVisaEntry";
import { ArrowLeft } from "lucide-react";
import { PasswordInput } from "@/components/PasswordInput";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();
  const dispatch = useAppDispatch();
  
  const { loading, error, user } = useAppSelector((state) => state.auth);
  // Step 8i: while the Tourist Visa form is open, a valid ?next=/tourist-visa is carried to the sign-up link.
  const { next: carried } = useCarriedNext();

  useEffect(() => {
    if (user) {
      // Back to the page the visitor came from (?next=) if it is a safe same-site path;
      // otherwise the usual defaults: admins to the admin panel, everyone else home.
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(postLoginDestination(isAdminRole(user.role), next));
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
      className={cn("flex flex-col gap-8", className)} 
      onSubmit={handleSubmit}
      {...props}
    >
      <div className="flex flex-col gap-6">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to website
        </Link>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">Login to your account</h1>
          <p className="mt-2 text-sm md:text-base text-slate-500">Enter your email and password to continue.</p>
        </div>
      </div>

      <div className="flex flex-col gap-5">
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
            className="flex h-11 w-full rounded-lg border bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:ring-2 focus:ring-offset-1 border-slate-200 focus:border-slate-900 focus:ring-slate-900"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-slate-900">
              Password
            </label>
          </div>
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Logging in..." : "Login"}
        </button>
      </div>

      <p className="text-center text-sm text-slate-500">
        Don&apos;t have an account?{" "}
        <a href={`/register${nextQuery(carried)}`} className="font-semibold text-slate-900 underline underline-offset-4 hover:text-slate-700 cursor-pointer">
          Sign up
        </a>
      </p>
    </form>
  );
}
