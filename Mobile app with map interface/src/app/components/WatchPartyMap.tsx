import { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  X, Clock, Volume2, VolumeX, Eye, Tv2, Users, Info,
  Search, SlidersHorizontal, Star, ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Bar {
  id: number;
  name: string;
  address: string;
  neighborhood: string;
  lat: number;
  lng: number;
  image: string;
  screens: number;
  tvQuality: "SD" | "HD" | "4K";
  viewAngles: string;
  audioMode: "Full Blast" | "Muted w/ Captions" | "Low Background";
  walkInPolicy: string;
  standingRoomPolicy: string;
  community: {
    busyLevel: number;
    busyVotes: number;
    waitMinutes: number;
    waitVotes: number;
    ageRange: { label: string; pct: number }[];
    ageVotes: number;
    fanSplit: { team: string; emoji: string; pct: number; color: string }[];
    fanVotes: number;
  };
}

type FilterKey =
  | "busy:chill" | "busy:moderate" | "busy:veryBusy" | "busy:packed"
  | "audio:blast" | "audio:muted" | "audio:low"
  | "tv:4K" | "tv:HD"
  | "wait:nowait" | "wait:short" | "wait:long"
  | "walkin:yes"
  | "standing:yes"
  | "age:young" | "age:mixed" | "age:older"
  | "knicks:heavy";

interface FilterDef {
  key: FilterKey;
  label: string;
  emoji: string;
  group: string;
  match: (b: Bar) => boolean;
}

// ─── Filter definitions ────────────────────────────────────────────────────────
const FILTERS: FilterDef[] = [
  // Busyness
  { key: "busy:chill",    label: "Chill",      emoji: "😌", group: "Busyness", match: (b) => b.community.busyLevel < 50 },
  { key: "busy:moderate", label: "Moderate",   emoji: "🙂", group: "Busyness", match: (b) => b.community.busyLevel >= 50 && b.community.busyLevel < 70 },
  { key: "busy:veryBusy", label: "Very Busy",  emoji: "🔥", group: "Busyness", match: (b) => b.community.busyLevel >= 70 && b.community.busyLevel < 90 },
  { key: "busy:packed",   label: "Packed",     emoji: "🤯", group: "Busyness", match: (b) => b.community.busyLevel >= 90 },
  // Audio
  { key: "audio:blast",   label: "Full Blast", emoji: "🔊", group: "Audio",    match: (b) => b.audioMode === "Full Blast" },
  { key: "audio:muted",   label: "Muted+CC",   emoji: "🔇", group: "Audio",    match: (b) => b.audioMode === "Muted w/ Captions" },
  { key: "audio:low",     label: "Low Audio",  emoji: "🔉", group: "Audio",    match: (b) => b.audioMode === "Low Background" },
  // TV Quality
  { key: "tv:4K",         label: "4K TVs",     emoji: "📺", group: "TV",       match: (b) => b.tvQuality === "4K" },
  { key: "tv:HD",         label: "HD TVs",     emoji: "📺", group: "TV",       match: (b) => b.tvQuality === "HD" },
  // Wait
  { key: "wait:nowait",   label: "No Wait",    emoji: "⚡", group: "Wait",     match: (b) => b.community.waitMinutes === 0 },
  { key: "wait:short",    label: "Short Wait", emoji: "⏱", group: "Wait",     match: (b) => b.community.waitMinutes > 0 && b.community.waitMinutes <= 20 },
  { key: "wait:long",     label: "Long Wait",  emoji: "⏳", group: "Wait",     match: (b) => b.community.waitMinutes > 20 },
  // Admission
  { key: "walkin:yes",    label: "Walk-in",    emoji: "🚶", group: "Entry",    match: (b) => b.walkInPolicy.toLowerCase().includes("walk-in") },
  { key: "standing:yes",  label: "Standing OK",emoji: "🧍", group: "Entry",    match: (b) => !b.standingRoomPolicy.toLowerCase().includes("no standing") },
  // Age
  { key: "age:young",     label: "21–30 crowd",emoji: "🧑", group: "Age",      match: (b) => (b.community.ageRange.find(a => a.label === "21–30")?.pct ?? 0) >= 50 },
  { key: "age:mixed",     label: "Mixed ages", emoji: "👥", group: "Age",      match: (b) => { const max = Math.max(...b.community.ageRange.map(a => a.pct)); return max < 50; } },
  { key: "age:older",     label: "31+ crowd",  emoji: "🧔", group: "Age",      match: (b) => { const over30 = b.community.ageRange.filter(a => a.label !== "21–30").reduce((s,a)=>s+a.pct,0); return over30 >= 60; } },
  // Knicks loyalty
  { key: "knicks:heavy",  label: "Knicks Only",emoji: "🏀", group: "Fans",     match: (b) => (b.community.fanSplit.find(f=>f.team==="Knicks")?.pct ?? 0) >= 85 },
];

const FILTER_GROUPS = ["Busyness", "Audio", "TV", "Wait", "Entry", "Age", "Fans"];

// ─── Bar data ──────────────────────────────────────────────────────────────────
const BARS: Bar[] = [
  {
    id: 1, name: "Madison Square Tap Room", address: "34 W 34th St · Midtown", neighborhood: "Midtown",
    lat: 40.7505, lng: -73.9934,
    image: "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=600&h=400&fit=crop&auto=format",
    screens: 12, tvQuality: "4K", viewAngles: "Every seat has a sightline", audioMode: "Full Blast",
    walkInPolicy: "Walk-ins welcome until tip-off", standingRoomPolicy: "Standing room opens at max capacity",
    community: { busyLevel: 87, busyVotes: 142, waitMinutes: 25, waitVotes: 38, ageVotes: 91, fanVotes: 204,
      ageRange: [{ label:"21–30",pct:38},{label:"31–40",pct:34},{label:"41–55",pct:20},{label:"55+",pct:8}],
      fanSplit: [{team:"Knicks",emoji:"🏀",pct:78,color:"#F58426"},{team:"Celtics",emoji:"☘️",pct:22,color:"#007A33"}] },
  },
  {
    id: 2, name: "The Orange & Blue Pub", address: "148 W 25th St · Chelsea", neighborhood: "Chelsea",
    lat: 40.7462, lng: -73.9945,
    image: "https://images.unsplash.com/photo-1546622891-02c72c1537b6?w=600&h=400&fit=crop&auto=format",
    screens: 6, tvQuality: "HD", viewAngles: "Good from bar, obstructed near restrooms", audioMode: "Full Blast",
    walkInPolicy: "Reservations recommended after 7PM", standingRoomPolicy: "No standing room — fire code",
    community: { busyLevel: 63, busyVotes: 74, waitMinutes: 10, waitVotes: 29, ageVotes: 55, fanVotes: 88,
      ageRange: [{label:"21–30",pct:52},{label:"31–40",pct:30},{label:"41–55",pct:14},{label:"55+",pct:4}],
      fanSplit: [{team:"Knicks",emoji:"🏀",pct:91,color:"#F58426"},{team:"Celtics",emoji:"☘️",pct:9,color:"#007A33"}] },
  },
  {
    id: 3, name: "Knick Knack Bar & Grill", address: "212 E 14th St · East Village", neighborhood: "East Village",
    lat: 40.7322, lng: -73.9862,
    image: "https://images.unsplash.com/photo-1514190051997-0f6f39ca5cde?w=600&h=400&fit=crop&auto=format",
    screens: 8, tvQuality: "HD", viewAngles: "Bar area excellent, booths slightly off-angle", audioMode: "Full Blast",
    walkInPolicy: "Walk-ins always welcome", standingRoomPolicy: "Standing room at the bar, $5 min spend",
    community: { busyLevel: 94, busyVotes: 188, waitMinutes: 40, waitVotes: 61, ageVotes: 120, fanVotes: 153,
      ageRange: [{label:"21–30",pct:60},{label:"31–40",pct:28},{label:"41–55",pct:10},{label:"55+",pct:2}],
      fanSplit: [{team:"Knicks",emoji:"🏀",pct:84,color:"#F58426"},{team:"Celtics",emoji:"☘️",pct:16,color:"#007A33"}] },
  },
  {
    id: 4, name: "Garden State Sports Bar", address: "87 Franklin St · Tribeca", neighborhood: "Tribeca",
    lat: 40.7163, lng: -74.0086,
    image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&h=400&fit=crop&auto=format",
    screens: 5, tvQuality: "HD", viewAngles: "Main screen visible from most tables", audioMode: "Low Background",
    walkInPolicy: "Walk-ins until 8PM, table service only after", standingRoomPolicy: "No standing room policy",
    community: { busyLevel: 45, busyVotes: 33, waitMinutes: 5, waitVotes: 18, ageVotes: 41, fanVotes: 47,
      ageRange: [{label:"21–30",pct:25},{label:"31–40",pct:42},{label:"41–55",pct:28},{label:"55+",pct:5}],
      fanSplit: [{team:"Knicks",emoji:"🏀",pct:71,color:"#F58426"},{team:"Celtics",emoji:"☘️",pct:29,color:"#007A33"}] },
  },
  {
    id: 5, name: "Spike Lee's Corner Bar", address: "40 Acres · Fort Greene, Brooklyn", neighborhood: "Brooklyn",
    lat: 40.6892, lng: -73.9752,
    image: "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=600&h=400&fit=crop&auto=format",
    screens: 15, tvQuality: "4K", viewAngles: "360° coverage, no bad seats", audioMode: "Full Blast",
    walkInPolicy: "Walk-ins welcome, VIP section bookable", standingRoomPolicy: "Dedicated standing rail section up front",
    community: { busyLevel: 98, busyVotes: 312, waitMinutes: 55, waitVotes: 99, ageVotes: 201, fanVotes: 341,
      ageRange: [{label:"21–30",pct:33},{label:"31–40",pct:35},{label:"41–55",pct:22},{label:"55+",pct:10}],
      fanSplit: [{team:"Knicks",emoji:"🏀",pct:96,color:"#F58426"},{team:"Celtics",emoji:"☘️",pct:4,color:"#007A33"}] },
  },
  {
    id: 6, name: "Upper West Side Social Club", address: "2175 Broadway · Upper West Side", neighborhood: "Upper West Side",
    lat: 40.7836, lng: -73.9815,
    image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&h=400&fit=crop&auto=format",
    screens: 7, tvQuality: "HD", viewAngles: "Good sightlines, some pillars in back", audioMode: "Muted w/ Captions",
    walkInPolicy: "Reservations only on playoff nights", standingRoomPolicy: "Standing room behind main seating area",
    community: { busyLevel: 55, busyVotes: 66, waitMinutes: 15, waitVotes: 44, ageVotes: 77, fanVotes: 93,
      ageRange: [{label:"21–30",pct:20},{label:"31–40",pct:38},{label:"41–55",pct:32},{label:"55+",pct:10}],
      fanSplit: [{team:"Knicks",emoji:"🏀",pct:82,color:"#F58426"},{team:"Celtics",emoji:"☘️",pct:18,color:"#007A33"}] },
  },
  {
    id: 7, name: "Harlem Tip-Off Lounge", address: "300 W 125th St · Harlem", neighborhood: "Harlem",
    lat: 40.8076, lng: -73.9472,
    image: "https://images.unsplash.com/photo-1571775295609-5c9ade30bce2?w=600&h=400&fit=crop&auto=format",
    screens: 9, tvQuality: "4K", viewAngles: "Giant projector screen + 8 supporting TVs", audioMode: "Full Blast",
    walkInPolicy: "Always walk-in friendly", standingRoomPolicy: "Overflow standing behind booths",
    community: { busyLevel: 79, busyVotes: 107, waitMinutes: 20, waitVotes: 52, ageVotes: 88, fanVotes: 127,
      ageRange: [{label:"21–30",pct:30},{label:"31–40",pct:36},{label:"41–55",pct:24},{label:"55+",pct:10}],
      fanSplit: [{team:"Knicks",emoji:"🏀",pct:93,color:"#F58426"},{team:"Celtics",emoji:"☘️",pct:7,color:"#007A33"}] },
  },
  {
    id: 8, name: "Hell's Kitchen Huddle", address: "690 9th Ave · Hell's Kitchen", neighborhood: "Hell's Kitchen",
    lat: 40.7589, lng: -73.9941,
    image: "https://images.unsplash.com/photo-1551024506-0bccd828d307?w=600&h=400&fit=crop&auto=format",
    screens: 6, tvQuality: "HD", viewAngles: "Bar height ideal, seated tables can be awkward", audioMode: "Full Blast",
    walkInPolicy: "Walk-in only, no reservations", standingRoomPolicy: "Standing room first come first served",
    community: { busyLevel: 72, busyVotes: 89, waitMinutes: 18, waitVotes: 37, ageVotes: 64, fanVotes: 99,
      ageRange: [{label:"21–30",pct:48},{label:"31–40",pct:35},{label:"41–55",pct:14},{label:"55+",pct:3}],
      fanSplit: [{team:"Knicks",emoji:"🏀",pct:87,color:"#F58426"},{team:"Celtics",emoji:"☘️",pct:13,color:"#007A33"}] },
  },
  {
    id: 9, name: "Williamsburg Three-Point Bar", address: "145 Bedford Ave · Williamsburg", neighborhood: "Williamsburg",
    lat: 40.7175, lng: -73.9571,
    image: "https://images.unsplash.com/photo-1508973379184-7517410fb0bc?w=600&h=400&fit=crop&auto=format",
    screens: 8, tvQuality: "HD", viewAngles: "Rooftop section has best angle", audioMode: "Low Background",
    walkInPolicy: "Walk-ins encouraged", standingRoomPolicy: "Rooftop standing room available weather permitting",
    community: { busyLevel: 58, busyVotes: 71, waitMinutes: 8, waitVotes: 30, ageVotes: 59, fanVotes: 82,
      ageRange: [{label:"21–30",pct:64},{label:"31–40",pct:26},{label:"41–55",pct:8},{label:"55+",pct:2}],
      fanSplit: [{team:"Knicks",emoji:"🏀",pct:75,color:"#F58426"},{team:"Celtics",emoji:"☘️",pct:25,color:"#007A33"}] },
  },
  {
    id: 10, name: "Lower East Ballers Cantina", address: "75 Orchard St · Lower East Side", neighborhood: "Lower East Side",
    lat: 40.7185, lng: -73.9887,
    image: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&h=400&fit=crop&auto=format",
    screens: 5, tvQuality: "HD", viewAngles: "Main TV over bar is excellent, side TVs fair", audioMode: "Muted w/ Captions",
    walkInPolicy: "Walk-in, no min spend before 8PM", standingRoomPolicy: "Bar stools often open, standing at bar welcome",
    community: { busyLevel: 41, busyVotes: 29, waitMinutes: 0, waitVotes: 14, ageVotes: 38, fanVotes: 44,
      ageRange: [{label:"21–30",pct:55},{label:"31–40",pct:30},{label:"41–55",pct:12},{label:"55+",pct:3}],
      fanSplit: [{team:"Knicks",emoji:"🏀",pct:70,color:"#F58426"},{team:"Celtics",emoji:"☘️",pct:30,color:"#007A33"}] },
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────
function getBusyLabel(level: number) {
  if (level >= 90) return { label: "Packed",    color: "#ef4444" };
  if (level >= 70) return { label: "Very Busy", color: "#f97316" };
  if (level >= 50) return { label: "Moderate",  color: "#eab308" };
  return             { label: "Chill",      color: "#22c55e" };
}

function getAudioIcon(mode: Bar["audioMode"]) {
  if (mode === "Full Blast")        return <Volume2 size={14} color="#F58426" />;
  if (mode === "Muted w/ Captions") return <VolumeX size={14} color="#8b93a7" />;
  return <Volume2 size={14} color="#eab308" />;
}

function createKnicksIcon(isSelected: boolean, dimmed: boolean, busyLevel: number = 50) {
  const busyColor = busyLevel >= 90 ? "#ef4444" : busyLevel >= 70 ? "#f97316" : busyLevel >= 50 ? "#eab308" : "#22c55e";
  const color = dimmed ? "#334155" : busyColor;
  const border = dimmed ? "#1e293b" : isSelected ? "white" : "rgba(255,255,255,0.6)";
  const size = isSelected ? 36 : 28;
  const pulse = isSelected && !dimmed
    ? `<circle cx="14" cy="14" r="14" fill="${color}" opacity="0.3">
        <animate attributeName="r" from="14" to="22" dur="1.2s" repeatCount="indefinite"/>
        <animate attributeName="opacity" from="0.3" to="0" dur="1.2s" repeatCount="indefinite"/>
       </circle>` : "";
  const text = dimmed ? "" : `<text x="14" y="18.5" text-anchor="middle" fill="white" font-size="11" font-weight="700" font-family="Arial">🏀</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 28 28">
    ${pulse}
    <circle cx="14" cy="14" r="12" fill="${color}" stroke="${border}" stroke-width="2"/>
    ${text}
  </svg>`;
  return L.divIcon({ html: svg, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

const TRENDING: { rank: number; name: string; neighborhood: string; tag: string; tagColor: string }[] = [
  { rank: 1, name: "Pennsylvania 6",      neighborhood: "Midtown",       tag: "Packed 🔥",    tagColor: "#ef4444" },
  { rank: 2, name: "Stout NYC",           neighborhood: "Hell's Kitchen", tag: "Very Busy",   tagColor: "#f97316" },
  { rank: 3, name: "Mustang Harry's",     neighborhood: "Chelsea",        tag: "Very Busy",   tagColor: "#f97316" },
  { rank: 4, name: "Blondies",            neighborhood: "Upper West Side",tag: "Moderate",    tagColor: "#eab308" },
  { rank: 5, name: "The Ainsworth",       neighborhood: "Midtown West",   tag: "Very Busy",   tagColor: "#f97316" },
  { rank: 6, name: "Professor Thom's",    neighborhood: "East Village",   tag: "Moderate",    tagColor: "#eab308" },
];

// ─── Search & Filter Bar ───────────────────────────────────────────────────────
function SearchAndFilter({
  query, onQuery,
  activeFilters, onToggleFilter,
  resultCount, totalCount,
  showPanel, onTogglePanel,
  onSelectTrending,
}: {
  query: string; onQuery: (q: string) => void;
  activeFilters: Set<FilterKey>; onToggleFilter: (k: FilterKey) => void;
  resultCount: number; totalCount: number;
  showPanel: boolean; onTogglePanel: () => void;
  onSelectTrending: (name: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const showTrending = focused && query === "" && !showPanel;

  return (
    <div className="flex flex-col gap-2">
      {/* Search row */}
      <div className="flex gap-2 items-center">
        <div
          className="flex items-center gap-2 flex-1 px-3 py-2.5 rounded-2xl"
          style={{
            background: "rgba(30,35,48,0.95)",
            border: `1px solid ${focused ? "rgba(245,132,38,0.55)" : "rgba(245,132,38,0.2)"}`,
            transition: "border-color 0.15s",
          }}
        >
          <Search size={15} color={focused ? "#F58426" : "#8b93a7"} style={{ flexShrink: 0, transition: "color 0.15s" }} />
          <input
            type="text"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="Search bars, neighborhoods…"
            className="flex-1 bg-transparent outline-none"
            style={{ color: "#f0f2f5", fontSize: 14, fontFamily: "system-ui", border: "none" }}
          />
          {query && (
            <button onClick={() => onQuery("")}>
              <X size={13} color="#8b93a7" />
            </button>
          )}
        </div>

        {/* Filter toggle */}
        <button
          onClick={onTogglePanel}
          className="relative flex items-center gap-1.5 px-3 py-2.5 rounded-2xl"
          style={{
            background: showPanel || activeFilters.size > 0 ? "rgba(245,132,38,0.18)" : "rgba(30,35,48,0.95)",
            border: `1px solid ${showPanel || activeFilters.size > 0 ? "rgba(245,132,38,0.6)" : "rgba(245,132,38,0.2)"}`,
            color: activeFilters.size > 0 ? "#F58426" : "#8b93a7",
          }}
        >
          <SlidersHorizontal size={15} />
          {activeFilters.size > 0 && (
            <span
              className="flex items-center justify-center rounded-full"
              style={{ width: 16, height: 16, background: "#F58426", color: "white", fontFamily: "system-ui", fontWeight: 800, fontSize: 10 }}
            >
              {activeFilters.size}
            </span>
          )}
        </button>
      </div>

      {/* Trending dropdown */}
      <AnimatePresence>
        {showTrending && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="rounded-2xl overflow-hidden"
            style={{ background: "rgba(18,23,32,0.99)", border: "1px solid rgba(245,132,38,0.2)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-3 pt-3 pb-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ fontSize: 13 }}>🔥</span>
              <span style={{ color: "#F58426", fontFamily: "system-ui", fontWeight: 800, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Trending Tonight
              </span>
              <span style={{ color: "#8b93a7", fontFamily: "system-ui", fontSize: 10, marginLeft: "auto" }}>
                Live · updating now
              </span>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#22c55e", flexShrink: 0 }} />
            </div>

            {/* Rows */}
            {TRENDING.map((t, i) => (
              <button
                key={t.name}
                onMouseDown={() => onSelectTrending(t.name)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                style={{ borderBottom: i < TRENDING.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
              >
                {/* Rank */}
                <span
                  className="flex items-center justify-center rounded-lg flex-shrink-0"
                  style={{ width: 24, height: 24, background: i === 0 ? "rgba(245,132,38,0.18)" : "rgba(255,255,255,0.05)", color: i === 0 ? "#F58426" : "#8b93a7", fontFamily: "system-ui", fontWeight: 800, fontSize: 12 }}
                >
                  {t.rank}
                </span>

                {/* Name + neighborhood */}
                <div className="flex-1 min-w-0">
                  <p style={{ color: "#f0f2f5", fontFamily: "system-ui", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {t.name}
                  </p>
                  <p style={{ color: "#8b93a7", fontFamily: "system-ui", fontSize: 11 }}>{t.neighborhood}</p>
                </div>

                {/* Busyness tag */}
                <span
                  className="px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: `${t.tagColor}18`, border: `1px solid ${t.tagColor}40`, color: t.tagColor, fontFamily: "system-ui", fontWeight: 700, fontSize: 10 }}
                >
                  {t.tag}
                </span>
              </button>
            ))}

            {/* Footer nudge */}
            <div className="px-3 py-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <p style={{ color: "#8b93a7", fontFamily: "system-ui", fontSize: 10, textAlign: "center" }}>
                Popularity based on check-ins from the last 30 min
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result count */}
      {(query || activeFilters.size > 0) && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
          <span style={{ color: "#8b93a7", fontSize: 11, fontFamily: "system-ui" }}>
            {resultCount === 0 ? "No spots match" : `${resultCount} of ${totalCount} spots`}
          </span>
          <button
            onClick={() => { onQuery(""); Array.from(activeFilters).forEach(onToggleFilter); }}
            style={{ color: "#F58426", fontSize: 11, fontFamily: "system-ui", fontWeight: 600 }}
          >
            Clear all
          </button>
        </motion.div>
      )}

      {/* Filter panel */}
      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden" }}
          >
            <div className="rounded-2xl p-3" style={{ background: "rgba(20,25,35,0.98)", border: "1px solid rgba(245,132,38,0.15)" }}>
              {FILTER_GROUPS.map((group) => {
                const groupFilters = FILTERS.filter((f) => f.group === group);
                return (
                  <div key={group} className="mb-3 last:mb-0">
                    <p style={{ color: "#8b93a7", fontSize: 9, fontFamily: "system-ui", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
                      {group}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {groupFilters.map((f) => {
                        const on = activeFilters.has(f.key);
                        return (
                          <button
                            key={f.key}
                            onClick={() => onToggleFilter(f.key)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-full"
                            style={{
                              background: on ? "rgba(245,132,38,0.18)" : "rgba(255,255,255,0.05)",
                              border: `1px solid ${on ? "rgba(245,132,38,0.7)" : "rgba(255,255,255,0.08)"}`,
                              color: on ? "#F58426" : "#c5cad6",
                              fontFamily: "system-ui",
                              fontWeight: on ? 700 : 400,
                              fontSize: 12,
                              transition: "all 0.15s",
                            }}
                          >
                            <span style={{ fontSize: 11 }}>{f.emoji}</span> {f.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Results list ──────────────────────────────────────────────────────────────
function ResultsList({ bars, onSelect }: { bars: Bar[]; onSelect: (b: Bar) => void }) {
  if (bars.length === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      className="rounded-2xl overflow-hidden"
      style={{ background: "rgba(20,25,35,0.98)", border: "1px solid rgba(245,132,38,0.15)", maxHeight: 220, overflowY: "auto" }}
    >
      {bars.map((bar, i) => {
        const busy = getBusyLabel(bar.community.busyLevel);
        return (
          <button
            key={bar.id}
            onClick={() => onSelect(bar)}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
            style={{ borderBottom: i < bars.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
          >
            <div className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0">
              <img src={bar.image} alt={bar.name} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p style={{ color: "#f0f2f5", fontFamily: "system-ui", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {bar.name}
              </p>
              <p style={{ color: "#8b93a7", fontFamily: "system-ui", fontSize: 11 }}>{bar.neighborhood}</p>
            </div>
            <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
              <span style={{ color: busy.color, fontFamily: "system-ui", fontWeight: 700, fontSize: 11 }}>{busy.label}</span>
              <span style={{ color: "#8b93a7", fontFamily: "system-ui", fontSize: 10 }}>{bar.community.waitMinutes === 0 ? "No wait" : `~${bar.community.waitMinutes}m`}</span>
            </div>
            <ChevronRight size={13} color="#8b93a7" style={{ flexShrink: 0 }} />
          </button>
        );
      })}
    </motion.div>
  );
}

// ─── Bar Detail Card ───────────────────────────────────────────────────────────
function BarCard({ bar, onClose }: { bar: Bar; onClose: () => void }) {
  const [myFanVote, setMyFanVote] = useState<string | null>(null);
  const [myBusyVote, setMyBusyVote] = useState<number | null>(null);
  const [fanSplit, setFanSplit] = useState(bar.community.fanSplit);
  const [fanVotes, setFanVotes] = useState(bar.community.fanVotes);
  const [busyLevel, setBusyLevel] = useState(bar.community.busyLevel);
  const [busyVotes, setBusyVotes] = useState(bar.community.busyVotes);
  const busy = getBusyLabel(busyLevel);

  function voteFan(team: string) {
    if (myFanVote) return;
    setMyFanVote(team);
    const total = fanVotes + 1;
    setFanSplit(fanSplit.map((f) => {
      const prev = Math.round((f.pct / 100) * fanVotes);
      return { ...f, pct: Math.round(((f.team === team ? prev + 1 : prev) / total) * 100) };
    }));
    setFanVotes(total);
  }

  function voteBusy(level: number) {
    if (myBusyVote !== null) return;
    setMyBusyVote(level);
    const total = busyVotes + 1;
    setBusyLevel(Math.round((busyLevel * busyVotes + level) / total));
    setBusyVotes(total);
  }

  return (
    <motion.div
      key={bar.id}
      initial={{ y: "100%", opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: "100%", opacity: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 38 }}
      className="absolute bottom-0 left-0 right-0 z-[1001] rounded-t-3xl flex flex-col"
      style={{ background: "#13181f", border: "1px solid rgba(245,132,38,0.25)", borderBottom: "none", maxHeight: "88%", overflow: "hidden" }}
    >
      <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
        <div className="w-10 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
      </div>

      <div className="relative h-40 overflow-hidden flex-shrink-0">
        <img src={bar.image} alt={bar.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(0deg,#13181f 0%,transparent 55%)" }} />
        <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(13,17,23,0.85)" }}>
          <X size={16} color="#f0f2f5" />
        </button>
        <span className="absolute bottom-3 left-4 px-2 py-0.5 rounded-md text-xs" style={{ background: "rgba(245,132,38,0.9)", color: "white", fontFamily: "system-ui", fontWeight: 700 }}>
          {bar.neighborhood}
        </span>
      </div>

      <div className="overflow-y-auto flex-1 px-4 pb-8" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="mt-3 mb-4">
          <h2 style={{ color: "#f0f2f5", fontFamily: "system-ui", fontWeight: 800, fontSize: 19, lineHeight: 1.2 }}>{bar.name}</h2>
          <p style={{ color: "#8b93a7", fontSize: 12, fontFamily: "system-ui", marginTop: 2 }}>{bar.address}</p>
        </div>

        <Section label="How Busy Right Now" votes={busyVotes}>
          <div className="flex items-center justify-between mb-1.5">
            <span style={{ color: busy.color, fontFamily: "system-ui", fontWeight: 800, fontSize: 15 }}>{busy.label}</span>
            <span style={{ color: "#f0f2f5", fontFamily: "system-ui", fontWeight: 700, fontSize: 15 }}>{busyLevel}%</span>
          </div>
          <div className="w-full h-2.5 rounded-full overflow-hidden mb-3" style={{ background: "#242938" }}>
            <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${busyLevel}%` }} transition={{ duration: 0.7 }} style={{ background: busy.color }} />
          </div>
          {myBusyVote === null ? (
            <div>
              <p style={{ color: "#8b93a7", fontSize: 11, fontFamily: "system-ui", marginBottom: 6 }}>How busy does it look to you?</p>
              <div className="grid grid-cols-4 gap-1.5">
                {[{label:"Chill",val:25,color:"#22c55e"},{label:"Moderate",val:55,color:"#eab308"},{label:"Very Busy",val:80,color:"#f97316"},{label:"Packed",val:97,color:"#ef4444"}].map(opt=>(
                  <button key={opt.label} onClick={()=>voteBusy(opt.val)} className="py-1.5 rounded-lg text-center" style={{ background:"#1e2330",border:`1px solid ${opt.color}40`,fontFamily:"system-ui",fontWeight:600,fontSize:10,color:opt.color }}>{opt.label}</button>
                ))}
              </div>
            </div>
          ) : <p style={{ color:"#22c55e",fontSize:12,fontFamily:"system-ui",fontWeight:600 }}>✓ Thanks for reporting!</p>}
        </Section>

        <Section label="Wait Time" votes={bar.community.waitVotes}>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center justify-center rounded-2xl flex-shrink-0" style={{ width:64,height:64,background:bar.community.waitMinutes===0?"rgba(34,197,94,0.12)":"rgba(245,132,38,0.12)",border:`1.5px solid ${bar.community.waitMinutes===0?"#22c55e":"#F58426"}40` }}>
              <Clock size={16} color={bar.community.waitMinutes===0?"#22c55e":"#F58426"} />
              <span style={{ color:bar.community.waitMinutes===0?"#22c55e":"#F58426",fontFamily:"system-ui",fontWeight:800,fontSize:18,lineHeight:1 }}>{bar.community.waitMinutes}</span>
              <span style={{ color:"#8b93a7",fontSize:9,fontFamily:"system-ui" }}>{bar.community.waitMinutes===0?"no wait":"min"}</span>
            </div>
            <div className="flex-1 space-y-1.5">
              <InfoRow icon="🚶" label="Walk-in" value={bar.walkInPolicy} />
              <InfoRow icon="🧍" label="Standing" value={bar.standingRoomPolicy} />
            </div>
          </div>
        </Section>

        <Section label="Who's Here Tonight" votes={fanVotes}>
          <div className="space-y-2 mb-3">
            {fanSplit.map(f=>(
              <div key={f.team}>
                <div className="flex items-center justify-between mb-1">
                  <span style={{ color:"#f0f2f5",fontFamily:"system-ui",fontWeight:700,fontSize:13 }}>{f.emoji} {f.team}</span>
                  <span style={{ color:f.color,fontFamily:"system-ui",fontWeight:800,fontSize:14 }}>{f.pct}%</span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ background:"#242938" }}>
                  <motion.div className="h-full rounded-full" initial={{ width:0 }} animate={{ width:`${f.pct}%` }} transition={{ duration:0.6,delay:0.1 }} style={{ background:f.color }} />
                </div>
              </div>
            ))}
          </div>
          {myFanVote===null ? (
            <div>
              <p style={{ color:"#8b93a7",fontSize:11,fontFamily:"system-ui",marginBottom:6 }}>Who are you rooting for?</p>
              <div className="flex gap-2">
                {fanSplit.map(f=>(
                  <button key={f.team} onClick={()=>voteFan(f.team)} className="flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1.5" style={{ background:`${f.color}18`,border:`1.5px solid ${f.color}50`,fontFamily:"system-ui",fontWeight:700,fontSize:13,color:f.color }}>
                    {f.emoji} {f.team}
                  </button>
                ))}
              </div>
            </div>
          ) : <p style={{ color:"#22c55e",fontSize:12,fontFamily:"system-ui",fontWeight:600 }}>✓ Counted as a {myFanVote} fan!</p>}
        </Section>

        <Section label="TV & Viewing Quality" votes={null}>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <StatTile icon={<Tv2 size={15} color="#F58426"/>} label="Screens" value={`${bar.screens} TVs`} />
            <StatTile icon={<Star size={15} color="#F58426"/>} label="Quality" value={bar.tvQuality} />
            <StatTile icon={<Eye size={15} color="#F58426"/>} label="Angles" value="See below" />
          </div>
          <div className="flex items-start gap-2 p-2.5 rounded-xl" style={{ background:"#1e2330" }}>
            <Eye size={13} color="#8b93a7" style={{ marginTop:1,flexShrink:0 }} />
            <p style={{ color:"#c5cad6",fontSize:12,fontFamily:"system-ui",lineHeight:1.4 }}>{bar.viewAngles}</p>
          </div>
        </Section>

        <Section label="Audio" votes={null}>
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background:"#1e2330" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:bar.audioMode==="Full Blast"?"rgba(245,132,38,0.15)":bar.audioMode==="Muted w/ Captions"?"rgba(139,147,167,0.12)":"rgba(234,179,8,0.12)" }}>
              {getAudioIcon(bar.audioMode)}
            </div>
            <div>
              <p style={{ color:"#f0f2f5",fontFamily:"system-ui",fontWeight:700,fontSize:14 }}>{bar.audioMode}</p>
              <p style={{ color:"#8b93a7",fontSize:11,fontFamily:"system-ui" }}>
                {bar.audioMode==="Full Blast"?"Game audio cranked — you'll hear every whistle":bar.audioMode==="Muted w/ Captions"?"Closed captions on — good for quieter crowd":"Music on low — partial game audio"}
              </p>
            </div>
          </div>
        </Section>

        <Section label="Crowd Age Range" votes={bar.community.ageVotes}>
          <div className="space-y-2">
            {bar.community.ageRange.map(a=>(
              <div key={a.label} className="flex items-center gap-2">
                <span style={{ color:"#8b93a7",fontSize:11,fontFamily:"system-ui",width:44,flexShrink:0 }}>{a.label}</span>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background:"#242938" }}>
                  <motion.div className="h-full rounded-full" initial={{ width:0 }} animate={{ width:`${a.pct}%` }} transition={{ duration:0.5 }} style={{ background:"#006BB6" }} />
                </div>
                <span style={{ color:"#f0f2f5",fontSize:11,fontFamily:"system-ui",fontWeight:700,width:28,textAlign:"right" }}>{a.pct}%</span>
              </div>
            ))}
          </div>
          <p style={{ color:"#8b93a7",fontSize:10,fontFamily:"system-ui",marginTop:6 }}>
            <Info size={9} style={{ display:"inline",marginRight:3 }}/>
            Self-reported by {bar.community.ageVotes} patrons tonight
          </p>
        </Section>
      </div>
    </motion.div>
  );
}

function Section({ label, votes, children }: { label: string; votes: number | null; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span style={{ color:"#F58426",fontSize:11,fontFamily:"system-ui",fontWeight:800,textTransform:"uppercase",letterSpacing:"0.07em" }}>{label}</span>
        {votes!==null&&<span style={{ color:"#8b93a7",fontSize:10,fontFamily:"system-ui" }}><Users size={9} style={{ display:"inline",marginRight:3 }}/>{votes} reports</span>}
      </div>
      {children}
      <div className="mt-4 h-px" style={{ background:"rgba(255,255,255,0.05)" }} />
    </div>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center py-2.5 rounded-xl gap-1" style={{ background:"#1e2330" }}>
      {icon}
      <span style={{ color:"#8b93a7",fontSize:9,fontFamily:"system-ui",textTransform:"uppercase",letterSpacing:"0.05em" }}>{label}</span>
      <span style={{ color:"#f0f2f5",fontSize:11,fontFamily:"system-ui",fontWeight:700 }}>{value}</span>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 py-1.5 px-2.5 rounded-lg" style={{ background:"#1e2330" }}>
      <span style={{ fontSize:12,flexShrink:0,marginTop:1 }}>{icon}</span>
      <div>
        <span style={{ color:"#8b93a7",fontSize:10,fontFamily:"system-ui",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em" }}>{label}: </span>
        <span style={{ color:"#c5cad6",fontSize:11,fontFamily:"system-ui" }}>{value}</span>
      </div>
    </div>
  );
}

// ─── Main Map ──────────────────────────────────────────────────────────────────
export function WatchPartyMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<number, L.Marker>>(new Map());

  const [selectedBar, setSelectedBar] = useState<Bar | null>(null);
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(new Set());
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const gameStatus = { quarter: "4th QTR", time: "3:42", home: 108, away: 97 };

  // Compute filtered bars
  const filteredBars = useMemo(() => {
    const q = query.trim().toLowerCase();
    return BARS.filter((b) => {
      const matchesQuery = !q ||
        b.name.toLowerCase().includes(q) ||
        b.neighborhood.toLowerCase().includes(q) ||
        b.address.toLowerCase().includes(q) ||
        b.audioMode.toLowerCase().includes(q) ||
        b.tvQuality.toLowerCase().includes(q);
      const matchesFilters = activeFilters.size === 0 ||
        Array.from(activeFilters).every((k) => {
          const f = FILTERS.find((x) => x.key === k);
          return f ? f.match(b) : true;
        });
      return matchesQuery && matchesFilters;
    });
  }, [query, activeFilters]);

  const filteredIds = useMemo(() => new Set(filteredBars.map((b) => b.id)), [filteredBars]);
  const isFiltering = query.trim() !== "" || activeFilters.size > 0;

  function toggleFilter(key: FilterKey) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // Sync marker styles whenever filtered set changes
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const bar = BARS.find((b) => b.id === id);
      const isSelected = selectedBar?.id === id;
      const dimmed = isFiltering && !filteredIds.has(id);
      marker.setIcon(createKnicksIcon(isSelected, dimmed, bar?.community.busyLevel ?? 50));
    });
  }, [filteredIds, selectedBar, isFiltering]);

  useEffect(() => {
    setShowResults(isFiltering && !selectedBar);
  }, [isFiltering, selectedBar]);

  // Build map once
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const map = L.map(mapRef.current, { center: [40.7484,-73.9967], zoom: 13, zoomControl: false, attributionControl: false });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 19 }).addTo(map);

    BARS.forEach((bar) => {
      const marker = L.marker([bar.lat, bar.lng], { icon: createKnicksIcon(false, false, bar.community.busyLevel) }).addTo(map);
      marker.on("click", () => {
        setSelectedBar(bar);
        setShowResults(false);
        markersRef.current.forEach((m, id) => {
          const b = BARS.find((x) => x.id === id);
          m.setIcon(createKnicksIcon(id === bar.id, false, b?.community.busyLevel ?? 50));
        });
        map.panTo([bar.lat, bar.lng], { animate: true, duration: 0.5 });
      });
      markersRef.current.set(bar.id, marker);
    });
    mapInstanceRef.current = map;
    return () => { map.remove(); mapInstanceRef.current = null; };
  }, []);

  function handleClose() {
    setSelectedBar(null);
    markersRef.current.forEach((m, id) => {
      const bar = BARS.find((b) => b.id === id);
      const dimmed = isFiltering && !filteredIds.has(id);
      m.setIcon(createKnicksIcon(false, dimmed, bar?.community.busyLevel ?? 50));
    });
    if (isFiltering) setShowResults(true);
  }

  function handleSelectFromList(bar: Bar) {
    setSelectedBar(bar);
    setShowResults(false);
    setShowFilterPanel(false);
    markersRef.current.forEach((m, id) => {
      const b = BARS.find((x) => x.id === id);
      m.setIcon(createKnicksIcon(id === bar.id, false, b?.community.busyLevel ?? 50));
    });
    mapInstanceRef.current?.panTo([bar.lat, bar.lng], { animate: true, duration: 0.5 });
  }

  return (
    <div className="relative w-full h-full" style={{ background: "#0d1117" }}>
      {/* Header */}
      <div
        className="absolute top-0 left-0 right-0 z-[1000] px-4 pt-10 pb-3"
        style={{ background: "linear-gradient(180deg,rgba(13,17,23,0.99) 70%,transparent)" }}
      >
        {/* Top row: logo + score */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 20 }}>🏀</span>
            <div>
              <p style={{ color:"#F58426",fontFamily:"system-ui",fontWeight:800,fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase" }}>NYC Watch Party</p>
              <p style={{ color:"#f0f2f5",fontFamily:"system-ui",fontWeight:800,fontSize:17,lineHeight:1.1 }}>Find Your Spot</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background:"#1a1f2e",border:"1px solid rgba(245,132,38,0.3)" }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background:"#22c55e" }} />
            <div className="text-right">
              <p style={{ color:"#8b93a7",fontFamily:"system-ui",fontWeight:600,fontSize:10 }}>LIVE · {gameStatus.quarter} {gameStatus.time}</p>
              <p style={{ color:"#f0f2f5",fontFamily:"system-ui",fontWeight:800,fontSize:14,lineHeight:1.1 }}>
                <span style={{ color:"#F58426" }}>NYK {gameStatus.home}</span>
                <span style={{ color:"#8b93a7",margin:"0 4px" }}>–</span>
                {gameStatus.away} BOS
              </p>
            </div>
          </div>
        </div>

        {/* Search + filter */}
        <SearchAndFilter
          query={query}
          onQuery={(q) => { setQuery(q); setShowFilterPanel(false); }}
          activeFilters={activeFilters}
          onToggleFilter={toggleFilter}
          resultCount={filteredBars.length}
          totalCount={BARS.length}
          showPanel={showFilterPanel}
          onTogglePanel={() => setShowFilterPanel((v) => !v)}
          onSelectTrending={(name) => setQuery(name)}
        />

        {/* Results list */}
        <AnimatePresence>
          {showResults && filteredBars.length > 0 && (
            <motion.div className="mt-2" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
              <ResultsList bars={filteredBars} onSelect={handleSelectFromList} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Map */}
      <div ref={mapRef} className="absolute inset-0" style={{ zIndex: 1 }} />

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none" style={{ background:"linear-gradient(0deg,rgba(13,17,23,0.85)0%,transparent)",zIndex:999 }} />

      {/* Bar Card */}
      <AnimatePresence>
        {selectedBar && <BarCard key={selectedBar.id} bar={selectedBar} onClose={handleClose} />}
      </AnimatePresence>

      {/* Legend */}
      {!selectedBar && (
        <div
          className="absolute bottom-8 right-4 z-[1001] px-3 py-2 rounded-xl flex flex-col gap-1"
          style={{ background: "rgba(20,25,35,0.92)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {[
            { color: "#22c55e", label: "Chill" },
            { color: "#eab308", label: "Moderate" },
            { color: "#f97316", label: "Very Busy" },
            { color: "#ef4444", label: "Packed" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
              <span style={{ color: "#c5cad6", fontSize: 10, fontFamily: "system-ui", fontWeight: 600 }}>{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Hint */}
      <AnimatePresence>
        {!selectedBar && !isFiltering && (
          <motion.div
            initial={{ opacity:0,y:10 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1001] px-4 py-2 rounded-full flex items-center gap-2"
            style={{ background:"rgba(26,31,46,0.95)",border:"1px solid rgba(245,132,38,0.4)",whiteSpace:"nowrap" }}
          >
            <span style={{ fontSize:14 }}>🏀</span>
            <span style={{ color:"#f0f2f5",fontSize:13,fontFamily:"system-ui",fontWeight:600 }}>Tap a dot to find your watch party</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
