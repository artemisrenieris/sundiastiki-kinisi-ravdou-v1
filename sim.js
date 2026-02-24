const simCanvas = document.getElementById("simCanvas");
const sctx = simCanvas.getContext("2d");
const chartCanvas = document.getElementById("chartCanvas");
const cctx = chartCanvas.getContext("2d");

const massSlider = document.getElementById("massSlider");
const totalLengthSlider = document.getElementById("totalLengthSlider");
const x1Slider = document.getElementById("x1Slider");
const x2Slider = document.getElementById("x2Slider");
const x3Slider = document.getElementById("x3Slider");

const massValue = document.getElementById("massValue");
const totalLengthValue = document.getElementById("totalLengthValue");
const x1Value = document.getElementById("x1Value");
const x2Value = document.getElementById("x2Value");
const x3Value = document.getElementById("x3Value");

const playPauseBtn = document.getElementById("playPauseBtn");
const resetBtn = document.getElementById("resetBtn");
const slowBtn = document.getElementById("slowBtn");
const currentToggle = document.getElementById("currentToggle");
const canvasStatusText = document.getElementById("canvasStatusText");

const tValue = document.getElementById("tValue");
const xValue = document.getElementById("xValue");
const uValue = document.getElementById("uValue");
const aValue = document.getElementById("aValue");
const eValue = document.getElementById("eValue");
const iRodValue = document.getElementById("iRodValue");
const i1Value = document.getElementById("i1Value");
const i2Value = document.getElementById("i2Value");
const fmagValue = document.getElementById("fmagValue");
const fextValue = document.getElementById("fextValue");
const switchValue = document.getElementById("switchValue");
const phaseValue = document.getElementById("phaseValue");
const uorOpenValue = document.getElementById("uorOpenValue");
const uorClosedValue = document.getElementById("uorClosedValue");
const vklValue = document.getElementById("vklValue");

const ORIGIN_X = 110;
const TOP_RAIL_Y = 175;
const BOTTOM_RAIL_Y = 425;
const ROD_DRAW_W = 16;
const DT_CAP = 0.03;
const TERMINAL_REACH_RATIO = 0.98;
const OPEN_HOLD_TIME = 1.1;
const PHASE_GAP_TIME = 1.0;
const TERMINAL_A_EPS = 0.01;
const TERMINAL_F_EPS = 0.01;

const P = {
  B1: 1,
  B3: 1,
  L: 1,
  R1: 2,
  R2: 2,
  Rrod: 3,
  F: 0.8
};

const state = {
  m: Number(massSlider.value),
  totalLength: Number(totalLengthSlider.value),
  x1: Number(x1Slider.value),
  x2: Number(x2Slider.value),
  x3: Number(x3Slider.value),
  t: 0,
  x: 0,
  u: 0,
  a: 0,
  emf: 0,
  Irod: 0,
  I1: 0,
  I2: 0,
  FL: 0,
  Fext: P.F,
  playing: false,
  slow: false,
  timeScale: 1,
  switchClosed: false,
  reachedT1: false,
  reachedT2: false,
  reachedT3: false,
  t1: null,
  t2: null,
  t3: null,
  Fprime: 0,
  history: [],
  chartTMax: 14,
  chartUMax: 8,
  showCurrents: false,
  lastTs: null
};

function rLoad() {
  if (state.switchClosed) {
    return (P.R1 * P.R2) / (P.R1 + P.R2);
  }
  return P.R1;
}

function openDampingK() {
  return (P.B1 * P.B1 * P.L * P.L) / (P.Rrod + P.R1);
}

function closedDampingK() {
  const rPar = (P.R1 * P.R2) / (P.R1 + P.R2);
  return (P.B3 * P.B3 * P.L * P.L) / (P.Rrod + rPar);
}

function rEqRod() {
  return P.Rrod + rLoad();
}

function regionB(x) {
  if (x < state.x1) return -P.B1;
  if (x < state.x2) return 0;
  return P.B3;
}

