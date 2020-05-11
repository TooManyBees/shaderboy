async function getMedia() {
  const canvas = document.getElementById("canvas");
  const swap = document.getElementById("swap");
  try {
    const video = document.getElementById("video");
    let stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
    video.srcObject = stream;

    await new Promise((resolve, reject) => {
      video.addEventListener("loadeddata", () => {
        canvas.setAttribute("width", video.videoWidth);
        canvas.setAttribute("height", video.videoHeight);
        swap.setAttribute("width", video.videoWidth);
        swap.setAttribute("height", video.videoHeight);
        resolve();
      });
    });

    return {
      source: video,
      canvas,
      swap,
    };
  } catch (e) {
    console.error(e);

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
        swap.setAttribute("width", image.width);
        swap.setAttribute("height", image.height);
        resolve();
      };
      image.onerror = reject;
    });

    return {
      source: image,
      canvas,
      swap,
    };
  }
}

async function loadWasm() {

}

async function init() {
  const textarea = document.getElementById('textarea');
  let previousFragment;
  try {
    previousFragment = localStorage.getItem("previous-frag-shader");
  } catch (e) {
    console.warn("Couldn't access localStorage for previous fragment shader.");
  }
  textarea.textContent = previousFragment || DEFAULT_FRAGMENT;

  const editor = window.editor = CodeMirror.fromTextArea(textarea, {
    lineNumbers: true,
    mode: 'glsl',
  });

  const [{ source, canvas, swap }, wasm] = await Promise.all([
    getMedia(),
    loadWasm(),
  ]);

  const program = window.program = new Program(canvas, swap, source);
  if (previousFragment) {
    program.recompile(textarea.textContent);
  }

  editor.setOption("extraKeys", {
    'Cmd-S': function() {
      program.recompile(editor.getValue());
    },
  });

  const scratchPad = swap.getContext('2d');
  const frameDuration = 1000 / 30;
  function draw() {
    // scratchPad.drawImage(source, 0, 0);
    // const imageData = scratchPad.getImageData(0, 0, swap.width, swap.height);
    // const faceData = doAnalysis(imageData);
    program.draw(source);
    setTimeout(draw, frameDuration);
  }
  draw();
}
