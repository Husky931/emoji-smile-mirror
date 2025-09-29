import {
  FaceLandmarker,
  FilesetResolver,
} from "./vendor/tasks-vision/vision_bundle.js";

// Configuration
const wasmRoot = "./vendor/tasks-vision/wasm";
const MODEL_TASK_URL = "./assets/face_landmarker.task";

// DOM Elements
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const btnStart = document.getElementById("btnStart");
const btnCalibrate = document.getElementById("btnCalibrate");
const chkPrivacy = document.getElementById("chkPrivacy");
const btnFS = document.getElementById("btnFS");

// Application State
let video = null;
let running = false;
let landmarker = null;
let baseline = null;

// Emoji Configuration
const EMOJI_SET = {
  neutral: "😐",
  smile: "🙂",
  surprise: "😮",
  frown: "😡",
  cheeky: "😜",
};

// Thresholds for emotion detection
const EMOTION_THRESHOLDS = {
  smile: 0.25,
  surprise: 0.28,
  frown: 0.2,
  cheeky: 0.22,
};

/**
 * Convert blendshape array to object mapping
 */
function blendMap(blendshapes) {
  const out = {};
  for (const cat of blendshapes?.categories ?? []) {
    out[cat.categoryName] = cat.score;
  }
  return out;
}

/**
 * Set baseline for emotion detection
 */
function calibrate(blend) {
  if (!blend) return;

  baseline = { ...blend };
  flash("Calibrated! Try smiling or opening your mouth.");
}

/**
 * Determine emoji based on facial expressions
 */
function pickEmoji(blend) {
  if (!blend) return EMOJI_SET.neutral;

  const b = baseline || {};
  const get = (key) => (blend[key] ?? 0) - (b[key] ?? 0);

  // Calculate expression scores
  const expressionScores = {
    smile: Math.max(get("mouthSmileLeft"), get("mouthSmileRight")),
    surprise: get("jawOpen") * 0.9 + get("mouthPucker") * 0.4,
    frown: Math.max(get("mouthFrownLeft"), get("mouthFrownRight")),
    cheeky:
      Math.max(get("cheekPuffLeft"), get("cheekPuffRight")) +
      (get("tongueOut") ?? 0),
  };

  // Find the strongest expression above threshold
  let bestExpression = "neutral";
  let bestScore = 0.15;

  for (const [expression, score] of Object.entries(expressionScores)) {
    const threshold = EMOTION_THRESHOLDS[expression];
    if (score > threshold && score > bestScore) {
      bestExpression = expression;
      bestScore = score;
    }
  }

  return EMOJI_SET[bestExpression];
}

/**
 * Draw privacy overlay
 */
function drawPrivacyOverlay() {
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "rgba(18, 22, 32, 0.95)");
  gradient.addColorStop(1, "rgba(28, 34, 48, 0.95)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/**
 * Draw emoji on canvas
 */
function drawEmoji(emoji) {
  const size = Math.min(canvas.width, canvas.height) * 0.3;
  const fontSize = Math.floor(size);

  ctx.font = `${fontSize}px system-ui, Apple Color Emoji, Segoe UI Emoji`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, canvas.width / 2, canvas.height / 2 + size * 0.05);
}

/**
 * Display temporary message
 */
function flash(text) {
  ctx.save();

  // Background
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(0, canvas.height - 56, canvas.width, 56);

  // Text
  ctx.fillStyle = "#fff";
  ctx.font = "20px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, canvas.height - 28);

  ctx.restore();
}

/**
 * Initialize the face landmark model
 */
async function setupModel() {
  const fileset = await FilesetResolver.forVisionTasks(wasmRoot);
  landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: MODEL_TASK_URL,
    },
    runningMode: "VIDEO",
    outputFaceBlendshapes: true,
    numFaces: 1,
  });
}

/**
 * Initialize camera stream
 */
async function setupCamera() {
  const videoElement = document.createElement("video");
  videoElement.autoplay = true;
  videoElement.playsInline = true;
  videoElement.muted = true;

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 960, height: 540 },
    audio: false,
  });

  videoElement.srcObject = stream;
  await videoElement.play();
  video = videoElement;

  // Adjust canvas to match video aspect ratio
  const videoWidth = videoElement.videoWidth || 960;
  const videoHeight = videoElement.videoHeight || 540;
  const aspectRatio = videoWidth / videoHeight;

  canvas.height = Math.round(canvas.width / aspectRatio);
}

/**
 * Utility function for current time
 */
const nowMs = () => performance.now();

/**
 * Main animation loop
 */
function loop() {
  if (!running) return;

  const timestamp = nowMs();

  if (video && landmarker) {
    // Draw video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Detect facial expressions
    const result = landmarker.detectForVideo(video, timestamp);
    const blendObj = blendMap(result?.faceBlendshapes?.[0]);

    // Apply privacy overlay if enabled
    if (chkPrivacy.checked) {
      drawPrivacyOverlay();
    }

    // Draw appropriate emoji
    drawEmoji(pickEmoji(blendObj));
  }

  requestAnimationFrame(loop);
}

// Event Handlers
btnStart.onclick = async () => {
  btnStart.disabled = true;

  try {
    await setupModel();
    await setupCamera();

    running = true;
    btnCalibrate.disabled = false;
    loop();
  } catch (error) {
    console.error("Initialization error:", error);
    alert(
      "Camera/model failed to start. Use Chrome desktop and allow camera permission."
    );
    btnStart.disabled = false;
  }
};

btnCalibrate.onclick = () => {
  if (!landmarker || !video) return;

  const result = landmarker.detectForVideo(video, nowMs());
  const blendObj = blendMap(result?.faceBlendshapes?.[0]);
  calibrate(blendObj);
};

btnFS.onclick = () => {
  if (!document.fullscreenElement) {
    canvas.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen();
  }
};
