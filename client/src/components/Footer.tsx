import Link from "next/link";
import { FaFacebookF, FaTwitter, FaLinkedinIn, FaInstagram, FaPhone, FaEnvelope, FaMapMarkerAlt } from "react-icons/fa";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  const services = [
    { name: "Student Visass", href: "/services/student-visa" },
    { name: "Tourist Visa", href: "/services/tourist-visa" },
    { name: "Transit Visa", href: "/services/transit-visa" },
    { name: "Work Visa", href: "/services/work-visa" },
  ];

  const quickLinks = [
    { name: "About Us", href: "/about" },
    { name: "Services", href: "/services" },
    { name: "Contact", href: "/contact" },
    { name: "Privacy Policy", href: "/privacy" },
    { name: "Terms of Service", href: "/terms" },
  ];

  return (
    <footer className="bg-slate-900 text-slate-300">
      {/* Main Footer Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand Section */}
          <div className="space-y-6">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center">
                <span className="text-slate-900 font-bold text-xl">WC</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-bold text-white leading-tight">
                  WISER CONSULTING
                </span>
                <span className="text-xs text-slate-400 leading-tight">
                  CONSULTANT
                </span>
              </div>
            </div>
            <p className="text-slate-400 leading-relaxed text-sm">
              Expert visa consultation services for students, professionals, and families worldwide.
              Your trusted partner for a brighter future.
            </p>
            {/* Social Links */}
            <div className="flex space-x-3">
              <a
                href="#"
                className="w-10 h-10 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center justify-center transition-colors border border-slate-700"
                aria-label="Facebook"
              >
                <FaFacebookF className="text-white text-sm" />
              </a>
              <a
                href="#"
                className="w-10 h-10 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center justify-center transition-colors border border-slate-700"
                aria-label="Twitter"
              >
                <FaTwitter className="text-white text-sm" />
              </a>
              <a
                href="#"
                className="w-10 h-10 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center justify-center transition-colors border border-slate-700"
                aria-label="Instagram"
              >
                <FaInstagram className="text-white text-sm" />
              </a>
              <a
                href="#"
                className="w-10 h-10 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center justify-center transition-colors border border-slate-700"
                aria-label="LinkedIn"
              >
                <FaLinkedinIn className="text-white text-sm" />
              </a>
            </div>
          </div>

          {/* Services */}
          <div>
            <h4 className="text-lg font-semibold text-white mb-6">Our Services</h4>
            <ul className="space-y-3">
              {services.map((service) => (
                <li key={service.name}>
                  <Link
                    href={service.href}
                    className="text-slate-400 hover:text-white transition-colors text-sm flex items-center group"
                  >
                    <span className="w-1.5 h-1.5 bg-slate-600 rounded-full mr-3 group-hover:bg-white transition-colors" />
                    {service.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-lg font-semibold text-white mb-6">Quick Links</h4>
            <ul className="space-y-3">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-slate-400 hover:text-white transition-colors text-sm flex items-center group"
                  >
                    <span className="w-1.5 h-1.5 bg-slate-600 rounded-full mr-3 group-hover:bg-white transition-colors" />
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h4 className="text-lg font-semibold text-white mb-6">Contact Us</h4>
            <ul className="space-y-4">
              <li className="flex items-start space-x-3">
                <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center flex-shrink-0 border border-slate-700">
                  <FaMapMarkerAlt className="text-white text-sm" />
                </div>
                <div>
                  <p className="text-white text-sm font-medium mb-1">Address</p>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Deans Trade Center, LG 07<br />
                    Peshawar, Pakistan
                  </p>
                </div>
              </li>
              <li className="flex items-start space-x-3">
                <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center flex-shrink-0 border border-slate-700">
                  <FaEnvelope className="text-white text-sm" />
                </div>
                <div>
                  <p className="text-white text-sm font-medium mb-1">Email</p>
                  <a
                    href="mailto:wiserconsulting55@gmail.com"
                    className="text-slate-400 hover:text-white transition-colors text-sm"
                  >
                    wiserconsulting55@gmail.com
                  </a>
                </div>
              </li>
              <li className="flex items-start space-x-3">
                <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center flex-shrink-0 border border-slate-700">
                  <FaPhone className="text-white text-sm" />
                </div>
                <div>
                  <p className="text-white text-sm font-medium mb-1">Phone</p>
                  <a
                    href="tel:+1234567890"
                    className="text-slate-400 hover:text-white transition-colors text-sm"
                  >
                    +1 (123) 456-7890
                  </a>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <p className="text-slate-400 text-sm text-center md:text-left">
              © {currentYear} <span className="text-white font-semibold">WISER CONSULTING</span>.
              All rights reserved.
            </p>
            <div className="flex items-center space-x-6 text-sm">
              <Link href="/privacy" className="text-slate-400 hover:text-white transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="text-slate-400 hover:text-white transition-colors">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
