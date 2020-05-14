import "./codemirror/codemirror.js";
import "./codemirror/clike.js";
import "./codemirror/closebrackets.js";
import "./codemirror/matchbrackets.js";
import "./codemirror/comment.js";

import clm from "./clmtracker/clmtracker.js";
import Program, { DEFAULT_FRAGMENT } from "./program.js";

async function getMedia() {
  const canvas = document.getElementById("canvas");
  try {
    const video = document.getElementById("video");
    let stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
    video.srcObject = stream;

    await new Promise((resolve, reject) => {
      video.addEventListener("loadeddata", () => {
        video.setAttribute("width", video.videoWidth);
        video.setAttribute("height", video.videoHeight);
        canvas.setAttribute("width", video.videoWidth);
        canvas.setAttribute("height", video.videoHeight);
        resolve();
      });
    });

    return {
      source: video,
      canvas,
    };
  } catch (e) {
    console.warn(e);

    const image = new Image();

    await new Promise((resolve, reject) => {
      image.src = "20191223_114551.jpg";
      image.onload = () => {
        if (image.width > 720) {
          const ratio = image.height / image.width;
          image.width = 720;
          image.height = ratio * 720;
        }
        canvas.setAttribute("width", image.width);
        canvas.setAttribute("height", image.height);
        resolve();
      };
      image.onerror = reject;
    });

    return {
      source: image,
      canvas,
    };
  }
}

async function init() {
  const mirrorToggle = document.getElementById("mirror-toggle");
  const textarea = document.getElementById("textarea");
  let previousFragment;
  try {
    previousFragment = localStorage.getItem("previous-frag-shader");
  } catch (e) {
    console.warn("Couldn't access localStorage for previous fragment shader.");
  }
  textarea.textContent = previousFragment || DEFAULT_FRAGMENT;

  const editor = window.editor = CodeMirror.fromTextArea(textarea, {
    theme: "monokai",
    lineNumbers: true,
    mode: 'x-shader/x-fragment',
    viewportMargin: Infinity,
    lineWrapping: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    // TODO: Split fragment shader "preamble" into non-editable bit
    // firstLineNumber: 10,
  });

  const { source, canvas } = await getMedia();

  const program = window.program = new Program(canvas, source);

  function recompile(shaderText) {
    try {
      program.recompile(shaderText);
    } catch (e) {
      if (e instanceof GlslCompileError) {
        console.warn(e);
      } else {
        console.error(e);
      }
    }
  }

  if (previousFragment) {
    recompile(textarea.textContent);
  }

  editor.setOption("extraKeys", {
    "Cmd-S": function() {
      recompile(editor.getValue());
    },
    "Cmd-/": function(cm) {
      cm.toggleComment({indent: true});
    },
  });

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

  const tracker = new clm.tracker();
  tracker.init();
  tracker.start(source);

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
      };
    }
    program.draw(source, faceData);
    setTimeout(draw, frameDuration);
  }
  draw();
}

window.addEventListener("load", init);