function stageText() {
  if (!state.reachedT1) return "0 → t1 (B1, F=0.8N)";
  if (!state.reachedT2) return "t1 → t2 (B=0, F=0)";
  if (!state.reachedT3) return "t2 → t3 (B3, F′, δ ανοικτός)";
  return "t > t3 (B3, F′, δ κλειστός)";
}

function uOrOpen() {
  return (P.F * (P.Rrod + P.R1)) / (P.B1 * P.B1 * P.L * P.L);
}

function uOrClosed() {
  return (state.Fprime * (P.Rrod + (P.R1 * P.R2) / (P.R1 + P.R2))) / (P.B3 * P.B3 * P.L * P.L);
}

function externalForceLabel() {
  if (!state.reachedT1) return "F";
  if (!state.reachedT2) return "F=0";
  return "F′";
}

function phase1RepresentativeDistance() {
  const uLim = uOrOpen();
  const k = openDampingK();
  const tau = state.m / k;
  const tReach = -tau * Math.log(1 - TERMINAL_REACH_RATIO);
  const xReach = uLim * (tReach - tau * (1 - Math.exp(-tReach / tau)));
  const xCruise = uLim * OPEN_HOLD_TIME;
  return xReach + xCruise;
}

function snapToHalf(v) {
  return Math.round(v * 2) / 2;
}

function recommendedGaps() {
  const uLim = Math.max(0.5, uOrOpen());
  return Math.max(1.5, uLim * PHASE_GAP_TIME);
}

function trackMax() {
  const tauClosed = state.m / closedDampingK();
  const uRef = Math.max(0.4, uOrOpen(), uOrClosed());
  const postSwitchDistance = Math.max(8, 2.2 * uRef * tauClosed + 2.5 * uOrClosed());
  return Math.max(state.totalLength, state.x3 + postSwitchDistance);
}

function scaleX() {
  return (simCanvas.width - ORIGIN_X - 110) / trackMax();
}

function xToPx(x) {
  return ORIGIN_X + x * scaleX();
}

function tuneBoundariesForRepresentativeMotion() {
  const minX1 = phase1RepresentativeDistance();
  const gap = recommendedGaps();
  const requestedX1 = Number(x1Slider.value);
  const requestedX2 = Number(x2Slider.value);
  const requestedX3 = Number(x3Slider.value);

  state.x1 = snapToHalf(Math.max(requestedX1, minX1));
  state.x2 = snapToHalf(Math.max(requestedX2, state.x1 + gap));
  state.x3 = snapToHalf(Math.max(requestedX3, state.x2 + gap));

  const neededMax = Math.max(80, Math.ceil(trackMax()));
  x1Slider.max = String(neededMax);
  x2Slider.max = String(neededMax);
  x3Slider.max = String(neededMax);
  x1Slider.value = String(state.x1);
  x2Slider.value = String(state.x2);
  x3Slider.value = String(state.x3);
}

function solvePhase1TimeForDistance(xTarget, tau, uLim) {
  if (xTarget <= 0) return 0;
  let t = Math.max(0.1, xTarget / Math.max(0.2, uLim));
  for (let i = 0; i < 24; i += 1) {
    const expTerm = Math.exp(-t / tau);
    const f = uLim * (t - tau * (1 - expTerm)) - xTarget;
    const df = uLim * (1 - expTerm);
    if (Math.abs(df) < 1e-7) break;
    const next = t - f / df;
    t = Math.max(0, next);
  }
  return t;
}

function updateChartScale() {
  const uOpen = Math.max(0.2, uOrOpen());
  const rPar = (P.R1 * P.R2) / (P.R1 + P.R2);
  const kOpen = (P.B1 * P.B1 * P.L * P.L) / (P.Rrod + P.R1);
  const kClosed = (P.B3 * P.B3 * P.L * P.L) / (P.Rrod + rPar);
  const tauOpen = state.m / kOpen;
  const tauClosed = state.m / kClosed;

  const t1Est = solvePhase1TimeForDistance(state.x1, tauOpen, uOpen);
  const t2Est = t1Est + (state.x2 - state.x1) / uOpen;
  const t3Est = t2Est + (state.x3 - state.x2) / uOpen;
  const uClosed = (state.Fprime * (P.Rrod + rPar)) / (P.B3 * P.B3 * P.L * P.L);

  state.chartTMax = Math.max(10, t3Est + 4 * tauClosed + 1);
  state.chartUMax = Math.max(5, 1.25 * Math.max(uOpen, uClosed, state.u, 0.2) + 0.5);
}

