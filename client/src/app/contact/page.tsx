"use client";

import { motion } from "framer-motion";
import { Mail, Phone, MapPin } from "lucide-react";

const cityImageUrl =
  "https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1200&q=80";

const ContactPage = () => {
  const fadeUp = {
    initial: { opacity: 0, y: 45 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6 }
  };

  return (
    <div className="bg-slate-50 text-slate-900">
      <section className="pt-20 pb-12 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-5 lg:px-8 text-center">
          <motion.div initial="initial" animate="animate" className="space-y-4">
            <motion.p variants={fadeUp} className="text-sm uppercase tracking-[0.32em] text-slate-700 font-bold drop-shadow-sm">
              Contact us
            </motion.p>
            <motion.h1 variants={fadeUp} className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900">
              Have questions? ready to help!
            </motion.h1>
            <motion.p variants={fadeUp} className="mx-auto max-w-3xl text-lg text-slate-600 leading-relaxed">
              Our expert team offers visa consulting for students, professionals, and families. Reach out for personalized guidance and support through every stage of your immigration process.
            </motion.p>
          </motion.div>
        </div>
      </section>

      <section className="pb-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-5 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] items-stretch">
            <motion.div
              variants={fadeUp}
              initial="initial"
              animate="animate"
              className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl"
            >
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${cityImageUrl})` }}
              />
              <div className="absolute inset-0 bg-slate-950/64" />
              <div className="relative z-10 flex min-h-[460px] flex-col justify-between p-6 sm:p-8 lg:p-10">
                <div>
                  <p className="text-sm uppercase tracking-[0.32em] text-emerald-300">Contact information</p>
                  <h2 className="mt-6 text-4xl font-bold tracking-tight text-white">Visa consulting made simple.</h2>
                  <p className="mt-4 max-w-xl text-slate-300 leading-relaxed">
                    Ready to move abroad for study, work, or family? Our visa consulting experts guide you through documentation, embassy processes, and application planning.
                  </p>
                </div>

                <div className="space-y-4 rounded-3xl bg-white/10 p-6 backdrop-blur-sm sm:p-8">
                  <div className="flex items-center gap-4 text-white">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500">
                      <Phone className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm uppercase tracking-[0.24em] text-slate-200">Phone</p>
                      <p className="mt-1 text-lg font-semibold">+92 370 970 6643</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-white">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-500">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm uppercase tracking-[0.24em] text-slate-200">Email</p>
                      <p className="mt-1 text-lg font-semibold">wiserconsulting55@gmail.com</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-white">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-500">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm uppercase tracking-[0.24em] text-slate-200">Office</p>
                      <p className="mt-1 text-lg font-semibold">Deans Trade Center, UG390, Peshawar</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              variants={fadeUp}
              initial="initial"
              animate="animate"
              className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl"
            >
              <div className="mb-8">
                <p className="text-sm uppercase tracking-[0.32em] text-slate-500">Send a message</p>
                <h3 className="mt-4 text-3xl font-bold text-slate-900">Start your consultation</h3>
                <p className="mt-3 text-slate-600 leading-relaxed">
                  Tell us about your situation and our team will reach out with the best guidance for your visa application.
                </p>
              </div>

              <form className="grid gap-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <input
                    type="text"
                    placeholder="Name*"
                    className="h-14 rounded-full border border-slate-200 bg-slate-50 px-5 text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                  />
                  <input
                    type="text"
                    placeholder="Phone number*"
                    className="h-14 rounded-full border border-slate-200 bg-slate-50 px-5 text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                  />
                </div>

                <input
                  type="email"
                  placeholder="Email address*"
                  className="h-14 rounded-full border border-slate-200 bg-slate-50 px-5 text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                />

                <textarea
                  rows={6}
                  placeholder="Write here your message"
                  className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-5 py-4 text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                />

                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-full bg-emerald-500 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-600"
                >
                  Send message
                </button>
              </form>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ContactPage;
