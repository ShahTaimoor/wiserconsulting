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
    <div className="bg-slate-50 text-slate-900">
      <section className="pt-32 pb-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div initial="initial" animate="animate" className="space-y-6">
            <motion.p variants={fadeUp} className="text-sm uppercase tracking-[0.32em] text-slate-400">
              Contact Us
            </motion.p>
            <motion.h1 variants={fadeUp} className="text-5xl md:text-6xl font-bold tracking-tight">
              Get in touch with our team.
            </motion.h1>
            <motion.p variants={fadeUp} className="mx-auto max-w-3xl text-xl text-slate-600 leading-relaxed">
              Send your questions, schedule a consultation, or request help with your visa application.
            </motion.p>
          </motion.div>
        </div>
      </section>

      <section className="py-20 bg-slate-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid gap-8 lg:grid-cols-3">
          <motion.div variants={fadeUp} initial="initial" animate="animate" className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <Phone className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Phone</h2>
            <p className="text-slate-600">+92 123 456 7890</p>
          </motion.div>

          <motion.div variants={fadeUp} initial="initial" animate="animate" className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <Mail className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Email</h2>
            <p className="text-slate-600">wiserconsulting55@gmail.com</p>
          </motion.div>

          <motion.div variants={fadeUp} initial="initial" animate="animate" className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <MapPin className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Office</h2>
            <p className="text-slate-600">Deans Trade Center, LG 07, Peshawar</p>
          </motion.div>
        </div>
      </section>

      <section className="pb-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial="initial" animate="animate" className="rounded-3xl border border-slate-200 bg-slate-50 p-10 shadow-sm">
            <div className="space-y-6">
              <motion.h2 variants={fadeUp} className="text-3xl font-bold text-slate-900">
                Send us a message
              </motion.h2>
              <motion.form variants={fadeUp} className="grid gap-6">
                <input type="text" placeholder="Your name" className="rounded-3xl border border-slate-200 bg-white px-5 py-4 text-slate-900 outline-none focus:ring-2 focus:ring-slate-300" />
                <input type="email" placeholder="Email address" className="rounded-3xl border border-slate-200 bg-white px-5 py-4 text-slate-900 outline-none focus:ring-2 focus:ring-slate-300" />
                <textarea rows={5} placeholder="Your message" className="rounded-3xl border border-slate-200 bg-white px-5 py-4 text-slate-900 outline-none focus:ring-2 focus:ring-slate-300" />
                <button type="submit" className="inline-flex items-center justify-center rounded-full bg-slate-900 px-8 py-4 text-white font-semibold hover:bg-slate-800 transition-all">
                  Send Message
                </button>
              </motion.form>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default ContactPage;
