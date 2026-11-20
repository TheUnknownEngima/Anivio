import React, {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Bell,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cloud,
  Code2,
  Download,
  ExternalLink,
  Github,
  Globe,
  Heart,
  Layers,
  Link2,
  LoaderCircle,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Shield,
  Sparkles,
  Sun,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Markdown from "react-markdown";
import type { Session } from "@supabase/supabase-js";
import {
  clientParams,
  configured,
  downloadJson,
  errorMessage,
  getSettings,
  origin,
  profileParams,
  profilePayload,
  readMedia,
  rpc,
  safeUrl,
  saveSettings,
  supabase,
  type Profile,
  type Row,
  type Settings,
} from "./api";
import { settingGroups } from "./settings-schema";
import { decryptCredential, encryptCredential } from "./credentials";
import {
  backupSettings,
  moveItem,
  patchPreference,
  readPreference,
  validateBackup,
} from "./sync.mjs";
import MediaServers from "./MediaServers";
import Covers from "./Covers";
import CollectionBuilder from "./CollectionBuilder";
import ProfileAvatar, { SupporterBadge, SupporterStyle, type SupporterTier } from "./ProfileAvatar";
import { supporterGradient } from "./supporter-style";
import { useProfileSelection, unlockProfile } from "./profile-selection";
import { enrichMedia, presentMedia } from "./media-metadata.mjs";
import HomeDetails from "./HomeDetails";
import { DesktopDownload, DesktopFeaturePreviews, DesktopScreenshots } from "./DesktopShowcase";
import CommunityCollections, { CollectionReview } from "./CommunityCollections";
import "./style.css";

const repo = "https://github.com/mdtahseen7/Anivio";
const releaseApi =
  "https://api.github.com/repos/mdtahseen7/Anivio/releases?per_page=30";
const icons: Record<string, typeof Users> = {
  admin: Shield,
  membership: Heart,
  media_servers: Monitor,
  overview: Layers,
  profiles: Users,
  addons: Link2,
  plugins: Code2,
  collections: BookOpen,
  watch_progress: Play,
  library: Layers,
  watched: CheckCircle2,
  mobile_settings: Settings2,
  integrations: Cloud,
  devices: Monitor,
  security: Shield,
  backup: Download,
};
const tabs: [string, string][] = [
  ["overview", "Overview"],
  ["profiles", "Profiles"],
  ["media_servers", "Media servers"],
  ["addons", "Addons"],
  ["plugins", "Plugins"],
  ["collections", "Collections"],
  ["watch_progress", "Watch progress"],
  ["library", "Library"],
  ["watched", "Watched"],
  ["mobile_settings", "App settings"],
  ["integrations", "Integrations"],
  ["devices", "Devices"],
  ["security", "Account & security"],
  ["membership", "Supporter status"],
  ["admin", "Supporter management"],
  ["backup", "Backup & restore"],
];
function useRoute() {
  const [route, set] = useState(location.pathname + location.search);
  useEffect(() => {
    const change = () => set(location.pathname + location.search);
    addEventListener("popstate", change);
    return () => removeEventListener("popstate", change);
  }, []);
  return route;
}
function navigate(path: string) {
  const request = new Event("anivio:navigate", { cancelable: true });
  if (!dispatchEvent(request)) return;
  history.pushState(null, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
  requestAnimationFrame(() => {
    const id = path.split("#")[1];
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    else window.scrollTo({ top: 0, behavior: "instant" });
  });
}
function Link({
  href,
  children,
  className = "",
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      {...props}
      className={className}
      href={href}
      onClick={(e) => {
        props.onClick?.(e);
        if (
          !e.defaultPrevented &&
          !e.metaKey &&
          !e.ctrlKey &&
          href.startsWith("/") &&
          !href.startsWith("//")
        ) {
          e.preventDefault();
          navigate(href);
        }
      }}
    >
      {children}
    </a>
  );
}
function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Anivio home">
      <img src="/wordmark.png" alt="Anivio" />
    </Link>
  );
}
function Button({
  children,
  busy,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      {...props}
      className={`button ${className}`}
      disabled={busy || props.disabled}
    >
      {busy ? <LoaderCircle className="spin" size={18} /> : null}
      {children}
    </button>
  );
}
function Message({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return children ? (
    <div
      className={`message ${error ? "error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {children}
    </div>
  ) : null;
}
function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Layers size={30} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}

function App() {
  const route = useRoute();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [profileId] = useProfileSelection(session?.user.id);
  const owner = session?.user.id;
  const [membership, setMembership] = useState<{ owner?: string; tier?: SupporterTier }>({});
  const tier = membership.owner === owner ? membership.tier : undefined;
  const [ring, setRing] = useState<{ owner?: string; profileId: number; gradient: string }>();
  const gradient = ring?.owner === owner && ring?.profileId === profileId ? ring.gradient : undefined;
  useEffect(() => {
    if (!owner) return;
    let request = 0;
    const refresh = async () => {
      const current = ++request;
      try {
        const [access] = await rpc<Row[]>("get_my_member_access");
        if (current !== request) return;
        const tier = access?.tier;
        setMembership({ owner, tier: tier === "SUPPORTER" || tier === "SUPPORTER_PLUS" ? tier : undefined });
      } catch {
        // Retain the last verified tier during a temporary connection failure.
      }
    };
    refresh();
    addEventListener("anivio-access-updated", refresh);
    addEventListener("focus", refresh);
    const timer = setInterval(refresh, 60_000);
    return () => {
      request++;
      removeEventListener("anivio-access-updated", refresh);
      removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, [owner]);
  useEffect(() => {
    if (!owner || tier !== "SUPPORTER_PLUS") return;
    let request = 0;
    const refresh = async () => {
      const current = ++request;
      try {
        const { settings_json } = await getSettings(profileId);
        if (current === request) setRing({ owner, profileId, gradient: supporterGradient(settings_json.features) });
      } catch { /* The ring has a neutral fallback while settings are unavailable. */ }
    };
    refresh();
    addEventListener("anivio:settings-saved", refresh);
    addEventListener("focus", refresh);
    return () => {
      request++;
      removeEventListener("anivio:settings-saved", refresh);
      removeEventListener("focus", refresh);
    };
  }, [owner, profileId, tier]);
  const [accountProfiles, setAccountProfiles] = useState<{
    owner: string;
    items: Profile[];
  }>({ owner: "", items: [] });
  const headerProfile =
    accountProfiles.owner === session?.user.id
      ? accountProfiles.items.find((p) => p.profile_index === profileId)
      : undefined;
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (!session) {
        setAccountProfiles({ owner: "", items: [] });
        return;
      }
      rpc<Profile[]>("sync_pull_profiles")
        .then((rows) => {
          if (active)
            setAccountProfiles({ owner: session.user.id, items: rows });
        })
        .catch(() => {});
    };
    refresh();
    addEventListener("anivio:profiles-updated", refresh);
    return () => {
      active = false;
      removeEventListener("anivio:profiles-updated", refresh);
    };
  }, [session?.user.id]);
  const [menu, setMenu] = useState(false);
  const [light, setLight] = useState(
    localStorage.getItem("anivio-web-theme") === "light",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = light ? "light" : "dark";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", light ? "#f4f5ef" : "#101311");
    localStorage.setItem("anivio-web-theme", light ? "light" : "dark");
  }, [light]);
  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setReady(true);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((event, value) => {
      if (mounted) {
        setSession(value);
        setReady(true);
        if (event === "PASSWORD_RECOVERY") navigate("/account/recovery");
      }
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    setMenu(false);
  }, [route]);
  const path = route.split("?")[0].replace(/\/+$/, "") || "/";
  const isAccount = path === "/account";
  return (
    <SupporterStyle.Provider value={{ tier, gradient }}>
      <header className="topbar">
        <Brand />
        <nav aria-label="Main navigation" className={menu ? "expanded" : ""}>
          <Link href="/#features" onClick={() => setMenu(false)}>
            The experience
          </Link>
          <Link href="/covers">Artwork</Link>
          <Link href="/community-collections">Collections</Link>
          <Link href="/news">What’s new</Link>
          <Link href="/docs">Get started</Link>
          <a href={repo} target="_blank" rel="noreferrer">
            Source <ArrowUpRight size={13} />
          </a>
        </nav>
        <div className="nav-actions">
          <button
            className="icon-button"
            aria-label={light ? "Switch to dark mode" : "Switch to light mode"}
            onClick={() => setLight(!light)}
          >
            {light ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <Link
            href={session ? "/account" : "/account/login"}
            className="nav-account"
            aria-label={session ? `${headerProfile?.name || "My account"} dashboard` : "Log in"}
          >
            {session && <ProfileAvatar profile={headerProfile} />}
            <span className="nav-profile-name">{session ? headerProfile?.name || "My account" : "Log in"}</span>
            <ArrowUpRight size={15} />
          </Link>
          <button
            className="icon-button mobile-menu"
            aria-label="Toggle navigation"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <main>
        {path === "/" ? (
          <Home />
        ) : isAccount ? (
          !ready ? (
            <Loading />
          ) : session ? (
            <Dashboard key={session.user.id} session={session} hasSupporter={Boolean(tier)} />
          ) : (
            <Auth mode="login" />
          )
        ) : path.startsWith("/account/") ? (
          <Auth mode={path.split("/")[2]} session={session} />
        ) : path === "/covers" ? (
          <Covers session={session} />
        ) : path === "/community-collections" ? (
          <CommunityCollections session={session} />
        ) : path === "/link" ? (
          <DeviceLink session={session} />
        ) : path === "/party" ? (
          <PartyInvite key={route} code={new URLSearchParams(location.search).get("code")} />
        ) : (
          <PublicPage path={path} />
        )}
      </main>
      {!isAccount && <Footer />}
    </SupporterStyle.Provider>
  );
}
function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" /> Loading your space…
    </div>
  );
}
function Home() {
  return (
    <>
      <section className="hero shell">
        <div className="hero-copy">
          <div className="eyebrow">
            <i /> Your next episode starts here
          </div>
          <h1>
            A little closer
            <br />
            to your next
            <br />
            <span>favourite.</span>
          </h1>
          <p>
            Your anime. Your manga. Your way.
            <br />
            An open-source home for the stories you love, with everything you
            need to pick up where you left off.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="#download">
              <Download size={18} /> Get Anivio <ArrowDown size={16} />
            </a>
            <Link className="button ghost" href="/account">
              Your account <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="hero-meta">
            <Github size={15} /> Free & open source <span /> Made for anime{" "}
            <span /> Built on Nuvio
          </div>
        </div>
        <div className="hero-stage">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="stage-caption">One more episode?</div>
          <div className="phone">
            <div className="phone-notch" />
            <img
              className="app-shot"
              src="/app-preview.jpg"
              alt="Anivio Android app with anime discovery and Continue Watching"
            />
            <div className="phone-fallback">
              <img src="/icon.jpg" alt="" />
            </div>
          </div>
          <div className="floating-note note-one">
            <span className="note-icon">
              <Check size={19} />
            </span>
            <div>
              <b>Right where you left off.</b>
              <small>Progress travels with you.</small>
            </div>
          </div>
          <div className="floating-note note-two">
            <Sparkles size={18} />
            <span>Made for your kind of stories.</span>
          </div>
          <span className="stage-coordinate">ANIVIO / MAKE IT YOURS</span>
        </div>
      </section>
      <div className="principles shell">
        <span>
          <Play size={17} /> Watch your way
        </span>
        <span>
          <BookOpen size={17} /> Read something new
        </span>
        <span>
          <Users size={17} /> Make it personal
        </span>
        <span>
          <Code2 size={17} /> Always open source
        </span>
      </div>
      <section id="features" className="shell section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">A better place for your favourites</div>
            <h2>
              All the good stuff.
              <br />
              <span>None of the friction.</span>
            </h2>
          </div>
          <p>
            From discovering your next obsession to finishing that final
            chapter. Thoughtful details, built around you.
          </p>
        </div>
        <div className="feature-grid">
          <DesktopFeaturePreviews />
          <article className="feature-card playback-feature">
            <div className="feature-art player-art">
              <div className="play-puck">
                <Play fill="currentColor" />
              </div>
              <span className="chip">
                <Sparkles size={14} /> Anime4K enhancement
              </span>
            </div>
            <div className="feature-text">
              <h3>Little details. Better watching.</h3>
              <p>
                Subtitle styling, intro skipping, downloads, Watch Party, and
                optional on-device video enhancement.
              </p>
            </div>
          </article>
          <article className="feature-card feature-large">
            <DesktopScreenshots />
            <div className="feature-text">
              <h3>There’s a whole world between episodes.</h3>
              <p>
                Explore episode details, adjust video and subtitle settings,
                or invite a friend to watch with you.
              </p>
            </div>
          </article>
        </div>
      </section>
      <HomeDetails />
      <section className="account-banner shell">
        <div>
          <div className="eyebrow">Your corner of Anivio</div>
          <h2>
            Your settings.
            <br />A little more breathing room.
          </h2>
          <p>
            Manage profiles, sources, collections, progress, and synced app
            preferences from your browser.
          </p>
          <Link className="button primary" href="/account">
            Open your dashboard <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="account-preview">
          <div className="preview-top">
            <img src="/wordmark.png" alt="Anivio" />
            <span>
              <i /> Account
            </span>
          </div>
          <h3>Make yourself at home.</h3>
          <p>Everything that makes Anivio yours.</p>
          <div className="preview-rows">
            <span>
              <Users />
              Profiles
              <ChevronRight />
            </span>
            <span>
              <Settings2 />
              App settings
              <ChevronRight />
            </span>
            <span>
              <Monitor />
              Devices
              <ChevronRight />
            </span>
          </div>
        </div>
      </section>
      <DesktopDownload />
      <section className="open-source shell">
        <div>
          <Code2 size={30} />
          <h3>
            Made with curiosity.
            <br />
            Built in the open.
          </h3>
        </div>
        <p>
          Created by <a href="https://github.com/mdtahseen7">Tahseen</a>, with a
          foundation from the Nuvio community. Contributions, ideas, and
          thoughtful bug reports are always welcome.
        </p>
        <a className="button ghost" href={repo}>
          Explore the source <Github size={18} />
        </a>
      </section>
    </>
  );
}
function Footer() {
  return (
    <footer className="shell footer">
      <div>
        <Brand />
        <p>A home for the stories you love.</p>
        <small>© {new Date().getFullYear()} Anivio · GNU GPLv3</small>
      </div>
      <div>
        <b>Explore</b>
        <Link href="/docs">Getting started</Link>
        <Link href="/news">Releases</Link>
        <Link href="/faq">Questions & answers</Link>
        <Link href="/account">Your account</Link>
      </div>
      <div>
        <b>The project</b>
        <a href={repo}>GitHub</a>
        <Link href="/support">Contribute</Link>
        <Link href="/contact">Contact</Link>
        <a href="https://nuvio.tv">Built on Nuvio ↗</a>
      </div>
      <div>
        <b>The details</b>
        <Link href="/privacy-policy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/account-deletion">Delete your account</Link>
        <Link href="/link">Link a device</Link>
      </div>
    </footer>
  );
}

function Auth({ mode, session }: { mode: string; session?: Session | null }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false);
  const signup = mode === "signup",
    reset = mode === "reset-password",
    recovery = mode === "recovery";
  useEffect(() => {
    setMessage("");
    setError(false);
  }, [mode]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    const values = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      const email = String(values.get("email") || "").trim(),
        password = String(values.get("password") || "");
      if (recovery) {
        if (!session)
          throw new Error(
            "Open the password reset link from your email to continue.",
          );
        const result = await supabase.auth.updateUser({ password });
        if (result.error) throw result.error;
        setMessage("Password updated. You can return to your account.");
      } else if (reset) {
        const result = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: origin(),
        });
        if (result.error) throw result.error;
        setMessage(
          "If an account matches this email, you’ll receive a reset link shortly.",
        );
      } else if (signup) {
        if (values.get("terms") !== "on")
          throw new Error(
            "Please review and accept the terms and privacy policy.",
          );
        const result = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${location.origin}/account` },
        });
        if (result.error) throw result.error;
        if (result.data.session) navigate("/account");
        else
          setMessage("Check your inbox to confirm your email, then sign in.");
      } else {
        const result = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (result.error) throw result.error;
        const next = new URLSearchParams(location.search).get("next");
        navigate(
          next?.startsWith("/") && !next.startsWith("//") ? next : "/account",
        );
      }
    } catch (e) {
      setMessage(errorMessage(e));
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-layout shell">
      <div className="auth-story">
        <div className="eyebrow">
          <i /> Your corner of Anivio
        </div>
        <h1>
          Your stories.
          <br />
          <span>Right here.</span>
        </h1>
        <p>
          A single account for your profiles, library, and the little details
          that make Anivio yours.
        </p>
        <div className="auth-benefits">
          <span>
            <Cloud /> Keep your progress in sync
          </span>
          <span>
            <Users /> A space for every profile
          </span>
          <span>
            <Shield /> Your account, under your control
          </span>
        </div>
      </div>
      <div className="auth-card">
        <Link className="text-link" href="/">
          <ArrowLeft size={15} /> Back to Anivio
        </Link>
        <h2>
          {signup
            ? "Make yourself at home."
            : reset
              ? "Let’s get you back in."
              : recovery
                ? "A fresh password."
                : "Welcome back."}
        </h2>
        <p>
          {signup
            ? "Create your Anivio account."
            : reset
              ? "We’ll send a password reset link to your inbox."
              : recovery
                ? "Choose a new password for your account."
                : "Pick up where you left off."}
        </p>
        <form onSubmit={submit}>
          {!recovery && (
            <Field
              label="Email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          )}
          {!reset && (
            <Field
              label={recovery ? "New password" : "Password"}
              name="password"
              type="password"
              minLength={signup || recovery ? 8 : 1}
              required
              autoComplete={
                signup || recovery ? "new-password" : "current-password"
              }
              placeholder="Enter your password"
            />
          )}
          {!signup && !reset && !recovery && (
            <Link className="forgot" href="/account/reset-password">
              Forgot password?
            </Link>
          )}
          {signup && (
            <label className="check-field">
              <input name="terms" type="checkbox" required />
              <span>
                I agree to the <Link href="/terms">Terms</Link> and{" "}
                <Link href="/privacy-policy">Privacy Policy</Link>.
              </span>
            </label>
          )}
          <Message error={error}>{message}</Message>
          {!configured && (
            <Message error>
              Account service needs configuration before sign-in is available.
            </Message>
          )}
          <Button className="primary full" busy={busy} disabled={!configured}>
            {signup
              ? "Create account"
              : reset
                ? "Send reset link"
                : recovery
                  ? "Update password"
                  : "Log in"}
            <ArrowRight size={17} />
          </Button>
        </form>
        <p className="auth-switch">
          {signup ? (
            <>
              Already have an account? <Link href="/account/login">Log in</Link>
            </>
          ) : recovery ? (
            <Link href="/account">Back to your account</Link>
          ) : (
            <>
              New here? <Link href="/account/signup">Create an account</Link>
            </>
          )}
        </p>
        <p className="fine-print">
          Your account stores sync data and settings. Anivio does not host
          media.
        </p>
      </div>
    </section>
  );
}

function Dashboard({ session, hasSupporter }: { session: Session; hasSupporter: boolean }) {
  const route = useRoute(),
    requested =
      new URLSearchParams(route.split("?")[1] || "").get("tab") || "overview";
  const tab = tabs.some(([key]) => key === requested) ? requested : "overview";
  const [profileId, selectProfile] = useProfileSelection(session.user.id);
  const [profiles, setProfiles] = useState<Profile[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [choosingProfile, setChoosingProfile] = useState(false);
  const [profileChoiceBusy, setProfileChoiceBusy] = useState(false);
  const [profileChoiceError, setProfileChoiceError] = useState("");
  const active = profiles.find((p) => p.profile_index === profileId);
  const [isAdmin, setAdmin] = useState(false);
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const [next, admin] = await Promise.all([
        rpc<Profile[]>("sync_pull_profiles"),
        rpc<boolean>("web_is_admin"),
      ]);
      setProfiles(next);
      dispatchEvent(new Event("anivio:profiles-updated"));
      setAdmin(admin);
      if (!next.some((p) => p.profile_index === profileId))
        selectProfile(next[0]?.profile_index ?? 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    refresh();
    if (supabase)
      rpc("register_current_device", {
        p_installation_id: getInstallationId(),
        p_client_name: "Anivio Web",
        p_client_version: "1.0.0",
        p_platform: "web",
        p_device_name: navigator.userAgent.includes("Mobile")
          ? "Mobile browser"
          : "Web browser",
      }).catch(() => {});
  }, [session.user.id]);
  const choose = async (id: number) => {
    if (id === profileId) {
      setChoosingProfile(false);
      return;
    }
    const target = profiles.find((p) => p.profile_index === id);
    setProfileChoiceBusy(true);
    setProfileChoiceError("");
    try {
      if (await unlockProfile(target)) {
        selectProfile(id);
        setChoosingProfile(false);
      }
    } catch (e) {
      setProfileChoiceError(errorMessage(e));
    } finally {
      setProfileChoiceBusy(false);
    }
  };
  const profileBackdrop = safeUrl(active?.profile_background_url);
  return (
    <div className="dashboard shell">
      <aside className="dashboard-sidebar">
        <div className="account-label">Your space</div>
        <button type="button" className="profile-select profile-switch-button"
          aria-label="Switch profile" aria-haspopup="dialog" disabled={!profiles.length}
          onClick={() => { setProfileChoiceError(""); setChoosingProfile(true); }}>
          <ProfileAvatar profile={active} />
          <span>{active?.name || "Your profile"}</span>
          <ChevronDown size={15} />
        </button>
        <label className="account-section-select">
          <span>Account section</span>
          <select value={tab} onChange={(e) => navigate(`/account?tab=${e.target.value}`)}>
            {tabs.filter(([key]) => key !== "admin" || isAdmin).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
        <nav aria-label="Account sections">
          {tabs
            .filter(([key]) => key !== "admin" || isAdmin)
            .map(([key, label]) => {
              const Icon = icons[key];
              return (
                <Link
                  key={key}
                  className={tab === key ? "active" : ""}
                  href={`/account?tab=${key}`}
                >
                  <Icon size={18} />
                  {label}
                  {tab === key && <ChevronRight size={14} />}
                </Link>
              );
            })}
        </nav>
        <button
          className="sign-out"
          onClick={async () => {
            await supabase?.auth.signOut();
            navigate("/account/login");
          }}
        >
          <LogOut size={17} /> Log out
        </button>
      </aside>
      <div className="dashboard-main">
        <div className="dashboard-heading">
          <div>
            <div className="eyebrow">
              {active?.name || "Anivio"} / Your account
            </div>
            <h1>
              {tab === "overview"
                ? "Your personal space"
                : tabs.find(([key]) => key === tab)?.[1]}
            </h1>
            <p>
              {tab === "overview"
                ? "Everything that makes Anivio yours, in one place."
                : "Changes sync with the selected profile in your Anivio app."}
            </p>
          </div>
          <button
            className="icon-button"
            aria-label="Refresh account"
            disabled={busy}
            onClick={refresh}
          >
            <RefreshCw size={18} className={busy ? "spin" : ""} />
          </button>
        </div>
        <Message error>{error}</Message>
        {busy && !profiles.length ? (
          <Loading />
        ) : (
          <div key={`${session.user.id}:${profileId}:${tab}`}>
            {tab === "overview" ? (
              <Overview profiles={profiles} session={session} active={active} profileId={profileId} />
            ) : tab === "profiles" ? (
              <Profiles profiles={profiles} refresh={refresh} />
            ) : tab === "addons" || tab === "plugins" ? (
              <Sources kind={tab} profile={active} profileId={profileId} />
            ) : tab === "admin" ? (
              isAdmin ? (
                <SupporterAdmin />
              ) : (
                <Empty title="Administrator access required" />
              )
            ) : tab === "membership" ? (
              <SupporterStatus />
            ) : tab === "media_servers" ? (
              <MediaServers profileId={profileId} />
            ) : tab === "mobile_settings" ? (
              <AppSettings profileId={profileId} hasSupporter={hasSupporter} />
            ) : tab === "security" ? (
              <Security session={session} />
            ) : tab === "devices" ? (
              <Devices />
            ) : tab === "backup" ? (
              <Backup profiles={profiles} />
            ) : tab === "integrations" ? (
              <Integrations profileId={profileId} />
            ) : tab === "collections" ? (
              <Collections profileId={profileId} />
            ) : (
              <MediaData kind={tab} profileId={profileId} />
            )}
          </div>
        )}
      </div>
      {choosingProfile && (
        <Modal title="Who’s watching?" className="profile-switch-modal"
          onClose={() => setChoosingProfile(false)}>
          {profileBackdrop && <img className="profile-switch-backdrop" src={profileBackdrop} alt="" />}
          <div className="profile-switch-grid">
            {profiles.map((p) => (
              <button key={p.profile_index} type="button"
                className="profile-switch-option" aria-current={p.profile_index === profileId}
                disabled={profileChoiceBusy} onClick={() => choose(p.profile_index)}>
                <ProfileAvatar profile={p} large />
                <strong>{p.name}</strong>
                {p.pin_enabled && <small>PIN protected</small>}
              </button>
            ))}
          </div>
          <Message error>{profileChoiceError}</Message>
          <Link className="button ghost" href="/account?tab=profiles" onClick={() => setChoosingProfile(false)}>
            Manage profiles
          </Link>
        </Modal>
      )}
    </div>
  );
}
function getInstallationId() {
  let id = localStorage.getItem("anivio-web-installation");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("anivio-web-installation", id);
  }
  return id;
}
function Overview({
  profiles,
  session,
  active,
  profileId,
}: {
  profiles: Profile[];
  session: Session;
  active?: Profile;
  profileId: number;
}) {
  return (
    <>
      <div
        className={`welcome-card ${safeUrl(active?.profile_background_url) ? "has-banner" : ""}`}
      >
        {safeUrl(active?.profile_background_url) && (
          <img
            className="welcome-backdrop"
            src={safeUrl(active?.profile_background_url)}
            alt=""
          />
        )}
        <div>
          <span className="status-dot" /> Active profile
          <h2>
            Welcome back,
            <br />
            {active?.name || "to Anivio"}.
          </h2>
          <p>{session.user.email}</p>
          <Link href="/account?tab=profiles" className="button primary">
            Customize profile
          </Link>
        </div>
        <div className="welcome-profile">
          <ProfileAvatar profile={active} large />
          <b>{active?.name || "Your profile"}</b>
          {active && <SupporterBadge />}
          <small>
            {active?.profile_index === 1
              ? "Primary profile"
              : "Personal profile"}
          </small>
        </div>
      </div>
      <ContinueWatchingOverview profileId={profileId} />
      <div className="quick-grid">
        {[
          [
            "profiles",
            "Your profiles",
            `${profiles.length} of 6 spaces, each with its own story.`,
          ],
          ["addons", "Your sources", "Keep the sources you love close by."],
          ["devices", "Connected devices", "See where you’re signed in."],
        ].map(([key, title, description]) => {
          const Icon = icons[key];
          return (
            <Link key={key} className="quick-card" href={`/account?tab=${key}`}>
              <Icon />
              <ArrowUpRight className="corner-arrow" size={17} />
              <h3>{title}</h3>
              <p>{description}</p>
            </Link>
          );
        })}
      </div>
      <div className="info-strip">
        <Shield size={20} />
        <p>
          Profile settings, sources, and progress belong to the selected
          profile. Switch profiles above to manage a different space.
        </p>
      </div>
    </>
  );
}

function ContinueWatchingOverview({ profileId }: { profileId: number }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    readMedia("watch_progress", profileId, 32).then((progress) => {
      const seen = new Set();
      const recent = progress.filter((row) => {
        if (seen.has(row.content_id) || Number(row.position) <= 0) return false;
        seen.add(row.content_id);
        const duration = Number(row.duration);
        return !duration || Number(row.position) < duration * 0.95;
      }).slice(0, 4);
      if (active) setRows(recent.map((row) => presentMedia(row)));
      return enrichMedia(recent);
    }).then((enriched) => {
      if (active) setRows(enriched);
    }).catch((e) => {
      if (active) setError(errorMessage(e));
    });
    return () => { active = false; };
  }, [profileId]);
  return (
    <section className="overview-watch" aria-labelledby="overview-watch-title">
      <div className="surface-heading">
        <h2 id="overview-watch-title">Continue Watching</h2>
        <Link className="text-link" href="/account?tab=watch_progress">Manage progress</Link>
      </div>
      {error ? <Message error>{error}</Message> : rows === null ? <Loading /> : rows.length === 0 ? (
        <p className="overview-watch-empty">Synced episodes you’re partway through will appear here.</p>
      ) : (
        <div className="overview-watch-grid">
          {rows.map((row) => {
            const duration = Number(row.duration);
            const position = Number(row.position);
            const backdrop = safeUrl(row.displayBackground || row.displayPoster);
            const episode = row.episode == null ? undefined : row.season == null ? `E${row.episode}` : `S${row.season} E${row.episode}`;
            return (
              <article key={String(row.progress_key || row.content_id)} className="overview-watch-card">
                {backdrop && <img src={backdrop} alt="" loading="lazy" />}
                {duration > position && <span className="overview-watch-time">{Math.ceil((duration - position) / 60_000)} min left</span>}
                <div>
                  {episode && <small>{episode}</small>}
                  <strong>{String(row.displayTitle)}</strong>
                  {duration > 0 && <progress aria-label="Episode progress" max={duration} value={position} />}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Profiles({
  profiles,
  refresh,
}: {
  profiles: Profile[];
  refresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Profile | null>(null),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError(false);
    const f = new FormData(e.currentTarget);
    try {
      const next = {
        ...editing,
        name: String(f.get("name")).trim(),
        avatar_color_hex: String(f.get("color")),
        avatar_url:
          f.get("discord") === "on"
            ? "discord://avatar"
            : String(f.get("avatar")).trim() === "discord://avatar"
              ? null
              : String(f.get("avatar")).trim() || null,
        profile_background_url: String(f.get("banner")).trim() || null,
        uses_primary_addons: f.get("addons") === "on",
        uses_primary_plugins: f.get("plugins") === "on",
      } as unknown as Profile;
      if (!next.name) throw new Error("Give this profile a name.");
      const pin = String(f.get("pin") || "");
      const currentPin = String(f.get("currentPin") || "");
      const clearPin = f.get("clearPin") === "on";
      if (pin && !/^\d{4}$/.test(pin))
        throw new Error("The PIN must contain four digits.");
      if (
        editing.pin_enabled &&
        (pin || clearPin) &&
        !/^\d{4}$/.test(currentPin)
      )
        throw new Error("Enter the current four-digit PIN to change it.");
      for (const value of [next.avatar_url, next.profile_background_url])
        if (value && !safeUrl(value) && value !== "discord://avatar")
          throw new Error("Use an HTTPS image URL.");
      const all = profiles.some((p) => p.profile_index === next.profile_index)
        ? profiles.map((p) =>
            p.profile_index === next.profile_index ? next : p,
          )
        : [...profiles, next];
      await rpc("sync_push_profiles", {
        p_profiles: all.map(profilePayload),
        p_client_max_profiles: 6,
        ...clientParams(),
      });
      if (clearPin) {
        await rpc("clear_profile_pin", {
          p_profile_id: next.profile_index,
          p_current_pin: currentPin,
        });
      } else if (pin) {
        await rpc("set_profile_pin", {
          p_profile_id: next.profile_index,
          p_pin: pin,
          p_current_pin: currentPin || null,
        });
      }
      setEditing(null);
      await refresh();
      setMessage("Profile saved.");
    } catch (e) {
      setError(true);
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(p: Profile) {
    if (
      !confirm(
        `Delete ${p.name} and its synced profile data? This cannot be undone.`,
      )
    )
      return;
    setBusy(true);
    try {
      await rpc("sync_delete_profile_data", { p_profile_id: p.profile_index });
      await refresh();
      setMessage("Profile deleted.");
    } catch (e) {
      setError(true);
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Message error={error}>{message}</Message>
      <div className="profiles-grid">
        {profiles.map((p) => (
          <article className="profile-card" key={p.profile_index}>
            <div
              className="profile-cover"
              style={
                safeUrl(p.profile_background_url)
                  ? {
                      backgroundImage: `url("${safeUrl(p.profile_background_url)}")`,
                    }
                  : {
                      background: `linear-gradient(135deg, ${p.avatar_color_hex}70, transparent)`,
                    }
              }
            />
            <ProfileAvatar profile={p} large />
            <h3 className="profile-card-name">{p.name} <SupporterBadge /></h3>
            <p>
              {p.profile_index === 1
                ? "Primary profile"
                : p.pin_enabled
                  ? "PIN protected"
                  : "Personal profile"}
            </p>
            <div className="card-actions">
              <Button onClick={() => setEditing(p)}>Edit profile</Button>
              {p.profile_index !== 1 && (
                <button
                  className="icon-button"
                  aria-label={`Delete ${p.name}`}
                  disabled={busy}
                  onClick={() => remove(p)}
                >
                  <Trash2 size={17} />
                </button>
              )}
            </div>
          </article>
        ))}
        {profiles.length < 6 && (
          <button
            className="add-profile"
            onClick={() =>
              setEditing({
                profile_index: [1, 2, 3, 4, 5, 6].find(
                  (id) => !profiles.some((p) => p.profile_index === id),
                )!,
                name: "",
                avatar_color_hex: "#b1c7a2",
              })
            }
          >
            <Plus />
            <b>A space for someone new</b>
            <span>Add a profile</span>
          </button>
        )}
      </div>
      {editing && (
        <Modal
          title={editing.name ? "Edit your profile" : "A new space"}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={save}>
            <Field
              name="name"
              label="Profile name"
              defaultValue={editing.name}
              maxLength={40}
              required
            />
            <Field
              name="color"
              label="Profile colour"
              type="color"
              defaultValue={editing.avatar_color_hex}
            />
            <Field
              name="avatar"
              label="Avatar image URL"
              defaultValue={editing.avatar_url || ""}
              placeholder="https://… or discord://avatar"
            />
            <label className="check-field">
              <input
                type="checkbox"
                name="discord"
                defaultChecked={editing.avatar_url === "discord://avatar"}
              />
              <span>Use the Discord picture linked in the app</span>
            </label>
            <Field
              name="banner"
              label="Banner image URL"
              defaultValue={String(editing.profile_background_url || "")}
              placeholder="https://…"
            />
            {editing.pin_enabled && (
              <>
                <Field
                  name="currentPin"
                  label="Current profile PIN"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  autoComplete="off"
                />
                <label className="check-field">
                  <input type="checkbox" name="clearPin" />
                  <span>Remove this profile’s PIN</span>
                </label>
              </>
            )}
            <Field
              name="pin"
              label="Set a new four-digit PIN (optional)"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              type="password"
              autoComplete="new-password"
            />
            <label className="check-field">
              <input
                type="checkbox"
                name="addons"
                defaultChecked={editing.uses_primary_addons}
              />
              <span>Use primary profile’s addons</span>
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                name="plugins"
                defaultChecked={editing.uses_primary_plugins}
              />
              <span>Use primary profile’s plugins</span>
            </label>
            <Button className="primary full" busy={busy}>
              Save profile
            </Button>
            <Message error={error}>{message}</Message>
          </form>
        </Modal>
      )}
    </>
  );
}
function Modal({
  title,
  onClose,
  children,
  className,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    const dialog = ref.current;
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={className ? `modal ${className}` : "modal"}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          aria-label="Close dialog"
          className="icon-button"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function Sources({
  kind,
  profile,
  profileId,
}: {
  kind: "addons" | "plugins";
  profile?: Profile;
  profileId: number;
}) {
  const inherited =
    profileId !== 1 &&
    Boolean(
      profile?.[
        kind === "addons" ? "uses_primary_addons" : "uses_primary_plugins"
      ],
    );
  const id = inherited ? 1 : profileId;
  const [rows, setRows] = useState<Row[]>([]),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function load() {
    setBusy(true);
    setError("");
    try {
      setRows(await rpc(`sync_pull_${kind}`, profileParams(id)));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
  }, [id, kind]);
  async function save(next: Row[]) {
    setBusy(true);
    setError("");
    try {
      await rpc(`sync_push_${kind}`, {
        ...profileParams(id),
        [`p_${kind}`]: next.map((r, i) => ({
          url: r.url,
          name: r.name || "",
          enabled: r.enabled !== false,
          sort_order: i,
        })),
        ...clientParams(),
      });
      setRows(next);
      setMessage("Sources saved. Open Anivio to refresh your sources.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const url = String(f.get("url"))
      .trim()
      .replace(/^stremio:\/\//, "https://");
    if (!safeUrl(url)) return setError("Use a valid HTTPS source URL.");
    if (rows.some((r) => r.url === url))
      return setError("This source is already installed.");
    const name = String(f.get("name") || new URL(url).hostname);
    await save([...rows, { url, name, enabled: true }]);
  }
  return (
    <>
      <Message error>{error}</Message>
      <Message>{message}</Message>
      {inherited && (
        <div className="info-strip">
          <Link2 size={19} />
          <p>
            This profile uses the primary profile’s {kind}. Changes here apply
            to that shared list.
          </p>
        </div>
      )}
      <section className="surface">
        <h2>Add a {kind === "addons" ? "source" : "repository"}</h2>
        <p>Use a source you trust. Anivio does not supply media.</p>
        <form onSubmit={add} className="source-form">
          <Field label="Name" name="name" placeholder="My source" />
          <Field
            label={kind === "addons" ? "Manifest URL" : "Repository URL"}
            name="url"
            placeholder="https://…"
            required
          />
          <Button className="primary" busy={busy}>
            <Plus size={17} /> Add
          </Button>
        </form>
      </section>
      <section className="surface">
        <div className="surface-heading">
          <h2>Your {kind}</h2>
          <span className="count">{rows.length}</span>
        </div>
        {busy && !rows.length ? (
          <Loading />
        ) : !rows.length ? (
          <Empty title="A clean slate">Add your first source above.</Empty>
        ) : (
          rows.map((r, i) => (
            <div
              key={String(r.url)}
              className="source-row"
              draggable={!busy}
              onDragStart={(e) =>
                e.dataTransfer.setData("text/plain", String(i))
              }
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const from = Number(e.dataTransfer.getData("text/plain"));
                if (Number.isInteger(from)) save(moveItem(rows, from, i));
              }}
            >
              <span className="source-number">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <b>{String(r.name || "Source")}</b>
                <small>{String(r.url)}</small>
              </div>
              <div className="source-controls">
                <button
                  disabled={busy || i === 0}
                  aria-label={`Move ${r.name} up`}
                  className="icon-button"
                  onClick={() => save(moveItem(rows, i, i - 1))}
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  disabled={busy || i === rows.length - 1}
                  aria-label={`Move ${r.name} down`}
                  className="icon-button"
                  onClick={() => save(moveItem(rows, i, i + 1))}
                >
                  <ArrowDown size={15} />
                </button>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={`Enable ${r.name}`}
                  checked={r.enabled !== false}
                  disabled={busy}
                  onChange={(e) =>
                    save(
                      rows.map((item, j) =>
                        i === j ? { ...item, enabled: e.target.checked } : item,
                      ),
                    )
                  }
                />
                <button
                  disabled={busy}
                  className="icon-button"
                  aria-label={`Remove ${r.name}`}
                  onClick={() => {
                    if (confirm(`Remove ${r.name || "this source"}?`))
                      save(rows.filter((_, j) => j !== i));
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </section>
    </>
  );
}

function AppSettings({
  profileId,
  hasSupporter,
}: {
  profileId: number;
  hasSupporter: boolean;
}) {
  const [features, setFeatures] = useState<Settings["features"]>({}),
    [revision, setRevision] = useState<string | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [dirty, setDirty] = useState(false),
    [group, setGroup] = useState("Appearance"),
    [raw, setRaw] = useState("");
  const dirtyRef = useRef(dirty),
    revisionRef = useRef(revision);
  dirtyRef.current = dirty;
  revisionRef.current = revision;
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  useEffect(() => {
    getSettings(profileId)
      .then((r) => {
        setFeatures(r.settings_json.features);
        setRevision(r.updated_at);
        setRaw(JSON.stringify(r.settings_json.features, null, 2));
        setLastChecked(new Date());
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setBusy(false));
  }, [profileId]);
  useEffect(() => {
    let active = true;
    async function refreshIfClean() {
      if (document.visibilityState !== "visible" || dirtyRef.current) return;
      try {
        const r = await getSettings(profileId);
        if (!active || dirtyRef.current) return;
        // A request started before a save must never replace newer values.
        if (
          Date.parse(r.updated_at || "") < Date.parse(revisionRef.current || "")
        )
          return;
        if (r.updated_at !== revisionRef.current) {
          setFeatures(r.settings_json.features);
          setRaw(JSON.stringify(r.settings_json.features, null, 2));
          setRevision(r.updated_at);
        }
        setLastChecked(new Date());
      } catch {
        /* Keep the saved view available while offline. */
      }
    }
    addEventListener("focus", refreshIfClean);
    const timer = setInterval(refreshIfClean, 30000);
    return () => {
      active = false;
      clearInterval(timer);
      removeEventListener("focus", refreshIfClean);
    };
  }, [profileId]);
  async function reload() {
    if (
      dirty &&
      !confirm("Discard your unsaved changes and load the latest app settings?")
    )
      return;
    setBusy(true);
    setError("");
    try {
      const r = await getSettings(profileId);
      setFeatures(r.settings_json.features);
      setRaw(JSON.stringify(r.settings_json.features, null, 2));
      setRevision(r.updated_at);
      setDirty(false);
      setLastChecked(new Date());
      setMessage("Latest settings loaded from your account.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    addEventListener("beforeunload", warn);
    const guard = (e: Event) => {
      if (dirty && !confirm("Discard your unsaved changes?"))
        e.preventDefault();
    };
    addEventListener("anivio:navigate", guard);
    return () => {
      removeEventListener("beforeunload", warn);
      removeEventListener("anivio:navigate", guard);
    };
  }, [dirty]);
  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = group === "All preferences" ? JSON.parse(raw) : features;
      if (!next || Array.isArray(next) || typeof next !== "object")
        throw new Error("Preferences must be a JSON object.");
      const updated = await saveSettings(profileId, next, revision);
      dispatchEvent(new Event("anivio:settings-saved"));
      setFeatures(next);
      setRaw(JSON.stringify(next, null, 2));
      setRevision(updated);
      revisionRef.current = updated;
      setLastChecked(new Date());
      setDirty(false);
      setMessage("Preferences saved. They’ll sync when the app reconnects.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function switchGroup(next: string) {
    if (dirty && !confirm("Discard your unsaved changes?")) return;
    if (dirty) {
      getSettings(profileId).then((r) => {
        setFeatures(r.settings_json.features);
        setRaw(JSON.stringify(r.settings_json.features, null, 2));
        setRevision(r.updated_at);
      });
      setDirty(false);
    }
    setGroup(next);
  }
  return (
    <>
      <div
        className="pill-tabs"
        role="tablist"
        aria-label="Settings categories"
      >
        {[...Object.keys(settingGroups), "All preferences"].map((g) => (
          <button
            role="tab"
            aria-selected={group === g}
            className={group === g ? "selected" : ""}
            key={g}
            onClick={() => switchGroup(g)}
          >
            {g}
          </button>
        ))}
      </div>
      <Message error>{error}</Message>
      <Message>{message}</Message>
      <div className="sync-summary">
        <Cloud size={18} />
        <div>
          <b>
            {dirty
              ? "You have unsaved changes"
              : "Connected to your app settings"}
          </b>
          <p>
            Save here to sync to this profile in the app. App changes appear
            after they upload.
            {lastChecked
              ? ` Last checked ${lastChecked.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
              : ""}
          </p>
        </div>
        <Button disabled={busy} className="small" onClick={reload}>
          <RefreshCw size={14} /> Reload
        </Button>
      </div>
      <section className="surface">
        <div className="surface-heading">
          <div>
            <h2>{group}</h2>
            <p>Synced mobile preferences for this profile.</p>
          </div>
          <Button
            busy={busy}
            disabled={!dirty}
            className="primary"
            onClick={save}
          >
            Save changes
          </Button>
        </div>
        {busy && !Object.keys(features).length ? (
          <Loading />
        ) : group === "All preferences" ? (
          <>
            <p className="fine-print">
              Edit every synced setting, including Anivio’s reader and
              enhancement options. Existing unknown fields are preserved. Export
              a backup before making advanced changes.
            </p>
            <label className="field">
              <span>Preference document (JSON)</span>
              <textarea
                className="code-editor"
                rows={22}
                spellCheck={false}
                value={raw}
                onChange={(e) => {
                  setRaw(e.target.value);
                  setDirty(true);
                }}
              />
            </label>
          </>
        ) : (
          <>
            {settingGroups[group].map((field) => {
              const value = readPreference(features, field);
              const update = (v: unknown) => {
                const next = patchPreference(features, field, v);
                setFeatures(next);
                setRaw(JSON.stringify(next, null, 2));
                setDirty(true);
              };
              return (
                <label className="setting-row" key={field.key}>
                  <div>
                    <b>{field.title}</b>
                    {field.description && <small>{field.description}</small>}
                  </div>
                  {field.type === "boolean" ? (
                    <input
                      type="checkbox"
                      role="switch"
                      checked={Boolean(value)}
                      onChange={(e) => update(e.target.checked)}
                    />
                  ) : field.options ? (
                    <select
                      value={String(value)}
                      onChange={(e) => update(e.target.value)}
                    >
                      {field.options.map((o) => (
                        <option
                          key={o}
                          value={o}
                          disabled={
                            !hasSupporter &&
                            [
                              "GOLD",
                              "JADE",
                              "ROSE_GOLD",
                              "ARCTIC_BLUE",
                              "GRAPHITE",
                            ].includes(o)
                          }
                        >
                          {o.replaceAll("_", " ").toLowerCase()}
                          {!hasSupporter &&
                          [
                            "GOLD",
                            "JADE",
                            "ROSE_GOLD",
                            "ARCTIC_BLUE",
                            "GRAPHITE",
                          ].includes(o)
                            ? " · supporter"
                            : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={String(value)}
                      type={
                        field.type === "string" || field.type === "stringset"
                          ? "text"
                          : "number"
                      }
                      onChange={(e) =>
                        update(
                          field.type === "stringset"
                            ? e.target.value
                                .split(",")
                                .map((v) => v.trim())
                                .filter(Boolean)
                            : field.type === "string"
                              ? e.target.value
                              : Number(e.target.value),
                        )
                      }
                    />
                  )}
                </label>
              );
            })}
            {group === "Appearance" && (
              <GradientEditor
                allowGradient={hasSupporter}
                features={features}
                onChange={(next) => {
                  setFeatures(next);
                  setRaw(JSON.stringify(next, null, 2));
                  setDirty(true);
                }}
              />
            )}
          </>
        )}
      </section>
    </>
  );
}
function GradientEditor({
  features,
  onChange,
  allowGradient,
}: {
  allowGradient: boolean;
  features: Settings["features"];
  onChange: (next: Settings["features"]) => void;
}) {
  const feature = features.theme_settings as
    Record<string, { value: string }> | undefined;
  let colors = ["#d6c5a3", "#b4cfa5", "#9db8c9"];
  try {
    const parsed = JSON.parse(feature?.custom_theme_colors?.value || "{}");
    if (Array.isArray(parsed.colors) && parsed.colors.length === 3)
      colors = parsed.colors;
  } catch {}
  // The app serialises its three #RRGGBB colours as a comma-separated hexadecimal string.
  const stored = feature?.custom_theme_colors?.value;
  if (stored?.includes(","))
    colors = stored.split(",").map((c) => `#${c.trim().slice(-6)}`);
  if (!allowGradient) colors = [colors[1], colors[1], colors[1]];
  return (
    <div className="gradient-editor">
      <div>
        <b>Your own gradient</b>
        <p>
          {allowGradient
            ? "Choose three colours, then select the custom theme."
            : "Supporter status unlocks three-colour gradients. You can choose a solid custom colour."}
        </p>
      </div>
      <div
        className="gradient-preview"
        style={{ background: `linear-gradient(110deg,${colors.join(",")})` }}
      />
      {(allowGradient ? colors : [colors[1]]).map((c, i) => (
        <input
          aria-label={`Gradient colour ${i + 1}`}
          key={i}
          type="color"
          value={c}
          onChange={(e) => {
            const next = allowGradient
              ? [...colors]
              : [e.target.value, e.target.value, e.target.value];
            if (allowGradient) next[i] = e.target.value;
            let updated = patchPreference(
              features,
              {
                feature: "theme_settings",
                key: "custom_theme_colors",
                type: "string",
              },
              next.map((c) => `#${c.slice(1).toUpperCase()}`).join(","),
            );
            updated = patchPreference(
              updated,
              {
                feature: "theme_settings",
                key: "selected_theme",
                type: "string",
              },
              "CUSTOM",
            );
            onChange(updated);
          }}
        />
      ))}
    </div>
  );
}

function SupporterStatus() {
  const [access, setAccess] = useState<Row | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    rpc<Row[]>("get_my_membership_overview")
      .then((rows) => setAccess(rows[0] || {}))
      .catch((e) => setError(errorMessage(e)));
  }, []);
  return (
    <>
      <Message error>{error}</Message>
      <section className="surface">
        <Heart size={27} />
        <h2 style={{ marginTop: 20 }}>A little extra, from the creator.</h2>
        <p>
          Supporter status is granted directly by Anivio’s creator. There are no
          subscriptions or automatic charges.
        </p>
        {!access && !error ? (
          <Loading />
        ) : (
          <>
            <span
              className={`connection ${access?.status === "active" ? "connected" : ""}`}
            >
              {access?.status === "active"
                ? String(access.tier).replaceAll("_", " ").toLowerCase()
                : "Standard account"}
            </span>
            {access?.status === "active" && (
              <p style={{ marginTop: 20 }}>
                {access.grant_expires_at
                  ? `Access until ${new Date(String(access.grant_expires_at)).toLocaleDateString()}`
                  : "No expiry set."}{" "}
                Gradient themes are available in the app and in your web
                preferences.
              </p>
            )}
          </>
        )}
      </section>
    </>
  );
}
function SupporterAdmin() {
  const [member, setMember] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [email, setEmail] = useState("");
  async function search(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const rows = await rpc<Row[]>("admin_find_member", {
        p_email: email.trim(),
      });
      setMember(rows[0] || null);
      if (!rows.length) setMessage("No Anivio account matches that email.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function grant(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!member) return;
    const values = new FormData(e.currentTarget);
    const tier = String(values.get("tier")),
      expiry = String(values.get("expiry") || "");
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await rpc("admin_set_supporter", {
        p_user_id: member.user_id,
        p_tier: tier === "STANDARD" ? null : tier,
        p_expires_at:
          tier === "STANDARD"
            ? null
            : expiry
              ? new Date(expiry).toISOString()
              : null,
        p_reason: String(values.get("reason") || ""),
      });
      const rows = await rpc<Row[]>("admin_find_member", {
        p_email: email.trim(),
      });
      setMember(rows[0] || null);
      dispatchEvent(new Event("anivio-access-updated"));
      setMessage(
        "Supporter access updated. The app refreshes access periodically, or after signing in again.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="surface">
        <div className="eyebrow">
          <Shield size={14} /> Creator controls
        </div>
        <h2>You decide who gets a little extra.</h2>
        <p>
          Find an existing Anivio account by its exact email. Supporter grants
          never change administrator permissions.
        </p>
        <form onSubmit={search} className="source-form">
          <Field
            name="email"
            type="email"
            label="Account email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button busy={busy}>
            Find account <Search size={16} />
          </Button>
        </form>
      </section>
      <Message error>{error}</Message>
      <Message>{message}</Message>
      {member && (
        <section className="surface">
          <h2>{String(member.email)}</h2>
          <p>
            Current status:{" "}
            {member.tier
              ? String(member.tier).replaceAll("_", " ").toLowerCase()
              : "standard"}
          </p>
          <form
            key={
              String(member.user_id) +
              String(member.tier) +
              String(member.expires_at)
            }
            onSubmit={grant}
          >
            <label className="field">
              <span>Access tier</span>
              <select
                name="tier"
                defaultValue={String(member.tier || "STANDARD")}
              >
                <option value="STANDARD">
                  Standard — remove supporter access
                </option>
                <option value="SUPPORTER">Supporter</option>
                <option value="SUPPORTER_PLUS">Supporter Plus</option>
              </select>
            </label>
            <Field
              name="expiry"
              label="Expiry (optional; leave blank for no expiry)"
              type="datetime-local"
              defaultValue={
                member.expires_at
                  ? new Date(
                      new Date(String(member.expires_at)).getTime() -
                        new Date(
                          String(member.expires_at),
                        ).getTimezoneOffset() *
                          60000,
                    )
                      .toISOString()
                      .slice(0, 16)
                  : ""
              }
            />
            <Field
              name="reason"
              label="Private note (optional)"
              maxLength={500}
              defaultValue={String(member.reason || "")}
            />
            <Button busy={busy} className="primary">
              Update access <Check size={17} />
            </Button>
          </form>
        </section>
      )}
      <CollectionReview />
    </>
  );
}

function MediaData({ kind, profileId }: { kind: string; profileId: number }) {
  const requestId = useRef(0);
  const [rows, setRows] = useState<Row[]>([]),
    [artworkLoading, setArtworkLoading] = useState(false),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [query, setQuery] = useState(""),
    [editing, setEditing] = useState<Row | null>(null);
  const isProgress = kind === "watch_progress",
    isLibrary = kind === "library";
  const suffix = isLibrary
    ? "library_items"
    : kind === "watched"
      ? "watched_items"
      : "watch_progress";
  async function load() {
    const generation = ++requestId.current;
    setBusy(true);
    setError("");
    try {
      const values = await readMedia(kind, profileId);
      if (generation !== requestId.current) return;
      setRows(values.map((row) => presentMedia(row, undefined, undefined)));
      setBusy(false);
      setArtworkLoading(true);
      const library = isLibrary
        ? values
        : await readMedia("library", profileId).catch(() => []);
      const enriched = await enrichMedia(values, library);
      if (generation === requestId.current) setRows(enriched);
    } catch (e) {
      if (generation === requestId.current) setError(errorMessage(e));
    } finally {
      if (generation === requestId.current) {
        setBusy(false);
        setArtworkLoading(false);
      }
    }
  }
  useEffect(() => {
    load();
    return () => {
      requestId.current++;
    };
  }, [profileId, kind]);
  async function remove(row: Row) {
    if (!confirm("Remove this saved item?")) return;
    setBusy(true);
    try {
      await rpc(`sync_delete_${suffix}`, {
        ...profileParams(profileId),
        p_keys: [
          isProgress
            ? row.progress_key
            : isLibrary
              ? row.content_id
              : {
                  content_id: row.content_id,
                  season: row.season ?? null,
                  episode: row.episode ?? null,
                },
        ],
        ...clientParams(),
      });
      await load();
      setMessage("Item removed.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const item: Row = {
        ...editing,
        content_id: String(form.get("id")).trim(),
        content_type: String(form.get("type")),
      };
      if (!item.content_id) throw new Error("Enter a content ID.");
      if (isLibrary)
        Object.assign(item, {
          name: form.get("title"),
          poster: form.get("poster") || null,
          added_at: Date.now(),
        });
      else
        Object.assign(item, {
          season: form.get("season") ? Number(form.get("season")) : null,
          episode: form.get("episode") ? Number(form.get("episode")) : null,
        });
      if (isProgress) {
        const duration = Number(form.get("duration")) * 1000,
          position = Number(form.get("position")) * 1000;
        if (position > duration || position < 0 || duration <= 0)
          throw new Error(
            "Progress must be between zero and the episode duration.",
          );
        Object.assign(item, {
          video_id: form.get("video_id") || item.content_id,
          position,
          duration,
          last_watched: Date.now(),
        });
        item.progress_key =
          item.season != null && item.episode != null
            ? `${item.content_id}_s${item.season}e${item.episode}`
            : item.content_id;
      } else if (!isLibrary)
        Object.assign(item, {
          title: form.get("title"),
          watched_at: Date.now(),
        });
      await rpc(`sync_push_${suffix}`, {
        ...profileParams(profileId),
        [isProgress ? "p_entries" : "p_items"]: [item],
        ...clientParams(),
      });
      setEditing(null);
      await load();
      setMessage("Item saved.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const visible = rows.filter((r) =>
    String(r.displayTitle || r.name || r.title || r.content_id)
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <Message error>{error}</Message>
      <Message>{message}</Message>
      <section className="surface">
        <div className="surface-heading">
          <div>
            <h2>
              Your saved{" "}
              {isProgress ? "progress" : isLibrary ? "library" : "episodes"}
            </h2>
            <p>
              {rows.length} items in this profile.
              {artworkLoading ? " Finding titles and artwork…" : ""}
            </p>
          </div>
          <Button onClick={() => setEditing({})}>
            <Plus size={16} /> Add item
          </Button>
        </div>
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Search saved items"
            placeholder="Find a title or content ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {busy && !rows.length ? (
          <Loading />
        ) : !visible.length ? (
          <Empty title={query ? "No matches" : "Nothing here yet"}>
            {query
              ? "Try another title or ID."
              : "Your synced activity will appear here."}
          </Empty>
        ) : (
          <div className="data-list">
            {visible.map((r, i) => (
              <article
                className={`data-row media-row ${isProgress ? "progress-row" : ""}`}
                key={String(r.progress_key || r.content_id) + i}
              >
                <MediaArtwork row={r} landscape={isProgress} />
                <div>
                  <b>
                    {String(
                      r.displayTitle || r.name || r.title || "Untitled media",
                    )}
                  </b>
                  <small>
                    {r.season != null
                      ? `Season ${r.season} · Episode ${r.episode} · `
                      : ""}
                    {String(r.content_type || "")}
                  </small>
                  {isProgress && (
                    <>
                      {Number(r.duration) > 0 && (
                        <progress
                          max={Number(r.duration) || 1}
                          value={Number(r.position) || 0}
                        />
                      )}
                      <small>
                        {Math.floor(Number(r.position) / 60000)}
                        {Number(r.duration) > 0
                          ? ` / ${Math.floor(Number(r.duration) / 60000)} min`
                          : " min watched"}
                      </small>
                    </>
                  )}
                </div>
                <Button
                  className="small"
                  disabled={busy}
                  onClick={() => setEditing(r)}
                >
                  Edit
                </Button>
                <button
                  disabled={busy}
                  className="icon-button"
                  aria-label={`Remove ${r.displayTitle || r.name || r.title || r.content_id}`}
                  onClick={() => remove(r)}
                >
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
      {editing && (
        <Modal
          title={isProgress ? "Edit watch progress" : "Edit saved item"}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={save}>
            <Field
              label="Content ID"
              name="id"
              defaultValue={String(editing.content_id || "")}
              placeholder="anilist:… or tt…"
              required
            />
            <label className="field">
              <span>Type</span>
              <select
                name="type"
                defaultValue={String(editing.content_type || "series")}
              >
                <option value="series">Series</option>
                <option value="movie">Movie</option>
                <option value="anime">Anime</option>
              </select>
            </label>
            {!isProgress && (
              <Field
                label="Title"
                name="title"
                defaultValue={String(editing.name || editing.title || "")}
                required
              />
            )}
            {isLibrary ? (
              <Field
                label="Poster URL"
                name="poster"
                defaultValue={String(editing.poster || "")}
              />
            ) : (
              <div className="form-grid">
                <Field
                  label="Season"
                  name="season"
                  type="number"
                  min={0}
                  defaultValue={
                    editing.season == null ? "" : Number(editing.season)
                  }
                />
                <Field
                  label="Episode"
                  name="episode"
                  type="number"
                  min={0}
                  defaultValue={
                    editing.episode == null ? "" : Number(editing.episode)
                  }
                />
              </div>
            )}
            {isProgress && (
              <>
                <Field
                  label="Video ID"
                  name="video_id"
                  defaultValue={String(editing.video_id || "")}
                />
                <div className="form-grid">
                  <Field
                    label="Position (seconds)"
                    name="position"
                    type="number"
                    min={0}
                    defaultValue={Number(editing.position || 0) / 1000}
                    required
                  />
                  <Field
                    label="Duration (seconds)"
                    name="duration"
                    type="number"
                    min={1}
                    defaultValue={Number(editing.duration || 0) / 1000}
                    required
                  />
                </div>
              </>
            )}
            <Button className="primary full" busy={busy}>
              Save item
            </Button>
            <Message error>{error}</Message>
          </form>
        </Modal>
      )}
    </>
  );
}

function MediaArtwork({ row, landscape }: { row: Row; landscape: boolean }) {
  const url = safeUrl(
    (landscape && row.displayBackground) || row.displayPoster,
  );
  const [failed, setFailed] = useState<string | undefined>();
  return (
    <span
      className={`media-artwork ${landscape && row.displayBackground ? "landscape" : "poster"}`}
    >
      {url && failed !== url ? (
        <img
          src={url}
          loading="lazy"
          alt={`${row.displayTitle || "Anime"} artwork`}
          onError={() => setFailed(url)}
        />
      ) : (
        <BookOpen size={22} />
      )}
    </span>
  );
}
function Collections({ profileId }: { profileId: number }) {
  const [items, setItems] = useState<Row[]>([]),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [editing, setEditing] = useState<Row | null>(null),
    [document, setDocument] = useState("");
  useEffect(() => {
    rpc<{ collections_json: Row[] }[]>(
      "sync_pull_collections",
      profileParams(profileId),
    )
      .then((rows) => setItems(rows[0]?.collections_json || []))
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setBusy(false));
  }, [profileId]);
  async function save(next: Row[]) {
    setBusy(true);
    setError("");
    try {
      await rpc("sync_push_collections", {
        ...profileParams(profileId),
        p_collections_json: next,
        ...clientParams(),
      });
      setItems(next);
      setEditing(null);
      setMessage("Collections saved.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function edit(item: Row) {
    setEditing(item);
    setDocument(JSON.stringify(item, null, 2));
  }
  return (
    <>
      <Message error>{error}</Message>
      <Message>{message}</Message>
      <section className="surface">
        <div className="surface-heading">
          <div>
            <h2>Curate your own corners.</h2>
            <p>Collections and their folders sync with the app.</p>
          </div>
          <Button
            onClick={() =>
              edit({
                id: crypto.randomUUID(),
                title: "My collection",
                folders: [],
                pinToTop: false,
                viewMode: "TABBED_GRID",
                showAllTab: true,
              })
            }
          >
            <Plus size={17} /> New collection
          </Button>
        </div>
        {busy && !items.length ? (
          <Loading />
        ) : !items.length ? (
          <Empty title="Make room for a favourite">
            Create a collection, then add folders and catalog sources.
          </Empty>
        ) : (
          items.map((item) => (
            <div key={String(item.id)} className="source-row">
              <BookOpen size={23} />
              <div>
                <b>{String(item.title)}</b>
                <small>
                  {Array.isArray(item.folders) ? item.folders.length : 0}{" "}
                  folders
                </small>
              </div>
              <Button onClick={() => edit(item)}>Edit</Button>
              <button
                className="icon-button"
                aria-label={`Delete ${item.title}`}
                onClick={() => {
                  if (confirm(`Delete ${item.title}?`))
                    save(items.filter((r) => r.id !== item.id));
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </section>
      {editing && (
        <Modal title="Edit collection" onClose={() => setEditing(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                const next = JSON.parse(document);
                if (!next.id || !next.title || !Array.isArray(next.folders))
                  throw new Error(
                    "A collection needs an id, title, and folders array.",
                  );
                save(
                  items.some((i) => i.id === editing.id)
                    ? items.map((i) => (i.id === editing.id ? next : i))
                    : [...items, next],
                );
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            <CollectionBuilder value={document} onChange={setDocument} />
            <details className="advanced-document">
              <summary>Advanced collection document</summary>
              <label className="field">
                <span>Collection JSON</span>
                <textarea
                  className="code-editor"
                  rows={18}
                  value={document}
                  onChange={(e) => setDocument(e.target.value)}
                />
              </label>
            </details>
            <Button busy={busy} className="primary full">
              Save collection
            </Button>
            <Message error>{error}</Message>
          </form>
        </Modal>
      )}
    </>
  );
}

function Integrations({ profileId }: { profileId: number }) {
  const [rows, setRows] = useState<Row[]>([]),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    rpc<Row[]>("sync_pull_provider_credentials", profileParams(profileId))
      .then(setRows)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setBusy(false));
  }, [profileId]);
  const providers = [
    ["tmdb", "TMDB", "Artwork and metadata", "api_key"],
    ["mdblist", "MDBList", "Ratings and curated lists", "api_key"],
    ["animeskip", "AnimeSkip", "Community skip markers", "client_id"],
    ["introdb", "IntroDB", "Intro, recap, and outro markers", "api_key"],
    ["anilist", "AniList", "Your anime list and episode progress", "api_key"],
    ["debrid:realdebrid", "Real-Debrid", "Your own cloud links", "api_key"],
    ["debrid:premiumize", "Premiumize", "Your own cloud links", "api_key"],
    ["debrid:torbox", "TorBox", "Your own cloud links", "api_key"],
  ];
  async function save(
    e: FormEvent<HTMLFormElement>,
    provider: string,
    field: string,
  ) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = e.currentTarget;
    try {
      const user = (await supabase!.auth.getUser()).data.user;
      if (!user) throw new Error("Sign in again to continue.");
      const value = String(new FormData(form).get("key") || "").trim();
      const encrypted = await encryptCredential(value, user.id);
      const next = rows.filter(
        (r) =>
          r.provider !== provider &&
          (provider !== "anilist" || r.provider !== "anilist:meta"),
      );
      next.push({ provider, credential_json: { [field]: encrypted } });
      if (provider === "anilist") {
        const response = await fetch("https://graphql.anilist.co", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + value,
          },
          body: JSON.stringify({
            query: "query { Viewer { id name bannerImage avatar { large } } }",
          }),
          signal: AbortSignal.timeout(15000),
        });
        const payload = await response.json();
        const viewer = payload.data?.Viewer;
        if (!response.ok || !viewer)
          throw new Error("AniList did not accept this access token.");
        const metadata = JSON.stringify({
          accountId: viewer.id,
          username: viewer.name,
          avatarUrl: viewer.avatar?.large || null,
          bannerUrl: viewer.bannerImage || null,
        });
        next.push({
          provider: "anilist:meta",
          credential_json: {
            payload: await encryptCredential(metadata, user.id),
          },
        });
      }
      await rpc("sync_push_provider_credentials", {
        ...profileParams(profileId),
        p_credentials: next,
        ...clientParams(),
      });
      setRows(next);
      form.reset();
      setMessage("Integration saved. Refresh the app to sync it.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Message error>{error}</Message>
      <Message>{message}</Message>
      <div className="info-strip">
        <Shield size={20} />
        <p>
          Keys use the same encrypted wire format as the app. They stay masked
          here. Connect OAuth services such as Discord, Trakt, and Simkl in the
          app so those services can show their permission screens.
        </p>
      </div>
      {busy && !rows.length ? (
        <Loading />
      ) : (
        <div className="integration-grid">
          {providers.map(([id, name, description, field]) => {
            const row = rows.find((r) => r.provider === id),
              credential = row?.credential_json as Row | undefined;
            return (
              <section className="surface" key={id}>
                <div className="surface-heading">
                  <h2>{name}</h2>
                  <span
                    className={`connection ${credential?.[field] ? "connected" : ""}`}
                  >
                    {credential?.[field] ? "Saved" : "Not connected"}
                  </span>
                </div>
                <p>{description}</p>
                <form onSubmit={(e) => save(e, id, field)}>
                  <Field
                    label={
                      field === "client_id"
                        ? "Client ID"
                        : id === "anilist"
                          ? "AniList access token"
                          : "API key"
                    }
                    type="password"
                    name="key"
                    autoComplete="off"
                    placeholder={
                      credential?.[field]
                        ? "Replace saved credential"
                        : "Paste your credential"
                    }
                    required
                  />
                  <Button busy={busy}>Save credential</Button>
                </form>
                {Boolean(credential?.[field]) && (
                  <button
                    className="text-link danger-text"
                    onClick={async () => {
                      if (!confirm(`Remove the saved ${name} credential?`))
                        return;
                      setBusy(true);
                      try {
                        const next = rows.map((r) =>
                          r.provider === id
                            ? { ...r, credential_json: { [field]: "" } }
                            : id === "anilist" && r.provider === "anilist:meta"
                              ? { ...r, credential_json: { payload: "" } }
                              : r,
                        );
                        await rpc("sync_push_provider_credentials", {
                          ...profileParams(profileId),
                          p_credentials: next,
                          ...clientParams(),
                        });
                        setRows(next);
                        setMessage("Credential removed.");
                      } catch (e) {
                        setError(errorMessage(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Remove saved credential
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function Devices() {
  const [rows, setRows] = useState<Row[]>([]),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  async function load() {
    setBusy(true);
    setError("");
    try {
      setRows(await rpc("list_my_sessions"));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <Message error>{error}</Message>
      <section className="surface">
        <div className="surface-heading">
          <div>
            <h2>Your account, on your screens.</h2>
            <p>Sign out a device you no longer use.</p>
          </div>
          <Link className="button" href="/link">
            <Link2 size={17} /> Link device
          </Link>
        </div>
        {busy ? (
          <Loading />
        ) : !rows.length ? (
          <Empty title="No registered devices">
            New sign-ins will appear here once registered.
          </Empty>
        ) : (
          rows.map((row, i) => (
            <div className="source-row" key={String(row.session_id || i)}>
              <Monitor size={25} />
              <div>
                <b>{String(row.device_name || row.client_name || "Device")}</b>
                <small>
                  {String(row.platform || "")} · Last active{" "}
                  {row.last_seen_at
                    ? new Date(String(row.last_seen_at)).toLocaleString()
                    : "unknown"}
                </small>
              </div>
              {Boolean(row.is_current) && (
                <span className="connection connected">This device</span>
              )}
              <Button
                disabled={busy}
                onClick={async () => {
                  if (!confirm("Sign this device out?")) return;
                  setBusy(true);
                  try {
                    await rpc("revoke_my_session", {
                      p_session_id: row.session_id,
                    });
                    if (row.is_current) {
                      await supabase?.auth.signOut({ scope: "local" });
                      navigate("/account/login");
                    } else await load();
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Sign out
              </Button>
            </div>
          ))
        )}
      </section>
    </>
  );
}
function Security({ session }: { session: Session }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      await action();
    } catch (e) {
      setError(true);
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Message error={error}>{message}</Message>
      <section className="surface">
        <h2>Account details</h2>
        <p>Signed in as {session.user.email}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            perform(async () => {
              const r = await supabase!.auth.updateUser(
                { email: String(f.get("email")).trim() },
                { emailRedirectTo: `${location.origin}/account` },
              );
              if (r.error) throw r.error;
              setMessage("Check your email to confirm the address change.");
            });
          }}
        >
          <Field
            name="email"
            label="New email address"
            type="email"
            required
            autoComplete="email"
          />
          <Button busy={busy}>Update email</Button>
        </form>
      </section>
      <section className="surface">
        <h2>Password & sessions</h2>
        <p>Use a unique password and sign out devices you don’t recognise.</p>
        <div className="card-actions">
          <Button
            busy={busy}
            onClick={() =>
              perform(async () => {
                const r = await supabase!.auth.resetPasswordForEmail(
                  session.user.email!,
                  { redirectTo: origin() },
                );
                if (r.error) throw r.error;
                setMessage("Password reset email requested.");
              })
            }
          >
            Send password reset email
          </Button>
          <Button
            busy={busy}
            onClick={() =>
              perform(async () => {
                if (!confirm("Sign out all your other devices?")) return;
                const r = await supabase!.auth.signOut({ scope: "others" });
                if (r.error) throw r.error;
                setMessage("Other sessions signed out.");
              })
            }
          >
            Sign out other devices
          </Button>
        </div>
      </section>
      <section className="surface danger-zone">
        <h2>Delete account</h2>
        <p>
          This permanently deletes your account and synced data. Download a
          backup first.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (new FormData(e.currentTarget).get("confirmation") !== "DELETE")
              return;
            perform(async () => {
              if (
                !confirm(
                  "Permanently delete your Anivio account and all synced data?",
                )
              )
                return;
              const r = await supabase!.functions.invoke("delete-account", {
                body: { confirmation: "DELETE" },
              });
              if (r.error) throw r.error;
              await supabase!.auth.signOut({ scope: "local" });
              navigate("/");
            });
          }}
        >
          <Field
            label="Type DELETE to confirm"
            name="confirmation"
            pattern="DELETE"
            required
            autoComplete="off"
          />
          <Button busy={busy} className="danger">
            Permanently delete my account
          </Button>
        </form>
      </section>
    </>
  );
}

function Backup({ profiles }: { profiles: Profile[] }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false),
    [pending, setPending] = useState<Record<string, unknown> | null>(null);
  async function exportBackup() {
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      const data = [];
      for (const profile of profiles) {
        const id = profile.profile_index;
        const [
          settings,
          addons,
          plugins,
          collections,
          progress,
          library,
          watched,
        ] = await Promise.all([
          getSettings(id),
          rpc("sync_pull_addons", profileParams(id)),
          rpc("sync_pull_plugins", profileParams(id)),
          rpc("sync_pull_collections", profileParams(id)),
          readMedia("watch_progress", id),
          readMedia("library", id),
          readMedia("watched", id),
        ]);
        data.push({
          profile: profilePayload(profile),
          settings: backupSettings(settings.settings_json),
          addons,
          plugins,
          collections,
          progress,
          library,
          watched,
        });
      }
      downloadJson(
        `anivio-backup-${new Date().toISOString().slice(0, 10)}.json`,
        {
          format: "anivio-web-backup",
          version: 1,
          exportedAt: new Date().toISOString(),
          profiles: data,
        },
      );
      setMessage(
        "Backup downloaded. Keep it private; it includes source URLs and saved preferences. Provider credentials and profile PINs are excluded.",
      );
    } catch (e) {
      setError(true);
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (
      !pending ||
      !confirm(
        "Merge this backup into the matching profile numbers? Saved preferences and source lists in those profiles will be replaced.",
      )
    )
      return;
    setBusy(true);
    setError(false);
    try {
      for (const entry of pending.profiles as Row[]) {
        const profile = entry.profile as Profile,
          id = profile.profile_index;
        if (!Number.isInteger(id) || id < 1 || id > 6)
          throw new Error("Invalid profile in backup.");
        await rpc("sync_push_profiles", {
          p_profiles: [profilePayload(profile)],
          p_client_max_profiles: 6,
          ...clientParams(),
        });
        const latest = await getSettings(id);
        await saveSettings(
          id,
          (entry.settings as Settings).features,
          latest.updated_at,
        );
        for (const kind of ["addons", "plugins"])
          await rpc(`sync_push_${kind}`, {
            ...profileParams(id),
            [`p_${kind}`]: entry[kind] || [],
            ...clientParams(),
          });
        const collections = entry.collections as Row[];
        await rpc("sync_push_collections", {
          ...profileParams(id),
          p_collections_json: collections?.[0]?.collections_json || [],
          ...clientParams(),
        });
        for (const [source, suffix, param] of [
          ["progress", "watch_progress", "p_entries"],
          ["library", "library_items", "p_items"],
          ["watched", "watched_items", "p_items"],
        ])
          await rpc(`sync_push_${suffix}`, {
            ...profileParams(id),
            [param]: entry[source] || [],
            ...clientParams(),
          });
      }
      setPending(null);
      setMessage("Backup restored. Refresh profiles and open Anivio to sync.");
    } catch (e) {
      setError(true);
      setMessage(
        `Restore stopped: ${errorMessage(e)}. Already completed profile updates were kept; you can retry the same backup.`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Message error={error}>{message}</Message>
      <section className="surface">
        <Download size={27} />
        <h2>A copy, just in case.</h2>
        <p>
          Export your profiles, sources, collections, library, watched history,
          progress, and app preferences.
        </p>
        <Button className="primary" busy={busy} onClick={exportBackup}>
          Download backup <ArrowDown size={17} />
        </Button>
      </section>
      <section className="surface">
        <h2>Bring your data back.</h2>
        <p>Choose an Anivio web backup. You can review it before restoring.</p>
        <label className="field">
          <span>Backup file</span>
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={async (e) => {
              try {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 10 * 1024 * 1024)
                  throw new Error("Backup must be smaller than 10 MB.");
                setPending(validateBackup(JSON.parse(await file.text())));
                setMessage("Backup ready for review.");
                setError(false);
              } catch (e) {
                setError(true);
                setMessage(errorMessage(e));
              }
            }}
          />
        </label>
        {pending && (
          <div>
            <p>
              {(pending.profiles as unknown[]).length} profiles · Created{" "}
              {String(pending.exportedAt || "unknown")}
            </p>
            <Button busy={busy} onClick={restore}>
              Restore this backup
            </Button>
          </div>
        )}
      </section>
    </>
  );
}
function PartyInvite({ code }: { code: string | null }) {
  const [copyStatus, setCopyStatus] = useState("");
  const partyCode = (code ?? "").replace(/[\s-]/g, "").toUpperCase();
  const valid = /^[A-HJ-NP-Z2-9]{6}$/.test(partyCode);

  return (
    <section className="narrow shell section">
      <h1>Join a Watch Party</h1>
      <div className="surface">
        {valid ? (
          <>
            <div className="device-preview">
              <Users size={24} aria-hidden="true" />
              <div>
                <p>Party code</p>
                <strong>{partyCode.slice(0, 3)} {partyCode.slice(3)}</strong>
              </div>
            </div>
            <div className="hero-actions">
              <a className="button primary" href={`anivio://party/${partyCode}`}>
                Open Anivio <ArrowUpRight size={17} />
              </a>
              <button
                type="button"
                className="button ghost"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(partyCode);
                    setCopyStatus("Party code copied.");
                  } catch {
                    setCopyStatus("Select the party code above to copy it.");
                  }
                }}
              >
                Copy code
              </button>
            </div>
            <Message>{copyStatus}</Message>
            <p>You can also enter the code in Settings → Watch Party in the app.</p>
            <a className="text-link" href={`${repo}/releases/latest`} rel="noreferrer">
              Download Anivio <ArrowUpRight size={15} />
            </a>
          </>
        ) : (
          <p>This link needs a valid party code. Ask the host for a new invite.</p>
        )}
      </div>
    </section>
  );
}
function DeviceLink({ session }: { session: Session | null }) {
  const [preview, setPreview] = useState<Row | null>(null);
  const [code, setCode] = useState(
      new URLSearchParams(location.search).get("code") || "",
    ),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false);
  return (
    <section className="narrow shell section">
      <div className="eyebrow">Your account / Link a device</div>
      <h1>
        A new screen.
        <br />
        The same you.
      </h1>
      <p>Enter the code shown by Anivio on the device you want to sign in.</p>
      <div className="surface">
        {!session ? (
          <>
            <p>Sign in to your Anivio account before approving a device.</p>
            <Link
              className="button primary"
              href={`/account/login?next=${encodeURIComponent("/link" + (code ? "?code=" + encodeURIComponent(code) : ""))}`}
            >
              Log in to continue <ArrowRight size={17} />
            </Link>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(false);
              try {
                if (!preview) {
                  const rows = await rpc<Row[]>(
                    "preview_device_login_session",
                    {
                      p_user_code: code.replace(/[\s-]/g, "").toUpperCase(),
                    },
                  );
                  if (!rows?.[0])
                    throw new Error(
                      "Code expired or not found. Request a new code on your device.",
                    );
                  setPreview(rows[0]);
                  setMessage("");
                  return;
                }
                await rpc("approve_tv_login_session", {
                  p_user_code: code.replace(/[\s-]/g, "").toUpperCase(),
                });
                setMessage("Device approved. Return to Anivio on that device.");
                setPreview(null);
              } catch (e) {
                setError(true);
                setMessage(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field
              label="Device code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setPreview(null);
                setMessage("");
              }}
              required
              minLength={4}
              maxLength={20}
              autoComplete="off"
              placeholder="ABCD 1234"
            />
            {preview && (
              <div className="device-preview">
                <Monitor size={24} />
                <div>
                  <b>{String(preview.device_name)}</b>
                  <p>
                    {String(preview.device_type)} · Approval expires{" "}
                    {new Date(String(preview.expires_at)).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            )}
            <p className="fine-print">
              Approve only a code shown on a device you’re signing in yourself.
            </p>
            <Button busy={busy} className="primary">
              {preview ? "Approve sign-in on this device" : "Review device"}
            </Button>
          </form>
        )}
        <Message error={error}>{message}</Message>
      </div>
    </section>
  );
}

type Release = {
  id: number;
  name: string;
  tag_name: string;
  body: string;
  html_url: string;
  published_at: string;
  prerelease: boolean;
  assets: { name: string; browser_download_url: string }[];
};
function ReleaseNews() {
  const [rows, setRows] = useState<Release[]>([]),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [beta, setBeta] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(releaseApi, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            "GitHub release information is unavailable right now.",
          );
        return r.json();
      })
      .then(setRows)
      .catch((e) => {
        if (e.name !== "AbortError") setError(errorMessage(e));
      })
      .finally(() => setBusy(false));
    return () => controller.abort();
  }, []);
  return (
    <>
      <div className="surface-heading">
        <p>Release notes, fixes, and the occasional new favourite feature.</p>
        <label className="check-field">
          <input
            type="checkbox"
            checked={beta}
            onChange={(e) => setBeta(e.target.checked)}
          />
          <span>Include beta releases</span>
        </label>
      </div>
      <Message error>{error}</Message>
      {busy ? (
        <Loading />
      ) : (
        rows
          .filter((r) => beta || !r.prerelease)
          .map((r) => (
            <article className="surface release-card" key={r.id}>
              <div className="eyebrow">
                {new Date(r.published_at).toLocaleDateString(undefined, {
                  dateStyle: "long",
                })}{" "}
                {r.prerelease ? "· Beta" : ""}
              </div>
              <h2>{r.name || r.tag_name}</h2>
              <div className="release-notes">
                <Markdown>
                  {r.body?.replace(/<!--.*?-->/gs, "") ||
                    "See the release on GitHub for details."}
                </Markdown>
              </div>
              <div className="card-actions">
                {r.assets
                  .filter((a) => /\.(apk|exe)$/i.test(a.name))
                  .map((a) => (
                    <a
                      className="button primary"
                      href={a.browser_download_url}
                      key={a.name}
                    >
                      <Download size={16} />
                      {a.name}
                    </a>
                  ))}
                <a className="button ghost" href={r.html_url}>
                  View release <ArrowUpRight size={16} />
                </a>
              </div>
            </article>
          ))
      )}
      {!busy && !error && !rows.filter((r) => beta || !r.prerelease).length && (
        <Empty title="No releases in this channel yet">
          Enable beta releases or <a href={`${repo}/releases`}>browse GitHub</a>
          .
        </Empty>
      )}
    </>
  );
}
const faqs = [
  [
    "Does Anivio provide streams?",
    "Anivio is a player and organiser. Install your own trusted sources and access only media you’re authorised to watch.",
  ],
  [
    "Can I use my app account here?",
    "Yes. The website uses Anivio’s account backend. Select your profile to manage its synced data. Your AniList account is a separate connected service.",
  ],
  [
    "Why aren’t my latest settings showing?",
    "Open the app while signed in and connected, allow it to sync, then refresh the website. Device-only settings are kept on the device.",
  ],
  [
    "Does enhancement turn every video into 4K?",
    "No. Optional Anime4K modes process video on your device. Output depends on the video, display, selected resolution, and available GPU memory.",
  ],
  [
    "Can I read manga too?",
    "Yes. Anivio includes a manga reader, reading preferences, progress, and downloads.",
  ],
  [
    "Can I build it myself?",
    "Yes. The application source is available on GitHub under GNU GPLv3.",
  ],
];
function PublicPage({ path }: { path: string }) {
  const titles: Record<string, [string, string]> = {
    "/news": ["A little better, every release.", "What’s new"],
    "/docs": ["Start with a story.", "Getting started"],
    "/faq": ["Good questions. Clear answers.", "The essentials"],
    "/support": ["Built together. Better together.", "The project"],
    "/contact": ["Let’s make it better.", "Get in touch"],
    "/privacy-policy": ["Your space. Your data.", "Privacy"],
    "/terms": ["A few things to know.", "Terms & acknowledgements"],
    "/account-deletion": ["You’re always in control.", "Account deletion"],
  };
  const title = titles[path];
  if (!title)
    return (
      <section className="shell section narrow">
        <h1>A page less travelled.</h1>
        <p>This page doesn’t exist.</p>
        <Link className="button primary" href="/">
          Back home
        </Link>
      </section>
    );
  return (
    <section className={`shell section ${path === "/news" ? "" : "narrow"}`}>
      <div className="eyebrow">{title[1]}</div>
      <h1 className="page-title">{title[0]}</h1>
      {path === "/news" ? (
        <ReleaseNews />
      ) : path === "/faq" ? (
        <div className="faq-list">
          {faqs.map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <Plus size={17} />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      ) : path === "/docs" ? (
        <div className="prose">
          <p>Get from install to your first episode in a few simple steps.</p>
          {[
            [
              "01",
              "Get the app",
              <>
                Find the <a href="/#download">Windows x64 installer</a> or get the{" "}
                <a href={`${repo}/releases/latest`}>latest Android APK</a>. iOS builds are available from source.
              </>,
            ],
            [
              "02",
              "Make it yours",
              <>
                Sign in or create an account, pick a profile, and choose a
                theme. Each profile keeps its own preferences.
              </>,
            ],
            [
              "03",
              "Connect your sources",
              <>
                Open Settings → Content & Discovery to install trusted addons
                and plugin repositories. You can also manage these in your{" "}
                <Link href="/account">web dashboard</Link>.
              </>,
            ],
            [
              "04",
              "Connect your lists",
              <>
                Link AniList inside the app to update anime status and episode
                progress. Other tracking services are available in Settings →
                Tracking.
              </>,
            ],
            [
              "05",
              "Find your next favourite",
              <>
                Browse seasonal anime, search for a title, or open the manga
                tab. Select a source to begin watching or reading.
              </>,
            ],
          ].map(([num, name, body]) => (
            <article className="doc-step" key={String(num)}>
              <span>{num}</span>
              <div>
                <h2>{name}</h2>
                <p>{body}</p>
              </div>
            </article>
          ))}
          <Link className="button" href="/faq">
            More questions <ArrowRight size={16} />
          </Link>
        </div>
      ) : path === "/support" ? (
        <div className="prose">
          <p>
            Anivio is created by{" "}
            <a href="https://github.com/mdtahseen7">Tahseen</a>, with help from
            open-source contributors and a foundation built by the Nuvio team.
          </p>
          <h2>Small contributions make a difference.</h2>
          <p>
            Report a reproducible bug, suggest an improvement, help with
            translations, or send a patch. You can support the original Nuvio
            project through its own website.
          </p>
          <div className="card-actions">
            <a href={`${repo}/issues`} className="button primary">
              Share an idea <ArrowUpRight size={16} />
            </a>
            <a href="https://nuvio.tv/support" className="button ghost">
              Support Nuvio <Heart size={16} />
            </a>
          </div>
        </div>
      ) : path === "/contact" ? (
        <div className="prose">
          <p>
            Have a bug report or an idea for Anivio? Start with the project’s
            GitHub issue tracker.
          </p>
          <a className="button primary" href={`${repo}/issues`}>
            Open an issue <ArrowUpRight size={16} />
          </a>
          <h2>A useful bug report includes</h2>
          <p>
            Your app version, device model, a short list of steps to reproduce
            the problem, and what you expected to happen. Remove private tokens,
            passwords, and source URLs from logs before posting.
          </p>
        </div>
      ) : path === "/privacy-policy" ? (
        <div className="prose">
          <p>Last updated: November 2026.</p>
          <h2>What your account stores</h2>
          <p>
            Your email address and authentication session, profiles, saved
            preferences, installed source URLs, library, watched history,
            collections, progress, and connected provider credentials are stored
            in Anivio’s configured Supabase backend.
          </p>
          <h2>What stays in your browser</h2>
          <p>
            Your sign-in session, theme choice, and a random installation
            identifier are stored locally. Sign out to clear the local account
            session. This website does not add advertising or analytics
            trackers.
          </p>
          <h2>Third-party services</h2>
          <p>
            Downloads and release news come from GitHub. Images you choose for
            your profile load from their original URLs. Connected sources and
            integrations have their own policies. The hosting provider and
            backend may retain routine access and security logs.
          </p>
          <h2>Your choices</h2>
          <p>
            Export your data, remove saved entries, revoke sessions, or delete
            your account from Account & security. Provider credentials are
            excluded from exported backups.
          </p>
          <Link href="/account?tab=security">Manage your account →</Link>
        </div>
      ) : path === "/terms" ? (
        <div className="prose">
          <h2>A player for your own sources</h2>
          <p>
            Anivio does not host, store, or distribute video or manga content.
            You are responsible for the sources you connect and for using
            content you own or are authorised to access.
          </p>
          <h2>Open source</h2>
          <p>
            Anivio is a fork of{" "}
            <a href="https://github.com/NuvioMedia/NuvioMobile">Nuvio Mobile</a>
            , licensed under GNU GPLv3. Anime4K is developed by bloc97 and
            contributors. Other components keep their respective licences and
            credits in the source repository.
          </p>
          <h2>Availability</h2>
          <p>
            The project is provided as available, without warranties. Keep a
            backup of data that matters to you. Service availability and
            third-party APIs may change.
          </p>
          <h2>Third-party artwork and services</h2>
          <p>
            Anivio is not affiliated with or endorsed by AniList, TMDB, TVDB,
            Discord, or any source provider. Artwork and names belong to their
            respective owners.
          </p>
        </div>
      ) : (
        <div className="prose">
          <p>
            You can permanently delete your account and synced data from the
            account dashboard. This action cannot be undone.
          </p>
          <ol>
            <li>Sign in to the account you want to delete.</li>
            <li>Download a backup if you want to keep your data.</li>
            <li>
              Open Account & security, enter DELETE, and confirm account
              deletion.
            </li>
          </ol>
          <Link className="button danger" href="/account?tab=security">
            Account & security <ArrowRight size={16} />
          </Link>
          <p>If you cannot sign in, use the password reset flow first.</p>
        </div>
      )}
    </section>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
