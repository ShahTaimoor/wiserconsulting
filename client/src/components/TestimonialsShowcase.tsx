"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import Autoplay from "embla-carousel-autoplay";
import { testimonialService, Testimonial } from "@/services/testimonialService";
import { getInitials } from "@/lib/utils";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";

// Matches ApprovedVisasShowcase's grid breakpoints: 1 col mobile, 2 cols sm+, 4 cols lg+
const getColumnsForWidth = (width: number): number => {
  if (width >= 1024) return 4;
  if (width >= 640) return 2;
  return 1;
};

const TestimonialCard = ({ testimonial }: { testimonial: Testimonial }) => (
  <div className="flex h-full w-full flex-col bg-white rounded-[2rem] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] transition-shadow duration-500">
    <div className="flex gap-1 mb-6 text-amber-400">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={20}
          fill={i <= testimonial.rating ? "currentColor" : "none"}
          className={i <= testimonial.rating ? "" : "text-slate-200"}
        />
      ))}
    </div>
    <p className="flex-1 text-slate-600 leading-relaxed mb-8 text-[15px]">
      &ldquo;{testimonial.reviewText}&rdquo;
    </p>
    <div className="flex items-center gap-4 mt-auto">
      {testimonial.clientPhotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URLs aren't in next.config's image domains, same convention used elsewhere
        <img
          src={testimonial.clientPhotoUrl}
          alt={testimonial.clientName}
          className="w-12 h-12 rounded-full object-cover border border-slate-200"
        />
      ) : (
        <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-700 font-bold text-lg border border-slate-200">
          {getInitials(testimonial.clientName)}
        </div>
      )}
      <div>
        <h4 className="font-bold text-slate-900 text-[16px]">{testimonial.clientName}</h4>
        <p className="text-sm font-semibold text-[#3b82f6]">
          {testimonial.roleOrCaption || "Satisfied Client"}
        </p>
      </div>
    </div>
  </div>
);

const TestimonialsShowcase = () => {
  const [mounted, setMounted] = useState(false);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [width, setWidth] = useState(0);

  // Continuous auto-loop: pauses natively on hover (stopOnMouseEnter) and
  // resumes on mouse-leave; a stray swipe/drag doesn't kill it permanently
  // (stopOnInteraction: false) since there are no manual controls, matching
  // ApprovedVisasShowcase's autoplay config exactly.
  const autoplayPlugin = useRef(
    Autoplay({ delay: 3500, stopOnMouseEnter: true, stopOnInteraction: false })
  );

  useEffect(() => {
    setMounted(true);
    setWidth(window.innerWidth);

    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const loadTestimonials = async () => {
      try {
        const data = await testimonialService.getPublicList();
        setTestimonials(data);
      } catch (error) {
        console.error("Failed to load testimonials:", error);
      } finally {
        setLoading(false);
      }
    };

    loadTestimonials();
  }, []);

  // Avoid a hydration mismatch (server has no viewport width) and avoid
  // flashing a broken/empty layout while the fetch is in flight.
  if (!mounted || loading) return null;

  // Graceful empty state: hide the section entirely rather than an empty grid.
  if (testimonials.length === 0) return null;

  const columns = getColumnsForWidth(width);
  const useCarousel = testimonials.length > columns;

  return (
    <div className="pt-6 pb-20 bg-slate-50 overflow-hidden border-t border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-16 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100/50 text-blue-700 font-bold text-xs tracking-wider uppercase mb-4 shadow-sm border border-blue-200/50">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span> Client Testimonial
        </div>
        <h2 className="text-[36px] md:text-[46px] font-black text-[#0a1128] tracking-tight">
          What Our Client Says
        </h2>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {useCarousel ? (
          <Carousel
            opts={{ align: "start", loop: true }}
            plugins={[autoplayPlugin.current]}
            className="w-full"
          >
            <CarouselContent>
              {testimonials.map((testimonial, index) => (
                <CarouselItem key={testimonial._id} className="sm:basis-1/2 lg:basis-1/4">
                  <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    className="h-full"
                  >
                    <TestimonialCard testimonial={testimonial} />
                  </motion.div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={testimonial._id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <TestimonialCard testimonial={testimonial} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TestimonialsShowcase;
