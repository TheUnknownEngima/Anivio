import React, { useState } from "react";
import {
  ArrowUpRight,
  AudioLines,
  BookOpen,
  Check,
  ChevronRight,
  Cloud,
  Download,
  ExternalLink,
  Headphones,
  Link2,
  MessageCircle,
  MonitorPlay,
  Palette,
  Play,
  Settings2,
  ShieldCheck,
  SkipForward,
  Sparkles,
  Subtitles,
  Users,
} from "lucide-react";

const tours = {
  Playback: {
    icon: MonitorPlay,
    title: "Press play. Make yourself comfortable.",
    description:
      "Tune the player around the way you watch. Spend less time in menus and more time in the story.",
    details: [
      "ExoPlayer by default, with mpv available",
      "Subtitle fonts, colours, size, and timing",
      "Intro skipping and the next episode ready",
      "Optional Anime4K enhancement on your device",
    ],
    label: "A player that feels like yours",
  },
  Reader: {
    icon: BookOpen,
    title: "There’s always another chapter.",
    description:
      "Your manga belongs here too. Pick a reading direction, settle into the page, and keep your place between sessions.",
    details: [
      "Continuous scroll or horizontal pages",
      "Left-to-right and right-to-left reading",
      "Page scaling and data saver options",
      "Saved chapter progress for every profile",
    ],
    label: "From the first page to the last",
  },
  "Watch Party": {
    icon: Users,
    title: "A little distance. The same episode.",
    description:
      "Bring your people along. Start a room in the app, share the party code, and watch together without losing the conversation.",
    details: [
      "Join friends with a party code",
      "Playback and chat side by side",
      "Fresh conversation for each session",
      "Your profile, your name, your picture",
    ],
    label: "Better with your people",
  },
};
export default function HomeDetails() {
  const [tour, setTour] = useState<keyof typeof tours>("Playback");
  const [serif, setSerif] = useState(false);
  const current = tours[tour];
  return (
    <>
      <section className="shell section home-tour" aria-labelledby="tour-title">
        <div className="section-heading">
          <div>
            <div className="eyebrow">A closer look</div>
            <h2 id="tour-title">
              Built around
              <br />
              <span>your downtime.</span>
            </h2>
          </div>
          <p>
            The details make the difference. Explore the player, open a chapter,
            or make an evening of it with friends.
          </p>
        </div>
        <div
          className="tour-tabs"
          role="tablist"
          aria-label="Explore app features"
        >
          {Object.entries(tours).map(([key, value]) => (
            <button
              key={key}
              role="tab"
              id={`tour-${key.replaceAll(" ", "-")}`}
              aria-selected={tour === key}
              aria-controls="feature-tour-panel"
              onClick={() => setTour(key as keyof typeof tours)}
            >
              <value.icon size={18} />
              {key}
            </button>
          ))}
        </div>
        <div
          className="tour-panel"
          id="feature-tour-panel"
          role="tabpanel"
          aria-labelledby={`tour-${tour.replaceAll(" ", "-")}`}
        >
          <div
            className={`tour-stage stage-${tour === "Watch Party" ? "party" : tour.toLowerCase()}`}
          >
            {tour === "Playback" ? (
              <>
                <div className="stage-scenery">
                  <span className="scenery-sun" />
                  <span className="scenery-ridge back" />
                  <span className="scenery-ridge front" />
                </div>
                <div className="demo-player-top">
                  <span>
                    <Play size={13} fill="currentColor" /> Anivio player
                  </span>
                  <span>1080p · Anime4K</span>
                </div>
                <p className={`demo-subtitle ${serif ? "serif" : ""}`}>
                  Every story starts
                  <br />
                  with a little curiosity.
                </p>
                <div className="demo-controls">
                  <Play size={17} fill="currentColor" />
                  <div className="demo-timeline">
                    <i />
                  </div>
                  <span>08:42 / 24:00</span>
                  <Subtitles size={17} />
                </div>
                <button
                  className="subtitle-demo"
                  onClick={() => setSerif(!serif)}
                >
                  <Subtitles size={15} /> Try {serif ? "sans" : "serif"}{" "}
                  subtitles <ChevronRight size={14} />
                </button>
              </>
            ) : tour === "Reader" ? (
              <>
                <div className="reader-paper">
                  <div className="manga-panel tall">
                    <span />
                    <BookOpen size={60} />
                  </div>
                  <div className="manga-panel">
                    <span />
                  </div>
                  <div className="manga-panel dark-panel">
                    <Sparkles size={32} />
                  </div>
                </div>
                <div className="reader-position">
                  <BookOpen size={16} /> Chapter 12 <span>Page 8 of 24</span>
                </div>
                <span className="reader-direction">
                  Your pace. Your direction. <ChevronRight size={15} />
                </span>
              </>
            ) : (
              <>
                <div className="party-mini">
                  <span>
                    <Users size={16} /> Watch Party
                  </span>
                  <div className="party-bubbles">
                    <div>
                      <i>You</i>
                      <p>Everyone ready?</p>
                    </div>
                    <div>
                      <i>Friend</i>
                      <p>One more episode ✨</p>
                    </div>
                    <span>
                      <Check size={12} /> In sync
                    </span>
                  </div>
                  <div className="party-input">
                    Send a message <MessageCircle size={14} />
                  </div>
                </div>
                <div className="party-screen">
                  <div className="stage-scenery">
                    <span className="scenery-sun" />
                    <span className="scenery-ridge front" />
                  </div>
                  <Play size={35} fill="currentColor" />
                  <div className="demo-timeline">
                    <i />
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="tour-copy">
            <div className="eyebrow">{current.label}</div>
            <h3>{current.title}</h3>
            <p>{current.description}</p>
            <ul>
              {current.details.map((detail) => (
                <li key={detail}>
                  <Check size={17} />
                  {detail}
                </li>
              ))}
            </ul>
            <a href="/docs" className="text-link">
              Find your way around <ArrowUpRight size={16} />
            </a>
          </div>
        </div>
      </section>
      <section
        className="shell section home-personal"
        aria-labelledby="personal-title"
      >
        <div className="personal-copy">
          <div className="eyebrow">Never one size fits all</div>
          <h2 id="personal-title">
            Your little corner
            <br />
            <span>of the internet.</span>
          </h2>
          <p>
            A favourite character on your profile. A banner from an anime you
            love. A colour that feels right. Make Anivio feel familiar before
            you even press play.
          </p>
          <div className="personal-points">
            <span>
              <Palette size={19} /> Themes & custom colours
            </span>
            <span>
              <Users size={19} /> Six separate profiles
            </span>
            <span>
              <Sparkles size={19} /> Anime banners & avatars
            </span>
          </div>
          <a href="/covers" className="button">
            Find your next banner <ArrowUpRight size={17} />
          </a>
        </div>
        <div
          className="personal-preview"
          aria-label="Profile customisation illustration"
        >
          <div className="personal-landscape">
            <div className="moon-shape" />
            <div className="landscape-wave" />
          </div>
          <div className="personal-avatar">
            <BookOpen size={29} />
          </div>
          <div className="personal-preview-copy">
            <b>Your name. Your world.</b>
            <span>A space for every side of you.</span>
          </div>
          <div
            className="theme-swatches"
            aria-label="Available colour examples"
          >
            {["#b7cca2", "#bcadda", "#a1bccd", "#d7b6a6", "#b75783"].map(
              (color) => (
                <i key={color} style={{ background: color }} />
              ),
            )}
          </div>
          <a className="personal-link" href="/account?tab=profiles">
            Make it personal <ArrowUpRight size={16} />
          </a>
        </div>
      </section>
      <section
        className="shell section home-connections"
        aria-labelledby="connections-title"
      >
        <div className="section-heading">
          <div>
            <div className="eyebrow">Keep the things you love</div>
            <h2 id="connections-title">
              Better together.
              <br />
              <span>Connected by you.</span>
            </h2>
          </div>
          <p>
            Your sources, tracking services, and favourite artwork. Connect what
            you use and keep your setup in one place.
          </p>
        </div>
        <div className="connection-grid">
          {[
            [
              "AniList",
              "Anime lists & progress",
              "https://anilist.co",
              BookOpen,
            ],
            [
              "TMDB",
              "Artwork, metadata & cast",
              "https://www.themoviedb.org",
              MonitorPlay,
            ],
            [
              "Trakt",
              "Watch tracking & collections",
              "https://trakt.tv",
              Check,
            ],
            ["Simkl", "Watchlists & history", "https://simkl.com", Cloud],
            [
              "Discord",
              "Your profile & watching activity",
              "https://discord.com",
              MessageCircle,
            ],
            [
              "IntroDB",
              "Intro, recap & outro markers",
              "https://introdb.app",
              SkipForward,
            ],
          ].map(([name, description, url, Icon]) => {
            const Symbol = Icon as typeof BookOpen;
            return (
              <a
                key={String(name)}
                className="connection-tile"
                href={String(url)}
                target="_blank"
                rel="noreferrer"
              >
                <Symbol size={25} />
                <div>
                  <b>{String(name)}</b>
                  <p>{String(description)}</p>
                </div>
                <ExternalLink size={14} />
              </a>
            );
          })}
        </div>
        <div className="source-note">
          <Link2 size={21} />
          <div>
            <h3>Bring your own sources.</h3>
            <p>
              Install the addons and provider repositories you choose. Enable
              what you need and put your favourite providers first.
            </p>
          </div>
          <a href="/account?tab=plugins">
            Manage sources <ArrowUpRight size={16} />
          </a>
        </div>
      </section>
      <section
        className="shell section home-start"
        aria-labelledby="start-title"
      >
        <div className="section-heading">
          <div>
            <div className="eyebrow">From here to your first episode</div>
            <h2 id="start-title">
              A few small steps.
              <br />
              <span>A whole lot to discover.</span>
            </h2>
          </div>
          <p>
            Start on Android. Manage your account from the browser. Keep the
            same profile wherever you pick things up.
          </p>
        </div>
        <ol className="start-steps">
          {[
            [
              Download,
              "Get the app",
              "Download the latest Android release from GitHub and install Anivio.",
              "Get Anivio",
              "#download",
            ],
            [
              Users,
              "Make yourself at home",
              "Create an account, pick a profile, and choose the colours and artwork you love.",
              "Your account",
              "/account",
            ],
            [
              Headphones,
              "Connect & settle in",
              "Add your sources, connect your tracking services, and find something worth your evening.",
              "Read the guide",
              "/docs",
            ],
          ].map(([Icon, title, description, label, href], index) => {
            const Symbol = Icon as typeof Download;
            return (
              <li key={String(title)}>
                <div className="step-top">
                  <span>0{index + 1}</span>
                  <Symbol size={24} />
                </div>
                <h3>{String(title)}</h3>
                <p>{String(description)}</p>
                <a href={String(href)}>
                  {String(label)} <ArrowUpRight size={16} />
                </a>
              </li>
            );
          })}
        </ol>
      </section>
      <section
        className="shell section home-questions"
        aria-labelledby="questions-title"
      >
        <div>
          <div className="eyebrow">Before you settle in</div>
          <h2 id="questions-title">
            A few things
            <br />
            <span>you might be wondering.</span>
          </h2>
          <a href="/faq" className="text-link">
            All questions & answers <ArrowUpRight size={16} />
          </a>
        </div>
        <div className="faq-list">
          {[
            [
              "Is Anivio free?",
              "Yes. The app is free and open source. Supporter status is granted by the creator and unlocks extra visual customisation; there is no payment checkout on this website.",
            ],
            [
              "Does the app include anime or manga?",
              "Anivio is a player and reader for the sources you connect. It does not host, store, or supply media. Use sources and content you are authorised to access.",
            ],
            [
              "What carries across my devices?",
              "With the same account and profile, your saved library, watch progress, sources, and supported app preferences sync through your Anivio account. Downloaded files, permissions, and your active profile selection stay on each device.",
            ],
            [
              "Can I watch on this website?",
              "The website is your account dashboard. Manage your profiles and synced data here, then watch anime and read manga in the Anivio app.",
            ],
          ].map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <ChevronRight size={18} />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
