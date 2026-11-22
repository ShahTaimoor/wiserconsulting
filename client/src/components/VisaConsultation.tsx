'use client';

import React, { useState, useEffect, useRef } from 'react';
import Typed from 'typed.js';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import AssessmentForm from './AssessmentForm';
import ApprovedVisasShowcase from './ApprovedVisasShowcase';
import {
  CheckCircle2,
  Clock,
  Shield,
  Award,
  TrendingUp,
  Mail,
  MapPin
} from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import { StatCountUp } from '@/components/StatCountUp';
import { CommentsModal } from '@/components/comments/CommentsModal';
import { OPEN_ASSESSMENT_EVENT } from '@/utils/assessmentForm';
import { OPEN_COMMENTS_EVENT, setCommentsViewed, useCommentsViewed } from '@/utils/commentsPanel';
import { RootState, AppDispatch } from '@/redux/store';
import { fetchAdminComments, fetchCustomerSubmission } from '@/redux/slices/formSubmission/formSubmissionSlice';
import { useSettings } from '@/context/SettingsContext';

interface AuthState {
  user: {
    email: string;
  } | null;
}

type Country = { name: string; image: string };

const VisaConsultation: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const [isFormOpen, setIsFormOpen] = useState(false);

  // The "Get Free Assessment" button is in the navbar: it opens this form, directly on this page or through /?assessment=open.
  useEffect(() => {
    const open = () => setIsFormOpen(true);
    const openComments = () => {
      setShowComments(true);
      setCommentsViewed(true);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setShowComments(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_ASSESSMENT_EVENT, open);
    window.addEventListener(OPEN_COMMENTS_EVENT, openComments);
    const params = new URLSearchParams(window.location.search);
    if (params.get("assessment") === "open") open();
    if (params.get("comments") === "open") openComments();
    if (params.has("assessment") || params.has("comments")) window.history.replaceState(null, "", window.location.pathname);
    return () => {
      window.removeEventListener(OPEN_ASSESSMENT_EVENT, open);
      window.removeEventListener(OPEN_COMMENTS_EVENT, openComments);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  const [showComments, setShowComments] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const hasViewedComments = useCommentsViewed();
  const [reuploadingDocId, setReuploadingDocId] = useState<string | null>(null);
  const [reuploadFiles, setReuploadFiles] = useState<{ [key: string]: File }>({});
  const typedEl = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!typedEl.current) return;

    const options = {
      strings: [
        "Your Journey to<br><span class=\"block mt-3 bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300\">Global Opportunities</span>"
      ],
      startDelay: 300,
      typeSpeed: 40,
      backSpeed: 40,
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

  const { user } = useSelector((state: RootState) => state.auth) as { user: { email: string; name: string } | null };
  const { adminComments, currentSubmission } = useSelector((state: RootState) => state.formSubmission);

  useEffect(() => {
    if (user?.email) {
      dispatch(fetchAdminComments(user.email));
    }
  }, [user?.email, dispatch]);

  const prevCommentsLength = useRef(adminComments.length);

  // Reset viewed status only if NEW comments arrive
  useEffect(() => {
    if (adminComments.length > prevCommentsLength.current) {
      setCommentsViewed(false);
    }
    prevCommentsLength.current = adminComments.length;
  }, [adminComments.length]);

  const handleReuploadFile = (docId: string, file: File) => {
    setReuploadFiles(prev => ({ ...prev, [docId]: file }));
  };

  const handleReuploadSubmit = async (docId: string) => {
    const file = reuploadFiles[docId];
    if (!file) {
      console.error('No file selected for re-upload');
      return;
    }

    console.log('🚀 Starting re-upload for document:', docId);
    console.log('📄 File details:', {
      name: file.name,
      size: file.size,
      type: file.type
    });
    console.log('👤 User logged in:', !!user);
    console.log('📧 User email:', user?.email);

    setReuploadingDocId(docId);
    console.log('⏳ Set reuploading state for document:', docId);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentId', docId);

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/reupload-document`;
      console.log('🔗 NEXT_PUBLIC_API_URL environment variable:', process.env.NEXT_PUBLIC_API_URL);
      console.log('🌐 Sending request to:', apiUrl);
      console.log('📡 Full API URL constructed:', apiUrl);
      console.log('🔑 Token exists:', !!token);
      console.log('📦 FormData contents:');
      for (const [key, value] of formData.entries()) {
        if (value instanceof File) {
          console.log(`- ${key}: ${value.name} (${value.size} bytes)`);
        } else {
          console.log(`- ${key}: ${value}`);
        }
      }

      console.log('📤 Making fetch request...');
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      console.log('📥 Response status:', response.status);
      console.log('📋 Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Error response:', errorText);
        throw new Error(`Failed to re-upload document: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ Response body:', result);
      console.log('🎉 Re-upload success:', result);
      
      // Clear the re-upload file for this document
      setReuploadFiles(prev => {
        const newFiles = { ...prev };
        delete newFiles[docId];
        return newFiles;
      });

      // Refresh both admin comments and current submission to show updated image
      if (user?.email) {
        console.log('🔄 Refreshing admin comments for user:', user.email);
        dispatch(fetchAdminComments(user.email));
        
        // Also refresh the current submission to update the image URLs
        console.log('🔄 Refreshing current submission for user:', user.email);
        dispatch(fetchCustomerSubmission(user.email));
        
        console.log('⏳ Waiting for state updates...');
        // Add a small delay to ensure state updates are processed
        setTimeout(() => {
          console.log('✅ State refresh completed - image should be updated now');
        }, 1000);
      }

      alert('Document re-uploaded successfully!');
    } catch (error) {
      console.error('Re-upload error:', error);
      alert(`Failed to re-upload document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setReuploadingDocId(null);
    }
  };

  const { settings } = useSettings();
  // Nearest available picture for each size (mobile prefers tablet, tablet prefers desktop, desktop prefers tablet).
  const heroMobile = settings.heroMobileUrl || settings.heroTabletUrl || settings.heroDesktopUrl || '';
  const heroTablet = settings.heroTabletUrl || settings.heroDesktopUrl || settings.heroMobileUrl || '';
  const heroDesktop = settings.heroDesktopUrl || settings.heroTabletUrl || settings.heroMobileUrl || '';

  // Icons stay fixed in code — only the value/label text is admin-editable
  // (via Settings > Homepage Statistics), with hardcoded fallbacks so the
  // cards never show blank if a field is missing/empty.
  const stats = [
    {
      value: settings.stat1Value || '10,000+',
      label: settings.stat1Label || 'Successful Applications',
      icon: <CheckCircle2 className="w-6 h-6" />,
    },
    {
      value: settings.stat2Value || '98%',
      label: settings.stat2Label || 'Success Rate',
      icon: <TrendingUp className="w-6 h-6" />,
    },
    {
      value: settings.stat3Value || '15+',
      label: settings.stat3Label || 'Years Experience',
      icon: <Award className="w-6 h-6" />,
    },
    {
      value: settings.stat4Value || '24/7',
      label: settings.stat4Label || 'Support Available',
      icon: <Shield className="w-6 h-6" />,
    },
  ];

  return (
    <div className="relative overflow-x-hidden">
      {/* Hero Section - Modern Design */}
      <section className="relative w-full min-h-screen flex items-center justify-center overflow-hidden bg-slate-900">
        {/* Hero banner: the admin uploads one picture per screen size (Admin > Settings > Homepage Banner).
            A size without a picture uses the nearest one that is set; with none at all the dark background shows. */}
        {(heroMobile || heroTablet || heroDesktop) && (
          <picture>
            {heroDesktop && <source media="(min-width: 1024px)" srcSet={heroDesktop} />}
            {heroTablet && <source media="(min-width: 640px)" srcSet={heroTablet} />}
            {/* eslint-disable-next-line @next/next/no-img-element -- storage URLs are not in next.config's image domains */}
            <img
              src={heroMobile}
              alt=""
              className="absolute top-0 left-0 w-full h-full object-cover z-0"
            />
          </picture>
        )}
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

          </motion.div>
        </div>
      </section>

      {/* Stats Section: one connected band, hairline dividers, count-up numbers */}
      <section className="relative bg-slate-50 py-14 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-600">Our track record</p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Trusted by applicants, backed by results</h2>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 shadow-[0_10px_40px_-12px_rgba(15,23,42,0.18)]"
          >
            {stats.map((stat, index) => (
              <div
                key={index}
                className="group relative flex flex-col items-center bg-white px-4 py-8 sm:px-6 sm:py-10 text-center transition-colors duration-300 hover:bg-slate-50"
              >
                <span className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-emerald-500 transition-transform duration-500 group-hover:scale-x-100" />
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 transition-colors duration-300 group-hover:bg-emerald-600 group-hover:text-white">
                  {stat.icon}
                </div>
                <div className="text-3xl sm:text-4xl lg:text-5xl font-bold tabular-nums tracking-tight text-slate-900">
                  <StatCountUp value={stat.value} />
                </div>
                <div className="mt-2 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {stat.label}
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Approved Visas Section */}
      <ApprovedVisasShowcase />

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

      {/* Comments (opened from the navbar) */}
      {mounted && user && (
        <CommentsModal
          isOpen={showComments}
          onClose={() => setShowComments(false)}
          submission={currentSubmission}
          adminComments={adminComments}
          reuploadFiles={reuploadFiles}
          reuploadingDocId={reuploadingDocId}
          onReuploadFile={handleReuploadFile}
          onReuploadSubmit={handleReuploadSubmit}
          onPreviewImage={setPreviewImageUrl}
          onReplySent={() => { if (user?.email) dispatch(fetchAdminComments(user.email)); }}
        />
      )}

      <AssessmentForm isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} />

      {/* Image Preview Modal */}
      <AnimatePresence>
        {previewImageUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm cursor-pointer"
            onClick={() => setPreviewImageUrl(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-5xl w-full max-h-[85vh] bg-white rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.3)] cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setPreviewImageUrl(null)}
                className="absolute top-4 right-4 z-20 w-10 h-10 bg-white/90 text-slate-900 rounded-full flex items-center justify-center hover:bg-slate-900 hover:text-white shadow-lg transition-all duration-300"
              >
                <span className="text-xl font-bold">✕</span>
              </button>
              
              <div className="relative w-full h-[80vh] bg-slate-50">
                <Image
                  src={previewImageUrl}
                  alt="Document Preview"
                  fill
                  className="object-contain p-2"
                  unoptimized
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VisaConsultation;
