"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Facebook,
    Twitter,
    Linkedin,
    Instagram,
    Mail,
    Phone,
    MapPin,
    Loader2,
} from "lucide-react";
import { adminSettingsService } from "@/services/adminSettingsService";

interface AdminSettings {
    websiteTitle: string;
    email: string;
    phone: string;
    address: string;
    siteLogo?: string;
    socialLinks?: {
        facebook?: string;
        twitter?: string;
        linkedin?: string;
        instagram?: string;
    };
}

const FooterDynamic = () => {
    const [settings, setSettings] = useState<AdminSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const currentYear = new Date().getFullYear();

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const publicSettings =
                    await adminSettingsService.getPublicSettings();
                setSettings(publicSettings);
            } catch (error) {
                console.error("Error loading settings:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchSettings();
    }, []);

    if (loading) {
        return (
            <footer className="flex items-center justify-center h-24 bg-gray-900 text-white">
                <Loader2 className="h-5 w-5 animate-spin" />
            </footer>
        );
    }

    if (!settings) {
        return null;
    }

    const socialIcons = [
        {
            name: "Facebook",
            icon: Facebook,
            url: settings.socialLinks?.facebook,
        },
        {
            name: "Twitter",
            icon: Twitter,
            url: settings.socialLinks?.twitter,
        },
        {
            name: "LinkedIn",
            icon: Linkedin,
            url: settings.socialLinks?.linkedin,
        },
        {
            name: "Instagram",
            icon: Instagram,
            url: settings.socialLinks?.instagram,
        },
    ];

    return (
        <footer className="bg-gray-900 text-gray-300">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
                    {/* Company Info */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            {settings.siteLogo && (
                                <img
                                    src={settings.siteLogo}
                                    alt={settings.websiteTitle}
                                    className="h-8 w-auto object-contain"
                                />
                            )}
                            <h3 className="text-xl font-bold text-white">
                                {settings.websiteTitle}
                            </h3>
                        </div>
                        <p className="text-sm text-gray-400">
                            Your trusted visa consulting partner
                        </p>
                    </div>

                    {/* Contact Info */}
                    <div className="space-y-4">
                        <h4 className="text-lg font-semibold text-white">
                            Contact
                        </h4>
                        {settings.email && (
                            <a
                                href={`mailto:${settings.email}`}
                                className="flex items-center gap-2 text-gray-300 hover:text-white transition"
                            >
                                <Mail className="h-5 w-5 text-blue-400" />
                                <span>{settings.email}</span>
                            </a>
                        )}
                        {settings.phone && (
                            <a
                                href={`tel:${settings.phone}`}
                                className="flex items-center gap-2 text-gray-300 hover:text-white transition"
                            >
                                <Phone className="h-5 w-5 text-green-400" />
                                <span>{settings.phone}</span>
                            </a>
                        )}
                        {settings.address && (
                            <div className="flex gap-2">
                                <MapPin className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                                <p className="text-gray-300">{settings.address}</p>
                            </div>
                        )}
                    </div>

                    {/* Quick Links */}
                    <div className="space-y-4">
                        <h4 className="text-lg font-semibold text-white">
                            Quick Links
                        </h4>
                        <ul className="space-y-2">
                            <li>
                                <Link
                                    href="/about"
                                    className="text-gray-300 hover:text-white transition"
                                >
                                    About Us
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="/services"
                                    className="text-gray-300 hover:text-white transition"
                                >
                                    Services
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="/contact"
                                    className="text-gray-300 hover:text-white transition"
                                >
                                    Contact
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="/privacy"
                                    className="text-gray-300 hover:text-white transition"
                                >
                                    Privacy Policy
                                </Link>
                            </li>
                        </ul>
                    </div>

                    {/* Social Links */}
                    <div className="space-y-4">
                        <h4 className="text-lg font-semibold text-white">
                            Follow Us
                        </h4>
                        <div className="flex gap-4">
                            {socialIcons.map(
                                (social) =>
                                    social.url && (
                                        <a
                                            key={social.name}
                                            href={social.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title={social.name}
                                            className="text-gray-400 hover:text-white transition"
                                        >
                                            <social.icon className="h-6 w-6" />
                                        </a>
                                    )
                            )}
                        </div>
                    </div>
                </div>

                {/* Divider */}
                <div className="border-t border-gray-700"></div>

                {/* Copyright */}
                <div className="mt-8 pt-8 text-center text-sm text-gray-400">
                    <p>
                        © {currentYear} {settings.websiteTitle}. All rights
                        reserved.
                    </p>
                </div>
            </div>
        </footer>
    );
};

export default FooterDynamic;
