import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_GAME_SECONDS = 8 * 60; // 8 minutes default
const DEFAULT_SHOT_SECONDS = 24;
const DEFAULT_TIMEOUTS = 5;
const HOTKEY_STORAGE_KEY = "basketball-scoreboard-hotkeys-v5";
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
  { id: "endQuarter", label: "End Quarter", category: "Game Actions" },
  { id: "resetEverything", label: "Reset Everything", category: "Game Actions" },
] as const;

type ActionDefinition = (typeof ACTION_DEFINITIONS)[number];
type ActionId = ActionDefinition["id"];
type HotkeyMap = Partial<Record<ActionId, string>>;
type TeamSide = "home" | "away";

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

function App() {
  const [home, setHome] = useState<Team>(() => createTeam("HOME", "home"));
  const [away, setAway] = useState<Team>(() => createTeam("AWAY", "away"));
  const [quarter, setQuarter] = useState(1);
  const [gameSeconds, setGameSeconds] = useState(DEFAULT_GAME_SECONDS);
  const [shotSeconds, setShotSeconds] = useState(DEFAULT_SHOT_SECONDS);
  const [isRunning, setIsRunning] = useState(false);
  const [isRunningTimeMode, setIsRunningTimeMode] = useState(false);

  // Modals & Popovers
  const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);
  const [isHotkeyModalOpen, setIsHotkeyModalOpen] = useState(false);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [activeStatsTab, setActiveStatsTab] = useState<TeamSide>("home");

  // Form Inputs for Adding Player
  const [newPlayerNumber, setNewPlayerNumber] = useState("");
  const [newPlayerName, setNewPlayerName] = useState("");

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
    },
    [updateTeam]
  );

  const adjustScore = useCallback(
    (side: TeamSide, amount: number) => {
      updateTeam(side, (team) => ({
        ...team,
        score: Math.max(0, team.score + amount),
      }));
      checkRunningTimeResume();
    },
    [checkRunningTimeResume, updateTeam]
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

  // Player Stats Operations
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

          if (statKey === "pts") scoreDiff = diff;
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
    [checkRunningTimeResume, updateTeam]
  );

  const handleAddPlayer = useCallback(
    (side: TeamSide) => {
      if (!newPlayerNumber.trim() || !newPlayerName.trim()) return;

      updateTeam(side, (team) => {
        const newPlayer: Player = {
          id: `p-${Date.now()}`,
          number: newPlayerNumber.trim(),
          name: newPlayerName.trim(),
          pts: 0,
          fouls: 0,
          reb: 0,
          ast: 0,
          stl: 0,
          blk: 0,
        };
        return { ...team, players: [...team.players, newPlayer] };
      });

      setNewPlayerNumber("");
      setNewPlayerName("");
    },
    [newPlayerName, newPlayerNumber, updateTeam]
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
    const shouldReset = window.confirm("Reset the entire scoreboard and player stats?");
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
  }, [assignHotkey, executeAction, hotkeyLookup, recordingActionId, startHorn, stopHorn]);

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

  // Compute Top Scorer & Foul Trouble for Team Card
  const getTeamHighlights = (team: Team) => {
    const topScorer = [...team.players].sort((a, b) => b.pts - a.pts)[0];
    const foulTrouble = team.players.find((p) => p.fouls >= 4);

    return {
      topScorer: topScorer && topScorer.pts > 0 ? `#${topScorer.number} ${topScorer.name} (${topScorer.pts}p)` : null,
      foulTrouble: foulTrouble ? `#${foulTrouble.number} ${foulTrouble.name} (${foulTrouble.fouls} PF)` : null,
    };
  };

  const renderTeamCard = (side: TeamSide, team: Team) => {
    const isHome = side === "home";
    const prefix = isHome ? "home" : "away";
    const highlights = getTeamHighlights(team);

    return (
      <section className={`team-card ${isHome ? "home" : "away"}`}>
        <div className="team-header-row">
          <span className="team-tag">{isHome ? "HOME TEAM" : "AWAY TEAM"}</span>
          <button
            className="roster-drawer-btn"
            onClick={() => {
              setActiveStatsTab(side);
              setIsStatsModalOpen(true);
            }}
          >
            👥 Roster ({team.players.length})
          </button>
        </div>

        <input
          className="team-name-input"
          aria-label={`${isHome ? "Home" : "Away"} team name`}
          value={team.name}
          maxLength={18}
          onChange={(event) => setTeamName(side, event.target.value)}
        />

        {/* Player Stats Highlights */}
        {(highlights.topScorer || highlights.foulTrouble) && (
          <div className="player-summary-strip">
            {highlights.topScorer ? (
              <span className="top-scorer-badge">🔥 {highlights.topScorer}</span>
            ) : (
              <span></span>
            )}
            {highlights.foulTrouble && (
              <span className="foul-warning-badge">⚠️ {highlights.foulTrouble}</span>
            )}
          </div>
        )}

        <div className="score-box">
          <span className="score-number">{team.score}</span>
        </div>

        <div className="score-actions-grid">
          <button
            className="btn-score"
            onClick={() => adjustScore(side, 1)}
            title={`+1 Point (${comboToLabel(hotkeys[`${prefix}ScorePlus1` as ActionId])})`}
          >
            +1
            {hotkeys[`${prefix}ScorePlus1` as ActionId] && (
              <span className="kbd-badge">{comboToLabel(hotkeys[`${prefix}ScorePlus1` as ActionId])}</span>
            )}
          </button>
          <button
            className="btn-score"
            onClick={() => adjustScore(side, 2)}
            title={`+2 Points (${comboToLabel(hotkeys[`${prefix}ScorePlus2` as ActionId])})`}
          >
            +2
            {hotkeys[`${prefix}ScorePlus2` as ActionId] && (
              <span className="kbd-badge">{comboToLabel(hotkeys[`${prefix}ScorePlus2` as ActionId])}</span>
            )}
          </button>
          <button
            className="btn-score"
            onClick={() => adjustScore(side, 3)}
            title={`+3 Points (${comboToLabel(hotkeys[`${prefix}ScorePlus3` as ActionId])})`}
          >
            +3
            {hotkeys[`${prefix}ScorePlus3` as ActionId] && (
              <span className="kbd-badge">{comboToLabel(hotkeys[`${prefix}ScorePlus3` as ActionId])}</span>
            )}
          </button>
          <button
            className="btn-score minus"
            onClick={() => adjustScore(side, -1)}
            title={`-1 Point (${comboToLabel(hotkeys[`${prefix}ScoreMinus1` as ActionId])})`}
          >
            -1
            {hotkeys[`${prefix}ScoreMinus1` as ActionId] && (
              <span className="kbd-badge">{comboToLabel(hotkeys[`${prefix}ScoreMinus1` as ActionId])}</span>
            )}
          </button>
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
      </section>
    );
  };

  const currentStatsTeam = activeStatsTab === "home" ? home : away;

  return (
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
          <button
            className="icon-btn stats-btn"
            onClick={() => setIsStatsModalOpen(true)}
            title="Player Stats & Box Score"
          >
            📊 Player Stats
          </button>
          <button className="icon-btn" onClick={() => setIsTimeModalOpen(true)} title="Set Custom Time">
            ⏱️ Time
          </button>
          <button className="icon-btn" onClick={() => setIsHotkeyModalOpen(true)} title="Custom Hotkeys">
            ⌨️ Hotkeys
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

          {/* Main Game Clock Card */}
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

        {/* Quick Actions */}
        <div className="quick-actions-bar">
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

      {/* Modal: Player Stats Tracker & Roster Manager */}
      {isStatsModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsStatsModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Player Stats & Box Score</h2>
              <button className="modal-close-btn" onClick={() => setIsStatsModalOpen(false)}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              {/* Team Tabs */}
              <div className="team-tab-bar">
                <button
                  className={`team-tab-btn home-tab ${activeStatsTab === "home" ? "active" : ""}`}
                  onClick={() => setActiveStatsTab("home")}
                >
                  {home.name} ({home.score} PTS)
                </button>
                <button
                  className={`team-tab-btn away-tab ${activeStatsTab === "away" ? "active" : ""}`}
                  onClick={() => setActiveStatsTab("away")}
                >
                  {away.name} ({away.score} PTS)
                </button>
              </div>

              {/* Add New Player Form */}
              <div className="add-player-form">
                <input
                  className="num-input"
                  placeholder="# Jersey"
                  maxLength={3}
                  value={newPlayerNumber}
                  onChange={(e) => setNewPlayerNumber(e.target.value)}
                />
                <input
                  className="name-input"
                  placeholder="Player Name (e.g. J. Cruz)"
                  maxLength={24}
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                />
                <button className="btn-add-player" onClick={() => handleAddPlayer(activeStatsTab)}>
                  + Add Player
                </button>
              </div>

              {/* Player Stats Table */}
              <table className="player-stats-table">
                <thead>
                  <tr>
                    <th style={{ width: "8%" }}>#</th>
                    <th className="left">PLAYER</th>
                    <th style={{ width: "16%" }}>PTS</th>
                    <th style={{ width: "16%" }}>FOULS</th>
                    <th style={{ width: "12%" }}>REB</th>
                    <th style={{ width: "12%" }}>AST</th>
                    <th style={{ width: "10%" }}>STL</th>
                    <th style={{ width: "10%" }}>BLK</th>
                    <th style={{ width: "8%" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {currentStatsTeam.players.map((player) => (
                    <tr key={player.id}>
                      <td className="player-num">#{player.number}</td>
                      <td>
                        <div className="player-name-cell">
                          <span>{player.name}</span>
                          {player.fouls >= 5 && <span className="fouled-out-badge">FOULED OUT</span>}
                          {player.fouls === 4 && <span className="foul-warning-badge-sm">4 PF</span>}
                        </div>
                      </td>

                      {/* Points */}
                      <td>
                        <div className="stat-cell-wrap">
                          <span className="stat-number">{player.pts}</span>
                          <button
                            className="btn-stat-inc pts"
                            onClick={() => adjustPlayerStat(activeStatsTab, player.id, "pts", 1)}
                            title="+1 Point"
                          >
                            +1
                          </button>
                          <button
                            className="btn-stat-inc pts"
                            onClick={() => adjustPlayerStat(activeStatsTab, player.id, "pts", 2)}
                            title="+2 Points"
                          >
                            +2
                          </button>
                          <button
                            className="btn-stat-inc pts"
                            onClick={() => adjustPlayerStat(activeStatsTab, player.id, "pts", 3)}
                            title="+3 Points"
                          >
                            +3
                          </button>
                        </div>
                      </td>

                      {/* Fouls */}
                      <td>
                        <div className="stat-cell-wrap">
                          <span className="stat-number" style={{ color: player.fouls >= 5 ? "#ef4444" : "#fff" }}>
                            {player.fouls}
                          </span>
                          <button
                            className="btn-stat-inc foul"
                            onClick={() => adjustPlayerStat(activeStatsTab, player.id, "fouls", 1)}
                            title="+1 Foul"
                          >
                            +F
                          </button>
                        </div>
                      </td>

                      {/* Rebounds */}
                      <td>
                        <div className="stat-cell-wrap">
                          <span className="stat-number">{player.reb}</span>
                          <button
                            className="btn-stat-inc"
                            onClick={() => adjustPlayerStat(activeStatsTab, player.id, "reb", 1)}
                          >
                            +1
                          </button>
                        </div>
                      </td>

                      {/* Assists */}
                      <td>
                        <div className="stat-cell-wrap">
                          <span className="stat-number">{player.ast}</span>
                          <button
                            className="btn-stat-inc"
                            onClick={() => adjustPlayerStat(activeStatsTab, player.id, "ast", 1)}
                          >
                            +1
                          </button>
                        </div>
                      </td>

                      {/* Steals */}
                      <td>
                        <div className="stat-cell-wrap">
                          <span className="stat-number">{player.stl}</span>
                          <button
                            className="btn-stat-inc"
                            onClick={() => adjustPlayerStat(activeStatsTab, player.id, "stl", 1)}
                          >
                            +1
                          </button>
                        </div>
                      </td>

                      {/* Blocks */}
                      <td>
                        <div className="stat-cell-wrap">
                          <span className="stat-number">{player.blk}</span>
                          <button
                            className="btn-stat-inc"
                            onClick={() => adjustPlayerStat(activeStatsTab, player.id, "blk", 1)}
                          >
                            +1
                          </button>
                        </div>
                      </td>

                      {/* Delete */}
                      <td>
                        <button
                          className="btn-stat-inc del"
                          onClick={() => handleDeletePlayer(activeStatsTab, player.id)}
                          title="Remove Player"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                  {currentStatsTeam.players.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ textAlign: "center", color: "#94a3b8", padding: "2rem" }}>
                        No players added to roster yet. Use the form above to add players.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
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
    </div>
  );
}

export default App;