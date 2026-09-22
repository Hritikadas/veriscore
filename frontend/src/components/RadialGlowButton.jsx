import React from "react";

const RG_CSS = `
@property --rg-pos-x { syntax: '<percentage>'; initial-value: 40%; inherits: false; }
@property --rg-pos-y { syntax: '<percentage>'; initial-value: 140%; inherits: false; }
@property --rg-spread-x { syntax: '<percentage>'; initial-value: 130%; inherits: false; }
@property --rg-spread-y { syntax: '<percentage>'; initial-value: 170%; inherits: false; }
@property --rg-color-1 { syntax: '<color>'; initial-value: #071A3D; inherits: false; }
@property --rg-color-2 { syntax: '<color>'; initial-value: #0B4DBB; inherits: false; }
@property --rg-color-3 { syntax: '<color>'; initial-value: #1677FF; inherits: false; }
@property --rg-color-4 { syntax: '<color>'; initial-value: #1677FF; inherits: false; }
@property --rg-color-5 { syntax: '<color>'; initial-value: #0B4DBB; inherits: false; }
@property --rg-border-angle { syntax: '<angle>'; initial-value: 180deg; inherits: true; }
@property --rg-border-color-1 { syntax: '<color>'; initial-value: hsla(214, 100%, 75%, 0.42); inherits: true; }
@property --rg-border-color-2 { syntax: '<color>'; initial-value: hsla(214, 100%, 98%, 0.6); inherits: true; }
@property --rg-stop-1 { syntax: '<percentage>'; initial-value: 35%; inherits: false; }
@property --rg-stop-2 { syntax: '<percentage>'; initial-value: 58%; inherits: false; }
@property --rg-stop-3 { syntax: '<percentage>'; initial-value: 76%; inherits: false; }
@property --rg-stop-4 { syntax: '<percentage>'; initial-value: 90%; inherits: false; }
@property --rg-stop-5 { syntax: '<percentage>'; initial-value: 100%; inherits: false; }

.rg-wrap {
  position: relative;
  display: inline-block;
}

.rg-button {
  --transition: 0.65s;
  --speed: 1.2s;
  --cut: 1px;
  --bg: radial-gradient(
    var(--rg-spread-x) var(--rg-spread-y) at var(--rg-pos-x) var(--rg-pos-y),
    var(--rg-color-1) var(--rg-stop-1),
    var(--rg-color-2) var(--rg-stop-2),
    var(--rg-color-3) var(--rg-stop-3),
    var(--rg-color-4) var(--rg-stop-4),
    var(--rg-color-5) var(--rg-stop-5)
  );

  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
  min-height: 0;
  height: 48px;
  padding: 0 28px;
  border: none;
  border-radius: 12px;
  font-family: var(--font-sans);
  font-size: 14.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1;
  color: #ffffff;
  background: var(--bg);
  cursor: pointer;
  text-shadow: 0 1px 2px rgba(7, 26, 61, 0.3);
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
  white-space: nowrap;
  box-shadow: 0 10px 24px rgba(22, 119, 255, 0.22);
  transition:
    --rg-pos-x 0.65s, --rg-pos-y 0.65s,
    --rg-spread-x 0.65s, --rg-spread-y 0.65s,
    --rg-color-1 0.65s, --rg-color-2 0.65s, --rg-color-3 0.65s, --rg-color-4 0.65s, --rg-color-5 0.65s,
    --rg-border-angle 0.65s, --rg-border-color-1 0.65s, --rg-border-color-2 0.65s,
    --rg-stop-1 0.65s, --rg-stop-2 0.65s, --rg-stop-3 0.65s, --rg-stop-4 0.65s, --rg-stop-5 0.65s,
    transform 0.18s var(--ease), box-shadow 0.25s var(--ease);
}

.rg-button::before {
  content: '';
  position: absolute;
  inset: 0;
  padding: 1px;
  border-radius: inherit;
  background-image: linear-gradient(
    var(--rg-border-angle),
    var(--rg-border-color-1),
    var(--rg-border-color-2)
  );
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  -webkit-mask-composite: xor;
  pointer-events: none;
}

.rg-button:hover {
  --rg-pos-x: 0%;
  --rg-pos-y: 120%;
  --rg-spread-x: 110.24%;
  --rg-spread-y: 110.2%;
  --rg-color-1: #0B4DBB;
  --rg-color-2: #1677FF;
  --rg-color-3: #5BB8FF;
  --rg-color-4: #8AD4FF;
  --rg-color-5: #1677FF;
  --rg-stop-1: 0%;
  --rg-stop-2: 20%;
  --rg-stop-3: 48%;
  --rg-stop-4: 82%;
  --rg-stop-5: 135%;
  --rg-border-angle: 190deg;
  --rg-border-color-1: hsla(214, 100%, 78%, 0.55);
  --rg-border-color-2: hsla(214, 100%, 96%, 0.65);
  --button-line-opacity: 1;
  transform: translateY(-1px);
  box-shadow: 0 14px 30px rgba(22, 119, 255, 0.28);
}

.rg-button:active {
  transform: translateY(0) scale(0.99);
  box-shadow: 0 6px 16px rgba(22, 119, 255, 0.22);
}

.rg-button:focus-visible {
  outline: 3px solid rgba(22, 119, 255, 0.4);
  outline-offset: 2px;
}

.rg-label {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.rg-bg {
  position: absolute;
  inset: var(--cut);
  background: var(--bg);
  border-radius: inherit;
  transition: background var(--transition), opacity var(--transition);
}

.rg-shine {
  position: absolute;
  inset: 0;
  container-type: size;
  border-radius: inherit;
  mix-blend-mode: soft-light;
  opacity: var(--button-line-opacity, 0);
  transition: opacity 0.3s;
  overflow: visible;
}

.rg-shine span {
  position: absolute;
  inset: 0;
  height: 100cqh;
  aspect-ratio: 1;
  animation: rg-slide var(--speed) ease-in-out infinite alternate;
  overflow: visible;
}

.rg-shine span::before {
  content: "";
  position: absolute;
  inset: -100%;
  background: conic-gradient(
    from calc(270deg - (90deg * 0.5)),
    transparent 0,
    #fff 90deg,
    transparent 90deg
  );
  animation: rg-spin calc(var(--speed) * 2) infinite linear;
}

@keyframes rg-spin {
  0% { rotate: 0deg; }
  15%, 35% { rotate: 90deg; }
  65%, 85% { rotate: 270deg; }
  100% { rotate: 360deg; }
}

@keyframes rg-slide {
  to { transform: translate(calc(100cqw - 100%), 0); }
}

@media (max-width: 768px) {
  .lnd-cta-row .rg-wrap { width: 100%; }
  .lnd-cta-row .rg-button { width: 100%; min-height: 48px; }
}

@media (max-height: 760px) and (min-width: 641px) {
  .lnd-cta-row .rg-button { height: 44px; }
}

@media (max-width: 640px) {
  .lnd-cta-row .rg-button { height: 46px; }
}

@media (max-width: 768px) and (max-height: 650px) {
  .lnd-cta-row .rg-button { height: 44px; min-height: 44px; }
}

@media (prefers-reduced-motion: reduce) {
  .rg-button, .rg-button:hover { transition: none; }
  .rg-button:hover { transform: none; }
  .rg-shine { opacity: 0 !important; }
  .rg-shine span, .rg-shine span::before { animation: none !important; }
}
`;

export default function RadialGlowButton({
  children = "Try AI Verification",
  className,
  ...props
}) {
  const classes = ["rg-button", className].filter(Boolean).join(" ");

  return (
    <div className="rg-wrap">
      <style>{RG_CSS}</style>
      <button className={classes} type="button" {...props}>
        <span className="rg-shine" aria-hidden="true">
          <span></span>
        </span>
        <span className="rg-bg" aria-hidden="true"></span>
        <span className="rg-label">{children}</span>
      </button>
    </div>
  );
}