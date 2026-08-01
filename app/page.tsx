"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { STICKER_DATA } from "./sticker-data.generated";

type Placement = {
  id: string;
  stickerId: number;
  x: number;
  y: number;
  rotation: number;
  size: number;
  createdAt: string;
};

type FlyingSticker = {
  placement: Placement;
  dx: number;
  dy: number;
};

const STICKERS = Array.from({ length: 35 }, (_, index) => index + 1);
const STORAGE_KEY = "noor-sticker-wall-v1";
const SOUND_KEY = "noor-sticker-wall-sound";

function stickerPath(id: number) {
  return STICKER_DATA[id - 1];
}

function stickerSize(id: number) {
  if (id >= 21 && id <= 25) return 104;
  if (id >= 26) return 82;
  return 94;
}

function localDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function playCelebrationChime() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.14, context.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.72);
    gain.connect(context.destination);

    [659.25, 783.99, 1046.5].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(context.currentTime + index * 0.11);
      oscillator.stop(context.currentTime + 0.48 + index * 0.11);
    });
    window.setTimeout(() => void context.close(), 1100);
  } catch {
    // Sound is a bonus. The sticker interaction still works without it.
  }
}

export default function Home() {
  const wallRef = useRef<HTMLDivElement>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [selectedSticker, setSelectedSticker] = useState<number | null>(null);
  const [flying, setFlying] = useState<FlyingSticker | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [parentOpen, setParentOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [ready, setReady] = useState(false);
  const [celebration, setCelebration] = useState<{
    stickerId: number;
    message: string;
  } | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setPlacements(JSON.parse(saved) as Placement[]);
      const savedSound = window.localStorage.getItem(SOUND_KEY);
      if (savedSound !== null) setSoundOn(savedSound === "true");
    } catch {
      // Start with a fresh wall if old browser data is unavailable or malformed.
    }
    setReady(true);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(placements));
  }, [placements, ready]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(SOUND_KEY, String(soundOn));
  }, [soundOn, ready]);

  const todayCount = useMemo(() => {
    const today = localDateKey(new Date());
    return placements.filter((item) => localDateKey(item.createdAt) === today)
      .length;
  }, [placements]);

  function chooseSticker(id: number) {
    setSelectedSticker(id);
    setPickerOpen(false);
    setResetConfirm(false);
    if (navigator.vibrate) navigator.vibrate(18);
  }

  function placeSticker(event: React.PointerEvent<HTMLDivElement>) {
    if (selectedSticker === null || flying) return;
    const wall = wallRef.current;
    if (!wall) return;

    const rect = wall.getBoundingClientRect();
    const localX = Math.min(Math.max(event.clientX - rect.left, 44), rect.width - 44);
    const localY = Math.min(Math.max(event.clientY - rect.top, 48), rect.height - 76);
    const x = (localX / rect.width) * 100;
    const y = (localY / rect.height) * 100;
    const rotation = Math.round(Math.random() * 14 - 7);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const placement: Placement = {
      id,
      stickerId: selectedSticker,
      x,
      y,
      rotation,
      size: stickerSize(selectedSticker),
      createdAt: new Date().toISOString(),
    };

    setFlying({
      placement,
      dx: rect.width / 2 - localX,
      dy: rect.height + 112 - localY,
    });

    window.setTimeout(() => {
      setPlacements((current) => [...current, placement]);
      setFlying(null);
      setSelectedSticker(null);
      const nextTotal = placements.length + 1;
      setCelebration({
        stickerId: placement.stickerId,
        message: nextTotal % 5 === 0 ? "يا سلام! خمس نجمات!" : "برافو يا نور!",
      });
      if (soundOn) playCelebrationChime();
      if (navigator.vibrate) navigator.vibrate([30, 45, 55]);
      window.setTimeout(() => setCelebration(null), 1900);
    }, 880);
  }

  function undoLastSticker() {
    setPlacements((current) => current.slice(0, -1));
    setResetConfirm(false);
  }

  function resetWall() {
    if (!resetConfirm) {
      setResetConfirm(true);
      return;
    }
    setPlacements([]);
    setSelectedSticker(null);
    setParentOpen(false);
    setResetConfirm(false);
  }

  return (
    <main className="app-viewport" dir="rtl">
      <div className="app-shell">
        <header className="topbar">
          <button
            className="parent-button"
            type="button"
            aria-label="إعدادات الكبار"
            onClick={() => {
              setParentOpen(true);
              setResetConfirm(false);
            }}
          >
            <span aria-hidden="true">•••</span>
          </button>

          <div className="title-lockup">
            <span className="tiny-star" aria-hidden="true">★</span>
            <div>
              <p>جدار إنجازاتي</p>
              <h1>نور</h1>
            </div>
          </div>

          <div className="today-pill" aria-label={`${todayCount} ملصقات اليوم`}>
            <span aria-hidden="true">⭐</span>
            <div>
              <small>اليوم</small>
              <strong>{todayCount}</strong>
            </div>
          </div>
        </header>

        <section className="wall-card" aria-label="جدار ملصقات نور">
          <div className="wall-arch" aria-hidden="true" />
          <div className="bubble bubble-one" aria-hidden="true" />
          <div className="bubble bubble-two" aria-hidden="true" />
          <div className="bubble bubble-three" aria-hidden="true" />

          <div
            className={`sticker-wall ${selectedSticker ? "is-ready" : ""}`}
            ref={wallRef}
            onPointerUp={placeSticker}
            role="application"
            aria-label={
              selectedSticker
                ? "المسي أي مكان فارغ على الجدار للصق الملصق"
                : `على الجدار ${placements.length} ملصق`
            }
          >
            {placements.length === 0 && !selectedSticker && ready ? (
              <div className="empty-wall" aria-hidden="true">
                <span className="empty-sparkle">✦</span>
                <img src={stickerPath(30)} alt="" />
                <p>هنا تبدأ<br />إنجازات نور</p>
                <small>كل مرة حمام = ستيكر جديد</small>
              </div>
            ) : null}

            {placements.map((item) => (
              <div
                className="placed-sticker"
                key={item.id}
                style={
                  {
                    left: `${item.x}%`,
                    top: `${item.y}%`,
                    "--rotation": `${item.rotation}deg`,
                    "--sticker-size": `${item.size}px`,
                  } as React.CSSProperties
                }
              >
                <img src={stickerPath(item.stickerId)} alt="" draggable={false} />
              </div>
            ))}

            {flying ? (
              <div
                className="flying-sticker"
                style={
                  {
                    left: `${flying.placement.x}%`,
                    top: `${flying.placement.y}%`,
                    "--dx": `${flying.dx}px`,
                    "--dy": `${flying.dy}px`,
                    "--dx-mid": `${flying.dx * 0.7}px`,
                    "--dy-mid": `${flying.dy * 0.48}px`,
                    "--dx-near": `${flying.dx * 0.11}px`,
                    "--dy-lift": `${flying.dy * -0.08}px`,
                    "--rotation": `${flying.placement.rotation}deg`,
                    "--sticker-size": `${flying.placement.size}px`,
                  } as React.CSSProperties
                }
              >
                <img
                  src={stickerPath(flying.placement.stickerId)}
                  alt="الملصق يطير إلى الجدار"
                  draggable={false}
                />
                <i className="landing-sparkle sparkle-a" aria-hidden="true">✦</i>
                <i className="landing-sparkle sparkle-b" aria-hidden="true">✦</i>
                <i className="landing-sparkle sparkle-c" aria-hidden="true">●</i>
              </div>
            ) : null}

            {selectedSticker && !flying ? (
              <div className="tap-hint" aria-live="polite">
                <span className="tap-finger" aria-hidden="true">👆</span>
                <div>
                  <strong>اختاري مكانه</strong>
                  <small>المسي الجدار يا نور</small>
                </div>
                <img src={stickerPath(selectedSticker)} alt="الملصق المختار" />
              </div>
            ) : null}
          </div>

          <div className="bathroom-shelf" aria-hidden="true">
            <span className="plant-pot"><i /><i /><i /></span>
            <span className="soap-bottle"><i /></span>
            <span className="rolled-towel" />
          </div>
        </section>

        <div className="bottom-actions">
          <button
            className="add-sticker-button"
            type="button"
            onClick={() => {
              setPickerOpen(true);
              setSelectedSticker(null);
            }}
          >
            <span className="button-star" aria-hidden="true">★</span>
            <span>
              <strong>أخذت ستيكر!</strong>
              <small>اختاري مكافأتك</small>
            </span>
            <span className="button-plus" aria-hidden="true">＋</span>
          </button>
          <p className="total-count">على جداري الآن <strong>{placements.length}</strong> ستيكر</p>
        </div>

        {pickerOpen ? (
          <div className="sheet-layer" role="dialog" aria-modal="true" aria-labelledby="picker-title">
            <button
              className="sheet-backdrop"
              type="button"
              aria-label="إغلاق"
              onClick={() => setPickerOpen(false)}
            />
            <section className="sticker-sheet">
              <div className="sheet-handle" aria-hidden="true" />
              <div className="sheet-heading">
                <div>
                  <p>مكافأة نور</p>
                  <h2 id="picker-title">اختاري ستيكرك ✨</h2>
                </div>
                <button type="button" onClick={() => setPickerOpen(false)} aria-label="إغلاق">×</button>
              </div>
              <div className="sticker-grid">
                {STICKERS.map((id) => (
                  <button
                    type="button"
                    className="sticker-choice"
                    key={id}
                    onClick={() => chooseSticker(id)}
                    aria-label={`اختيار الملصق ${id}`}
                  >
                    <img src={stickerPath(id)} alt="" draggable={false} />
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {parentOpen ? (
          <div className="sheet-layer" role="dialog" aria-modal="true" aria-labelledby="parent-title">
            <button
              className="sheet-backdrop"
              type="button"
              aria-label="إغلاق"
              onClick={() => setParentOpen(false)}
            />
            <section className="parent-sheet">
              <div className="sheet-handle" aria-hidden="true" />
              <div className="sheet-heading">
                <div>
                  <p>للأب والأم</p>
                  <h2 id="parent-title">إعدادات الجدار</h2>
                </div>
                <button type="button" onClick={() => setParentOpen(false)} aria-label="إغلاق">×</button>
              </div>

              <div className="parent-stats">
                <div><small>ملصقات اليوم</small><strong>{todayCount}</strong></div>
                <div><small>كل الإنجازات</small><strong>{placements.length}</strong></div>
              </div>

              <button
                className="settings-row"
                type="button"
                onClick={() => setSoundOn((value) => !value)}
              >
                <span>{soundOn ? "🔔" : "🔕"}</span>
                <div><strong>صوت الاحتفال</strong><small>{soundOn ? "مفعّل" : "متوقف"}</small></div>
                <i className={`toggle ${soundOn ? "on" : ""}`} aria-hidden="true"><b /></i>
              </button>

              <button
                className="settings-row"
                type="button"
                onClick={undoLastSticker}
                disabled={placements.length === 0}
              >
                <span>↶</span>
                <div><strong>إزالة آخر ستيكر</strong><small>للتراجع عن اللمسات بالغلط</small></div>
              </button>

              <button
                className={`reset-button ${resetConfirm ? "confirm" : ""}`}
                type="button"
                onClick={resetWall}
                disabled={placements.length === 0}
              >
                {resetConfirm ? "اضغطي مرة ثانية للتأكيد" : "بدء جدار جديد"}
              </button>
            </section>
          </div>
        ) : null}

        {celebration ? (
          <div className="celebration" role="status" aria-live="assertive">
            <div className="celebration-glow" />
            <div className="confetti" aria-hidden="true">
              {Array.from({ length: 14 }, (_, index) => (
                <i key={index} style={{ "--i": index } as React.CSSProperties} />
              ))}
            </div>
            <img src={stickerPath(celebration.stickerId)} alt="" />
            <strong>{celebration.message}</strong>
            <span>إنجاز جديد على الجدار ⭐</span>
          </div>
        ) : null}
      </div>
    </main>
  );
}