function updateUiReadouts() {
  massValue.textContent = state.m.toFixed(2);
  totalLengthValue.textContent = trackMax().toFixed(1);
  x1Value.textContent = state.x1.toFixed(1);
  x2Value.textContent = state.x2.toFixed(1);
  x3Value.textContent = state.x3.toFixed(1);

  tValue.textContent = state.t.toFixed(2);
  xValue.textContent = state.x.toFixed(2);
  uValue.textContent = state.u.toFixed(2);
  aValue.textContent = state.a.toFixed(2);
  eValue.textContent = state.emf.toFixed(2);
  iRodValue.textContent = state.Irod.toFixed(2);
  i1Value.textContent = state.I1.toFixed(2);
  i2Value.textContent = state.I2.toFixed(2);
  fmagValue.textContent = state.FL.toFixed(2);
  fextValue.textContent = state.Fext.toFixed(2);
  switchValue.textContent = state.switchClosed ? "Κλειστός" : "Ανοικτός";
  phaseValue.textContent = stageText();
  uorOpenValue.textContent = uOrOpen().toFixed(2);
  uorClosedValue.textContent = uOrClosed().toFixed(2);
  const vkl = state.switchClosed ? state.Irod * ((P.R1 * P.R2) / (P.R1 + P.R2)) : state.Irod * P.R1;
  vklValue.textContent = vkl.toFixed(2);
  canvasStatusText.textContent = `Κατάσταση: ${stageText()} | δ: ${state.switchClosed ? "κλειστός" : "ανοικτός"} | υ=${state.u.toFixed(2)} m/s`;
}

function recalcElectromagnetics() {
  const B = regionB(state.x);
  const Emag = Math.abs(B) * P.L * Math.abs(state.u);
  state.emf = Emag;

  if (Math.abs(B) < 1e-9 || state.u <= 0) {
    state.Irod = 0;
    state.I1 = 0;
    state.I2 = 0;
    state.FL = 0;
    return;
  }

  state.Irod = Emag / rEqRod();
  if (state.switchClosed) {
    const vRails = state.Irod * ((P.R1 * P.R2) / (P.R1 + P.R2));
    state.I1 = vRails / P.R1;
    state.I2 = vRails / P.R2;
  } else {
    state.I1 = state.Irod;
    state.I2 = 0;
  }

  state.FL = Math.abs(B) * P.L * state.Irod;
}

function resetState() {
  state.t = 0;
  state.x = 0;
  state.u = 0;
  state.a = 0;
  state.emf = 0;
  state.Irod = 0;
  state.I1 = 0;
  state.I2 = 0;
  state.FL = 0;
  state.Fext = P.F;
  state.playing = false;
  state.switchClosed = false;
  state.reachedT1 = false;
  state.reachedT2 = false;
  state.reachedT3 = false;
  state.t1 = null;
  state.t2 = null;
  state.t3 = null;
  state.Fprime = (P.B3 * P.B3 * P.L * P.L * uOrOpen()) / (P.Rrod + P.R1);
  state.history = [{ t: 0, u: 0 }];
  updateChartScale();
  state.lastTs = null;
  playPauseBtn.textContent = "Play";
}

function normalizeBoundaries() {
  tuneBoundariesForRepresentativeMotion();
}

