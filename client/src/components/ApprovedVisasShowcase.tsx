"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { approvedVisaService, ApprovedVisa } from "@/services/approvedVisaService";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";

// Matches ServicesSection's grid breakpoints: 1 col mobile, 2 cols sm+, 4 cols lg+
const getColumnsForWidth = (width: number): number => {
  if (width >= 1024) return 4;
  if (width >= 640) return 2;
  return 1;
};

const formatApprovalDate = (dateStr?: string): string | null => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  return `Approved ${date.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;
};

const VisaCard = ({ visa, index }: { visa: ApprovedVisa; index: number }) => {
  const approvalLabel = formatApprovalDate(visa.approvalDate);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="group relative h-[420px] w-full overflow-hidden rounded-[2rem] shadow-lg"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary URLs aren't in next.config's image domains, same convention used elsewhere (Navbar/Footer logo, admin previews) */}
      <img
        src={visa.clientPhotoUrl}
        alt={visa.clientName}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0a1128] via-[#0a1128]/60 to-transparent" />

      <div className="absolute top-4 right-4 h-12 w-12 overflow-hidden rounded-full border-2 border-white bg-white shadow-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={visa.countryFlagUrl} alt={visa.countryName} className="h-full w-full object-cover" />
      </div>

      <div className="relative z-10 flex h-full flex-col justify-end p-6 text-white">
        <h3 className="text-xl font-bold">{visa.clientName}</h3>
        <p className="text-sm text-white/80">
          {visa.countryName}
          {visa.visaType ? ` · ${visa.visaType}` : ""}
        </p>
        {visa.note && (
          <p className="mt-2 text-sm italic leading-relaxed text-white/90 line-clamp-2">
            &ldquo;{visa.note}&rdquo;
          </p>
        )}
        {approvalLabel && (
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">
            {approvalLabel}
          </p>
        )}
      </div>
    </motion.div>
  );
};

const ApprovedVisasShowcase = () => {
  const [mounted, setMounted] = useState(false);
  const [visas, setVisas] = useState<ApprovedVisa[]>([]);
  const [loading, setLoading] = useState(true);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    setMounted(true);
    setWidth(window.innerWidth);

    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const loadVisas = async () => {
      try {
        const data = await approvedVisaService.getPublicList();
        setVisas(data);
      } catch (error) {
        console.error("Failed to load approved visas:", error);
      } finally {
        setLoading(false);
      }
    };

    loadVisas();
  }, []);

  // Avoid a hydration mismatch (server has no viewport width) and avoid
  // flashing a broken/empty layout while the fetch is in flight.
  if (!mounted || loading) return null;

  // Graceful empty state: hide the section entirely rather than an empty grid.
  if (visas.length === 0) return null;

  const columns = getColumnsForWidth(width);
  const useCarousel = visas.length > columns;

  return (
    <section className="pt-20 pb-8 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Approved Visas
          </h2>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Success Stories From Our Clients
          </p>
        </motion.div>

        {useCarousel ? (
          <Carousel opts={{ align: "start" }} className="w-full px-8 sm:px-12">
            <CarouselContent>
              {visas.map((visa, index) => (
                <CarouselItem key={visa._id} className="sm:basis-1/2 lg:basis-1/4">
                  <VisaCard visa={visa} index={index} />
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
          </Carousel>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {visas.map((visa, index) => (
              <VisaCard key={visa._id} visa={visa} index={index} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default ApprovedVisasShowcase;
