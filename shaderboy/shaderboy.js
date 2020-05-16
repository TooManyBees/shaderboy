import "./codemirror/codemirror.js";
import "./codemirror/clike.js";
import "./codemirror/closebrackets.js";
import "./codemirror/matchbrackets.js";
import "./codemirror/foldcode.js";
import "./codemirror/foldgutter.js";
import "./codemirror/brace-fold.js";
import "./codemirror/comment.js";

import clm from "./clmtrackr/clmtrackr.js";
import Program, { GlslCompileError, DEFAULT_FRAGMENT } from "./program.js";

async function getVideo() {
  const canvas = document.getElementById("canvas");
  const placeholder = document.getElementById("canvas-placeholder");
  const video = document.getElementById("video");
  let stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
  video.srcObject = stream;

  await new Promise((resolve, reject) => {
    video.addEventListener("loadeddata", resolve);
  });

  video.setAttribute("width", video.videoWidth);
  video.setAttribute("height", video.videoHeight);
  canvas.setAttribute("width", video.videoWidth);
  canvas.setAttribute("height", video.videoHeight);
  placeholder.style.height = `${placeholder.firstElementChild.offsetHeight}px`;

  return {
    source: video,
    canvas,
  };
}

async function getImage() {
  const canvas = document.getElementById("canvas");
  const placeholder = document.getElementById("canvas-placeholder");
  const image = new Image();
  const imageCanvas = document.getElementById("image");

  await new Promise((resolve, reject) => {
    image.src = "20191223_114551.jpg";
    image.onload = resolve;
    image.onerror = reject;
  });

  if (image.width > 720) {
    const ratio = image.height / image.width;
    image.width = 720;
    image.height = ratio * 720;
  }
  canvas.setAttribute("width", image.width);
  canvas.setAttribute("height", image.height);
  imageCanvas.setAttribute("width", image.width);
  imageCanvas.setAttribute("height", image.height);
  imageCanvas.getContext("2d").drawImage(image, 0, 0, image.width, image.height);
  placeholder.style.height = `${placeholder.firstElementChild.offsetHeight}px`;

  return {
    source: image,
    altSource: imageCanvas,
    canvas,
  };
}

async function getInitialMedia() {
  try {
    return await getVideo(canvas);
  } catch (e) {
    console.warn(e);
    return await getImage(canvas);
  }
}

