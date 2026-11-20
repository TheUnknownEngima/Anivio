import React, { useEffect, useState } from "react";
import { Cloud, Download, Monitor, Smartphone, Users } from "lucide-react";

const repo = "https://github.com/mdtahseen7/Anivio";
type Release = {
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; browser_download_url: string }[];
};

function useWindowsInstaller() {
  const [installer, setInstaller] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    fetch("https://api.github.com/repos/mdtahseen7/Anivio/releases?per_page=30",
      { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<Release[]> : [])
      .then((releases) => {
        const asset = releases
          .filter((release) => !release.draft && !release.prerelease)
          .flatMap((release) => release.assets)
          .find(({ name, browser_download_url }) =>
            name === "Anivio-Windows-x64.exe" &&
            browser_download_url.startsWith(`${repo}/releases/download/`));
        if (!controller.signal.aborted) setInstaller(asset?.browser_download_url);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return installer;
}

export function DesktopFeaturePreviews() {
  return (
    <>
      <article className="feature-card feature-large">
        <div className="showcase-watch">
          <div className="showcase-watch-heading">
            <span>Continue Watching</span>
            <Cloud size={17} aria-label="Synced progress" />
          </div>
          <div className="showcase-watch-cards">
            <img src="/showcase/grand-blue.webp" width="418" height="236" loading="lazy"
              alt="Grand Blue Dreaming Season 3, episode 11. Four minutes left." />
            <img src="/showcase/black-clover.webp" width="408" height="231" loading="lazy"
              alt="Black Clover Season 2, episode 8. Airs tomorrow." />
          </div>
        </div>
        <div className="feature-text">
          <h3>Pick up where you left off</h3>
          <p>See what’s next and how much time is left. Your progress follows your profile between Android and Windows.</p>
        </div>
      </article>
      <article className="feature-card">
        <div className="showcase-switch">
          <img src="/showcase/switch-profile.webp" width="1500" height="688" loading="lazy"
            alt="Anivio’s Switch Profile screen with an anime background and profile picker." />
        </div>
        <div className="feature-text">
          <h3>Switch profiles</h3>
          <p>Give up to six people their own progress, library, avatar, and banner.</p>
        </div>
      </article>
    </>
  );
}

export function DesktopDownload() {
  const windowsInstaller = useWindowsInstaller();
  return (
    <section id="download" className="shell section download-platforms" aria-labelledby="download-title">
      <div className="section-heading">
        <div><h2 id="download-title">Download Anivio</h2></div>
        <p>Available for Android and Windows. Use the same account and profile to sync your progress.</p>
      </div>
      <div className="windows-showcase">
        <img src="/showcase/windows-home.webp" width="1600" height="856" loading="lazy"
          alt="Anivio on Windows, showing the One Piece hero and Continue Watching." />
      </div>
      <div className="download-platform-actions">
        <a className="download-platform" href={windowsInstaller || `${repo}/releases`}>
          <span className="download-platform-icon"><Monitor size={22} /></span>
          <span><strong>{windowsInstaller ? "Download for Windows" : "Windows releases"}</strong>
            <small>{windowsInstaller ? "x64 installer · .exe" : "Check GitHub for the x64 installer"}</small></span>
          <Download size={18} aria-hidden="true" />
        </a>
        <a className="download-platform" href={`${repo}/releases/latest`}>
          <span className="download-platform-icon"><Smartphone size={22} /></span>
          <span><strong>Download for Android</strong><small>GitHub release · .apk</small></span>
          <Download size={18} aria-hidden="true" />
        </a>
      </div>
      <div className="download-details">
        <a href="/news">Release notes</a>
        <a href={repo}>Build for iOS from source</a>
      </div>
    </section>
  );
}

export function PersonalSpacePreview() {
  return (
    <div className="space-showcase">
      <div className="space-showcase-cover">
        <img src="/showcase/switch-profile.webp" width="1500" height="688" loading="lazy" alt="" />
        <span><Users size={16} aria-hidden="true" /> Profile customization</span>
      </div>
      <img className="space-showcase-banners" src="/showcase/profile-banners.webp"
        width="1500" height="244" loading="lazy" alt="Choose a profile background from Anivio’s banner gallery." />
    </div>
  );
}
