"use client";

import Image from "next/image";
import { GraduationCap, Plane } from "lucide-react";
import { motion } from "framer-motion";

export default function ServicesPage() {
  const fadeUp = {
    initial: { opacity: 0, y: 30 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.6 }
  };

  return (
    <div className="bg-[#f4f5f7] pt-16 text-[#1a1f2c] font-sans overflow-hidden">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 mb-24">
        
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row items-center justify-between mb-24 mt-8 gap-x-12 gap-y-16">
          <motion.div 
            {...fadeUp}
            className="flex-1 text-left max-w-2xl"
          >
            <span className="inline-block text-sm uppercase tracking-[0.25em] font-extrabold text-[#1e293b] mb-6">
              OUR SERVICES
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-[4rem] leading-[1.1] font-bold tracking-tight mb-8 text-[#0a1128]">
              Expert guidance,<br />built for success
            </h1>
            <p className="text-lg md:text-[1.15rem] text-[#475569] leading-relaxed max-w-xl">
              We craft personalized immigration strategies and reliable visa solutions that connect you globally, and support your journey.
            </p>
          </motion.div>

          <div className="relative inline-flex items-center justify-center flex-shrink-0 pr-16 lg:pr-24 group cursor-default">
            <motion.div 
              whileHover={{ scale: 1.03 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="w-[200px] h-[200px] md:w-[280px] md:h-[280px] rounded-full overflow-hidden shadow-2xl relative z-10 border-[6px] border-[#f4f5f7]"
            >
              <Image 
                src="/consultant.png" 
                alt="Consultant" 
                fill 
                className="object-cover transition-transform duration-700 group-hover:scale-110"
              />
            </motion.div>
            

          </div>
        </div>

        {/* Cards Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          
          {/* Card 1 */}
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            whileHover={{ y: -8 }}
            className="relative rounded-[2rem] overflow-hidden flex flex-col shadow-lg h-[460px] transition-all hover:shadow-xl group"
          >
            <Image 
              src="/student_visa.png" 
              alt="Student Visa" 
              fill 
              className="object-cover group-hover:scale-110 transition-transform duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a1128] via-[#0a1128]/70 to-transparent"></div>
            
            <div className="relative z-10 p-10 w-full flex flex-col h-full justify-end items-center text-center">
              <div className="w-1.5 h-1.5 bg-white/50 mb-6 rounded-sm group-hover:bg-[#3b82f6] transition-colors"></div>
              <motion.div whileHover={{ rotate: 10, scale: 1.15 }} transition={{ type: "spring", stiffness: 300 }}>
                <GraduationCap className="w-12 h-12 text-white mb-6" strokeWidth={1.5} />
              </motion.div>
              <h3 className="text-2xl font-bold mb-4 text-white">Student Visa</h3>
              <p className="text-gray-300 text-[14px] mb-8 leading-relaxed max-w-[240px] mx-auto opacity-90">
                Guidance for international students with university, application, and document support.
              </p>
              <div className="text-gray-400 font-medium text-sm mt-auto group-hover:text-white transition-colors">01</div>
            </div>
          </motion.div>

          {/* Card 2 */}
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            whileHover={{ y: -8 }}
            className="relative rounded-[2rem] overflow-hidden flex flex-col shadow-lg h-[460px] transition-all hover:shadow-xl group"
          >
            <Image 
              src="/tourist_visa.png" 
              alt="Tourist Visa" 
              fill 
              className="object-cover group-hover:scale-110 transition-transform duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a1128] via-[#0a1128]/70 to-transparent"></div>
            
            <div className="relative z-10 p-10 w-full flex flex-col h-full justify-end items-center text-center">
              <div className="w-1.5 h-1.5 bg-white/50 mb-6 rounded-sm group-hover:bg-[#3b82f6] transition-colors"></div>
              <motion.div whileHover={{ rotate: -10, scale: 1.15 }} transition={{ type: "spring", stiffness: 300 }}>
                <Plane className="w-12 h-12 text-white mb-6" strokeWidth={1.5} />
              </motion.div>
              <h3 className="text-2xl font-bold mb-4 text-white">Tourist Visa</h3>
              <p className="text-gray-300 text-[14px] mb-8 leading-relaxed max-w-[240px] mx-auto opacity-90">
                Quick and reliable visitor visa support for travel, tourism, and family trips.
              </p>
              <div className="text-gray-400 font-medium text-sm mt-auto group-hover:text-white transition-colors">02</div>
            </div>
          </motion.div>

        </div>
      </div>

      {/* How We Work Section */}
      <section className="pt-24 pb-32 bg-white relative">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <motion.h3 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-[13px] uppercase tracking-[0.25em] text-[#94a3b8] font-bold"
            >
              How we work
            </motion.h3>
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="mt-4 text-[2.5rem] font-bold text-[#0a1128] tracking-tight"
            >
              Simple process. Better outcomes.
            </motion.h2>
          </div>
          
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { step: "01", title: "Consultation", img: "/consultant.png" },
              { step: "02", title: "Planning", img: "/business.png" },
              { step: "03", title: "Submission", img: "/student_visa.png" },
              { step: "04", title: "Approval", img: "/tourist_visa.png" }
            ].map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.15 }}
                whileHover={{ y: -8, scale: 1.02 }}
                className="rounded-[24px] border border-slate-100 bg-white overflow-hidden text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-all cursor-pointer flex flex-col group relative"
              >
                <div className="relative h-48 w-full overflow-hidden">
                  <Image src={item.img} alt={item.title} fill className="object-cover transition-transform duration-700 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors duration-500"></div>
                </div>
                
                <div className="absolute top-[164px] left-1/2 -translate-x-1/2 inline-flex h-[56px] w-[56px] items-center justify-center rounded-full bg-[#0a1128] border-4 border-white text-white text-[15px] font-bold shadow-sm z-10 transition-colors duration-300 group-hover:bg-[#3b82f6]">
                  {item.step}
                </div>
                
                <div className="px-6 pb-8 pt-10 flex-1 flex items-center justify-center bg-white relative z-0">
                  <h3 className="text-[18px] font-bold text-[#0a1128] group-hover:text-[#3b82f6] transition-colors">{item.title}</h3>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
