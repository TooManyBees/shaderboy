const DEFAULT_VERTEX = `
attribute vec2 a_texcoord;
attribute vec2 a_position;
varying vec2 v_texcoord;
uniform float u_mirror;

void main() {
  gl_Position = vec4(a_position.x * u_mirror, a_position.y, 0.0, 1.0);
  v_texcoord = a_texcoord;
}
`.trim();

const DEFAULT_FRAGMENT = `
precision mediump float;

varying vec2 v_texcoord;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_leftEye;
uniform vec2 u_rightEye;
uniform sampler2D u_texture;

float interference(vec2 st, vec2 p1, vec2 p2) {
    float d1 = distance(st, p1);
    float d2 = distance(st, p2);
    float wave1 = cos(pow(d1, 0.5) * 100.0 + u_time / 200.) / 2.0 + 0.5;
    wave1 *= smoothstep(0.75, 0.0, d1);
    float wave2 = cos(pow(d2, 0.5) * 100.0 + u_time / 200.) / 2.0 + 0.5;
    wave2 *= smoothstep(0.75, 0.0, d2);
    return wave1 + wave2;
}

vec4 flare(vec2 st, vec2 p) {
  vec4 baseGlow = smoothstep(
    vec4(0.065, 0.06, 0.07, 0.08),
    vec4(0.005),
    vec4(distance(st, p))
  );

  float h = length((st - p) * vec2(5.0, 50.0));
  float v = length((st - p) * vec2(150.0, 15.0));
  vec4 handles = vec4(0.05)/(h*h) + vec4(0.05)/(v*v);

  return baseGlow + min(handles, vec4(0.5));
}

void main() {
  vec2 st = gl_FragCoord.xy / u_resolution;
  vec2 leftEye = u_leftEye / u_resolution;
  vec2 rightEye = u_rightEye / u_resolution;

  vec4 color = texture2D(u_texture, v_texcoord);

  // Add some rad light flares
  // color += flare(st, leftEye);
  // color += flare(st, rightEye);

  /* Add some psychic waves */
  // float i = interference(st, leftEye, rightEye);
  // color += smoothstep(0.0, 1.0, i) * vec4(0.6, 0.0, 0.8, 1.0);

  gl_FragColor = color;
}
`.trim() + "\n";

class GlslCompileError extends Error {
  constructor(errors) {
    super(errors);
    this.errors = errors.split(/\r?\n/);
  }
}

class Program {
  constructor(canvas, video) {
    this.canvas = canvas;
    const gl = this.gl = this.canvas.getContext('webgl');
    this.video = video;
    this.uniforms = {};
    this.VERTEX_SHADER = this.compileShader(DEFAULT_VERTEX, gl.VERTEX_SHADER);
    this.FRAGMENT_SHADER = this.compileShader(DEFAULT_FRAGMENT, gl.FRAGMENT_SHADER);

    this.linkProgram(this.VERTEX_SHADER, this.FRAGMENT_SHADER);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  }

  draw(imageData, faceData) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
    if (faceData) {
      gl.uniform2f(this.uniforms["u_leftEye"], faceData.leftEye[0], faceData.leftEye[1]);
      gl.uniform2f(this.uniforms["u_rightEye"], faceData.rightEye[0], faceData.rightEye[1]);
    }
    gl.uniform1f(this.uniforms["u_time"], this.startTime - performance.now());
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  recompile(source) {
    const fragmentShader = this.compileShader(source, this.gl.FRAGMENT_SHADER);
    this.linkProgram(this.VERTEX_SHADER, fragmentShader);
  }

  mirror(m) {
    this.mirrored = m;
    this.gl.uniform1f(this.uniforms["u_mirror"], m ? - 1.0 : 1.0);
  }

  compileShader(source, type) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      return shader;
    } else {
      throw new GlslCompileError(gl.getShaderInfoLog(shader));
    }
  }

  linkProgram(vertex, fragment) {
    const gl = this.gl;
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1.0,  1.0, 1.0,  1.0,
        -1.0, -1.0, 1.0, -1.0,
      ]), gl.STATIC_DRAW);
      gl.useProgram(program);

      this.uniforms["u_resolution"] = gl.getUniformLocation(program, "u_resolution");
      this.gl.uniform2f(this.uniforms["u_resolution"], this.canvas.width, this.canvas.height);

      this.uniforms["u_mirror"] = gl.getUniformLocation(program, "u_mirror");
      this.gl.uniform1f(this.uniforms["u_mirror"], this.mirrored || 1.0);

      this.uniforms["u_texture"] = gl.getUniformLocation(program, "u_texture");
      gl.uniform1i(this.uniforms["u_texture"], 0);

      this.uniforms["u_leftEye"] = gl.getUniformLocation(program, "u_leftEye");
      this.uniforms["u_rightEye"] = gl.getUniformLocation(program, "u_rightEye");
      this.uniforms["u_time"] = gl.getUniformLocation(program, "u_time");

      {
        const position = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      }

      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);

      {
        const texcoord = gl.getAttribLocation(program, "a_texcoord");
        const texcoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
        gl.enableVertexAttribArray(texcoord);
        gl.vertexAttribPointer(texcoord, 2, gl.FLOAT, false, 0, 0);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
          0.0,  0.0,
          1.0,  0.0,
          0.0,  1.0,
          1.0,  1.0,
        ]), gl.STATIC_DRAW);
      }

      if (this.program) {
        gl.deleteProgram(this.program);
      }
      this.program = program;
      this.startTime = performance.now();
      return program;
    } else {
      throw new Error(`Couldn't link program:\n${gl.getProgramInfoLog(program)}`);
    }
  }
}

export default Program;
export {
  DEFAULT_FRAGMENT,
  GlslCompileError,
}
