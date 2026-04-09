"use client";

import { motion } from "framer-motion";
import { Globe2, Briefcase, GraduationCap, Heart } from "lucide-react";

const ServicesPage = () => {
  const fadeUp = {
    initial: { opacity: 0, y: 45 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6 }
  };

  const services = [
    {
      title: "Student Visa",
      description: "Guidance for international students with university, application, and document support.",
      icon: <GraduationCap className="w-6 h-6" />
    },
    {
      title: "Tourist Visa",
      description: "Quick and reliable visitor visa support for travel, tourism, and family trips.",
      icon: <Globe2 className="w-6 h-6" />
    }
  ];

  return (
    <div className="bg-slate-50 text-slate-900">
      <section className="pt-32 pb-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div initial="initial" animate="animate" className="space-y-6">
            <motion.p variants={fadeUp} className="text-sm uppercase tracking-[0.32em] text-slate-400">
              Our Services
            </motion.p>
            <motion.h1 variants={fadeUp} className="text-5xl md:text-6xl font-bold tracking-tight">
              Services built for smooth visa approval.
            </motion.h1>
            <motion.p variants={fadeUp} className="mx-auto max-w-3xl text-xl text-slate-600 leading-relaxed">
              Explore the expert immigration services we offer for students, travelers, professionals, and families.
            </motion.p>
          </motion.div>
        </div>
      </section>

      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-2">
            {services.map((service) => (
              <motion.div
                key={service.title}
                variants={fadeUp}
                initial="initial"
                animate="animate"
                whileHover={{ y: -8 }}
                className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm transition-all hover:shadow-xl"
              >
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white mb-6">
                  {service.icon}
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-3">{service.title}</h2>
                <p className="text-slate-600 leading-relaxed">{service.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <motion.p variants={fadeUp} initial="initial" animate="animate" className="text-sm uppercase tracking-[0.32em] text-slate-400">
              How we work
            </motion.p>
            <motion.h2 variants={fadeUp} initial="initial" animate="animate" className="mt-4 text-4xl font-bold text-slate-900">
              Simple process. Better outcomes.
            </motion.h2>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { step: "01", title: "Consultation" },
              { step: "02", title: "Planning" },
              { step: "03", title: "Submission" },
              { step: "04", title: "Approval" }
            ].map((item) => (
              <motion.div
                key={item.step}
                variants={fadeUp}
                initial="initial"
                animate="animate"
                className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center shadow-sm"
              >
                <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-900 text-white text-xl font-bold">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold text-slate-900">{item.title}</h3>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default ServicesPage;
