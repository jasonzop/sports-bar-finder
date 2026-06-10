import { WatchPartyMap } from "./components/WatchPartyMap";

export default function App() {
  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ background: "#0d1117" }}
    >
      {/* Mobile frame */}
      <div
        className="relative overflow-hidden"
        style={{
          width: "min(390px, 100vw)",
          height: "min(844px, 100svh)",
          borderRadius: "clamp(0px, calc((100vw - 390px) * 999), 44px)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.7)",
          background: "#0d1117",
        }}
      >
        <WatchPartyMap />
      </div>
    </div>
  );
}
