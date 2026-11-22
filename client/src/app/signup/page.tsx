import { redirect } from "next/navigation"

// The real sign-up page is /register; this old template page (Acme Inc. placeholder) just sends visitors there.
export default function SignupPage() {
  redirect("/register")
}