function updateModel(dt) {
  if (!state.playing) return;

  const B = regionB(state.x);

  if (!state.reachedT1 && state.x >= state.x1) {
    state.reachedT1 = true;
    state.t1 = state.t;
    state.Fext = 0;
  }

  if (state.reachedT1 && !state.reachedT2 && state.x >= state.x2) {
    state.reachedT2 = true;
    state.t2 = state.t;
    state.Fprime = (P.B3 * P.B3 * P.L * P.L * uOrOpen()) / (P.Rrod + P.R1);
    state.Fext = state.Fprime;
    updateChartScale();
  }

  if (state.reachedT2 && !state.reachedT3 && state.x >= state.x3) {
    state.reachedT3 = true;
    state.t3 = state.t;
    state.switchClosed = true;
  }

  recalcElectromagnetics();

  if (Math.abs(B) < 1e-9) {
    state.a = 0;
  } else {
    state.a = (state.Fext - state.FL) / state.m;
  }

  state.u += state.a * dt;
  if (state.u < 0) state.u = 0;

  state.x += state.u * dt;
  if (state.x > trackMax()) {
    state.x = trackMax();
    state.playing = false;
    playPauseBtn.textContent = "Play";
  }

  state.t += dt;

  recalcElectromagnetics();
  state.history.push({ t: state.t, u: state.u });
  if (state.history.length > 4000) state.history.shift();
}

function drawArrow(ctx, x1, y1, x2, y2, color) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const headLen = 14;
  const headSpread = 0.45;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - headSpread), y2 - headLen * Math.sin(angle - headSpread));
  ctx.lineTo(x2 - headLen * Math.cos(angle + headSpread), y2 - headLen * Math.sin(angle + headSpread));
  ctx.closePath();
  ctx.fill();
}

function vectorLength(value, pxPerUnit, maxPx) {
  const abs = Math.abs(value);
  if (abs < 1e-4) return 0;
  return Math.min(maxPx, abs * pxPerUnit);
}

