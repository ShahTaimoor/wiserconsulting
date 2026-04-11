"use client";

import { motion } from "framer-motion";

const AboutPage = () => {
  const fadeIn = {
    initial: { opacity: 0, y: 40 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6 }
  };

  return (
    <div className="bg-slate-50 text-slate-900">
      <section className="pt-32 pb-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="initial"
            animate="animate"
            className="text-center"
            variants={{ animate: { transition: { staggerChildren: 0.15 } } }}
          >
            <motion.h1 variants={fadeIn} className="text-5xl md:text-6xl font-bold tracking-tight mb-6">
              About Wiser Consulting
            </motion.h1>
            <motion.p variants={fadeIn} className="mx-auto max-w-3xl text-xl text-slate-600 leading-relaxed">
              We make global immigration simpler with trusted visa guidance, expert document support, and a people-first process.
            </motion.p>
          </motion.div>
        </div>
      </section>

      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid gap-16 lg:grid-cols-[0.9fr_0.9fr] items-center">
          <motion.div variants={fadeIn} initial="initial" animate="animate" className="space-y-6">
            <p className="text-sm uppercase tracking-[0.32em] text-slate-400">Our Story</p>
            <h2 className="text-4xl font-bold text-slate-900">Focused on real results for families and professionals.</h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              Since 2009, our team has supported thousands of clients with every type of visa journey. We combine personal care, legal knowledge, and practical support so you can move forward with confidence.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-400 uppercase tracking-[0.24em]">Trusted by</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">10,000+</p>
                <p className="mt-2 text-slate-600">clients worldwide</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-400 uppercase tracking-[0.24em]">Success rate</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">98%</p>
                <p className="mt-2 text-slate-600">approved applications</p>
              </div>
            </div>
          </motion.div>

          <motion.div variants={fadeIn} initial="initial" animate="animate" className="rounded-[2rem] bg-gradient-to-br from-slate-900 to-slate-700 p-10 text-white shadow-2xl">
            <div className="space-y-6">
              <p className="text-sm uppercase tracking-[0.24em] text-cyan-300">Why choose us</p>
              <h3 className="text-3xl font-bold">Personalized support at every step.</h3>
              <p className="text-slate-200 leading-relaxed">
                We listen to your goals, review your documents carefully, and keep you informed throughout the process so your visa journey is clear and stress-free.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl bg-white/10 p-4">
                  <p className="text-sm uppercase tracking-[0.24em] text-slate-300">Dedicated team</p>
                  <p className="mt-2 text-base font-semibold">Experienced specialists</p>
                </div>
                <div className="rounded-3xl bg-white/10 p-4">
                  <p className="text-sm uppercase tracking-[0.24em] text-slate-300">Clear process</p>
                  <p className="mt-2 text-base font-semibold">Easy steps to approval</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center mb-16">
            <p className="text-[12px] uppercase tracking-[0.3em] text-[#94A3B8] font-medium mb-3">Our Values</p>
            <h2 className="text-[36px] md:text-[42px] font-[800] text-[#0F172A] tracking-tight">What drives our work</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 max-w-6xl mx-auto">
            {[
              { title: "Integrity", description: "Transparent advice and honest support." },
              { title: "Care", description: "People-first service for every application." },
              { title: "Expertise", description: "Years of visa and immigration experience." },
              { title: "Results", description: "A process built for approval and peace of mind." }
            ].map((item) => (
              <motion.div
                key={item.title}
                variants={fadeIn}
                initial="initial"
                animate="animate"
                className="rounded-[20px] border border-[#F1F5F9] bg-[#FAFBFC] p-[30px] shadow-[0_2px_12px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-1 hover:border-[#E2E8F0] transition-all duration-300 flex flex-col"
              >
                <h3 className="text-[17px] font-semibold text-[#0F172A] mb-2.5">{item.title}</h3>
                <p className="text-[#64748B] text-[15px] leading-[1.65]">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default AboutPage;
