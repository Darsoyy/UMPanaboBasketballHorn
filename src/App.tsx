import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_GAME_SECONDS = 8 * 60; // 8 minutes default
const DEFAULT_SHOT_SECONDS = 24;
const DEFAULT_TIMEOUTS = 5;

const HOTKEY_STORAGE_KEY = "basketball-scoreboard-hotkeys-v5";
const LIVE_STATE_STORAGE_KEY = "basketball-scoreboard-live-state-v1";
const MATCH_HISTORY_STORAGE_KEY = "basketball-scoreboard-match-history-v1";
const LICENSE_STORAGE_KEY = "basketball-scoreboard-license-v2";
const USED_CODES_STORAGE_KEY = "basketball-scoreboard-used-codes-v2";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds
const ADMIN_MASTER_PASSWORD = "Dar1031win";

const RESERVED_HORN_HOTKEY = "Space";

const ACTION_DEFINITIONS = [
  { id: "quarterPrev", label: "Previous Quarter", category: "Quarter" },
  { id: "quarterNext", label: "Next Quarter", category: "Quarter" },
  { id: "clockStart", label: "Start Clock", category: "Game Clock" },
  { id: "clockPause", label: "Pause Clock", category: "Game Clock" },
  { id: "clockReset", label: "Reset Game Clock", category: "Game Clock" },
  { id: "toggleRunningTime", label: "Toggle Running Time", category: "Game Clock" },
  { id: "shot24", label: "Shot Clock 24", category: "Shot Clock" },
  { id: "shot14", label: "Shot Clock 14", category: "Shot Clock" },
  { id: "shot0", label: "Shot Clock 0", category: "Shot Clock" },
  { id: "homeScorePlus1", label: "Home +1", category: "Home Team" },
  { id: "homeScorePlus2", label: "Home +2", category: "Home Team" },
  { id: "homeScorePlus3", label: "Home +3", category: "Home Team" },
  { id: "homeScoreMinus1", label: "Home -1", category: "Home Team" },
  { id: "homeScoreMinus2", label: "Home -2", category: "Home Team" },
  { id: "homeScoreMinus3", label: "Home -3", category: "Home Team" },
  { id: "homeFoulMinus", label: "Home Foul -", category: "Home Team" },
  { id: "homeFoulPlus", label: "Home Foul +", category: "Home Team" },
  { id: "homeTimeoutUse", label: "Home Use Timeout", category: "Home Team" },
  { id: "homeTimeoutAdd", label: "Home Add Timeout", category: "Home Team" },
  { id: "awayScorePlus1", label: "Away +1", category: "Away Team" },
  { id: "awayScorePlus2", label: "Away +2", category: "Away Team" },
  { id: "awayScorePlus3", label: "Away +3", category: "Away Team" },
  { id: "awayScoreMinus1", label: "Away -1", category: "Away Team" },
  { id: "awayScoreMinus2", label: "Away -2", category: "Away Team" },
  { id: "awayScoreMinus3", label: "Away -3", category: "Away Team" },
  { id: "awayFoulMinus", label: "Away Foul -", category: "Away Team" },
  { id: "awayFoulPlus", label: "Away Foul +", category: "Away Team" },
  { id: "awayTimeoutUse", label: "Away Use Timeout", category: "Away Team" },
  { id: "awayTimeoutAdd", label: "Away Add Timeout", category: "Away Team" },
  { id: "customTimeSet", label: "Set Custom Time", category: "Game Actions" },
  { id: "resetShotClock", label: "Reset Shot Clock", category: "Game Actions" },
  { id: "toggleScoreboard", label: "Toggle Show/Hide Scoreboard", category: "Game Actions" },
  { id: "endQuarter", label: "End Quarter", category: "Game Actions" },
  { id: "resetEverything", label: "Reset Everything", category: "Game Actions" },
] as const;

type ActionDefinition = (typeof ACTION_DEFINITIONS)[number];
type ActionId = ActionDefinition["id"];
type HotkeyMap = Partial<Record<ActionId, string>>;
type TeamSide = "home" | "away";

type ScoreAnimState = {
  type: "+1" | "+2" | "+3";
  id: number;
} | null;

type Player = {
  id: string;
  number: string;
  name: string;
  pts: number;
  fouls: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
};

type Team = {
  name: string;
  score: number;
  fouls: number;
  timeouts: number;
  players: Player[];
};

type MatchRecord = {
  id: string;
  date: string;
  homeName: string;
  homeScore: number;
  homeFouls: number;
  homePlayers: Player[];
  awayName: string;
  awayScore: number;
  awayFouls: number;
  awayPlayers: Player[];
  quarter: number;
};

type LicenseRecord = {
  code: string;
  activatedAt: number;
  expiresAt: number;
};

type LiveState = {
  home: Team;
  away: Team;
  quarter: number;
  gameSeconds: number;
  shotSeconds: number;
  isRunningTimeMode: boolean;
};

type KeyCombo = {
  id: string;
  label: string;
};

type HornGraph = {
  context: AudioContext;
  input: GainNode;
  filter: BiquadFilterNode;
  master: GainNode;
};

const DEFAULT_HOTKEYS: HotkeyMap = {
  quarterPrev: "ArrowLeft",
  quarterNext: "ArrowRight",
  clockStart: "Enter",
  clockPause: "KeyP",
  clockReset: "Ctrl+KeyR",
  toggleRunningTime: "KeyT",
  shot24: "KeyZ",
  shot14: "KeyX",
  shot0: "KeyC",
  homeScorePlus1: "KeyQ",
  homeScorePlus2: "KeyW",
  homeScorePlus3: "KeyE",
  homeScoreMinus1: "KeyA",
  homeScoreMinus2: "KeyS",
  homeScoreMinus3: "KeyD",
  awayScorePlus1: "KeyU",
  awayScorePlus2: "KeyI",
  awayScorePlus3: "KeyO",
  awayScoreMinus1: "KeyJ",
  awayScoreMinus2: "KeyK",
  awayScoreMinus3: "KeyL",
  resetShotClock: "KeyM",
  toggleScoreboard: "KeyV",
  endQuarter: "KeyN",
  resetEverything: "Ctrl+Shift+KeyR",
};