function drawRegions() {
  const xA = xToPx(0);
  const x1 = xToPx(state.x1);
  const x2 = xToPx(state.x2);
  const x3 = xToPx(state.x3);
  const xG = xToPx(trackMax());

  sctx.fillStyle = "#eef6ff";
  sctx.fillRect(0, 0, simCanvas.width, simCanvas.height);

  sctx.fillStyle = "rgba(54, 109, 171, 0.14)";
  sctx.fillRect(xA, TOP_RAIL_Y, x1 - xA, BOTTOM_RAIL_Y - TOP_RAIL_Y);
  sctx.fillStyle = "rgba(160, 165, 178, 0.12)";
  sctx.fillRect(x1, TOP_RAIL_Y, x2 - x1, BOTTOM_RAIL_Y - TOP_RAIL_Y);
  sctx.fillStyle = "rgba(37, 164, 120, 0.14)";
  sctx.fillRect(x2, TOP_RAIL_Y, xG - x2, BOTTOM_RAIL_Y - TOP_RAIL_Y);

  sctx.strokeStyle = "#8aa0be";
  sctx.lineWidth = 1.3;
  [x1, x2, x3].forEach((x) => {
    sctx.beginPath();
    sctx.moveTo(x, TOP_RAIL_Y - 26);
    sctx.lineTo(x, BOTTOM_RAIL_Y + 26);
    sctx.stroke();
  });

  sctx.fillStyle = "#244568";
  sctx.font = "bold 24px Trebuchet MS";
  sctx.fillText("A", xA - 20, TOP_RAIL_Y - 10);
  sctx.fillText("Δ", xA - 24, BOTTOM_RAIL_Y + 30);
  sctx.fillText("Γ", xG + 10, TOP_RAIL_Y - 10);
  sctx.fillText("Z", xG + 10, BOTTOM_RAIL_Y + 30);

  sctx.font = "bold 20px Trebuchet MS";
  sctx.fillText("B1 (×)", xA + 12, TOP_RAIL_Y + 28);
  sctx.fillText("B2 = 0", x1 + 12, TOP_RAIL_Y + 28);
  sctx.fillText("B3 (•)", x2 + 12, TOP_RAIL_Y + 28);

  sctx.font = "16px Trebuchet MS";
  if (state.t1 !== null) sctx.fillText(`t1=${state.t1.toFixed(2)}s`, x1 - 36, BOTTOM_RAIL_Y + 48);
  if (state.t2 !== null) sctx.fillText(`t2=${state.t2.toFixed(2)}s`, x2 - 36, BOTTOM_RAIL_Y + 48);
  if (state.t3 !== null) sctx.fillText(`t3=${state.t3.toFixed(2)}s`, x3 - 36, BOTTOM_RAIL_Y + 48);

  sctx.strokeStyle = "#2d4568";
  sctx.lineWidth = 6;
  sctx.beginPath();
  sctx.moveTo(xA, TOP_RAIL_Y);
  sctx.lineTo(xG, TOP_RAIL_Y);
  sctx.stroke();
  sctx.beginPath();
  sctx.moveTo(xA, BOTTOM_RAIL_Y);
  sctx.lineTo(xG, BOTTOM_RAIL_Y);
  sctx.stroke();

  const switchX = x3 + 24;
  sctx.strokeStyle = "#1f3f62";
  sctx.lineWidth = 4;
  if (state.switchClosed) {
    sctx.beginPath();
    sctx.moveTo(switchX - 14, TOP_RAIL_Y);
    sctx.lineTo(switchX + 14, TOP_RAIL_Y);
    sctx.stroke();
  } else {
    sctx.beginPath();
    sctx.moveTo(switchX - 12, TOP_RAIL_Y);
    sctx.lineTo(switchX + 14, TOP_RAIL_Y - 16);
    sctx.stroke();
  }
  sctx.fillStyle = "#1f3f62";
  sctx.font = "bold 20px Trebuchet MS";
  sctx.fillText("δ", switchX + 18, TOP_RAIL_Y - 10);

  const connectorMid = (TOP_RAIL_Y + BOTTOM_RAIL_Y) / 2;
  const leftRTop = connectorMid - 48;
  const leftRBottom = connectorMid + 48;
  const rightRTop = connectorMid - 48;
  const rightRBottom = connectorMid + 48;
  drawResistor(xA - 40, TOP_RAIL_Y, leftRTop, leftRBottom, BOTTOM_RAIL_Y, "R1");
  drawResistor(xG + 40, TOP_RAIL_Y, rightRTop, rightRBottom, BOTTOM_RAIL_Y, "R2");

  sctx.strokeStyle = "#2d4568";
  sctx.lineWidth = 4;
  sctx.beginPath();
  sctx.moveTo(xA, TOP_RAIL_Y);
  sctx.lineTo(xA - 40, TOP_RAIL_Y);
  sctx.moveTo(xA, BOTTOM_RAIL_Y);
  sctx.lineTo(xA - 40, BOTTOM_RAIL_Y);
  sctx.moveTo(xG, TOP_RAIL_Y);
  sctx.lineTo(xG + 40, TOP_RAIL_Y);
  sctx.moveTo(xG, BOTTOM_RAIL_Y);
  sctx.lineTo(xG + 40, BOTTOM_RAIL_Y);
  sctx.stroke();
}

function drawResistor(x, railTop, resistorTop, resistorBottom, railBottom, label) {
  sctx.strokeStyle = "#324862";
  sctx.lineWidth = 5;
  sctx.beginPath();
  sctx.moveTo(x, railTop);
  sctx.lineTo(x, resistorTop);
  sctx.moveTo(x, resistorBottom);
  sctx.lineTo(x, railBottom);
  sctx.stroke();

  const zigAmp = 13;
  const zigSteps = 11;
  const stepY = (resistorBottom - resistorTop) / zigSteps;
  sctx.strokeStyle = "#1d3557";
  sctx.lineWidth = 4;
  sctx.beginPath();
  sctx.moveTo(x, resistorTop);
  for (let i = 1; i < zigSteps; i += 1) {
    const xx = x + (i % 2 === 0 ? -zigAmp : zigAmp);
    const yy = resistorTop + i * stepY;
    sctx.lineTo(xx, yy);
  }
  sctx.lineTo(x, resistorBottom);
  sctx.stroke();

  sctx.fillStyle = "#1b2f4a";
  sctx.font = "bold 20px Trebuchet MS";
  const isLeftSide = x < xToPx(trackMax() * 0.5);
  const labelX = isLeftSide ? x - 38 : x + 16;
  sctx.fillText(label, labelX, (resistorTop + resistorBottom) * 0.5 + 6);
}

