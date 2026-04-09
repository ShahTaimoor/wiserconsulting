"use client";

import { motion } from "framer-motion";
import { Mail, Phone, MapPin } from "lucide-react";

const ContactPage = () => {
  const fadeUp = {
    initial: { opacity: 0, y: 45 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6 }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-slate-950/100 to-slate-950/0" />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <motion.p variants={fadeUp} initial="initial" animate="animate" className="inline-flex rounded-full border border-slate-600 bg-slate-900/80 px-4 py-2 text-xs uppercase tracking-[0.32em] text-slate-400">
              Contact Us
            </motion.p>
            <motion.h1 variants={fadeUp} initial="initial" animate="animate" className="mt-8 text-5xl font-semibold tracking-tight text-white sm:text-6xl">
              Visa support for every step.
            </motion.h1>
            <motion.p variants={fadeUp} initial="initial" animate="animate" className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-400">
              Expert guidance for student, work, and family visa applications with document support and fast processing advice.
            </motion.p>
          </div>

          <motion.div
            variants={fadeUp}
            initial="initial"
            animate="animate"
            className="mt-16 grid gap-8 xl:grid-cols-[1.35fr_0.85fr]"
          >
            <div className="rounded-[2rem] border border-white/10 bg-slate-900/90 p-8 shadow-2xl shadow-slate-950/40">
              <div className="space-y-8">
                <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-6">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Our visa services</p>
                  <h2 className="mt-4 text-3xl font-semibold text-white">
                    Personalized visa support you can trust.
                  </h2>
                  <p className="mt-4 text-slate-400 leading-relaxed">
                    Fast, reliable help with student, work, family, and visitor visas from application review to approval.
                  </p>
                </div>

                <div className="grid gap-4">
                  <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-6 flex items-start gap-4">
                    <div className="mt-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-white">
                      <MapPin className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm uppercase tracking-[0.16em] text-slate-400">Address</p>
                      <p className="mt-3 text-base text-white">Deans Trade Center, LG 07, Peshawar</p>
                    </div>
                  </div>
                  <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-6 flex items-start gap-4">
                    <div className="mt-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-white">
                      <Mail className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm uppercase tracking-[0.16em] text-slate-400">Email</p>
                      <p className="mt-3 text-base text-white">wiserconsulting55@gmail.com</p>
                    </div>
                  </div>
                  <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-6 flex items-start gap-4">
                    <div className="mt-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-white">
                      <Phone className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm uppercase tracking-[0.16em] text-slate-400">Phone</p>
                      <p className="mt-3 text-base text-white">+92 123 456 7890</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] bg-white p-8 shadow-2xl shadow-black/20">
              <h2 className="text-2xl font-semibold text-slate-900">Send us a message</h2>
              <form className="mt-8 space-y-5">
                <input
                  type="text"
                  placeholder="Your name"
                  className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-slate-900 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                />
                <input
                  type="email"
                  placeholder="Email address"
                  className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-slate-900 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                />
                <textarea
                  rows={5}
                  placeholder="Your message"
                  className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-slate-900 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                />
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-8 py-4 text-base font-semibold text-white transition hover:bg-slate-800"
                >
                  Send Message
                </button>
              </form>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default ContactPage;
