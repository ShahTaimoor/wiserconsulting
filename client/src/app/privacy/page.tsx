import React from 'react';

const PrivacyPolicy = () => {
  return (
    <div className="bg-slate-50 min-h-screen pt-32 pb-24">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 bg-white p-8 md:p-12 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
        <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-8 tracking-tight">Privacy Policy</h1>
        <div className="max-w-none text-slate-600 space-y-6 leading-relaxed">
          <p className="text-slate-400 font-medium tracking-wide text-sm uppercase">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
          
          <h2 className="text-2xl font-semibold text-slate-800 mt-10 mb-4">1. Introduction</h2>
          <p>Welcome to <strong>Wiser Consulting</strong>. We respect your privacy and are committed to protecting your personal data. This Privacy Policy will inform you as to how we look after your personal data when you visit our website and use our visa consulting services, and tell you about your privacy rights and how the law protects you.</p>

          <h2 className="text-2xl font-semibold text-slate-800 mt-10 mb-4">2. The Data We Collect</h2>
          <p>As a visa consulting agency, we may collect, use, store and transfer different kinds of sensitive personal data about you which we have grouped together as follows:</p>
          <ul className="list-disc pl-6 space-y-3 mt-4 text-slate-700">
            <li><strong>Identity Data:</strong> includes first name, last name, username or similar identifier, marital status, title, date of birth, copies of passports, visas, and other identification documents.</li>
            <li><strong>Contact Data:</strong> includes residential address, email address and telephone numbers.</li>
            <li><strong>Profile Data:</strong> includes your educational background, employment history, travel history, criminal record disclosures, and other detailed information strictly required for visa applications.</li>
            <li><strong>Financial Data:</strong> includes bank account details, and evidence of financial support or sponsorships required by immigration authorities.</li>
          </ul>

          <h2 className="text-2xl font-semibold text-slate-800 mt-10 mb-4">3. How We Use Your Data</h2>
          <p>We will only use your personal data when the law allows us to. Most commonly, we will use your personal data in the following circumstances:</p>
          <ul className="list-disc pl-6 space-y-3 mt-4 text-slate-700">
            <li>To explicitly register you as a new client and evaluate your eligibility for various visa categories based on current immigration laws.</li>
            <li>To process and formally submit your visa, school, or immigration applications to the relevant government authorities or educational institutions.</li>
            <li>To manage our relationship with you, including notifying you about application updates, deadlines, or changes to our privacy policy.</li>
          </ul>

          <h2 className="text-2xl font-semibold text-slate-800 mt-10 mb-4">4. Data Security</h2>
          <p>We have put in place robust security measures to prevent your personal data from being accidentally lost, used or accessed in an unauthorised way, altered or disclosed. Due to the highly sensitive nature of immigration documents, we heavily restrict access to your personal data to those employees, agents, contractors and other third parties who have a business need to know. They will only process your personal data on our explicit instructions and they are subject to a duty of strict confidentiality.</p>

          <h2 className="text-2xl font-semibold text-slate-800 mt-10 mb-4">5. Third-Party Sharing</h2>
          <p>In order to actively provide our visa consulting services, we must inevitably share your personal data with select third parties including:</p>
          <ul className="list-disc pl-6 space-y-3 mt-4 text-slate-700">
            <li>Government embassies, ministries, consulates, and immigration departments required to successfully process your application.</li>
            <li>Designated educational institutions if you are applying for a student visa.</li>
            <li>Translators or legal professionals strictly partnered with Wiser Consulting for the purpose of validating your application documents.</li>
          </ul>

          <h2 className="text-2xl font-semibold text-slate-800 mt-10 mb-4">6. Your Legal Rights</h2>
          <p>Under certain circumstances, you have rights under data protection laws in relation to your personal data, including the right to request access, correction, erasure, restriction, transfer, or to object to processing. To exercise any of these rights or if you have questions regarding this policy, please contact us at <strong>wiserconsulting55@gmail.com</strong>.</p>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
