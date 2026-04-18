'use client';

import React, { useState, useEffect, useRef } from 'react';
import Typed from 'typed.js';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import AssessmentForm from './AssessmentForm';
import StarButton from '@/components/ui/star-button';
import {
  Globe2,
  FileCheck2,
  Users,
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Clock,
  Shield,
  Award,
  TrendingUp,
  Phone,
  Mail,
  MapPin
} from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/redux/store';
import { fetchAdminComments } from '@/redux/slices/formSubmission/formSubmissionSlice';

interface AuthState {
  user: {
    email: string;
  } | null;
}

type Country = { name: string; image: string };
type AdminComment = {
  documentId: string;
  documentName: string;
  comment: string;
  createdAt: string;
};

const VisaConsultation: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const typedEl = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!typedEl.current) return;

    const options = {
      strings: [
        "Your Journey to<br><span class=\"block mt-3 bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300\">Global Opportunities</span>"
      ],
      startDelay: 300,
      typeSpeed: 100,
      backSpeed: 100,
      backDelay: 5000,
      showCursor: false,
      smartBackspace: true,
      loop: true,
    };

    const typed = new Typed(typedEl.current, options);

    return () => {
      // Destroy Typed instance during cleanup to prevent memory leaks
      typed.destroy();
    };
  }, []);

  const popularDestinations: Country[] = [
    { name: 'United Kingdom', image: 'https://flagcdn.com/gb.svg' },
    { name: 'United States', image: 'https://flagcdn.com/us.svg' },
    { name: 'Canada', image: 'https://flagcdn.com/ca.svg' },
    { name: 'Australia', image: 'https://flagcdn.com/au.svg' },
    { name: 'Hongkong', image: 'https://flagcdn.com/hk.svg' },
  ];

  const { user } = useSelector((state: RootState) => state.auth) as { user: { email: string } | null };
  const { adminComments } = useSelector((state: RootState) => state.formSubmission);

  useEffect(() => {
    if (user?.email) {
      dispatch(fetchAdminComments(user.email));
    }
  }, [user?.email, dispatch]);

  const groupCommentsByDocument = (comments: AdminComment[]) => {
    const grouped: { [key: string]: AdminComment[] } = {};
    comments.forEach((c) => {
      if (!grouped[c.documentName]) grouped[c.documentName] = [];
      grouped[c.documentName].push(c);
    });
    return grouped;
  };

  const stats = [
    { value: '10,000+', label: 'Successful Applications', icon: <CheckCircle2 className="w-6 h-6" /> },
    { value: '98%', label: 'Success Rate', icon: <TrendingUp className="w-6 h-6" /> },
    { value: '15+', label: 'Years Experience', icon: <Award className="w-6 h-6" /> },
    { value: '24/7', label: 'Support Available', icon: <Shield className="w-6 h-6" /> },
  ];

  const processSteps = [
    {
      step: '01',
      title: 'Free Consultation',
      description: 'Schedule a free consultation to discuss your visa requirements and eligibility.',
      icon: <Phone className="w-8 h-8" />,
      image: '/free-consultation.jpg',
    },
    {
      step: '02',
      title: 'Document Review',
      description: 'Our experts review all your documents and provide personalized guidance.',
      icon: <FileCheck2 className="w-8 h-8" />,
      image: '/document-review.jpg',
    },
    {
      step: '03',
      title: 'Application Submission',
      description: 'We handle the complete application process with attention to detail.',
      icon: <CheckCircle2 className="w-8 h-8" />,
      image: '/application-submission.jpg',
    },
    {
      step: '04',
      title: 'Visa Approval',
      description: 'Track your application status and receive your visa approval.',
      icon: <Award className="w-8 h-8" />,
      image: '/visa-approved.jpg',
    },
  ];

  return (
    <div className="relative overflow-x-hidden">
      {/* Hero Section - Modern Design */}
      <section className="relative w-full min-h-screen flex items-center justify-center overflow-hidden">
        <video
          className="absolute top-0 left-0 w-full h-full object-cover z-0"
          src="/U.mp4"
          autoPlay
          loop
          muted
          playsInline
        />
        <div className="absolute inset-0 bg-slate-900/70 z-10" />

        <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="space-y-10"
          >
            <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 backdrop-blur-sm rounded-full border border-white/20 mb-4">
              <Clock className="w-4 h-4 text-white" />
              <span className="text-sm text-white font-medium">Trusted Visa Consultants Since 2009</span>
            </div>

            <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black text-white leading-[0.95] tracking-tight min-h-[140px] sm:min-h-[160px] md:min-h-[180px] lg:min-h-[220px]">
              <span ref={typedEl}></span>
            </h1>

            <p className="text-xl md:text-2xl text-slate-200 max-w-3xl mx-auto leading-relaxed">
              Expert visa consultation services for students, professionals, and families.
              Get personalized immigration solutions tailored to your needs.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <StarButton
                onClick={() => setIsFormOpen(true)}
              >
                Get Free Assessment
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </StarButton>
              <Link href="/contact">
                <motion.button
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-8 py-4 bg-transparent text-white font-semibold rounded-lg text-lg border-2 border-white hover:bg-white/10 transition-all block"
                >
                  Learn More
                </motion.button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 relative bg-white border-b border-slate-100 overflow-hidden">
        {/* Subtle background gradient to make it look "light" and elegant */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-50/50 to-white z-0" />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 lg:gap-8">
            {stats.map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6, delay: index * 0.1, ease: "easeOut" }}
                whileHover={{ y: -8, scale: 1.02 }}
                className="group relative flex flex-col items-center p-8 bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.03)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] border border-slate-200 hover:border-slate-300 transition-all duration-500"
              >
                {/* Light color glow on hover behind the card */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-50/60 to-amber-50/60 opacity-0 group-hover:opacity-100 rounded-3xl transition-opacity duration-500" />

                <div className="relative z-20 inline-flex items-center justify-center w-20 h-20 bg-slate-50 border border-blue-50 rounded-2xl mb-6 text-slate-600 group-hover:bg-white group-hover:text-amber-600 group-hover:border-amber-200 group-hover:shadow-md group-hover:-translate-y-2 group-hover:rotate-3 transition-all duration-500">
                  {/* Subtle inner glow for icon container */}
                  <div className="absolute inset-0 bg-amber-400 opacity-0 group-hover:opacity-10 blur-xl rounded-2xl transition-opacity duration-500"></div>
                  <div className="relative z-10">
                    {stat.icon}
                  </div>
                </div>

                <div className="relative z-20 text-3xl md:text-4xl lg:text-5xl font-extrabold text-slate-900 mb-2 tracking-tight group-hover:text-slate-800 transition-colors">
                  {stat.value}
                </div>
                <div className="relative z-20 text-xs md:text-sm font-bold text-slate-500 uppercase tracking-wider group-hover:text-amber-600 transition-colors duration-300 text-center">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
              Why Choose Our Visa Services
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              We combine expertise, personalized service, and proven success rates to make your visa journey smooth and stress-free.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Background glowing elements for added premium feel */}
            <div className="absolute top-1/2 left-0 w-[400px] h-[400px] bg-blue-100/40 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
            <div className="absolute top-1/2 right-0 w-[400px] h-[400px] bg-amber-100/40 rounded-full blur-[120px] translate-x-1/2 -translate-y-1/2 pointer-events-none" />

            <ServiceCard
              index={0}
              icon={<Globe2 className="w-8 h-8" />}
              title="Personalized Guidance"
              description="One-on-one sessions tailored to your specific travel and documentation needs. Our experts understand every case is unique."
            />
            <ServiceCard
              index={1}
              icon={<FileCheck2 className="w-8 h-8" />}
              title="Complete File Preparation"
              description="From visa forms to financial documents, everything is reviewed, organized, and prepared to perfection by our team."
            />
            <ServiceCard
              index={2}
              icon={<Users className="w-8 h-8" />}
              title="Family & Group Support"
              description="Specialized support for couples, families, and group applications ensuring a smooth process for everyone involved."
            />
          </div>
        </div>
      </section>

      {/* Process Section */}
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
              Our Simple Process
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Four simple steps to get your visa approved
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {processSteps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="relative h-full"
              >
                <div className="group relative w-full h-[380px] bg-white rounded-3xl overflow-hidden transition-all duration-500 hover:shadow-[0_20px_50px_rgba(0,0,0,0.15)] hover:-translate-y-2 border border-slate-100 flex flex-col">

                  {/* Card Image Area (Profile-Pic equivalent) */}
                  <div className="relative w-full h-[60%] transition-all duration-500 group-hover:h-[45%] shrink-0 overflow-hidden">
                    <Image
                      src={step.image}
                      alt={step.title}
                      fill
                      className="object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />

                    {/* Mail / Contact Icon button top-right */}
                    <button className="absolute top-4 right-4 w-10 h-10 bg-white/70 backdrop-blur-sm rounded-full flex items-center justify-center text-slate-800 shadow-md hover:bg-slate-900 hover:text-white transition-all z-10">
                      <svg xmlns="http://www.w3.org/2000/svg" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect width={20} height={16} x={2} y={4} rx={2} /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
                    </button>

                    {/* Step Number Overlay */}
                    <div className="absolute bottom-3 left-6 text-5xl font-black text-white/90 drop-shadow-md z-10 transition-transform duration-500 group-hover:scale-95 group-hover:translate-x-1 origin-left">
                      {step.step}
                    </div>
                  </div>

                  {/* Content Container */}
                  <div className="relative flex-1 bg-white transition-all duration-500 flex flex-col p-6 z-20">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xl font-bold text-slate-900 group-hover:text-amber-600 transition-colors duration-300">
                        {step.title}
                      </h3>
                      <div className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center text-slate-600 shrink-0 shadow-inner group-hover:bg-amber-100 group-hover:text-amber-700 group-hover:border-amber-200 transition-colors duration-300 -mt-8 relative z-30 bg-white">
                        {step.icon}
                      </div>
                    </div>

                    <p className="text-slate-600 leading-relaxed text-sm line-clamp-3 group-hover:line-clamp-none transition-all duration-500">
                      {step.description}
                    </p>

                    {/* Hidden Action Area that appears on hover */}
                    <div className="mt-auto opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500 pb-1">
                      <Link href="/contact" className="text-sm font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-2 mt-4 w-fit inline-flex cursor-pointer relative z-40">
                        View Details <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </Link>
                    </div>
                  </div>
                </div>

                {/* Connector Line (Horizontal) */}
                {index < processSteps.length - 1 && (
                  <div className="hidden lg:block absolute top-[30%] -right-4 w-8 h-[2px] bg-slate-200 pointer-events-none" />
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Destinations Section */}
      <section className="pt-8 pb-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-10"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
              Popular Visa Destinations
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              We help you get visas for the most sought-after destinations worldwide
            </p>
          </motion.div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-6">
            {popularDestinations.map((country, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.1 }}
                whileHover={{ y: -8, scale: 1.05 }}
                className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-xl transition-all border border-slate-200 hover:border-slate-300 cursor-pointer group"
              >
                <div className="aspect-video mb-4 relative overflow-hidden rounded-lg bg-slate-100">
                  <Image
                    src={country.image}
                    alt={country.name}
                    fill
                    className="object-cover group-hover:scale-110 transition-transform duration-300"
                  />
                </div>
                <h3 className="font-semibold text-slate-900 text-center group-hover:text-slate-700 transition-colors">
                  {country.name}
                </h3>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-slate-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="space-y-8"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Ready to Start Your Visa Journey?
            </h2>
            <p className="text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
              Contact us today for a free consultation and let our expert team guide you through every step of the visa process.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <StarButton
                onClick={() => setIsFormOpen(true)}
              >
                Get Free Assessment
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </StarButton>
              <motion.a
                href="tel:+1234567890"
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-4 bg-transparent text-white font-semibold rounded-lg text-lg border-2 border-white hover:bg-white/10 transition-all flex items-center gap-2"
              >
                <Phone className="w-5 h-5" />
                Call Us Now
              </motion.a>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-8 pt-8 text-slate-400">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5" />
                <span className="text-sm">wiserconsulting55@gmail.com</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                <span className="text-sm">Deans Trade Center, UG390, Peshawar</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Comments Toggle Button */}
      {user && (
        <>
          <button
            onClick={() => setShowComments(!showComments)}
            className="fixed top-40 right-0 z-50 bg-slate-900 text-white p-3 rounded-l-xl shadow-xl hover:bg-slate-800 transition-all border border-slate-700 hover:shadow-2xl"
          >
            {showComments ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            {adminComments.length > 0 && (
              <span className="absolute -top-2 -left-2 bg-red-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-lg">
                {adminComments.length}
              </span>
            )}
          </button>

          {/* Comments Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: showComments ? 0 : "100%" }}
            transition={{ type: "tween", duration: 0.3 }}
            className="fixed top-20 right-0 w-96 h-[85vh] bg-white shadow-2xl border-l border-slate-200 rounded-l-2xl overflow-hidden z-40"
          >
            <div className="h-full flex flex-col">
              <div className="px-6 py-4 bg-slate-900 text-white border-b border-slate-700">
                <h3 className="text-lg font-semibold">Admin Comments</h3>
                <p className="text-sm text-slate-300 mt-1">Review feedback on your documents</p>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                {adminComments.length > 0 ? (
                  <div className="space-y-6">
                    {Object.entries(groupCommentsByDocument(adminComments)).map(([docName, comments]) => (
                      <div key={docName} className="mb-6">
                        <h4 className="font-semibold text-sm text-slate-900 mb-3 pb-2 border-b border-slate-200">
                          {docName}
                        </h4>
                        <div className="space-y-3">
                          {comments.map((c, i) => (
                            <div
                              key={i}
                              className="bg-slate-50 p-4 rounded-lg border-l-4 border-slate-600"
                            >
                              <p className="text-sm text-slate-800 leading-relaxed">{c.comment}</p>
                              <span className="text-xs text-slate-500 mt-2 block">
                                {new Date(c.createdAt).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric'
                                })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <FileCheck2 className="w-12 h-12 text-slate-300 mb-4" />
                    <p className="text-slate-500">No comments yet.</p>
                    <p className="text-sm text-slate-400 mt-2">Check back later for updates</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}

      <AssessmentForm isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} />
    </div>
  );
};

const ServiceCard = ({ icon, title, description, index = 0 }: { icon: React.ReactNode; title: string; description: string; index?: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 50 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-50px" }}
    transition={{ duration: 0.7, delay: index * 0.15, ease: "easeOut" }}
    whileHover={{ y: -12 }}
    className="relative bg-white p-8 sm:p-10 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.12)] transition-all duration-500 border border-slate-100 hover:border-slate-200 h-full overflow-hidden group z-10"
  >
    {/* Decorative background flares on hover */}
    <div className="absolute -right-20 -top-20 w-48 h-48 bg-slate-50 group-hover:bg-blue-50/80 rounded-full blur-3xl transition-colors duration-700 -z-10" />
    <div className="absolute -left-20 -bottom-20 w-48 h-48 bg-slate-50 group-hover:bg-amber-50/80 rounded-full blur-3xl transition-colors duration-700 -z-10" />

    <div className="w-16 h-16 bg-slate-50/80 border border-slate-100 rounded-2xl flex items-center justify-center mb-8 text-slate-600 group-hover:bg-slate-900 group-hover:text-white group-hover:-rotate-3 group-hover:scale-110 transition-all duration-500 shadow-sm relative z-20">
      <div className="absolute inset-0 rounded-2xl bg-slate-900 opacity-0 group-hover:opacity-20 blur-md transition-opacity duration-500 z-10"></div>
      <div className="relative z-20">
        {icon}
      </div>
    </div>

    <h3 className="text-2xl font-bold mb-4 text-slate-900 group-hover:text-slate-800 transition-colors duration-300 relative z-20">{title}</h3>
    <p className="text-slate-600/90 leading-relaxed text-base relative z-20">{description}</p>

    {/* Bottom decorative animated underline */}
    <div className="absolute bottom-0 left-0 w-0 h-1.5 bg-gradient-to-r from-slate-800 to-slate-600 group-hover:w-full transition-all duration-700 ease-in-out" />
  </motion.div>
);

export default VisaConsultation;
