import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle } from 'lucide-react';

interface NotificationProps {
  type: 'success' | 'error';
  message: string;
}

export const Notification: React.FC<NotificationProps> = ({ type, message }) => {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className={`mx-8 mt-6 p-4 rounded-lg flex items-center gap-3 ${
          type === 'success'
            ? 'bg-green-50 border border-green-200'
            : 'bg-red-50 border border-red-200'
        }`}
      >
        {type === 'success' ? (
          <CheckCircle2 className="w-5 h-5 text-green-600" />
        ) : (
          <AlertCircle className="w-5 h-5 text-red-600" />
        )}
        <p className={`text-sm font-medium ${
          type === 'success' ? 'text-green-800' : 'text-red-800'
        }`}>
          {message}
        </p>
      </motion.div>
    </AnimatePresence>
  );
};

