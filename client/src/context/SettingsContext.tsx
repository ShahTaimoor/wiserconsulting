"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { siteSettingsService, SiteSettings } from "@/services/siteSettingsService";

interface SettingsContextValue {
  settings: SiteSettings;
  loading: boolean;
  refreshSettings: () => Promise<void>;
}

const defaultSettings: SiteSettings = {
  websiteTitle: "Wiser Consulting",
  emailAddress: "",
  phoneNumber: "",
  address: "",
  logoUrl: "",
  socialLinks: {
    facebook: "",
    twitter: "",
    linkedin: "",
    instagram: "",
  },
  stat1Value: "10,000+",
  stat1Label: "Successful Applications",
  stat2Value: "98%",
  stat2Label: "Success Rate",
  stat3Value: "15+",
  stat3Label: "Years Experience",
  stat4Value: "24/7",
  stat4Label: "Support Available",
};

const SettingsContext = createContext<SettingsContextValue>({
  settings: defaultSettings,
  loading: true,
  refreshSettings: async () => {},
});

export const SettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  const refreshSettings = async () => {
    try {
      const data = await siteSettingsService.getSettings();
      setSettings(data);
    } catch (error) {
      console.error("Error fetching site settings:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSettings();
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loading, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