const createDefaultPlayers = (side: TeamSide): Player[] => {
  const isHome = side === "home";
  return isHome
    ? [
        { id: "h1", number: "4", name: "J. Smith", pts: 0, fouls: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
        { id: "h2", number: "7", name: "M. Santos", pts: 0, fouls: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
        { id: "h3", number: "10", name: "K. Reyes", pts: 0, fouls: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
        { id: "h4", number: "23", name: "D. Cruz", pts: 0, fouls: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
        { id: "h5", number: "30", name: "A. Garcia", pts: 0, fouls: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
      ]
    : [
        { id: "a1", number: "3", name: "C. Paul", pts: 0, fouls: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
        { id: "a2", number: "8", name: "R. Miller", pts: 0, fouls: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
        { id: "a3", number: "11", name: "B. Lopez", pts: 0, fouls: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
        { id: "a4", number: "24", name: "K. Bryant", pts: 0, fouls: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
        { id: "a5", number: "34", name: "S. O'Neal", pts: 0, fouls: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
      ];
};

const createTeam = (name: string, side: TeamSide = "home"): Team => ({
  name,
  score: 0,
  fouls: 0,
  timeouts: DEFAULT_TIMEOUTS,
  players: createDefaultPlayers(side),
});

const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

const formatClock = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
};

const formatTimeRemaining = (ms: number): string => {
  if (ms <= 0) return "EXPIRED";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${remainingHours}h remaining`;
  return `${remainingHours}h ${minutes}m remaining`;
};

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();

  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
};

const formatCode16 = (raw: string): string => {
  const clean = raw.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 16);
  const parts = clean.match(/.{1,4}/g) || [];
  return parts.join("-");
};

const loadStoredLicense = (): LicenseRecord | null => {
  if (typeof window === "undefined") return null;

  try {
    const saved = window.localStorage.getItem(LICENSE_STORAGE_KEY);
    if (!saved) return null;
    return JSON.parse(saved) as LicenseRecord;
  } catch {
    return null;
  }
};

const loadStoredUsedCodes = (): string[] => {
  if (typeof window === "undefined") return [];

  try {
    const saved = window.localStorage.getItem(USED_CODES_STORAGE_KEY);
    if (!saved) return [];
    return JSON.parse(saved) as string[];
  } catch {
    return [];
  }
};

const loadStoredHotkeys = (): HotkeyMap => {
  if (typeof window === "undefined") return DEFAULT_HOTKEYS;

  try {
    const saved = window.localStorage.getItem(HOTKEY_STORAGE_KEY);
    if (!saved) return DEFAULT_HOTKEYS;
    const parsed = JSON.parse(saved) as HotkeyMap;
    return { ...DEFAULT_HOTKEYS, ...parsed };
  } catch {
    return DEFAULT_HOTKEYS;
  }
};

const loadStoredLiveState = (): LiveState | null => {
  if (typeof window === "undefined") return null;

  try {
    const saved = window.localStorage.getItem(LIVE_STATE_STORAGE_KEY);
    if (!saved) return null;
    return JSON.parse(saved) as LiveState;
  } catch {
    return null;
  }
};

const loadStoredMatchHistory = (): MatchRecord[] => {
  if (typeof window === "undefined") return [];

  try {
    const saved = window.localStorage.getItem(MATCH_HISTORY_STORAGE_KEY);
    if (!saved) return [];
    return JSON.parse(saved) as MatchRecord[];
  } catch {
    return [];
  }
};

const generate16CharKey = (): string => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let key = "";
  for (let i = 0; i < 16; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return formatCode16(key);
};

const codeToLabel = (code: string) => {
  const labels: Record<string, string> = {
    Space: "Space",
    Enter: "Enter",
    Escape: "Esc",
    Backspace: "Backspace",
    Tab: "Tab",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backslash: "\\",
    Backquote: "`",
  };

  if (labels[code]) return labels[code];
  if (code.startsWith("Key")) return code.replace("Key", "");
  if (code.startsWith("Digit")) return code.replace("Digit", "");
  if (code.startsWith("Numpad")) return `Num ${code.replace("Numpad", "")}`;

  return code;
};

const comboToLabel = (combo?: string | null) => {
  if (!combo) return "";

  return combo
    .split("+")
    .map((part) => {
      if (["Ctrl", "Alt", "Shift", "Meta"].includes(part)) return part;
      return codeToLabel(part);
    })
    .join("+");
};

const readComboFromEvent = (event: KeyboardEvent): KeyCombo | null => {
  const modifierOnlyCodes = new Set([
    "ShiftLeft",
    "ShiftRight",
    "ControlLeft",
    "ControlRight",
    "AltLeft",
    "AltRight",
    "MetaLeft",
    "MetaRight",
  ]);

  if (modifierOnlyCodes.has(event.code)) return null;

  const parts: string[] = [];

  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");

  parts.push(event.code);

  const id = parts.join("+");

  return {
    id,
    label: comboToLabel(id),
  };
};

type RollingScoreProps = {
  score: number;
  animClass?: string;
  isHome?: boolean;
};

const RollingScoreNumber = ({ score, animClass = "", isHome = true }: RollingScoreProps) => {
  const [displayScore, setDisplayScore] = useState(score);
  const [prevScore, setPrevScore] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);

  useEffect(() => {
    if (score !== displayScore) {
      setPrevScore(displayScore);
      setDisplayScore(score);
      setIsRolling(true);
      const timer = setTimeout(() => {
        setIsRolling(false);
        setPrevScore(null);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [score, displayScore]);

  const colorClass = isHome ? "home" : "away";

  return (
    <div className={`rolling-score-box ${colorClass}`}>
      {isRolling && prevScore !== null ? (
        <div className="rolling-score-digit-container">
          <span className={`rolling-score-number roll-out ${animClass}`}>{prevScore}</span>
          <span className={`rolling-score-number roll-in ${animClass}`} style={{ position: "absolute", top: 0, left: 0 }}>
            {displayScore}
          </span>
        </div>
      ) : (
        <span className={`rolling-score-number ${animClass}`}>{displayScore}</span>
      )}
    </div>
  );
};

function App() {
  // License State
  const [license, setLicense] = useState<LicenseRecord | null>(() => loadStoredLicense());
  const [usedCodes, setUsedCodes] = useState<string[]>(() => loadStoredUsedCodes());
  const [codeInputValue, setCodeInputValue] = useState("");
  const [activationError, setActivationError] = useState("");
  const [showAdminDrawer, setShowAdminDrawer] = useState(false);
  const [adminPassInput, setAdminPassInput] = useState("");
  const [generatedKey, setGeneratedKey] = useState("");

  const isLicenseActive = useMemo(() => {
    if (!license) return false;
    return Date.now() < license.expiresAt;
  }, [license]);

  const savedState = useMemo(() => loadStoredLiveState(), []);

  const [home, setHome] = useState<Team>(() => savedState?.home || createTeam("HOME", "home"));
  const [away, setAway] = useState<Team>(() => savedState?.away || createTeam("AWAY", "away"));
  const [quarter, setQuarter] = useState<number>(() => savedState?.quarter || 1);
  const [gameSeconds, setGameSeconds] = useState<number>(() => savedState?.gameSeconds ?? DEFAULT_GAME_SECONDS);
  const [shotSeconds, setShotSeconds] = useState<number>(() => savedState?.shotSeconds ?? DEFAULT_SHOT_SECONDS);
  const [isRunning, setIsRunning] = useState(false);
  const [isRunningTimeMode, setIsRunningTimeMode] = useState<boolean>(() => savedState?.isRunningTimeMode || false);

  // NBA Broadcast Score Animation States
  const [homeScoreAnim, setHomeScoreAnim] = useState<ScoreAnimState>(null);
  const [awayScoreAnim, setAwayScoreAnim] = useState<ScoreAnimState>(null);

  // Broadcast Entrance / Exit & Pulse States
  const [visibilityPhase, setVisibilityPhase] = useState<"visible" | "entering" | "exiting" | "hidden">("visible");
  const [homePulse, setHomePulse] = useState(false);
  const [awayPulse, setAwayPulse] = useState(false);
  const [homeNameAnim, setHomeNameAnim] = useState(false);
  const [awayNameAnim, setAwayNameAnim] = useState(false);

  // Toggle Scoreboard Entrance/Exit Animation
  const toggleScoreboardVisibility = useCallback(() => {
    if (visibilityPhase === "visible" || visibilityPhase === "entering") {
      setVisibilityPhase("exiting");
      setTimeout(() => {
        setVisibilityPhase("hidden");
      }, 380);
    } else {
      setVisibilityPhase("entering");
      setTimeout(() => {
        setVisibilityPhase("visible");
      }, 750);
    }
  }, [visibilityPhase]);

  // Saved Games & Match History State
  const [matchHistory, setMatchHistory] = useState<MatchRecord[]>(() => loadStoredMatchHistory());
  const [selectedHistoryStats, setSelectedHistoryStats] = useState<MatchRecord | null>(null);

  // Modals
  const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);
  const [isHotkeyModalOpen, setIsHotkeyModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isLicenseInfoModalOpen, setIsLicenseInfoModalOpen] = useState(false);

  // Per-Team Add Player Form Inputs
  const [homeNewNum, setHomeNewNum] = useState("");
  const [homeNewName, setHomeNewName] = useState("");
  const [awayNewNum, setAwayNewNum] = useState("");
  const [awayNewName, setAwayNewName] = useState("");

  const [customMinutes, setCustomMinutes] = useState("8");
  const [customSeconds, setCustomSeconds] = useState("00");

  const [isHornActive, setIsHornActive] = useState(false);
  const [hotkeys, setHotkeys] = useState<HotkeyMap>(() => loadStoredHotkeys());
  const [recordingActionId, setRecordingActionId] = useState<ActionId | null>(null);
  const [hotkeyNotice, setHotkeyNotice] = useState("Click 'Change' on any action and press your hotkey combination.");

  const hornGraphRef = useRef<HornGraph | null>(null);
  const hornOscillatorsRef = useRef<OscillatorNode[]>([]);
  const hornRunningRef = useRef(false);
  const spacePressedRef = useRef(false);
  const hasPlayedGameEndHornRef = useRef(false);
  const hasPlayedShotEndHornRef = useRef(false);

  const triggerScoreAnim = useCallback((side: TeamSide, amount: number) => {
    if (amount <= 0 || amount > 3) return;

    const animType = `+${amount}` as "+1" | "+2" | "+3";
    const animObj = { type: animType, id: Date.now() };

    if (side === "home") {
      setHomeScoreAnim(animObj);
      setHomePulse(true);
      setTimeout(() => setHomePulse(false), 600);
      setTimeout(() => setHomeScoreAnim(null), 1500);
    } else {
      setAwayScoreAnim(animObj);
      setAwayPulse(true);
      setTimeout(() => setAwayPulse(false), 600);
      setTimeout(() => setAwayScoreAnim(null), 1500);
    }
  }, []);

  // Auto-save live state
  useEffect(() => {
    const liveState: LiveState = {
      home,
      away,
      quarter,
      gameSeconds,
      shotSeconds,
      isRunningTimeMode,
    };
    window.localStorage.setItem(LIVE_STATE_STORAGE_KEY, JSON.stringify(liveState));
  }, [away, gameSeconds, home, isRunningTimeMode, quarter, shotSeconds]);

  // Save match history
  useEffect(() => {
    window.localStorage.setItem(MATCH_HISTORY_STORAGE_KEY, JSON.stringify(matchHistory));
  }, [matchHistory]);

  // Save used codes
  useEffect(() => {
    window.localStorage.setItem(USED_CODES_STORAGE_KEY, JSON.stringify(usedCodes));
  }, [usedCodes]);

  const handleActivateCode = () => {
    const cleanCode = codeInputValue.replace(/[^A-Z0-9]/gi, "").toUpperCase();

    if (cleanCode.length !== 16) {
      setActivationError("Access code must be exactly 16 characters long.");
      return;
    }

    if (usedCodes.includes(cleanCode)) {
      setActivationError("This 16-character access code has already been used.");
      return;
    }

    const now = Date.now();
    const newLicense: LicenseRecord = {
      code: formatCode16(cleanCode),
      activatedAt: now,
      expiresAt: now + THREE_DAYS_MS,
    };

    setLicense(newLicense);
    setUsedCodes((prev) => [...prev, cleanCode]);
    window.localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(newLicense));

    setActivationError("");
    setCodeInputValue("");
    alert("🎉 3-Day Scorekeeper Access Code successfully activated!");
  };

  const handleAdminGenerateKey = () => {
    if (adminPassInput.trim() !== ADMIN_MASTER_PASSWORD) {
      alert("Invalid Admin Password!");
      return;
    }

    const key = generate16CharKey();
    setGeneratedKey(key);
  };

  const handleSaveCurrentMatch = () => {
    const now = new Date();
    const formattedDate = `${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    const newRecord: MatchRecord = {
      id: `match-${Date.now()}`,
      date: formattedDate,
      homeName: home.name,
      homeScore: home.score,
      homeFouls: home.fouls,
      homePlayers: [...home.players],
      awayName: away.name,
      awayScore: away.score,
      awayFouls: away.fouls,
      awayPlayers: [...away.players],
      quarter,
    };

    setMatchHistory((prev) => [newRecord, ...prev]);
    alert(`✅ Game Saved! ${home.name} ${home.score} - ${away.score} ${away.name}`);
  };

  const handleLoadPastMatch = (record: MatchRecord) => {
    const confirmLoad = window.confirm(`Load past game "${record.homeName} vs ${record.awayName}" onto the scoreboard?`);
    if (!confirmLoad) return;

    setHome({
      name: record.homeName,
      score: record.homeScore,
      fouls: record.homeFouls,
      timeouts: DEFAULT_TIMEOUTS,
      players: record.homePlayers || [],
    });

    setAway({
      name: record.awayName,
      score: record.awayScore,
      fouls: record.awayFouls,
      timeouts: DEFAULT_TIMEOUTS,
      players: record.awayPlayers || [],
    });

    setQuarter(record.quarter || 4);
    setIsHistoryModalOpen(false);
  };

  const handleDeleteHistoryRecord = (id: string) => {
    setMatchHistory((prev) => prev.filter((rec) => rec.id !== id));
  };

  const createHornGraph = useCallback((): HornGraph | null => {
    if (hornGraphRef.current) return hornGraphRef.current;

    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) return null;

    const context = new AudioContextClass();
    const input = context.createGain();
    const filter = context.createBiquadFilter();
    const master = context.createGain();

    input.gain.value = 0;
    filter.type = "lowpass";
    filter.frequency.value = 3200;
    filter.Q.value = 1.1;
    master.gain.value = 0.95;

    input.connect(filter);
    filter.connect(master);
    master.connect(context.destination);

    const graph: HornGraph = { context, input, filter, master };
    hornGraphRef.current = graph;

    return graph;
  }, []);

  const startHorn = useCallback(async () => {
    if (hornRunningRef.current) return;
    const graph = createHornGraph();
    if (!graph) return;

    if (graph.context.state === "suspended") {
      await graph.context.resume().catch(() => undefined);
    }

    hornRunningRef.current = true;
    setIsHornActive(true);

    const now = graph.context.currentTime;
    graph.input.gain.cancelScheduledValues(now);
    graph.input.gain.setValueAtTime(0.0001, now);
    graph.input.gain.exponentialRampToValueAtTime(0.9, now + 0.035);

    const osc1 = graph.context.createOscillator();
    const osc2 = graph.context.createOscillator();
    const osc3 = graph.context.createOscillator();

    osc1.type = "sawtooth";
    osc2.type = "square";
    osc3.type = "sawtooth";

    osc1.frequency.setValueAtTime(120, now);
    osc2.frequency.setValueAtTime(240, now);
    osc3.frequency.setValueAtTime(180, now);

    osc1.detune.setValueAtTime(-8, now);
    osc2.detune.setValueAtTime(6, now);
    osc3.detune.setValueAtTime(3, now);

    osc1.connect(graph.input);
    osc2.connect(graph.input);
    osc3.connect(graph.input);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);

    hornOscillatorsRef.current = [osc1, osc2, osc3];
  }, [createHornGraph]);

  const stopHorn = useCallback(() => {
    if (!hornRunningRef.current) return;
    const graph = hornGraphRef.current;
    if (!graph) return;

    hornRunningRef.current = false;
    setIsHornActive(false);

    const now = graph.context.currentTime;
    graph.input.gain.cancelScheduledValues(now);
    graph.input.gain.setTargetAtTime(0.0001, now, 0.03);

    hornOscillatorsRef.current.forEach((oscillator) => {
      try {
        oscillator.stop(now + 0.08);
      } catch {
        // Ignore
      }
    });

    window.setTimeout(() => {
      hornOscillatorsRef.current.forEach((oscillator) => {
        try {
          oscillator.disconnect();
        } catch {
          // Ignore
        }
      });
      hornOscillatorsRef.current = [];
    }, 300);
  }, []);

  const playHornOnce = useCallback(
    async (durationSeconds = 0.45) => {
      const graph = createHornGraph();
      if (!graph) return;

      if (graph.context.state === "suspended") {
        await graph.context.resume().catch(() => undefined);
      }

      const now = graph.context.currentTime;
      const oneShotGain = graph.context.createGain();
      const fadeStart = Math.max(0.08, durationSeconds - 0.18);
      const stopTime = now + durationSeconds;

      oneShotGain.gain.setValueAtTime(0.0001, now);
      oneShotGain.gain.exponentialRampToValueAtTime(0.86, now + 0.025);
      oneShotGain.gain.setTargetAtTime(0.0001, now + fadeStart, 0.045);

      const osc1 = graph.context.createOscillator();
      const osc2 = graph.context.createOscillator();
      const osc3 = graph.context.createOscillator();

      osc1.type = "sawtooth";
      osc2.type = "square";
      osc3.type = "sawtooth";

      osc1.frequency.setValueAtTime(120, now);
      osc2.frequency.setValueAtTime(240, now);
      osc3.frequency.setValueAtTime(180, now);

      osc1.detune.setValueAtTime(-8, now);
      osc2.detune.setValueAtTime(6, now);
      osc3.detune.setValueAtTime(3, now);

      osc1.connect(oneShotGain);
      osc2.connect(oneShotGain);
      osc3.connect(oneShotGain);
      oneShotGain.connect(graph.filter);

      osc1.start(now);
      osc2.start(now);
      osc3.start(now);

      osc1.stop(stopTime);
      osc2.stop(stopTime);
      osc3.stop(stopTime);

      window.setTimeout(() => {
        try {
          osc1.disconnect();
          osc2.disconnect();
          osc3.disconnect();
          oneShotGain.disconnect();
        } catch {
          // Ignore
        }
      }, Math.ceil((durationSeconds + 0.4) * 1000));
    },
    [createHornGraph]
  );

  useEffect(() => {
    return () => {
      stopHorn();
      void hornGraphRef.current?.context.close();
    };
  }, [stopHorn]);

  useEffect(() => {
    window.localStorage.setItem(HOTKEY_STORAGE_KEY, JSON.stringify(hotkeys));
  }, [hotkeys]);

  const checkRunningTimeResume = useCallback(() => {
    if (isRunningTimeMode && gameSeconds > 0) {
      setIsRunning(true);
    }
  }, [gameSeconds, isRunningTimeMode]);

  const updateTeam = useCallback((side: TeamSide, updater: (team: Team) => Team) => {
    if (side === "home") {
      setHome((team) => updater(team));
    } else {
      setAway((team) => updater(team));
    }
  }, []);

  const setTeamName = useCallback(
    (side: TeamSide, name: string) => {
      updateTeam(side, (team) => ({
        ...team,
        name: name.toUpperCase(),
      }));
      if (side === "home") {
        setHomeNameAnim(true);
        setTimeout(() => setHomeNameAnim(false), 300);
      } else {
        setAwayNameAnim(true);
        setTimeout(() => setAwayNameAnim(false), 300);
      }
    },
    [updateTeam]
  );

  const adjustScore = useCallback(
    (side: TeamSide, amount: number) => {
      updateTeam(side, (team) => ({
        ...team,
        score: Math.max(0, team.score + amount),
      }));
      if (amount > 0) triggerScoreAnim(side, amount);
      checkRunningTimeResume();
    },
    [checkRunningTimeResume, triggerScoreAnim, updateTeam]
  );

  const adjustFouls = useCallback(
    (side: TeamSide, amount: number) => {
      updateTeam(side, (team) => ({
        ...team,
        fouls: Math.max(0, team.fouls + amount),
      }));
      checkRunningTimeResume();
    },
    [checkRunningTimeResume, updateTeam]
  );

  const adjustTimeouts = useCallback(
    (side: TeamSide, amount: number) => {
      updateTeam(side, (team) => ({
        ...team,
        timeouts: Math.max(0, team.timeouts + amount),
      }));
    },
    [updateTeam]
  );

  const adjustPlayerStat = useCallback(
    (side: TeamSide, playerId: string, statKey: keyof Omit<Player, "id" | "number" | "name">, amount: number) => {
      updateTeam(side, (team) => {
        let scoreDiff = 0;
        let foulsDiff = 0;

        const updatedPlayers = team.players.map((player) => {
          if (player.id !== playerId) return player;

          const currentVal = player[statKey];
          const newVal = Math.max(0, currentVal + amount);
          const diff = newVal - currentVal;

          if (statKey === "pts") {
            scoreDiff = diff;
            if (diff > 0) triggerScoreAnim(side, diff);
          }
          if (statKey === "fouls") foulsDiff = diff;

          return { ...player, [statKey]: newVal };
        });

        return {
          ...team,
          score: Math.max(0, team.score + scoreDiff),
          fouls: Math.max(0, team.fouls + foulsDiff),
          players: updatedPlayers,
        };
      });

      if (statKey === "pts" || statKey === "fouls") {
        checkRunningTimeResume();
      }
    },
    [checkRunningTimeResume, triggerScoreAnim, updateTeam]
  );

  const handleAddPlayerInline = useCallback(
    (side: TeamSide) => {
      const num = side === "home" ? homeNewNum : awayNewNum;
      const name = side === "home" ? homeNewName : awayNewName;

      if (!num.trim() || !name.trim()) return;

      updateTeam(side, (team) => {
        const newPlayer: Player = {
          id: `p-${Date.now()}`,
          number: num.trim(),
          name: name.trim(),
          pts: 0,
          fouls: 0,
          reb: 0,
          ast: 0,
          stl: 0,
          blk: 0,
        };
        return { ...team, players: [...team.players, newPlayer] };
      });

      if (side === "home") {
        setHomeNewNum("");
        setHomeNewName("");
      } else {
        setAwayNewNum("");
        setAwayNewName("");
      }
    },
    [awayNewName, awayNewNum, homeNewName, homeNewNum, updateTeam]
  );

  const handleDeletePlayer = useCallback(
    (side: TeamSide, playerId: string) => {
      updateTeam(side, (team) => ({
        ...team,
        players: team.players.filter((p) => p.id !== playerId),
      }));
    },
    [updateTeam]
  );

  const resetGameClock = useCallback(() => {
    setIsRunning(false);
    setGameSeconds(DEFAULT_GAME_SECONDS);
    setCustomMinutes("8");
    setCustomSeconds("00");
  }, []);

  const applyCustomTime = useCallback(
    (mStr?: string, sStr?: string) => {
      const targetM = mStr ?? customMinutes;
      const targetS = sStr ?? customSeconds;
      const minutes = clamp(Number(targetM) || 0, 0, 99);
      const seconds = clamp(Number(targetS) || 0, 0, 59);

      setIsRunning(false);
      setGameSeconds(minutes * 60 + seconds);
      setCustomMinutes(minutes.toString());
      setCustomSeconds(seconds.toString().padStart(2, "0"));
      setIsTimeModalOpen(false);

      if (isRunningTimeMode && minutes * 60 + seconds > 0) {
        setIsRunning(true);
      }
    },
    [customMinutes, customSeconds, isRunningTimeMode]
  );

  const endQuarter = useCallback(() => {
    setIsRunning(false);
    setGameSeconds(DEFAULT_GAME_SECONDS);
    setShotSeconds(DEFAULT_SHOT_SECONDS);
    setQuarter((current) => Math.min(5, current + 1));
  }, []);

  const resetEverything = useCallback(() => {
    const shouldReset = window.confirm("Reset the entire scoreboard and scorekeeper sheets?");
    if (!shouldReset) return;

    setIsRunning(false);
    setHome(createTeam("HOME", "home"));
    setAway(createTeam("AWAY", "away"));
    setQuarter(1);
    setGameSeconds(DEFAULT_GAME_SECONDS);
    setShotSeconds(DEFAULT_SHOT_SECONDS);
    setCustomMinutes("8");
    setCustomSeconds("00");
    stopHorn();
  }, [stopHorn]);

  const executeAction = useCallback(
    (actionId: ActionId) => {
      switch (actionId) {
        case "quarterPrev":
          setQuarter((current) => Math.max(1, current - 1));
          break;
        case "quarterNext":
          setQuarter((current) => Math.min(5, current + 1));
          break;
        case "clockStart":
          if (gameSeconds > 0) setIsRunning(true);
          break;
        case "clockPause":
          setIsRunning(false);
          break;
        case "clockReset":
          resetGameClock();
          break;
        case "toggleRunningTime":
          setIsRunningTimeMode((prev) => !prev);
          break;
        case "shot24":
          setShotSeconds(24);
          break;
        case "shot14":
          setShotSeconds(14);
          break;
        case "shot0":
          setShotSeconds(0);
          break;
        case "homeScorePlus1":
          adjustScore("home", 1);
          break;
        case "homeScorePlus2":
          adjustScore("home", 2);
          break;
        case "homeScorePlus3":
          adjustScore("home", 3);
          break;
        case "homeScoreMinus1":
          adjustScore("home", -1);
          break;
        case "homeScoreMinus2":
          adjustScore("home", -2);
          break;
        case "homeScoreMinus3":
          adjustScore("home", -3);
          break;
        case "homeFoulMinus":
          adjustFouls("home", -1);
          break;
        case "homeFoulPlus":
          adjustFouls("home", 1);
          break;
        case "homeTimeoutUse":
          adjustTimeouts("home", -1);
          break;
        case "homeTimeoutAdd":
          adjustTimeouts("home", 1);
          break;
        case "awayScorePlus1":
          adjustScore("away", 1);
          break;
        case "awayScorePlus2":
          adjustScore("away", 2);
          break;
        case "awayScorePlus3":
          adjustScore("away", 3);
          break;
        case "awayScoreMinus1":
          adjustScore("away", -1);
          break;
        case "awayScoreMinus2":
          adjustScore("away", -2);
          break;
        case "awayScoreMinus3":
          adjustScore("away", -3);
          break;
        case "awayFoulMinus":
          adjustFouls("away", -1);
          break;
        case "awayFoulPlus":
          adjustFouls("away", 1);
          break;
        case "awayTimeoutUse":
          adjustTimeouts("away", -1);
          break;
        case "awayTimeoutAdd":
          adjustTimeouts("away", 1);
          break;
        case "customTimeSet":
          setIsTimeModalOpen(true);
          break;
        case "resetShotClock":
          setShotSeconds(DEFAULT_SHOT_SECONDS);
          break;
        case "toggleScoreboard":
          toggleScoreboardVisibility();
          break;
        case "endQuarter":
          endQuarter();
          break;
        case "resetEverything":
          resetEverything();
          break;
      }
    },
    [
      adjustFouls,
      adjustScore,
      adjustTimeouts,
      endQuarter,
      gameSeconds,
      resetEverything,
      resetGameClock,
      toggleScoreboardVisibility,
    ]
  );

  const assignHotkey = useCallback((actionId: ActionId, combo: KeyCombo) => {
    const action = ACTION_DEFINITIONS.find((item) => item.id === actionId);

    if (combo.id === RESERVED_HORN_HOTKEY) {
      setHotkeyNotice("Space is reserved for the long horn.");
      setRecordingActionId(null);
      return;
    }

    setHotkeys((current) => {
      const next: HotkeyMap = { ...current };

      ACTION_DEFINITIONS.forEach((item) => {
        if (next[item.id] === combo.id && item.id !== actionId) {
          delete next[item.id];
        }
      });

      next[actionId] = combo.id;
      return next;
    });

    setHotkeyNotice(`${action?.label ?? "Action"} hotkey set to ${combo.label}.`);
    setRecordingActionId(null);
  }, []);

  const clearHotkey = useCallback((actionId: ActionId) => {
    const action = ACTION_DEFINITIONS.find((item) => item.id === actionId);

    setHotkeys((current) => {
      const next = { ...current };
      delete next[actionId];
      return next;
    });

    setHotkeyNotice(`${action?.label ?? "Action"} hotkey cleared.`);
  }, []);

  const resetHotkeys = useCallback(() => {
    setHotkeys(DEFAULT_HOTKEYS);
    setHotkeyNotice("Hotkeys restored to default layout.");
  }, []);

  const hotkeyLookup = useMemo(() => {
    const lookup = new Map<string, ActionId>();
    ACTION_DEFINITIONS.forEach((action) => {
      const combo = hotkeys[action.id];
      if (combo) {
        lookup.set(combo, action.id);
      }
    });
    return lookup;
  }, [hotkeys]);

  useEffect(() => {
    if (!isLicenseActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (recordingActionId) {
        const combo = readComboFromEvent(event);
        if (!combo) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        assignHotkey(recordingActionId, combo);
        return;
      }

      if (event.code === RESERVED_HORN_HOTKEY && !isTypingTarget(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }

        if (spacePressedRef.current || event.repeat) return;

        spacePressedRef.current = true;
        void startHorn();
        return;
      }

      if (isTypingTarget(event.target) || event.repeat) return;

      const combo = readComboFromEvent(event);
      if (!combo) return;

      const actionId = hotkeyLookup.get(combo.id);
      if (!actionId) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      executeAction(actionId);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== RESERVED_HORN_HOTKEY || isTypingTarget(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      spacePressedRef.current = false;
      stopHorn();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [assignHotkey, executeAction, hotkeyLookup, isLicenseActive, recordingActionId, startHorn, stopHorn]);

  useEffect(() => {
    if (!isRunning) return;

    const intervalId = window.setInterval(() => {
      setGameSeconds((current) => {
        if (current <= 1) {
          if (!hasPlayedGameEndHornRef.current) {
            hasPlayedGameEndHornRef.current = true;
            void playHornOnce(3);
          }
          setIsRunning(false);
          return 0;
        }
        return current - 1;
      });

      setShotSeconds((current) => {
        if (current <= 1) {
          if (!hasPlayedShotEndHornRef.current) {
            hasPlayedShotEndHornRef.current = true;
            void playHornOnce();
          }
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isRunning, playHornOnce]);

  useEffect(() => {
    if (gameSeconds > 0) hasPlayedGameEndHornRef.current = false;
  }, [gameSeconds]);

  useEffect(() => {
    if (shotSeconds > 0) hasPlayedShotEndHornRef.current = false;
  }, [shotSeconds]);

  const leadingTeam = useMemo(() => {
    if (home.score === away.score) return "TIE GAME";
    return home.score > away.score ? `${home.name} LEADS` : `${away.name} LEADS`;
  }, [away.name, away.score, home.name, home.score]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => undefined);
    } else {
      document.exitFullscreen().catch(() => undefined);
    }
  };

  const actionsByCategory = useMemo(() => {
    return ACTION_DEFINITIONS.reduce<Record<string, ActionDefinition[]>>((groups, action) => {
      groups[action.category] = groups[action.category] ?? [];
      groups[action.category].push(action);
      return groups;
    }, {});
  }, []);

  const renderTeamCard = (side: TeamSide, team: Team) => {
    const isHome = side === "home";
    const currNum = isHome ? homeNewNum : awayNewNum;
    const currName = isHome ? homeNewName : awayNewName;

    // NBA Broadcast Score Animation Computation
    const animState = isHome ? homeScoreAnim : awayScoreAnim;
    const animClass = animState ? `anim-plus${animState.type.slice(1)}` : "";
    const popLabel = animState?.type === "+3" ? "💥 THREE POINTER MADE! (+3)" : animState?.type === "+2" ? "🏀 FIELD GOAL MADE! (+2)" : "🎯 FREE THROW MADE! (+1)";
    const popClass = animState ? `pop-${animState.type.slice(1)}` : "";
    const waveClass = isHome ? "home-wave" : "away-wave";
    const pulseClass = isHome ? (homePulse ? "pulse-home" : "") : (awayPulse ? "pulse-away" : "");
    const nameAnimClass = isHome ? (homeNameAnim ? "team-name-slide" : "") : (awayNameAnim ? "team-name-slide" : "");

    return (
      <section className={`team-card ${isHome ? "home" : "away"} ${pulseClass}`}>
        <div className="team-header-row">
          <span className="team-tag">{isHome ? "HOME TEAM" : "AWAY TEAM"}</span>
        </div>

        <input
          className={`team-name-input ${nameAnimClass}`}
          aria-label={`${isHome ? "Home" : "Away"} team name`}
          value={team.name}
          maxLength={18}
          onChange={(event) => setTeamName(side, event.target.value)}
        />

        {/* Score Box with NBA 2K Broadcast Graphic Banner & Shockwave Ring */}
        <div className="score-box">
          {animState && (
            <>
              <div key={`wave-${animState.id}`} className={`nba-shockwave ${waveClass}`} />
              <div key={`banner-${animState.id}`} className={`nba-broadcast-banner ${popClass}`}>
                {popLabel}
              </div>
            </>
          )}
          <RollingScoreNumber score={team.score} animClass={animClass} isHome={isHome} />
        </div>

        <div className="team-stats-row">
          <div className="stat-box">
            <label>FOULS</label>
            <span className="stat-value">{team.fouls}</span>
            <div className="stat-controls">
              <button className="btn-mini" onClick={() => adjustFouls(side, -1)}>-</button>
              <button className="btn-mini" onClick={() => adjustFouls(side, 1)}>+</button>
            </div>
          </div>

          <div className="stat-box">
            <label>TIMEOUTS</label>
            <span className="stat-value">{team.timeouts}</span>
            <div className="stat-controls">
              <button className="btn-mini" onClick={() => adjustTimeouts(side, -1)}>Use</button>
              <button className="btn-mini" onClick={() => adjustTimeouts(side, 1)}>Add</button>
            </div>
          </div>
        </div>

        {/* EMBEDDED WHITE PAPER SCOREKEEPER PLAYER STATS SHEET */}
        <div className="paper-score-sheet">
          <div className="paper-sheet-header">
            <span className="paper-sheet-title">📝 OFFICIAL SCOREKEEPER SHEET</span>
          </div>

          {/* Quick Add Player Form Row */}
          <div className="paper-add-player-row">
            <input
              className="paper-input num-input"
              placeholder="#"
              maxLength={3}
              value={currNum}
              onChange={(e) => (isHome ? setHomeNewNum(e.target.value) : setAwayNewNum(e.target.value))}
            />
            <input
              className="paper-input name-input"
              placeholder="Add Player Name"
              maxLength={20}
              value={currName}
              onChange={(e) => (isHome ? setHomeNewName(e.target.value) : setAwayNewName(e.target.value))}
            />
            <button className="btn-paper-add" onClick={() => handleAddPlayerInline(side)}>
              + Add
            </button>
          </div>

          {/* Paper Table */}
          <table className="paper-table">
            <thead>
              <tr>
                <th style={{ width: "6%" }}>#</th>
                <th className="left">PLAYER</th>
                <th style={{ width: "28%" }}>POINTS (PTS)</th>
                <th style={{ width: "18%" }}>FOULS (F)</th>
                <th style={{ width: "16%" }}>REB (R)</th>
                <th style={{ width: "16%" }}>AST (A)</th>
                <th style={{ width: "6%" }}></th>
              </tr>
            </thead>
            <tbody>
              {team.players.map((player) => (
                <tr key={player.id}>
                  <td className="paper-player-num">#{player.number}</td>
                  <td>
                    <div className="paper-player-name" title={player.name}>
                      {player.name}
                      {player.fouls >= 5 && <span className="paper-foul-out">OUT</span>}
                      {player.fouls === 4 && <span className="paper-foul-warn">4F</span>}
                    </div>
                  </td>

                  {/* PTS Controls */}
                  <td>
                    <div className="paper-stat-cell-wrap">
                      <button
                        className="btn-paper-act sub"
                        onClick={() => adjustPlayerStat(side, player.id, "pts", -1)}
                        title="-1 Point"
                      >
                        -1
                      </button>
                      <span className="paper-stat-badge">{player.pts}</span>
                      <button
                        className="btn-paper-act pt1"
                        onClick={() => adjustPlayerStat(side, player.id, "pts", 1)}
                        title="+1 Point"
                      >
                        +1
                      </button>
                      <button
                        className="btn-paper-act pt2"
                        onClick={() => adjustPlayerStat(side, player.id, "pts", 2)}
                        title="+2 Points"
                      >
                        +2
                      </button>
                      <button
                        className="btn-paper-act pt3"
                        onClick={() => adjustPlayerStat(side, player.id, "pts", 3)}
                        title="+3 Points"
                      >
                        +3
                      </button>
                    </div>
                  </td>

                  {/* FOULS Controls */}
                  <td>
                    <div className="paper-stat-cell-wrap">
                      <button
                        className="btn-paper-act sub"
                        onClick={() => adjustPlayerStat(side, player.id, "fouls", -1)}
                        title="-1 Foul"
                      >
                        -
                      </button>
                      <span className="paper-stat-badge" style={{ color: player.fouls >= 5 ? "#dc2626" : "#0f172a" }}>
                        {player.fouls}
                      </span>
                      <button
                        className="btn-paper-act foul"
                        onClick={() => adjustPlayerStat(side, player.id, "fouls", 1)}
                        title="+1 Foul"
                      >
                        +F
                      </button>
                    </div>
                  </td>

                  {/* REBOUNDS Controls */}
                  <td>
                    <div className="paper-stat-cell-wrap">
                      <button
                        className="btn-paper-act sub"
                        onClick={() => adjustPlayerStat(side, player.id, "reb", -1)}
                        title="-1 Rebound"
                      >
                        -
                      </button>
                      <span className="paper-stat-badge" style={{ color: "#475569" }}>
                        {player.reb}
                      </span>
                      <button
                        className="btn-paper-act stat"
                        onClick={() => adjustPlayerStat(side, player.id, "reb", 1)}
                        title="+1 Rebound"
                      >
                        +
                      </button>
                    </div>
                  </td>

                  {/* ASSISTS Controls */}
                  <td>
                    <div className="paper-stat-cell-wrap">
                      <button
                        className="btn-paper-act sub"
                        onClick={() => adjustPlayerStat(side, player.id, "ast", -1)}
                        title="-1 Assist"
                      >
                        -
                      </button>
                      <span className="paper-stat-badge" style={{ color: "#475569" }}>
                        {player.ast}
                      </span>
                      <button
                        className="btn-paper-act stat"
                        onClick={() => adjustPlayerStat(side, player.id, "ast", 1)}
                        title="+1 Assist"
                      >
                        +
                      </button>
                    </div>
                  </td>

                  {/* Delete Player */}
                  <td>
                    <button
                      className="btn-paper-act del"
                      onClick={() => handleDeletePlayer(side, player.id)}
                      title="Remove Player"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {team.players.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "#64748b", padding: "0.75rem" }}>
                    No players in roster. Use the form above to add players.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  // If 3-Day License is Expired or Not Activated, render Activation Screen!
  if (!isLicenseActive) {
    return (
      <div className="login-gate-overlay">
        <div className="login-card">
          <div className="login-brand-logo">UM</div>
          <h2>3-Day Access Code Required</h2>
          <p>
            {license
              ? "Your 3-Day Scorekeeper Access Pass has EXPIRED. Please request or purchase a new 16-character access code from the Administrator."
              : "Enter your 16-character Access Code to activate your 3-Day Scorekeeper Desk Pass."}
          </p>

          {activationError && <div className="login-error-alert">⚠️ {activationError}</div>}

          <input
            className="code-input-16"
            placeholder="XXXX-XXXX-XXXX-XXXX"
            maxLength={19}
            value={codeInputValue}
            onChange={(e) => setCodeInputValue(formatCode16(e.target.value))}
          />

          <button className="btn-activate-pass" onClick={handleActivateCode}>
            ACTIVATE 3-DAY PASS
          </button>

          {/* Notification Card */}
          <div className="admin-contact-box">
            <div className="admin-contact-header" style={{ justifyContent: "center", textAlign: "center", padding: "0.2rem 0" }}>
              <span>📢 Please request or buy an Access Code from the Administrator.</span>
            </div>

            <div style={{ marginTop: "0.6rem", textAlign: "center" }}>
              <button
                style={{
                  background: "none",
                  border: "none",
                  color: "#64748b",
                  fontSize: "0.72rem",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
                onClick={() => setShowAdminDrawer(!showAdminDrawer)}
              >
                {showAdminDrawer ? "Hide Admin Key Generator" : "🔑 Tournament Admin Key Generator"}
              </button>
            </div>

            {/* Hidden Admin Key Generator Drawer */}
            {showAdminDrawer && (
              <div style={{ marginTop: "0.65rem", paddingTop: "0.65rem", borderTop: "1px solid rgba(255, 255, 255, 0.1)" }}>
                <div style={{ fontSize: "0.72rem", fontWeight: "800", color: "#f59e0b", marginBottom: "0.35rem" }}>
                  ADMIN KEY GENERATOR TOOL
                </div>
                <div style={{ display: "flex", gap: "0.35rem", marginBottom: "0.45rem" }}>
                  <input
                    type="password"
                    placeholder="Enter Admin Password"
                    className="paper-input"
                    style={{ flex: 1, background: "#0f172a !important", color: "#fff !important" }}
                    value={adminPassInput}
                    onChange={(e) => setAdminPassInput(e.target.value)}
                  />
                  <button className="btn-paper-add" onClick={handleAdminGenerateKey}>
                    Generate
                  </button>
                </div>
                {generatedKey && (
                  <div
                    style={{
                      padding: "0.45rem",
                      background: "rgba(245, 158, 11, 0.15)",
                      border: "1px solid #f59e0b",
                      borderRadius: "0.4rem",
                      color: "#facc15",
                      fontFamily: "var(--font-digital)",
                      fontWeight: "900",
                      textAlign: "center",
                    }}
                  >
                    Key: {generatedKey}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="scoreboard-viewport">
      {/* Header Bar */}
      <header className="arena-header">
        <div className="brand-section">
          <div className="logo-badge">UM</div>
          <div className="brand-titles">
            <h1>Basketball Scoreboard</h1>
            <p>Panabo Arena Official Desk</p>
          </div>
        </div>

        <div className="header-center-info">
          <div className={`status-badge ${isRunning ? "live" : "paused"}`}>
            <span className="status-dot"></span>
            {isRunning ? "LIVE" : "PAUSED"}
          </div>

          {/* Active 3-Day License Expiration Pill */}
          <button
            className="license-expiry-pill"
            onClick={() => setIsLicenseInfoModalOpen(true)}
            title="Click for Access Pass details"
          >
            🟢 {license ? formatTimeRemaining(license.expiresAt - Date.now()) : "3-Day Pass Active"}
          </button>

          <button
            className={`mode-toggle-btn ${isRunningTimeMode ? "running-active" : ""}`}
            onClick={() => setIsRunningTimeMode((prev) => !prev)}
            title="Toggle Clock Mode (Stop Clock vs Running Time)"
          >
            {isRunningTimeMode ? "⚡ RUNNING TIME" : "⏹ STOP CLOCK MODE"}
          </button>

          <div className="lead-banner">{leadingTeam}</div>
        </div>

        <div className="header-actions">
          <button className="icon-btn" onClick={() => setIsHistoryModalOpen(true)} title="Match History Archive">
            📂 History ({matchHistory.length})
          </button>
          <button className="icon-btn" onClick={() => setIsTimeModalOpen(true)} title="Set Custom Time">
            ⏱️ Time
          </button>
          <button className="icon-btn" onClick={() => setIsHotkeyModalOpen(true)} title="Custom Hotkeys">
            ⌨️ Hotkeys
          </button>
          <button
            className="icon-btn lock-btn"
            onClick={() => {
              const lockNow = window.confirm("Deactivate current pass & exit to Access Code login screen?");
              if (!lockNow) return;
              setLicense(null);
              window.localStorage.removeItem(LICENSE_STORAGE_KEY);
            }}
            title="Deactivate Pass (Logout)"
          >
            🔒 Deactivate Pass
          </button>
          <button className="icon-btn" onClick={toggleFullscreen} title="Toggle Fullscreen">
            ⛶ Screen
          </button>
        </div>
      </header>

      {/* Main 3-Column Arena Display Grid */}
      <main className="arena-grid">
        {/* Left: Home Team */}
        {renderTeamCard("home", home)}

        {/* Center: Game Clock & Shot Clock */}
        <section className="center-column">
          {/* Quarter selector pills */}
          <div className="quarter-bar">
            <span className="quarter-title">QUARTER</span>
            <div className="quarter-pills">
              {[1, 2, 3, 4].map((q) => (
                <button
                  key={q}
                  className={`q-pill ${quarter === q ? "active" : ""}`}
                  onClick={() => setQuarter(q)}
                >
                  Q{q}
                </button>
              ))}
              <button
                className={`q-pill ${quarter === 5 ? "active" : ""}`}
                onClick={() => setQuarter(5)}
              >
                OT
              </button>
            </div>
          </div>

          {/* Main Game Clock Box */}
          <div className="main-clock-box">
            <div className="clock-header-row">
              <span className="clock-label">GAME CLOCK</span>
              {isRunningTimeMode && <span className="running-time-tag">⚡ RUNNING TIME</span>}
            </div>

            <div className={`game-clock-display ${gameSeconds <= 10 && gameSeconds > 0 ? "critical" : ""}`}>
              {formatClock(gameSeconds)}
            </div>

            <div className="clock-main-controls">
              {isRunning ? (
                <button className="btn-clock pause" onClick={() => setIsRunning(false)}>
                  PAUSE
                  {hotkeys.clockPause && <span className="kbd-badge">{comboToLabel(hotkeys.clockPause)}</span>}
                </button>
              ) : (
                <button
                  className="btn-clock start"
                  onClick={() => gameSeconds > 0 && setIsRunning(true)}
                  disabled={gameSeconds === 0}
                >
                  START
                  {hotkeys.clockStart && <span className="kbd-badge">{comboToLabel(hotkeys.clockStart)}</span>}
                </button>
              )}
              <button className="btn-clock" onClick={resetGameClock}>
                RESET (8m)
              </button>
            </div>
          </div>

          {/* Shot Clock Card */}
          <div className="shot-clock-card">
            <div className="shot-clock-display-wrap">
              <span className="clock-label">SHOT CLOCK</span>
              <span className={`shot-clock-number ${shotSeconds <= 5 && shotSeconds > 0 ? "critical" : ""}`}>
                {shotSeconds}
              </span>
            </div>

            <div className="shot-clock-actions">
              <button className="btn-shot" onClick={() => setShotSeconds(24)} title="Set 24s">
                24s
              </button>
              <button className="btn-shot" onClick={() => setShotSeconds(14)} title="Set 14s">
                14s
              </button>
              <button className="btn-shot" onClick={() => setShotSeconds(0)} title="Zero Shot Clock">
                0s
              </button>
            </div>
          </div>
        </section>

        {/* Right: Away Team */}
        {renderTeamCard("away", away)}
      </main>

      {/* Bottom Quick Control Desk Bar */}
      <footer className="arena-footer-desk">
        {/* Huge Horn Trigger */}
        <button
          className={`horn-btn-huge ${isHornActive ? "active" : ""}`}
          type="button"
          onMouseDown={() => void startHorn()}
          onMouseUp={stopHorn}
          onMouseLeave={stopHorn}
          onTouchStart={(event) => {
            event.preventDefault();
            void startHorn();
          }}
          onTouchEnd={stopHorn}
          onTouchCancel={stopHorn}
        >
          🔊 {isHornActive ? "BUZZING..." : "LONG HORN"}
          <kbd>SPACE</kbd>
        </button>

        {/* Save Game & History Quick Actions */}
        <div className="quick-actions-bar">
          <button className="btn-desk-action save" onClick={handleSaveCurrentMatch} title="Save current match to history">
            💾 Save Match
          </button>
          <button className="btn-desk-action" onClick={() => setShotSeconds(DEFAULT_SHOT_SECONDS)}>
            Reset Shot
            {hotkeys.resetShotClock && <span className="kbd-badge">{comboToLabel(hotkeys.resetShotClock)}</span>}
          </button>
          <button className="btn-desk-action" onClick={endQuarter}>
            End Quarter
            {hotkeys.endQuarter && <span className="kbd-badge">{comboToLabel(hotkeys.endQuarter)}</span>}
          </button>
        </div>

        {/* Action / Reset */}
        <div className="quick-actions-bar">
          <button className="btn-desk-action" onClick={() => setIsTimeModalOpen(true)}>
            Custom Time
          </button>
          <button className="btn-desk-action danger" onClick={resetEverything}>
            Reset Match
          </button>
        </div>
      </footer>
    </div>

      {/* Modal: License Info Details */}
      {isLicenseInfoModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsLicenseInfoModalOpen(false)}>
          <div className="modal-card" style={{ maxWidth: "480px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🎟️ 3-Day Pass Details</h2>
              <button className="modal-close-btn" onClick={() => setIsLicenseInfoModalOpen(false)}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="admin-contact-box" style={{ marginBottom: "1rem" }}>
                <div className="admin-contact-item">
                  <span>Activated Key:</span>
                  <strong>{license?.code}</strong>
                </div>
                <div className="admin-contact-item">
                  <span>Activated On:</span>
                  <strong>{license ? new Date(license.activatedAt).toLocaleString() : ""}</strong>
                </div>
                <div className="admin-contact-item">
                  <span>Expires On:</span>
                  <strong style={{ color: "#ef4444" }}>
                    {license ? new Date(license.expiresAt).toLocaleString() : ""}
                  </strong>
                </div>
                <div className="admin-contact-item">
                  <span>Status:</span>
                  <strong style={{ color: "#22c55e" }}>
                    {license ? formatTimeRemaining(license.expiresAt - Date.now()) : ""}
                  </strong>
                </div>
              </div>

              <button
                className="btn-desk-action danger"
                style={{ width: "100%", padding: "0.6rem" }}
                onClick={() => {
                  setLicense(null);
                  window.localStorage.removeItem(LICENSE_STORAGE_KEY);
                  setIsLicenseInfoModalOpen(false);
                }}
              >
                🔒 Deactivate Pass & Enter New Code
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Saved Games & Match History Archive */}
      {isHistoryModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsHistoryModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📂 Saved Games & Match History ({matchHistory.length})</h2>
              <button className="modal-close-btn" onClick={() => setIsHistoryModalOpen(false)}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              {matchHistory.length === 0 ? (
                <div style={{ textAlign: "center", color: "#64748b", padding: "2rem 0" }}>
                  No saved games found. Click <strong>"💾 Save Match"</strong> on the desk to store game records!
                </div>
              ) : (
                <div className="history-match-list">
                  {matchHistory.map((rec) => {
                    const isHomeWinner = rec.homeScore > rec.awayScore;
                    const isTie = rec.homeScore === rec.awayScore;
                    const winnerText = isTie ? "TIE" : isHomeWinner ? `${rec.homeName} WIN` : `${rec.awayName} WIN`;

                    return (
                      <div key={rec.id} className="history-match-card">
                        <div className="history-card-header">
                          <span className="history-date">📅 {rec.date}</span>
                          <span className="history-winner-tag">🏆 {winnerText}</span>
                        </div>

                        <div className="history-scores-row">
                          <div className="history-team-badge">
                            <span className="history-team-name">{rec.homeName}</span>
                            <span className="history-team-score">{rec.homeScore}</span>
                          </div>

                          <span className="history-vs-divider">VS</span>

                          <div className="history-team-badge">
                            <span className="history-team-name">{rec.awayName}</span>
                            <span className="history-team-score" style={{ color: "#38bdf8" }}>
                              {rec.awayScore}
                            </span>
                          </div>
                        </div>

                        <div className="history-actions-row">
                          <button
                            className="btn-paper-add"
                            style={{ background: "#0284c7", borderColor: "#0369a1" }}
                            onClick={() => setSelectedHistoryStats(selectedHistoryStats?.id === rec.id ? null : rec)}
                          >
                            {selectedHistoryStats?.id === rec.id ? "Hide Box Score" : "📋 View Stats Sheet"}
                          </button>
                          <button
                            className="btn-paper-add"
                            style={{ background: "#d97706", borderColor: "#b45309" }}
                            onClick={() => handleLoadPastMatch(rec)}
                          >
                            🔄 Load to Desk
                          </button>
                          <button
                            className="btn-paper-act del"
                            style={{ padding: "0.25rem 0.5rem" }}
                            onClick={() => handleDeleteHistoryRecord(rec.id)}
                            title="Delete Record"
                          >
                            ✕
                          </button>
                        </div>

                        {/* Expandable Past Match White Box Score Sheet */}
                        {selectedHistoryStats?.id === rec.id && (
                          <div className="paper-score-sheet" style={{ marginTop: "0.5rem" }}>
                            <div className="paper-sheet-header">
                              <span className="paper-sheet-title">📝 PAST BOX SCORE: {rec.homeName} vs {rec.awayName}</span>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                              {/* Home Stats */}
                              <div>
                                <h4 style={{ fontSize: "0.75rem", fontWeight: "900", color: "#b45309", marginBottom: "0.25rem" }}>
                                  {rec.homeName} ({rec.homeScore} PTS)
                                </h4>
                                <table className="paper-table">
                                  <thead>
                                    <tr>
                                      <th>#</th>
                                      <th className="left">PLAYER</th>
                                      <th>PTS</th>
                                      <th>F</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rec.homePlayers.map((p) => (
                                      <tr key={p.id}>
                                        <td className="paper-player-num">#{p.number}</td>
                                        <td className="left">{p.name}</td>
                                        <td className="paper-stat-badge">{p.pts}</td>
                                        <td className="paper-stat-badge">{p.fouls}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>

                              {/* Away Stats */}
                              <div>
                                <h4 style={{ fontSize: "0.75rem", fontWeight: "900", color: "#0369a1", marginBottom: "0.25rem" }}>
                                  {rec.awayName} ({rec.awayScore} PTS)
                                </h4>
                                <table className="paper-table">
                                  <thead>
                                    <tr>
                                      <th>#</th>
                                      <th className="left">PLAYER</th>
                                      <th>PTS</th>
                                      <th>F</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rec.awayPlayers.map((p) => (
                                      <tr key={p.id}>
                                        <td className="paper-player-num">#{p.number}</td>
                                        <td className="left">{p.name}</td>
                                        <td className="paper-stat-badge">{p.pts}</td>
                                        <td className="paper-stat-badge">{p.fouls}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Custom Time Selector */}
      {isTimeModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsTimeModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Set Custom Game Clock</h2>
              <button className="modal-close-btn" onClick={() => setIsTimeModalOpen(false)}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="preset-time-row">
                <button className="preset-time-btn" onClick={() => applyCustomTime("12", "00")}>
                  12:00
                </button>
                <button className="preset-time-btn" onClick={() => applyCustomTime("10", "00")}>
                  10:00
                </button>
                <button className="preset-time-btn" onClick={() => applyCustomTime("8", "00")}>
                  8:00 (Default)
                </button>
                <button className="preset-time-btn" onClick={() => applyCustomTime("5", "00")}>
                  5:00
                </button>
                <button className="preset-time-btn" onClick={() => applyCustomTime("3", "00")}>
                  3:00
                </button>
              </div>

              <div className="time-inputs-flex">
                <div className="time-field">
                  <label>MINUTES</label>
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(e.target.value)}
                  />
                </div>
                <span className="time-colon">:</span>
                <div className="time-field">
                  <label>SECONDS</label>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={customSeconds}
                    onChange={(e) => setCustomSeconds(e.target.value)}
                  />
                </div>
              </div>

              <button className="horn-btn-huge" style={{ width: "100%" }} onClick={() => applyCustomTime()}>
                APPLY TIME
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Custom Hotkeys Settings */}
      {isHotkeyModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsHotkeyModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Configure Hotkeys</h2>
              <button className="modal-close-btn" onClick={() => setIsHotkeyModalOpen(false)}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="hotkey-notice-bar">
                <span>{recordingActionId ? "Listening for keypress..." : hotkeyNotice}</span>
                <button className="btn-mini" onClick={resetHotkeys}>
                  Restore Defaults
                </button>
              </div>

              {Object.keys(actionsByCategory).map((category) => {
                const actions = actionsByCategory[category];
                return (
                  <div key={category} className="hotkey-category-section">
                    <h3>{category}</h3>
                    <div className="hotkey-grid">
                      {actions.map((action) => {
                        const isRecording = recordingActionId === action.id;
                        const assignedKey = comboToLabel(hotkeys[action.id]);

                        return (
                          <div key={action.id} className="hotkey-row-card">
                            <span>{action.label}</span>
                            <div className="actions">
                              <span className="kbd-badge">{isRecording ? "Press key..." : assignedKey || "None"}</span>
                              <button
                                className={`btn-rebind ${isRecording ? "recording" : ""}`}
                                onClick={() => {
                                  setRecordingActionId(action.id);
                                  setHotkeyNotice(
                                    `Press any key combo for "${action.label}". (Space is reserved for Horn)`
                                  );
                                }}
                              >
                                {isRecording ? "Stop" : "Change"}
                              </button>
                              {assignedKey && (
                                <button className="btn-mini" onClick={() => clearHotkey(action.id)}>
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;