function drawRodAndVectors() {
  const rodX = xToPx(state.x);
  const rodLeft = rodX - ROD_DRAW_W * 0.5;
  const rodRight = rodX + ROD_DRAW_W * 0.5;
  sctx.fillStyle = "#273f66";
  sctx.fillRect(rodLeft, TOP_RAIL_Y - 8, ROD_DRAW_W, BOTTOM_RAIL_Y - TOP_RAIL_Y + 16);
  sctx.fillStyle = "#13233a";
  sctx.font = "bold 20px Trebuchet MS";
  sctx.fillText("K", rodX - 24, TOP_RAIL_Y - 14);
  sctx.fillText("Λ", rodX - 24, BOTTOM_RAIL_Y + 34);

  drawArrow(sctx, rodX + 16, (TOP_RAIL_Y + BOTTOM_RAIL_Y) / 2, rodX + 16 + 46, (TOP_RAIL_Y + BOTTOM_RAIL_Y) / 2, "#f18805");
  sctx.fillStyle = "#f18805";
  sctx.fillText("υ", rodX + 66, (TOP_RAIL_Y + BOTTOM_RAIL_Y) / 2 + 8);

  const centerY = (TOP_RAIL_Y + BOTTOM_RAIL_Y) / 2;
  const fMagSigned = state.u === 0 ? 0 : -Math.sign(state.u) * state.FL;
  const fNetSigned = state.Fext + fMagSigned;
  const nearTerminal = Math.abs(state.a) <= TERMINAL_A_EPS && Math.abs(fNetSigned) <= TERMINAL_F_EPS;
  const forceScale = 70;

  const fExtLen = vectorLength(state.Fext, forceScale, 190);
  const fMagLen = vectorLength(fMagSigned, forceScale, 190);
  const fNetLen = nearTerminal ? 0 : vectorLength(fNetSigned, 95, 190);
  const aLen = nearTerminal ? 0 : vectorLength(state.a, 360, 190);
  const frontBaseX = rodRight + 28;
  const backBaseX = rodLeft - 28;
  const labelX = frontBaseX + 10;

  if (fExtLen > 0) {
    drawArrow(
      sctx,
      frontBaseX,
      centerY - 54,
      frontBaseX + Math.sign(state.Fext) * fExtLen,
      centerY - 54,
      "#e76f51"
    );
    sctx.fillStyle = "#e76f51";
    sctx.fillText(externalForceLabel(), labelX, centerY - 62);
  }

  if (fMagLen > 0) {
    drawArrow(
      sctx,
      backBaseX,
      centerY - 20,
      backBaseX + Math.sign(fMagSigned) * fMagLen,
      centerY - 20,
      "#2a9d8f"
    );
    sctx.fillStyle = "#2a9d8f";
    sctx.fillText("FL", backBaseX - 34, centerY - 28);
  }

  if (fNetLen > 0) {
    drawArrow(
      sctx,
      frontBaseX,
      centerY + 92,
      frontBaseX + Math.sign(fNetSigned) * fNetLen,
      centerY + 92,
      "#355070"
    );
    sctx.fillStyle = "#355070";
    sctx.fillText("ΣF", labelX, centerY + 84);
  }

  if (aLen > 0) {
    drawArrow(
      sctx,
      frontBaseX,
      centerY + 128,
      frontBaseX + Math.sign(state.a) * aLen,
      centerY + 128,
      "#7b2cbf"
    );
    sctx.fillStyle = "#7b2cbf";
    sctx.fillText("α", labelX, centerY + 122);
  }
}

