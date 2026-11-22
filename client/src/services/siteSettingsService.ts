interface SocialLinks {
  facebook?: string;
  twitter?: string;
  linkedin?: string;
  instagram?: string;
}

/** One banner picture of a screen size (the older single picture of a size is shown with the id "legacy" by the admin screen). */
export interface HeroImage {
  _id: string;
  url: string;
}

export interface SiteSettings {
  websiteTitle: string;
  emailAddress: string;
  phoneNumber: string;
  address: string;
  logoUrl?: string;
  heroMobileUrl?: string | null;
  heroTabletUrl?: string | null;
  heroDesktopUrl?: string | null;
  heroMobileImages?: HeroImage[];
  heroTabletImages?: HeroImage[];
  heroDesktopImages?: HeroImage[];
  socialLinks?: SocialLinks;
  stat1Value?: string;
  stat1Label?: string;
  stat2Value?: string;
  stat2Label?: string;
  stat3Value?: string;
  stat3Label?: string;
  stat4Value?: string;
  stat4Label?: string;
  aboutStat1Value?: string;
  aboutStat1Label?: string;
  aboutStat2Value?: string;
  aboutStat2Label?: string;
}

export type HeroBannerDevice = "mobile" | "tablet" | "desktop";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

const assertResponse = async (response: Response) => {
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.message || "Failed to fetch site settings");
  }
  return json;
};

export const siteSettingsService = {
  async getSettings(): Promise<SiteSettings> {
    const response = await fetch(`${API_URL}/site-settings`, {
      cache: "no-store",
    });
    const json = await assertResponse(response);
    return json.data;
  },

  async updateSettings(settings: Partial<SiteSettings>, token: string): Promise<SiteSettings> {
    const response = await fetch(`${API_URL}/site-settings`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(settings),
    });
    const json = await assertResponse(response);
    return json.data;
  },

  async uploadHeroBanner(device: HeroBannerDevice, file: File, token: string): Promise<SiteSettings> {
    const formData = new FormData();
    formData.append("image", file);

    const response = await fetch(`${API_URL}/site-settings/hero-banner/${device}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const json = await assertResponse(response);
    return json.data;
  },

  async removeHeroImage(device: HeroBannerDevice, imageId: string, token: string): Promise<SiteSettings> {
    const response = await fetch(`${API_URL}/site-settings/hero-banner/${device}/${encodeURIComponent(imageId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await assertResponse(response);
    return json.data;
  },

  async removeHeroBanner(device: HeroBannerDevice, token: string): Promise<SiteSettings> {
    const response = await fetch(`${API_URL}/site-settings/hero-banner/${device}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await assertResponse(response);
    return json.data;
  },

  async uploadLogo(file: File, token: string): Promise<SiteSettings> {
    const formData = new FormData();
    formData.append("logo", file);

    const response = await fetch(`${API_URL}/site-settings/logo`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
    const json = await assertResponse(response);
    return json.data;
  },
};
