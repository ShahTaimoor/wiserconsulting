import React from 'react';
import Link from 'next/link';
import { Shield, Lock, Info, ArrowLeft, Check } from 'lucide-react';

const PrivacyPolicy = () => {
  return (
    <div className="bg-gradient-to-b from-slate-900 via-slate-50 to-slate-50 min-h-screen">
      {/* Hero Section */}
      <div className="relative pt-20 pb-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500 rounded-full mix-blend-multiply filter blur-3xl"></div>
        </div>
        <div className="max-w-6xl mx-auto relative z-10">
          <Link href="/" className="inline-flex items-center gap-2 text-slate-300 hover:text-white mb-8 transition">
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
          <div className="flex items-center gap-4 mb-6">
            <div className="p-4 bg-blue-500/20 rounded-full">
              <Shield className="h-8 w-8 text-blue-400" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">Privacy Policy</h1>
          </div>
          <p className="text-slate-300 text-lg md:text-xl max-w-2xl">Your privacy is our priority. Learn how Wiser Consulting protects your personal information.</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
          {/* Meta Info */}
          <div className="border-b border-slate-100 px-8 md:px-12 py-6 bg-gradient-to-r from-blue-50 to-cyan-50">
            <p className="text-slate-600 text-sm"><span className="font-semibold">Last updated:</span> {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </div>

          {/* Quick Links */}
          <div className="px-8 md:px-12 py-8 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-700 mb-4">Quick Navigation</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {['Introduction', 'Data Collection', 'Data Usage', 'Security', 'Sharing', 'Your Rights'].map((item, i) => (
                <a key={i} href={`#section-${i}`} className="text-sm px-4 py-2 bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-700 rounded-lg transition">
                  {item}
                </a>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="px-8 md:px-12 py-12 max-w-none text-slate-600 space-y-8 leading-relaxed">
            
            <div id="section-0" className="scroll-mt-8">
              <div className="flex items-center gap-3 mb-4">
                <Info className="h-6 w-6 text-blue-500" />
                <h2 className="text-2xl font-semibold text-slate-800">1. Introduction</h2>
              </div>
              <p className="pl-9">Welcome to <strong>Wiser Consulting</strong>. We respect your privacy and are committed to protecting your personal data. This Privacy Policy will inform you as to how we look after your personal data when you visit our website and use our visa consulting services, and tell you about your privacy rights and how the law protects you.</p>
            </div>

            <div id="section-1" className="scroll-mt-8">
              <div className="flex items-center gap-3 mb-4">
                <Lock className="h-6 w-6 text-blue-500" />
                <h2 className="text-2xl font-semibold text-slate-800">2. The Data We Collect</h2>
              </div>
              <p className="pl-9 mb-6">As a visa consulting agency, we may collect, use, store and transfer different kinds of sensitive personal data about you which we have grouped together as follows:</p>
              <div className="grid md:grid-cols-2 gap-4 pl-9">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 hover:shadow-md transition">
                  <strong className="text-blue-900 block">Identity Data</strong>
                  <p className="text-sm text-blue-800 mt-2">Includes first name, last name, username or similar identifier, marital status, title, date of birth, copies of passports, visas, and other identification documents.</p>
                </div>
                <div className="bg-cyan-50 p-4 rounded-lg border border-cyan-100 hover:shadow-md transition">
                  <strong className="text-cyan-900 block">Contact Data</strong>
                  <p className="text-sm text-cyan-800 mt-2">Includes residential address, email address and telephone numbers.</p>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 hover:shadow-md transition">
                  <strong className="text-blue-900 block">Profile Data</strong>
                  <p className="text-sm text-blue-800 mt-2">Includes your educational background, employment history, travel history, criminal record disclosures, and other detailed information strictly required for visa applications.</p>
                </div>
                <div className="bg-cyan-50 p-4 rounded-lg border border-cyan-100 hover:shadow-md transition">
                  <strong className="text-cyan-900 block">Financial Data</strong>
                  <p className="text-sm text-cyan-800 mt-2">Includes bank account details, and evidence of financial support or sponsorships required by immigration authorities.</p>
                </div>
              </div>
            </div>

            <div id="section-2" className="scroll-mt-8">
              <h2 className="text-2xl font-semibold text-slate-800 mb-4">3. How We Use Your Data</h2>
              <p className="mb-6">We will only use your personal data when the law allows us to. Most commonly, we will use your personal data in the following circumstances:</p>
              <ul className="space-y-3 pl-6">
                <li className="flex gap-3">
                  <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span>To explicitly register you as a new client and evaluate your eligibility for various visa categories based on current immigration laws.</span>
                </li>
                <li className="flex gap-3">
                  <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span>To process and formally submit your visa, school, or immigration applications to the relevant government authorities or educational institutions.</span>
                </li>
                <li className="flex gap-3">
                  <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span>To manage our relationship with you, including notifying you about application updates, deadlines, or changes to our privacy policy.</span>
                </li>
              </ul>
            </div>

            <div id="section-3" className="scroll-mt-8">
              <h2 className="text-2xl font-semibold text-slate-800 mb-4">4. Data Security</h2>
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-green-500 p-6 rounded-r-lg">
                <p className="text-green-900">We have put in place robust security measures to prevent your personal data from being accidentally lost, used or accessed in an unauthorised way, altered or disclosed. Due to the highly sensitive nature of immigration documents, we heavily restrict access to your personal data to those employees, agents, contractors and other third parties who have a business need to know. They will only process your personal data on our explicit instructions and they are subject to a duty of strict confidentiality.</p>
              </div>
            </div>

            <div id="section-4" className="scroll-mt-8">
              <h2 className="text-2xl font-semibold text-slate-800 mb-4">5. Third-Party Sharing</h2>
              <p className="mb-6">In order to actively provide our visa consulting services, we must inevitably share your personal data with select third parties including:</p>
              <ul className="space-y-3 pl-6">
                <li className="flex gap-3">
                  <span className="text-blue-500 font-bold flex-shrink-0">•</span>
                  <span><strong>Government embassies, ministries, consulates, and immigration departments</strong> required to successfully process your application.</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-blue-500 font-bold flex-shrink-0">•</span>
                  <span><strong>Designated educational institutions</strong> if you are applying for a student visa.</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-blue-500 font-bold flex-shrink-0">•</span>
                  <span><strong>Translators or legal professionals</strong> strictly partnered with Wiser Consulting for the purpose of validating your application documents.</span>
                </li>
              </ul>
            </div>

            <div id="section-5" className="scroll-mt-8">
              <h2 className="text-2xl font-semibold text-slate-800 mb-4">6. Your Legal Rights</h2>
              <p className="mb-6">Under certain circumstances, you have rights under data protection laws in relation to your personal data, including the right to:</p>
              <div className="grid md:grid-cols-2 gap-4 mb-8">
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 hover:shadow-md transition">
                  <p className="font-semibold text-blue-900">Request Access</p>
                  <p className="text-sm text-blue-800 mt-2">Access to your personal data</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 hover:shadow-md transition">
                  <p className="font-semibold text-blue-900">Request Correction</p>
                  <p className="text-sm text-blue-800 mt-2">Correction of inaccurate data</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 hover:shadow-md transition">
                  <p className="font-semibold text-blue-900">Request Erasure</p>
                  <p className="text-sm text-blue-800 mt-2">Erasure or restriction of processing</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 hover:shadow-md transition">
                  <p className="font-semibold text-blue-900">Object to Processing</p>
                  <p className="text-sm text-blue-800 mt-2">Object to processing of your data</p>
                </div>
              </div>
              <div className="p-6 bg-slate-900 text-white rounded-lg">
                <p className="mb-2 font-semibold text-lg">Questions or Concerns?</p>
                <p>To exercise any of these rights or if you have questions regarding this policy, please contact us at <strong>wiserconsulting55@gmail.com</strong></p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