async function init() {
  const PREVIOUS_FRAG_SHADER = "previous-frag-shader";
  const mirrorToggle = document.getElementById("mirror-toggle");
  const resetButton = document.getElementById("reset-button");
  const sourceToggle = document.getElementById("source-toggle");
  const saveButton = document.getElementById("save-button");
  const textarea = document.getElementById("textarea");
  let previousFragment;
  try {
    previousFragment = localStorage.getItem(PREVIOUS_FRAG_SHADER);
  } catch (e) {
    console.warn("Couldn't access localStorage for previous fragment shader.");
  }
  textarea.textContent = previousFragment || DEFAULT_FRAGMENT;

  const isMac = CodeMirror.keyMap.default === CodeMirror.keyMap.macDefault;
  const editor = window.editor = CodeMirror.fromTextArea(textarea, {
    theme: "monokai",
    lineNumbers: true,
    mode: 'x-shader/x-fragment',
    extraKeys: {
      [isMac ? "Cmd-S" : "Ctrl-S"]: function(cm) {
        recompile(cm.getValue());
      },
      [isMac ? "Cmd-/" : "Ctrl-/"]: function(cm) {
        cm.toggleComment({indent: true});
      },
    },
    viewportMargin: Infinity,
    lineWrapping: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
    foldGutter: true,
    foldOptions: {
      widget: (from, to) => {
        let count = undefined;

        // Get open / close token
        let startToken = '{', endToken = '}';
        const prevLine = editor.getLine(from.line);
        if (prevLine.lastIndexOf('[') > prevLine.lastIndexOf('{')) {
          startToken = '[', endToken = ']';
        }

        // Get json content
        const internal = editor.getRange(from, to);
        const toParse = startToken + internal + endToken;

        // Get key count
        try {
          const parsed = JSON.parse(toParse);
          count = Object.keys(parsed).length;
        } catch(e) { }

        return count ? `\u21A4${count}\u21A6` : '\u2194';
      },
    },
    // TODO: Split fragment shader "preamble" into non-editable bit
    // firstLineNumber: 10,
  });

  if (!previousFragment || previousFragment === DEFAULT_FRAGMENT) {
    const lines = DEFAULT_FRAGMENT.split(/\r?\n/);
    try {
      editor.foldCode(lines.findIndex(line => line.startsWith("float interference")));
      editor.foldCode(lines.findIndex(line => line.startsWith("vec4 flare")));
      editor.foldCode(lines.findIndex(line => line.startsWith("vec4 landmarks")));
    } catch (e) {
      console.error(e);
    }
  }

  const errorWidgets = [];
  function appendErrorWidgets(lines) {
    const errors = lines.map(line => {
      const m = line.match(/^ERROR:\s+\d+:(\d+):\s+(.*)/);
      if (m) {
        const widget = document.createElement('samp');
        widget.textContent = m[2];
        return { line: parseInt(m[1], 10), widget };
      }
    }).filter(e => !!e);
    errors.map(({ line, widget }) => {
      const lineWidget = editor.addLineWidget(line - 1, widget, { className: 'error' });
      errorWidgets.push(lineWidget);
    });
  }
  function clearErrorWidgets() {
    errorWidgets.forEach(widget => widget.clear());
    errorWidgets.length = 0;
  }

  let { source, canvas, altSource } = await getInitialMedia();
  if (source instanceof HTMLVideoElement) {
    sourceToggle.setAttribute("on", "");
  }

  const program = window.program = new Program(canvas, source);

  saveButton.addEventListener("click", () => {
    recompile(editor.getValue());
  });
  function recompile(shaderText) {
    clearErrorWidgets();
    try {
      program.recompile(shaderText);
      localStorage.setItem(PREVIOUS_FRAG_SHADER, shaderText);
    } catch (e) {
      if (e instanceof GlslCompileError) {
        console.warn(e.errors);
        appendErrorWidgets(e.errors);
      } else {
        console.error(e);
      }
    }
  }

  if (previousFragment) {
    recompile(textarea.textContent);
  }

  let mirrored = false;
  mirrorToggle.addEventListener('click', function(e) {
    mirrored = !mirrored;
    program.mirror(mirrored);
    if (mirrored) {
      mirrorToggle.setAttribute("on", "");
    } else {
      mirrorToggle.removeAttribute("on");
    }
  });

  sourceToggle.addEventListener('click', async function(e) {
    sourceToggle.setAttribute("disabled", "");
    try {
      if (source instanceof Image) {
        const { source: source_ } = await getVideo();
        source = source_;
        altSource = undefined;
        sourceToggle.setAttribute("on", "");
      } else {
        const { source: source_, altSource: altSource_ } = await getImage();
        source.srcObject.getTracks()[0].stop();
        source = source_;
        altSource = altSource_;
        sourceToggle.removeAttribute("on");
      }
      program.setResolution();
      startTracker();
    } catch (e) {
      console.error(e);
    }
    sourceToggle.removeAttribute("disabled");
  });

  resetButton.addEventListener('click', function(e) {
    editor.setValue(DEFAULT_FRAGMENT);
    recompile(DEFAULT_FRAGMENT);
    try {
      localStorage.removeItem(PREVIOUS_FRAG_SHADER);
    } catch (e) {}
  });

  let tracker;
  function startTracker() {
    if (tracker) {
      tracker.stop();
    }
    tracker = window.tracker = new clm.tracker({
      stopOnConvergence: (source instanceof Image),
    });
    tracker.init();
    tracker.start(altSource || source);
  }

  const frameDuration = 1000 / 30;
  function draw() {
    let data = tracker.getCurrentPosition();
    let faceData;
    if (data) {
      // This data has the origin at top-left; convert to glsl's coords
      data = data.map(([x, y]) => [mirrored ? canvas.width - x : x, canvas.height - y]);
      faceData = {
        leftEye: data[27],
        rightEye: data[32],
        mouth: [
          (data[44][0] + data[50][0])/2,
          (data[57][1] + data[60][1])/2,
        ],
        noseBridge: [data[62], data[41], data[33]],
        faceUpVector: [data[33][0] - data[7][0], data[33][1] - data[7][1]],
        openMouth: Math.abs(data[57] - data[60]),
        vertices: data,
      };
    }
    program.draw(source, faceData);
    setTimeout(draw, frameDuration);
  }

  startTracker();
  draw();

  const canvasWrapper = document.querySelector('.canvas-wrapper');
  const placeholder = document.getElementById("canvas-placeholder");
  const stickyObserver = new IntersectionObserver(entries => {
    const pos = placeholder.getBoundingClientRect();
    const top = pos.top;
    const right = pos.left + canvasWrapper.firstElementChild.offsetWidth;
    if (entries[0].isIntersecting) {
      canvasWrapper.style.top = `${top}px`;
      canvasWrapper.style.right = `${right}px`;
      canvasWrapper.classList.remove("sticky");
    } else {
      canvasWrapper.style.top = `${top}px`;
      canvasWrapper.style.right = `${right}px`;
      canvasWrapper.style.position = "fixed";
      setTimeout(() => {
        canvasWrapper.removeAttribute("style");
        canvasWrapper.classList.add("sticky");
      }, 5);
    }
  }, { threshold: 0.75 });
  if (!window.matchMedia('(max-width: 480px)').matches) {
    stickyObserver.observe(placeholder);
  }
}

window.addEventListener("load", init);
