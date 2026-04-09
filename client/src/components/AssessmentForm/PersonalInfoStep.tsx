import React from 'react';
import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import { FormData } from '@/hooks/useAssessmentForm';

interface PersonalInfoStepProps {
  formData: FormData;
  user: { name?: string; email?: string } | null;
  validationErrors: Record<string, string>;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
}

export const PersonalInfoStep: React.FC<PersonalInfoStepProps> = ({
  formData,
  user,
  validationErrors,
  onInputChange,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      {user && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-900 rounded-full flex items-center justify-center text-white font-semibold">
            {user.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Logged in as {user.name}</p>
            <p className="text-xs text-slate-600">{user.email}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-2">
            Full Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="name"
            placeholder="Enter your full name"
            value={formData.name}
            readOnly={!!user}
            onChange={onInputChange}
            className={`w-full border rounded-lg px-4 py-3 focus:ring-2 focus:ring-slate-500 focus:border-slate-500 bg-white text-slate-900 disabled:bg-slate-50 ${
              validationErrors.name ? 'border-red-500' : 'border-slate-300'
            }`}
            required
          />
          {validationErrors.name && (
            <p className="text-red-500 text-xs mt-1">{validationErrors.name}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-2">
            Email Address <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            name="email"
            placeholder="Enter your email"
            value={formData.email}
            readOnly={!!user}
            onChange={onInputChange}
            className={`w-full border rounded-lg px-4 py-3 focus:ring-2 focus:ring-slate-500 focus:border-slate-500 bg-white text-slate-900 disabled:bg-slate-50 ${
              validationErrors.email ? 'border-red-500' : 'border-slate-300'
            }`}
            required
          />
          {validationErrors.email && (
            <p className="text-red-500 text-xs mt-1">{validationErrors.email}</p>
          )}
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-semibold text-slate-800 mb-2">
            Phone Number <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            name="phone"
            placeholder="Enter your phone number"
            value={formData.phone}
            onChange={onInputChange}
            className={`w-full border rounded-lg px-4 py-3 focus:ring-2 focus:ring-slate-500 focus:border-slate-500 bg-white text-slate-900 ${
              validationErrors.phone ? 'border-red-500' : 'border-slate-300'
            }`}
            required
          />
          {validationErrors.phone && (
            <p className="text-red-500 text-xs mt-1">{validationErrors.phone}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
};

