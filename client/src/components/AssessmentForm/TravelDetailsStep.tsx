import React from 'react';
import { motion } from 'framer-motion';
import { Plane } from 'lucide-react';
import { FormData } from '@/hooks/useAssessmentForm';

interface TravelDetailsStepProps {
  formData: FormData;
  validationErrors: Record<string, string>;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  countries: string[];
  visaTypes: string[];
}

export const TravelDetailsStep: React.FC<TravelDetailsStepProps> = ({
  formData,
  validationErrors,
  onInputChange,
  countries,
  visaTypes,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-2">
            Destination Country <span className="text-red-500">*</span>
          </label>
          <select
            name="destinationCountry"
            value={formData.destinationCountry}
            onChange={onInputChange}
            className={`w-full border rounded-lg px-4 py-3 focus:ring-2 focus:ring-slate-500 focus:border-slate-500 bg-white text-slate-900 ${
              validationErrors.destinationCountry ? 'border-red-500' : 'border-slate-300'
            }`}
            required
          >
            <option value="">Select country</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {validationErrors.destinationCountry && (
            <p className="text-red-500 text-xs mt-1">{validationErrors.destinationCountry}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-2">
            Visa Type <span className="text-red-500">*</span>
          </label>
          <select
            name="visaType"
            value={formData.visaType}
            onChange={onInputChange}
            className={`w-full border rounded-lg px-4 py-3 focus:ring-2 focus:ring-slate-500 focus:border-slate-500 bg-white text-slate-900 ${
              validationErrors.visaType ? 'border-red-500' : 'border-slate-300'
            }`}
            required
          >
            <option value="">Select visa type</option>
            {visaTypes.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          {validationErrors.visaType && (
            <p className="text-red-500 text-xs mt-1">{validationErrors.visaType}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-2">
            Travel From Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            name="fromDate"
            value={formData.fromDate}
            onChange={onInputChange}
            className={`w-full border rounded-lg px-4 py-3 focus:ring-2 focus:ring-slate-500 focus:border-slate-500 bg-white text-slate-900 ${
              validationErrors.fromDate ? 'border-red-500' : 'border-slate-300'
            }`}
            required
          />
          {validationErrors.fromDate && (
            <p className="text-red-500 text-xs mt-1">{validationErrors.fromDate}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-2">
            Travel To Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            name="toDate"
            value={formData.toDate}
            onChange={onInputChange}
            className={`w-full border rounded-lg px-4 py-3 focus:ring-2 focus:ring-slate-500 focus:border-slate-500 bg-white text-slate-900 ${
              validationErrors.toDate ? 'border-red-500' : 'border-slate-300'
            }`}
            required
          />
          {validationErrors.toDate && (
            <p className="text-red-500 text-xs mt-1">{validationErrors.toDate}</p>
          )}
        </div>
        {formData.destinationCountry === 'Other' && (
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-slate-800 mb-2">
              Specify Country <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="otherCountry"
              placeholder="Enter country name"
              value={formData.otherCountry}
              onChange={onInputChange}
              className={`w-full border rounded-lg px-4 py-3 focus:ring-2 focus:ring-slate-500 focus:border-slate-500 bg-white text-slate-900 ${
                validationErrors.otherCountry ? 'border-red-500' : 'border-slate-300'
              }`}
              required
            />
            {validationErrors.otherCountry && (
              <p className="text-red-500 text-xs mt-1">{validationErrors.otherCountry}</p>
            )}
          </div>
        )}
        <div className="md:col-span-2">
          <label className="block text-sm font-semibold text-slate-800 mb-2">
            Purpose of Travel <span className="text-red-500">*</span>
          </label>
          <textarea
            name="purpose"
            placeholder="Describe the purpose of your travel..."
            value={formData.purpose}
            onChange={onInputChange}
            rows={4}
            className={`w-full border rounded-lg px-4 py-3 focus:ring-2 focus:ring-slate-500 focus:border-slate-500 bg-white text-slate-900 resize-none ${
              validationErrors.purpose ? 'border-red-500' : 'border-slate-300'
            }`}
            required
          />
          {validationErrors.purpose && (
            <p className="text-red-500 text-xs mt-1">{validationErrors.purpose}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
};

