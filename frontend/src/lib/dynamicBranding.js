/**
 * Dynamically updates the browser favicon, iPhone apple-touch-icon,
 * and PWA web app manifest based on the custom uploaded logo and mess name.
 */
export function applyDynamicBranding(business) {
  if (typeof document === "undefined" || !business) return;

  const logoUrl = business.logo_url || "/workforce-logo.png";
  const messName = business.name || "Ayushman Kitchen";

  // 1. Update Document Title & Meta Tags
  document.title = `${messName} - Cloud Kitchen Management`;

  let appNameMeta = document.querySelector("meta[name='application-name']");
  if (!appNameMeta) {
    appNameMeta = document.createElement("meta");
    appNameMeta.name = "application-name";
    document.head.appendChild(appNameMeta);
  }
  appNameMeta.content = messName;

  let appleTitleMeta = document.querySelector("meta[name='apple-mobile-web-app-title']");
  if (!appleTitleMeta) {
    appleTitleMeta = document.createElement("meta");
    appleTitleMeta.name = "apple-mobile-web-app-title";
    document.head.appendChild(appleTitleMeta);
  }
  appleTitleMeta.content = messName;

  // 2. Update Browser Favicon (<link rel="icon"> & <link rel="shortcut icon">)
  const iconLinks = document.querySelectorAll("link[rel*='icon']");
  if (iconLinks.length > 0) {
    iconLinks.forEach((link) => {
      link.setAttribute("href", logoUrl);
    });
  } else {
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = logoUrl;
    document.head.appendChild(link);
  }

  // 3. Update iPhone / iPad Apple Touch Icon (<link rel="apple-touch-icon">)
  const appleTouchLinks = document.querySelectorAll("link[rel*='apple-touch-icon']");
  if (appleTouchLinks.length > 0) {
    appleTouchLinks.forEach((link) => {
      link.setAttribute("href", logoUrl);
    });
  } else {
    const appleLink = document.createElement("link");
    appleLink.rel = "apple-touch-icon";
    appleLink.sizes = "180x180";
    appleLink.href = logoUrl;
    document.head.appendChild(appleLink);
  }

  // 4. Update Dynamic PWA Manifest for Chrome / Android / Desktop Web App Install
  try {
    const dynamicManifest = {
      short_name: messName,
      name: `${messName} - Cloud Kitchen Management`,
      start_url: "/",
      display: "standalone",
      background_color: "#102f2c",
      theme_color: "#102f2c",
      icons: [
        {
          src: logoUrl,
          sizes: "192x192 512x512",
          type: "image/png",
          purpose: "any maskable",
        },
        {
          src: "/workforce-icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any maskable",
        },
        {
          src: "/workforce-icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any maskable",
        },
      ],
    };

    const manifestBlob = new Blob([JSON.stringify(dynamicManifest)], {
      type: "application/manifest+json",
    });
    const manifestBlobUrl = URL.createObjectURL(manifestBlob);

    let manifestTag = document.querySelector("link[rel='manifest']");
    if (!manifestTag) {
      manifestTag = document.createElement("link");
      manifestTag.rel = "manifest";
      document.head.appendChild(manifestTag);
    }
    manifestTag.setAttribute("href", manifestBlobUrl);
  } catch (err) {
    console.warn("Failed to set dynamic PWA manifest:", err);
  }
}
