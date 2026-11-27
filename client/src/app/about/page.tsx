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
      <section className="pt-24 pb-28 md:pb-36 bg-[#f4f5f7]">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-x-12 gap-y-8">
            <motion.div
              initial="initial"
              animate="animate"
              className="flex-1 text-left max-w-2xl"
              variants={{ animate: { transition: { staggerChildren: 0.15 } } }}
            >
              <motion.span variants={fadeIn} className="inline-block text-sm uppercase tracking-[0.25em] font-extrabold text-[#1e293b] mb-6">
                ABOUT WISER CONSULTING
              </motion.span>
              <motion.h1 variants={fadeIn} className="text-4xl md:text-5xl lg:text-[4rem] leading-[1.1] font-bold tracking-tight mb-8 text-[#0a1128]">
                Your trusted path,<br />to a global future
              </motion.h1>
              <motion.p variants={fadeIn} className="text-lg md:text-[1.15rem] text-[#475569] leading-relaxed max-w-xl">
                We make global immigration simpler with trusted visa guidance, expert document support, and a people-first process helping thousands worldwide.
              </motion.p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative inline-flex items-center justify-center flex-shrink-0 group cursor-default"
            >
              <motion.div
                whileHover={{ scale: 1.03 }}
                transition={{ type: "spring", stiffness: 300 }}
                className="w-[240px] h-[240px] md:w-[320px] md:h-[320px] rounded-full overflow-hidden shadow-2xl relative z-10 border-[6px] border-white"
              >
                <img
                  src="/passports.png"
                  alt="Our Team"
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AboutPage;
