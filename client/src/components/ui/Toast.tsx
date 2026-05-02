"use client";

import { motion, AnimatePresence } from 'framer-motion';
import React from 'react';

interface ToastProps {
  type: 'success' | 'error';
  message: string;
}

export const Toast: React.FC<ToastProps> = ({ type, message }) => {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className={`fixed right-5 top-5 z-[100] w-[min(380px,calc(100%-2rem))] rounded-2xl border px-4 py-3 shadow-2xl shadow-slate-950/15 backdrop-blur-xl ${
          type === 'success' ? 'bg-emerald-500/95 border-emerald-400 text-white' : 'bg-rose-500/95 border-rose-400 text-white'
        }`}
      >
        <p className="text-sm font-semibold">{message}</p>
      </motion.div>
    </AnimatePresence>
  );
};