function drawCurrentVectors() {
  if (!state.showCurrents) return;
  const xA = xToPx(0);
  const xG = xToPx(trackMax());
  const rodX = xToPx(state.x);
  const topY = TOP_RAIL_Y;
  const bottomY = BOTTOM_RAIL_Y;
  const rodTop = TOP_RAIL_Y + 22;
  const rodBottom = BOTTOM_RAIL_Y - 22;
  const B = regionB(state.x);

  if (state.Irod < 1e-4 || Math.abs(B) < 1e-9) {
    sctx.fillStyle = "#a4161a";
    sctx.font = "bold 16px Trebuchet MS";
    sctx.fillText("Ρεύματα: I = 0 στην τρέχουσα περιοχή", xA + 14, TOP_RAIL_Y + 52);
    return;
  }

  const downInBranches = B < 0;
  const color = "#d90429";
  sctx.lineWidth = 4;

  if (downInBranches) {
    drawArrow(sctx, xA + 14, TOP_RAIL_Y + 12, xA + 14, BOTTOM_RAIL_Y - 12, color);
    if (state.switchClosed && state.I2 > 1e-4) {
      drawArrow(sctx, xG - 14, TOP_RAIL_Y + 12, xG - 14, BOTTOM_RAIL_Y - 12, color);
    }
    drawArrow(sctx, rodX, rodTop, rodX, rodBottom, color);
  } else {
    drawArrow(sctx, xA + 14, BOTTOM_RAIL_Y - 12, xA + 14, TOP_RAIL_Y + 12, color);
    if (state.switchClosed && state.I2 > 1e-4) {
      drawArrow(sctx, xG - 14, BOTTOM_RAIL_Y - 12, xG - 14, TOP_RAIL_Y + 12, color);
    }
    drawArrow(sctx, rodX, rodBottom, rodX, rodTop, color);
  }

  sctx.fillStyle = color;
  sctx.font = "bold 16px Trebuchet MS";
  sctx.fillText(`IKL=${state.Irod.toFixed(2)}A`, rodX + 14, TOP_RAIL_Y - 28);
  sctx.fillText(`I1=${state.I1.toFixed(2)}A`, xA - 90, TOP_RAIL_Y - 28);
  if (state.switchClosed) {
    sctx.fillText(`I2=${state.I2.toFixed(2)}A`, xG + 16, TOP_RAIL_Y - 28);
  }
}

function drawChart() {
  cctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
  cctx.fillStyle = "#f6faff";
  cctx.fillRect(0, 0, chartCanvas.width, chartCanvas.height);

  const margin = { left: 55, right: 18, top: 18, bottom: 35 };
  const w = chartCanvas.width - margin.left - margin.right;
  const h = chartCanvas.height - margin.top - margin.bottom;

  const tMax = state.chartTMax;
  const uMax = state.chartUMax;

  cctx.strokeStyle = "#2a4d73";
  cctx.lineWidth = 1.5;
  cctx.beginPath();
  cctx.moveTo(margin.left, margin.top);
  cctx.lineTo(margin.left, margin.top + h);
  cctx.lineTo(margin.left + w, margin.top + h);
  cctx.stroke();

  cctx.fillStyle = "#23415f";
  cctx.font = "15px Trebuchet MS";
  cctx.fillText("υ (m/s)", 8, margin.top + 4);
  cctx.fillText("t (s)", margin.left + w - 6, margin.top + h + 28);

  cctx.strokeStyle = "rgba(36, 65, 95, 0.22)";
  cctx.lineWidth = 1;
  for (let i = 1; i <= 4; i += 1) {
    const y = margin.top + (i * h) / 5;
    cctx.beginPath();
    cctx.moveTo(margin.left, y);
    cctx.lineTo(margin.left + w, y);
    cctx.stroke();
  }
  for (let i = 1; i <= 6; i += 1) {
    const x = margin.left + (i * w) / 7;
    cctx.beginPath();
    cctx.moveTo(x, margin.top);
    cctx.lineTo(x, margin.top + h);
    cctx.stroke();
  }

  cctx.strokeStyle = "#f18805";
  cctx.lineWidth = 2.6;
  cctx.beginPath();
  state.history.forEach((p, idx) => {
    const clampedT = Math.min(p.t, tMax);
    const px = margin.left + (clampedT / tMax) * w;
    const py = margin.top + h - (p.u / uMax) * h;
    if (idx === 0) cctx.moveTo(px, py);
    else cctx.lineTo(px, py);
  });
  cctx.stroke();

  const uOpen = uOrOpen();
  const uClosed = uOrClosed();
  const yOpen = margin.top + h - (uOpen / uMax) * h;
  const yClosed = margin.top + h - (uClosed / uMax) * h;
  cctx.strokeStyle = "#457b9d";
  cctx.lineWidth = 1.4;
  cctx.beginPath();
  cctx.moveTo(margin.left, yOpen);
  cctx.lineTo(margin.left + w, yOpen);
  cctx.stroke();
  cctx.fillStyle = "#457b9d";
  cctx.fillText("uορ", margin.left + 6, yOpen - 4);

  cctx.strokeStyle = "#7b2cbf";
  cctx.lineWidth = 1.4;
  cctx.beginPath();
  cctx.moveTo(margin.left, yClosed);
  cctx.lineTo(margin.left + w, yClosed);
  cctx.stroke();
  cctx.fillStyle = "#7b2cbf";
  cctx.fillText("u'ορ", margin.left + 54, yClosed - 4);

  const markers = [
    { t: state.t1, label: "t1", color: "#366dab" },
    { t: state.t2, label: "t2", color: "#6c757d" },
    { t: state.t3, label: "t3", color: "#25a478" }
  ];
  markers.forEach((m) => {
    if (m.t === null) return;
    const px = margin.left + (m.t / tMax) * w;
    cctx.strokeStyle = m.color;
    cctx.lineWidth = 1.2;
    cctx.beginPath();
    cctx.moveTo(px, margin.top);
    cctx.lineTo(px, margin.top + h);
    cctx.stroke();
    cctx.fillStyle = m.color;
    cctx.fillText(m.label, px + 4, margin.top + 14);
  });
}

