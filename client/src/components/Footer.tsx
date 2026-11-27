import Link from "next/link";
import { FaFacebookF, FaTwitter, FaLinkedinIn, FaInstagram, FaPhone, FaEnvelope, FaMapMarkerAlt } from "react-icons/fa";
import { useSettings } from "@/context/SettingsContext";
import { useTouristVisaEntry } from "@/hooks/useTouristVisaEntry";
import { ENTRY_TEXT } from "@/utils/safeRedirect";

const Footer = () => {
  const { settings } = useSettings();
  const displayLogo = settings.logoUrl || "/logo.png";
  const currentYear = new Date().getFullYear();
  // The link to the online application: only while the form is open (the existing status hook), otherwise the column is as it always was.
  const touristVisaEntry = useTouristVisaEntry();

  const services = [
    { name: ENTRY_TEXT.footer, href: touristVisaEntry.href },
  ];

  const quickLinks = [
    { name: "Home", href: "/" },
    { name: "About Us", href: "/about" },
    { name: "Services", href: "/services" },
    { name: "Contact", href: "/contact" },
  ];

  const socials = [
    { key: "facebook", label: "Facebook", Icon: FaFacebookF },
    { key: "twitter", label: "Twitter", Icon: FaTwitter },
    { key: "instagram", label: "Instagram", Icon: FaInstagram },
    { key: "linkedin", label: "LinkedIn", Icon: FaLinkedinIn },
  ] as const;

  const phone = settings.phoneNumber || "+923709706643";
  const address = settings.address || "UG 400 Deans Trade Center Cantt,\nPeshawar, Pakistan";
  const email = settings.emailAddress || "wiserconsulting.info@gmail.com";
  const chip = "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-slate-700/70 bg-slate-800/70 text-emerald-400 transition-colors group-hover:border-emerald-500/50 group-hover:bg-emerald-500/10";
  const heading = "mb-5 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-white";
  const headingBar = <span className="h-4 w-1 rounded-full bg-gradient-to-b from-emerald-400 to-sky-400" />;

  return (
    <footer className="relative overflow-hidden bg-slate-950 text-slate-300">
      {/* Accent line and soft glow */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />

      {/* Main Footer Content */}
      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-12 lg:gap-8">
          {/* Brand Section */}
          <div className="space-y-5 lg:col-span-4">
            <Link href="/" className="flex items-center gap-3">
              <img
                src={displayLogo}
                alt={settings.websiteTitle}
                className="h-12 w-12 rounded-xl bg-white object-contain p-0.5"
              />
              <div className="flex flex-col">
                <span className="text-xl font-bold leading-tight tracking-wide text-white">
                  {settings.websiteTitle || "WISER CONSULTING"}
                </span>
                <span className="text-[11px] font-medium uppercase tracking-[0.25em] text-emerald-400/90">
                  Consultant
                </span>
              </div>
            </Link>
            <p className="max-w-sm text-sm leading-relaxed text-slate-400">
              Expert visa consultation services for students, professionals, and families worldwide.
              Your trusted partner for a brighter future.
            </p>
            {/* Social Links */}
            <div className="flex gap-2.5">
              {socials.map(({ key, label, Icon }) => {
                const href = settings.socialLinks?.[key];
                if (!href) return null;
                return (
                  <a
                    key={key}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-800/60 text-slate-300 transition-all hover:-translate-y-0.5 hover:border-emerald-400 hover:bg-emerald-500 hover:text-white"
                    aria-label={label}
                  >
                    <Icon className="text-sm" />
                  </a>
                );
              })}
            </div>
          </div>

          {/* Quick Links */}
          <div className="lg:col-span-2 lg:col-start-6">
            <h4 className={heading}>{headingBar}Quick Links</h4>
            <ul className="space-y-3">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  <Link href={link.href} className="group inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white">
                    <span className="h-px w-3 bg-slate-600 transition-all group-hover:w-5 group-hover:bg-emerald-400" />
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Services */}
          <div className="lg:col-span-2">
            <h4 className={heading}>{headingBar}Our Services</h4>
            <ul className="space-y-3">
              {services.map((service) => (
                <li key={service.name}>
                  <Link href={service.href} className="group inline-flex items-start gap-2 text-sm text-slate-400 transition-colors hover:text-white">
                    <span className="mt-2 h-px w-3 flex-shrink-0 bg-slate-600 transition-all group-hover:w-5 group-hover:bg-emerald-400" />
                    {service.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact Info */}
          <div className="sm:col-span-2 lg:col-span-3">
            <h4 className={heading}>{headingBar}Contact Us</h4>
            <ul className="space-y-4">
              {address && (
                <li className="group flex items-start gap-3">
                  <div className={chip}>
                    <FaMapMarkerAlt className="text-sm" />
                  </div>
                  <div>
                    <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Address</p>
                    <p className="whitespace-pre-line text-sm leading-relaxed text-slate-300">{address}</p>
                  </div>
                </li>
              )}
              {email && (
                <li className="group flex items-start gap-3">
                  <div className={chip}>
                    <FaEnvelope className="text-sm" />
                  </div>
                  <div className="min-w-0">
                    <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Email</p>
                    <a
                      href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-sm text-slate-300 transition-colors hover:text-emerald-400"
                    >
                      {email}
                    </a>
                  </div>
                </li>
              )}
              <li className="group flex items-start gap-3">
                <div className={chip}>
                  <FaPhone className="text-sm" />
                </div>
                <div>
                  <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Phone</p>
                  <a href={`tel:${phone}`} className="text-sm text-slate-300 transition-colors hover:text-emerald-400">
                    {phone}
                  </a>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="relative border-t border-slate-800/80">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-3 md:flex-row">
            <p className="text-center text-sm text-slate-500 md:text-left">
              © {currentYear} <span className="font-semibold text-slate-200">WISER CONSULTING</span>. All rights reserved.
            </p>
            <div className="flex items-center gap-6 text-sm">
              <Link href="/privacy" className="text-slate-500 transition-colors hover:text-white">
                Privacy Policy
              </Link>
              <Link href="/terms" className="text-slate-500 transition-colors hover:text-white">
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
