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
uniform sampler2D u_texture;

void main() {
  gl_FragColor = texture2D(u_texture, v_texcoord);
}
`.trim();

class Program {
  constructor(canvas, swap, video) {
    this.canvas = canvas;
    this.swap = swap;
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

  draw(imageData) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  recompile(source) {
    let fragmentShader
    try {
      fragmentShader = this.compileShader(source, this.gl.FRAGMENT_SHADER);
    } catch (e) {
      console.error(e);
      return false;
    }
    this.linkProgram(this.VERTEX_SHADER, fragmentShader);
    return true;
  }

  mirror(m) {
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
      throw new Error(`Coudn't compile shader:\n${gl.getShaderInfoLog(shader)}`);
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
      this.gl.uniform1f(this.uniforms["u_mirror"], 1.0);

      this.uniforms["u_texture"] = gl.getUniformLocation(program, "u_texture");
      gl.uniform1i(this.uniforms["u_texture"], 0);

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
      return program;
    } else {
      throw new Error(`Couldn't link program:\n${gl.getProgramInfoLog(program)}`);
    }
  }
}