function draw() {
  drawRegions();
  drawRodAndVectors();
  drawCurrentVectors();
  drawChart();
}

function tick(ts) {
  if (state.lastTs === null) state.lastTs = ts;
  let dt = (ts - state.lastTs) / 1000;
  state.lastTs = ts;
  dt = Math.min(DT_CAP, dt) * state.timeScale;

  updateModel(dt);
  updateUiReadouts();
  draw();

  requestAnimationFrame(tick);
}

function handleInputs() {
  massSlider.addEventListener("input", () => {
    state.m = Number(massSlider.value);
    normalizeBoundaries();
    updateChartScale();
    updateUiReadouts();
  });

  totalLengthSlider.addEventListener("input", () => {
    state.totalLength = Number(totalLengthSlider.value);
    normalizeBoundaries();
    updateChartScale();
    updateUiReadouts();
  });

  x1Slider.addEventListener("input", () => {
    state.x1 = Number(x1Slider.value);
    normalizeBoundaries();
    updateChartScale();
    updateUiReadouts();
  });

  x2Slider.addEventListener("input", () => {
    state.x2 = Number(x2Slider.value);
    normalizeBoundaries();
    updateChartScale();
    updateUiReadouts();
  });

  x3Slider.addEventListener("input", () => {
    state.x3 = Number(x3Slider.value);
    normalizeBoundaries();
    updateChartScale();
    updateUiReadouts();
  });

  playPauseBtn.addEventListener("click", () => {
    state.playing = !state.playing;
    playPauseBtn.textContent = state.playing ? "Pause" : "Play";
  });

  resetBtn.addEventListener("click", () => {
    resetState();
    updateUiReadouts();
    draw();
  });

  slowBtn.addEventListener("click", () => {
    state.slow = !state.slow;
    state.timeScale = state.slow ? 0.28 : 1;
    slowBtn.classList.toggle("slow-on", state.slow);
    slowBtn.textContent = state.slow ? "Slow: On" : "Slow: Off";
  });

  currentToggle.addEventListener("change", () => {
    state.showCurrents = currentToggle.checked;
  });
}

handleInputs();
resetState();
normalizeBoundaries();
state.showCurrents = currentToggle.checked;
updateUiReadouts();
requestAnimationFrame(tick);
