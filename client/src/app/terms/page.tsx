import React from 'react';
import { FileText, CheckCircle, AlertCircle, DollarSign } from 'lucide-react';

const TermsOfService = () => {
  return (
    <div className="bg-gradient-to-b from-slate-900 via-slate-50 to-slate-50 min-h-screen">
      {/* Hero Section */}
      <div className="relative pt-20 pb-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl"></div>
        </div>
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-4 bg-purple-500/20 rounded-full">
              <FileText className="h-8 w-8 text-purple-400" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">Terms of Service</h1>
          </div>
          <p className="text-slate-300 text-lg md:text-xl max-w-2xl">Please read our terms and conditions carefully before using Wiser Consulting services.</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
          {/* Meta Info */}
          <div className="border-b border-slate-100 px-8 md:px-12 py-6 bg-gradient-to-r from-purple-50 to-pink-50">
            <p className="text-slate-600 text-sm"><span className="font-semibold">Last updated:</span> {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </div>

          {/* Quick Links */}
          <div className="px-8 md:px-12 py-8 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-700 mb-4">Quick Navigation</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {['Agreement', 'Services', 'User Responsibilities', 'Fees & Refunds', 'Liability', 'Changes'].map((item, i) => (
                <a key={i} href={`#section-${i}`} className="text-sm px-4 py-2 bg-slate-100 hover:bg-purple-100 text-slate-700 hover:text-purple-700 rounded-lg transition">
                  {item}
                </a>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="px-8 md:px-12 py-12 max-w-none text-slate-600 space-y-8 leading-relaxed">
            
            <div id="section-0" className="scroll-mt-8">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle className="h-6 w-6 text-purple-500" />
                <h2 className="text-2xl font-semibold text-slate-800">1. Agreement to Terms</h2>
              </div>
              <p className="pl-9">By accessing or utilizing the services provided by <strong>Wiser Consulting</strong>, you unconditionally agree to be bound by these Terms of Service. If you disagree with any part of these terms, you may not access our website or utilize our visa consultation services.</p>
            </div>

            <div id="section-1" className="scroll-mt-8">
              <h2 className="text-2xl font-semibold text-slate-800 mb-4">2. Description of Services</h2>
              <p className="mb-6">Wiser Consulting provides advisory, preparation, and consultation services relating to visa applications, immigration pathways, and overseas education. We assist our clients in filling out forms, reviewing statutory requirements, compiling necessary documents, and offering strategic advice designed to maximize application success.</p>
              <div className="bg-amber-50 border-l-4 border-amber-400 p-6 rounded-r-lg">
                <div className="flex gap-3">
                  <AlertCircle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-900 mb-2">Important Disclaimer</p>
                    <p className="text-amber-800">Wiser Consulting is an independent, private consulting agency and is not affiliated with any government, embassy, or official immigration authority. We do not possess the authority to unilaterally grant visas, nor can we guarantee a 100% success rate on any application. The final granting decision routinely rests with the respective sovereign government authorities.</p>
                  </div>
                </div>
              </div>
            </div>

            <div id="section-2" className="scroll-mt-8">
              <h2 className="text-2xl font-semibold text-slate-800 mb-4">3. User Responsibilities</h2>
              <p className="mb-6">As an applying client, you agree that you will:</p>
              <div className="space-y-3">
                <div className="flex gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span><strong>Provide Complete Information:</strong> Provide completely accurate, genuine, and current information, documents, and disclosures essential for your visa application process.</span>
                </div>
                <div className="flex gap-3 p-4 bg-red-50 rounded-lg border border-red-200">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <span><strong>No Fraudulent Documents:</strong> Not submit fabricated, falsified, or fraudulent documents. If we reasonably suspect intentional misrepresentation, Wiser Consulting actively reserves the right to terminate our services immediately without issuing a refund.</span>
                </div>
                <div className="flex gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span><strong>Adhere to Timelines:</strong> Adhere to the designated timelines and requests conveyed by our consultants to ensure your application can be optimally processed prior to external submission deadlines.</span>
                </div>
              </div>
            </div>

            <div id="section-3" className="scroll-mt-8">
              <div className="flex items-center gap-3 mb-4">
                <DollarSign className="h-6 w-6 text-blue-500" />
                <h2 className="text-2xl font-semibold text-slate-800">4. Fees, Payments, and Refunds</h2>
              </div>
              <div className="space-y-4 pl-9">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                  <p className="text-blue-900"><strong>Separate Charges:</strong> Our professional consulting fees are distinctly separate from, and expressly do not include, applicable external government processing fees, courier transport charges, mandatory medical examination costs, biometrics fees, or independent third-party credential assessments unless expressly packaged.</p>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                  <p className="text-blue-900"><strong>Non-Refundable Services:</strong> Given the deeply personalized and resource-intensive nature of counseling and evaluation, Wiser Consulting's service fees are generally considered non-refundable once the assessment and application compilation process has been formally initiated, regardless of the ultimate embassy decision or if the client withdraws the application voluntarily.</p>
                </div>
              </div>
            </div>

            <div id="section-4" className="scroll-mt-8">
              <h2 className="text-2xl font-semibold text-slate-800 mb-4">5. Limitation of Liability</h2>
              <div className="bg-gradient-to-r from-orange-50 to-amber-50 border-l-4 border-orange-500 p-6 rounded-r-lg">
                <p className="text-orange-900">While we consistently leverage our professional expertise to ensure highly accurate, error-free documentation representation, Wiser Consulting and its employees shall not be held liable for any damages, personal losses, delays, or immediate rejections resulting from incomplete information provided by you, sudden sweeping changes in immigration laws/policies, or unpredicted processing delays naturally caused by government departments.</p>
              </div>
            </div>

            <div id="section-5" className="scroll-mt-8 pb-12">
              <h2 className="text-2xl font-semibold text-slate-800 mb-4">6. Changes to Terms</h2>
              <p className="mb-6">We reserve the right, at our sole operational discretion, to modify or seamlessly replace these Terms at any given time. We will make a reasonable attempt to provide noticeable communication prior to any substantially new terms taking functional effect. Your continued uninterrupted use of our Service extensively constitutes your acceptance of the updated terms.</p>
              <div className="p-6 bg-slate-900 text-white rounded-lg">
                <p className="mb-2 font-semibold text-lg">Need Clarification?</p>
                <p>If you have any questions about these Terms of Service, please reach out to us at <strong>wiserconsulting55@gmail.com</strong></p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
