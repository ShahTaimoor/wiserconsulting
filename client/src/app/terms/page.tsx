import React from 'react';

const TermsOfService = () => {
  return (
    <div className="bg-slate-50 min-h-screen pt-32 pb-24">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 bg-white p-8 md:p-12 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
        <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-8 tracking-tight">Terms of Service</h1>
        <div className="max-w-none text-slate-600 space-y-6 leading-relaxed">
          <p className="text-slate-400 font-medium tracking-wide text-sm uppercase">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
          
          <h2 className="text-2xl font-semibold text-slate-800 mt-10 mb-4">1. Agreement to Terms</h2>
          <p>By accessing or utilizing the services provided by <strong>Wiser Consulting</strong>, you unconditionally agree to be bound by these Terms of Service. If you disagree with any part of these terms, you may not access our website or utilize our visa consultation services.</p>

          <h2 className="text-2xl font-semibold text-slate-800 mt-10 mb-4">2. Description of Services</h2>
          <p>Wiser Consulting provides advisory, preparation, and consultation services relating to visa applications, immigration pathways, and overseas education. We assist our clients in filling out forms, reviewing statutory requirements, compiling necessary documents, and offering strategic advice designed to maximize application success.</p>
          <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-lg my-6">
            <p className="text-amber-800 m-0"><strong>Disclaimer:</strong> Wiser Consulting is an independent, private consulting agency and is not affiliated with any government, embassy, or official immigration authority. We do not possess the authority to unilaterally grant visas, nor can we guarantee a 100% success rate on any application. The final granting decision routinely rests with the respective sovereign government authorities.</p>
          </div>

          <h2 className="text-2xl font-semibold text-slate-800 mt-10 mb-4">3. User Responsibilities</h2>
          <p>As an applying client, you agree that you will:</p>
          <ul className="list-disc pl-6 space-y-3 mt-4 text-slate-700">
            <li>Provide completely accurate, genuine, and current information, documents, and disclosures essential for your visa application process.</li>
            <li>Not submit fabricated, falsified, or fraudulent documents. If we reasonably suspect intentional misrepresentation, Wiser Consulting actively reserves the right to terminate our services immediately without issuing a refund.</li>
            <li>Adhere to the designated timelines and requests conveyed by our consultants to ensure your application can be optimally processed prior to external submission deadlines.</li>
          </ul>

          <h2 className="text-2xl font-semibold text-slate-800 mt-10 mb-4">4. Fees, Payments, and Refunds</h2>
          <p>Our professional consulting fees are distinctly separate from, and expressly do not include, applicable external government processing fees, courier transport charges, mandatory medical examination costs, biometrics fees, or independent third-party credential assessments unless expressly packaged.</p>
          <p>Given the deeply personalized and resource-intensive nature of counseling and evaluation, Wiser Consulting's service fees are generally considered non-refundable once the assessment and application compilation process has been formally initiated, regardless of the ultimate embassy decision or if the client withdraws the application voluntarily.</p>

          <h2 className="text-2xl font-semibold text-slate-800 mt-10 mb-4">5. Limitation of Liability</h2>
          <p>While we consistently leverage our professional expertise to ensure highly accurate, error-free documentation representation, Wiser Consulting and its employees shall not be held liable for any damages, personal losses, delays, or immediate rejections resulting from incomplete information provided by you, sudden sweeping changes in immigration laws/policies, or unpredicted processing delays naturally caused by government departments.</p>

          <h2 className="text-2xl font-semibold text-slate-800 mt-10 mb-4">6. Changes to Terms</h2>
          <p>We reserve the right, at our sole operational discretion, to modify or seamlessly replace these Terms at any given time. We will make a reasonable attempt to provide noticeable communication prior to any substantially new terms taking functional effect. Your continued uninterrupted use of our Service extensively constitutes your acceptance of the updated terms.</p>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
