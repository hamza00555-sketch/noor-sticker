"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { BATHROOM_WALL_ASSET } from "./bathroom-asset.generated";
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

type DraftSticker = Omit<Placement, "id" | "createdAt">;

type PointerPoint = {
  x: number;
  y: number;
};

type DragAnchor = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
};

type RotationGesture = {
  pointerIds: [number, number];
  startAngle: number;
  startRotation: number;
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

function angleBetween(first: PointerPoint, second: PointerPoint) {
  return Math.atan2(second.y - first.y, second.x - first.x) * (180 / Math.PI);
}

function normalizeRotation(rotation: number) {
  return ((rotation + 540) % 360) - 180;
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
  const draftRef = useRef<DraftSticker | null>(null);
  const activePointersRef = useRef(new Map<number, PointerPoint>());
  const dragAnchorRef = useRef<DragAnchor | null>(null);
  const rotationGestureRef = useRef<RotationGesture | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [selectedSticker, setSelectedSticker] = useState<number | null>(null);
  const [draftSticker, setDraftSticker] = useState<DraftSticker | null>(null);
  const [stickingId, setStickingId] = useState<string | null>(null);
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
    draftRef.current = null;
    activePointersRef.current.clear();
    dragAnchorRef.current = null;
    rotationGestureRef.current = null;
    setDraftSticker(null);
    setSelectedSticker(id);
    setPickerOpen(false);
    setResetConfirm(false);
    if (navigator.vibrate) navigator.vibrate(18);
  }

  function updateDraft(next: DraftSticker) {
    draftRef.current = next;
    setDraftSticker(next);
  }

  function clampedPosition(clientX: number, clientY: number, size: number) {
    const wall = wallRef.current;
    if (!wall) return null;

    const rect = wall.getBoundingClientRect();
    const edge = Math.min(size / 2 + 4, rect.width / 2, rect.height / 2);
    const localX = Math.min(Math.max(clientX - rect.left, edge), rect.width - edge);
    const localY = Math.min(Math.max(clientY - rect.top, edge), rect.height - edge);
    return {
      x: (localX / rect.width) * 100,
      y: (localY / rect.height) * 100,
    };
  }

  function beginRotationGesture() {
    const draft = draftRef.current;
    const entries = Array.from(activePointersRef.current.entries());
    if (!draft || entries.length < 2) {
      rotationGestureRef.current = null;
      return;
    }

    const [[firstId, first], [secondId, second]] = entries;
    rotationGestureRef.current = {
      pointerIds: [firstId, secondId],
      startAngle: angleBetween(first, second),
      startRotation: draft.rotation,
    };
  }

  function refreshDraftFromPointers() {
    const draft = draftRef.current;
    const wall = wallRef.current;
    if (!draft || !wall) return;

    let next = draft;
    const anchor = dragAnchorRef.current;
    const anchorPoint = anchor
      ? activePointersRef.current.get(anchor.pointerId)
      : undefined;

    if (anchor && anchorPoint) {
      const position = clampedPosition(
        anchorPoint.x + anchor.offsetX,
        anchorPoint.y + anchor.offsetY,
        draft.size,
      );
      if (position) next = { ...next, ...position };
    }

    const rotationGesture = rotationGestureRef.current;
    if (rotationGesture) {
      const first = activePointersRef.current.get(rotationGesture.pointerIds[0]);
      const second = activePointersRef.current.get(rotationGesture.pointerIds[1]);
      if (first && second) {
        const angleDelta = angleBetween(first, second) - rotationGesture.startAngle;
        next = {
          ...next,
          rotation: normalizeRotation(rotationGesture.startRotation + angleDelta),
        };
      }
    }

    updateDraft(next);
  }

  function updatePointerFromEvent(event: React.PointerEvent<HTMLDivElement>) {
    const previousPoint = activePointersRef.current.get(event.pointerId);
    activePointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    const draft = draftRef.current;
    if (
      event.shiftKey &&
      activePointersRef.current.size === 1 &&
      draft &&
      previousPoint
    ) {
      updateDraft({
        ...draft,
        rotation: normalizeRotation(
          draft.rotation + (event.clientX - previousPoint.x) * 0.85,
        ),
      });
      return;
    }

    refreshDraftFromPointers();
  }

  function moveAnchorToRemainingPointer() {
    const draft = draftRef.current;
    const wall = wallRef.current;
    const nextPointer = activePointersRef.current.entries().next().value as
      | [number, PointerPoint]
      | undefined;
    if (!draft || !wall || !nextPointer) {
      dragAnchorRef.current = null;
      return;
    }

    const [pointerId, point] = nextPointer;
    const rect = wall.getBoundingClientRect();
    const centerX = rect.left + (draft.x / 100) * rect.width;
    const centerY = rect.top + (draft.y / 100) * rect.height;
    dragAnchorRef.current = {
      pointerId,
      offsetX: centerX - point.x,
      offsetY: centerY - point.y,
    };
  }

  function placeDraft() {
    const draft = draftRef.current;
    if (!draft) return;

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const placement: Placement = {
      id,
      ...draft,
      createdAt: new Date().toISOString(),
    };

    const nextTotal = placements.length + 1;
    setPlacements((current) => [...current, placement]);
    setStickingId(id);
    setSelectedSticker(null);
    draftRef.current = null;
    setDraftSticker(null);

    window.setTimeout(() => setStickingId((current) => current === id ? null : current), 620);
    window.setTimeout(() => {
      setCelebration({
        stickerId: placement.stickerId,
        message: nextTotal % 5 === 0 ? "يا سلام! خمس نجمات!" : "برافو يا نور!",
      });
      if (soundOn) playCelebrationChime();
      if (navigator.vibrate) navigator.vibrate([30, 45, 55]);
      window.setTimeout(() => setCelebration(null), 1900);
    }, 360);
  }

  function startStickerDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (selectedSticker === null || stickingId) return;
    event.preventDefault();

    activePointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some embedded browsers do not support pointer capture; the drag still works inside the wall.
    }

    if (!draftRef.current) {
      const size = stickerSize(selectedSticker);
      const position = clampedPosition(event.clientX, event.clientY, size);
      if (!position) return;
      updateDraft({
        stickerId: selectedSticker,
        ...position,
        rotation: 0,
        size,
      });
      dragAnchorRef.current = {
        pointerId: event.pointerId,
        offsetX: 0,
        offsetY: 0,
      };
    } else if (!dragAnchorRef.current) {
      moveAnchorToRemainingPointer();
    }

    if (activePointersRef.current.size >= 2) beginRotationGesture();
  }

  function moveStickerDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!activePointersRef.current.has(event.pointerId)) return;
    event.preventDefault();
    updatePointerFromEvent(event);
  }

  function finishStickerDrag(
    event: React.PointerEvent<HTMLDivElement>,
    cancelled = false,
  ) {
    if (!activePointersRef.current.has(event.pointerId)) return;
    event.preventDefault();

    if (!cancelled) {
      updatePointerFromEvent(event);
    }

    activePointersRef.current.delete(event.pointerId);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Pointer capture is optional, so a missing implementation is safe to ignore.
    }

    if (activePointersRef.current.size > 0) {
      if (dragAnchorRef.current?.pointerId === event.pointerId) {
        moveAnchorToRemainingPointer();
      }
      beginRotationGesture();
      return;
    }

    dragAnchorRef.current = null;
    rotationGestureRef.current = null;
    if (cancelled) {
      draftRef.current = null;
      setDraftSticker(null);
      return;
    }

    placeDraft();
  }

  function rotateDraftWithWheel(event: React.WheelEvent<HTMLDivElement>) {
    const draft = draftRef.current;
    if (!draft) return;
    event.preventDefault();
    updateDraft({
      ...draft,
      rotation: normalizeRotation(draft.rotation + (event.deltaY > 0 ? 7 : -7)),
    });
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
    draftRef.current = null;
    activePointersRef.current.clear();
    dragAnchorRef.current = null;
    rotationGestureRef.current = null;
    setDraftSticker(null);
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
          <Image
            className="bathroom-scene"
            src={BATHROOM_WALL_ASSET}
            alt=""
            aria-hidden="true"
            draggable={false}
            fill
            priority
            unoptimized
            sizes="(max-width: 540px) calc(100vw - 24px), 516px"
          />
          <div className="bubble bubble-one" aria-hidden="true" />
          <div className="bubble bubble-two" aria-hidden="true" />
          <div className="bubble bubble-three" aria-hidden="true" />

          <div
            className={`sticker-wall ${selectedSticker ? "is-ready" : ""} ${draftSticker ? "is-dragging" : ""}`}
            ref={wallRef}
            onPointerDown={startStickerDrag}
            onPointerMove={moveStickerDrag}
            onPointerUp={finishStickerDrag}
            onPointerCancel={(event) => finishStickerDrag(event, true)}
            onWheel={rotateDraftWithWheel}
            role="application"
            aria-label={
              selectedSticker
                ? "اسحبي الملصق على الجدار، لفيه بإصبعين، ثم ارفعي يدك ليلتصق"
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
                className={`placed-sticker ${stickingId === item.id ? "is-sticking" : ""}`}
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
                {stickingId === item.id ? (
                  <>
                    <i className="stick-sparkle stick-sparkle-a" aria-hidden="true">✦</i>
                    <i className="stick-sparkle stick-sparkle-b" aria-hidden="true">✦</i>
                    <i className="stick-sparkle stick-sparkle-c" aria-hidden="true">●</i>
                  </>
                ) : null}
              </div>
            ))}

            {draftSticker ? (
              <div
                className="draft-sticker"
                style={
                  {
                    left: `${draftSticker.x}%`,
                    top: `${draftSticker.y}%`,
                    "--rotation": `${draftSticker.rotation}deg`,
                    "--sticker-size": `${draftSticker.size}px`,
                  } as React.CSSProperties
                }
              >
                <img
                  src={stickerPath(draftSticker.stickerId)}
                  alt="معاينة الستيكر قبل لصقه"
                  draggable={false}
                />
                <span className="rotation-badge" aria-hidden="true">
                  ↻ {Math.round(draftSticker.rotation)}°
                </span>
              </div>
            ) : null}

            {draftSticker ? (
              <div className="drag-instruction" aria-live="polite">
                <span aria-hidden="true">↻</span>
                <strong>لفّيه بإصبعين</strong>
                <small>وارفعي يدك عشان يلصق</small>
              </div>
            ) : null}

            {selectedSticker && !draftSticker ? (
              <div className="tap-hint" aria-live="polite">
                <span className="tap-finger" aria-hidden="true">✋</span>
                <div>
                  <strong>اسحبي الستيكر</strong>
                  <small>لفّيه بإصبعين، وبعدها اتركيه</small>
                </div>
                <img src={stickerPath(selectedSticker)} alt="الملصق المختار" />
              </div>
            ) : null}
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
