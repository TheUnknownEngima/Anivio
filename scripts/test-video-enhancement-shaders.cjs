// Compile and render the exact GLES 3 shader graphs exported by VideoEnhancementTest.
// Software ANGLE catches shader/binding/float-framebuffer errors without an Android device.
// It does not establish Android driver compatibility or on-device performance.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const fixturePath = path.join(root, 'composeApp/build/enhancement-gpu-fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!fs.existsSync(chrome)) throw new Error('Set CHROME_PATH to a Chromium executable.');
const buildDir = path.join(root, 'build/enhancement-gpu');
fs.mkdirSync(buildDir, { recursive: true });
const harness = path.join(buildDir, 'index.html');
function run(fixtures) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) throw new Error('WebGL2 float framebuffer support unavailable');
  const vertex = `#version 300 es
    in vec2 a_position; out vec2 v_uv;
    void main() { gl_Position = vec4(a_position, 0.0, 1.0); v_uv = a_position * 0.5 + 0.5; }`;
  const vertices = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  };
  const texture = (width, height, data) => {
    const id = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, id);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, data ? gl.RGBA8 : gl.RGBA16F, width, height, 0, gl.RGBA, data ? gl.UNSIGNED_BYTE : gl.HALF_FLOAT, data || null);
    return { id, width, height };
  };
  const pixels = new Uint8Array(64 * 36 * 4);
  for (let y = 0; y < 36; y++) for (let x = 0; x < 64; x++) {
    const offset = (y * 64 + x) * 4;
    const edge = Math.abs(x - y * 1.5) < 1.4;
    pixels.set(edge ? [12,12,12,255] : [x < 32 ? 180 : 35, y < 18 ? 60 : 170, 90, 255], offset);
  }
  const input = texture(64, 36, pixels);
  const results = [];
  for (const graph of fixtures) {
    canvas.width = graph.width; canvas.height = graph.height;
    const targets = new Map();
    const resources = [];
    for (let index = 0; index < graph.nodes.length; index++) {
      const node = graph.nodes[index];
      const vs = compile(gl.VERTEX_SHADER, vertex);
      let fs;
      try { fs = compile(gl.FRAGMENT_SHADER, node.shader); }
      catch (error) { throw new Error(`${graph.mode}/${index}: ${error.message}`); }
      const program = gl.createProgram();
      gl.attachShader(program, vs); gl.attachShader(program, fs);
      gl.bindAttribLocation(program, 0, 'a_position'); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`${graph.mode}/${index}: ${gl.getProgramInfoLog(program)}`);
      gl.deleteShader(vs); gl.deleteShader(fs); resources.push(program);
      let target = null;
      if (node.slot >= 0) {
        target = targets.get(node.slot);
        if (!target) {
          const tex = texture(node.width, node.height);
          const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex.id, 0);
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Float framebuffer incomplete');
          target = { ...tex, fbo }; targets.set(node.slot, target);
        }
        if (target.width !== node.width || target.height !== node.height) throw new Error('Slot dimension mismatch');
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
      gl.viewport(0, 0, node.width, node.height); gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, vertices); gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      Object.entries(node.inputs).forEach(([name, source], unit) => {
        const tex = source < 0 ? input : targets.get(graph.nodes[source].slot);
        if (!tex || tex === target) throw new Error('Missing input or read/write feedback');
        gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex.id);
        const sampler = gl.getUniformLocation(program, `u_${name}`);
        if (sampler !== null) gl.uniform1i(sampler, unit);
        const size = gl.getUniformLocation(program, `u_${name}_size`);
        if (size !== null) gl.uniform2f(size, tex.width, tex.height);
      });
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      const error = gl.getError();
      if (error !== gl.NO_ERROR) throw new Error(`${graph.mode}/${index}: GL error ${error}`);
    }
    const output = new Uint8Array(graph.width * graph.height * 4);
    gl.readPixels(0, 0, graph.width, graph.height, gl.RGBA, gl.UNSIGNED_BYTE, output);
    let sum = 0, min = 255, max = 0;
    for (let i = 0; i < output.length; i += 4) {
      if (output[i + 3] !== 255) throw new Error(`${graph.mode}: transparent/unrendered pixel`);
      sum += output[i] + output[i+1] + output[i+2];
      min = Math.min(min, output[i]); max = Math.max(max, output[i]);
    }
    const mean = sum / (graph.width * graph.height * 3);
    if (mean < 10 || mean > 245 || max - min < 30) throw new Error(`${graph.mode}: blank or corrupted output`);
    results.push({ mode: graph.mode, passes: graph.nodes.length, size: `${graph.width}x${graph.height}`, mean: +mean.toFixed(2), result: 'pass' });
    for (const id of resources) gl.deleteProgram(id);
    for (const target of targets.values()) { gl.deleteFramebuffer(target.fbo); gl.deleteTexture(target.id); }
  }
  return results;
}
const data = JSON.stringify(fixtures).replace(/</g, '\\u003c');
fs.writeFileSync(harness, `<!doctype html><meta charset="utf-8"><pre id="result">pending</pre><script>
try { document.getElementById('result').textContent = JSON.stringify({ok:true,results:(${run.toString()})(${data})}); }
catch (error) { document.getElementById('result').textContent = JSON.stringify({ok:false,error:String(error.stack || error)}); }
</script>`);
const result = spawnSync(chrome, ['--headless=new', '--no-first-run', '--disable-background-networking', '--disable-component-update',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-watchdog',
  `--user-data-dir=${path.join(buildDir, 'chrome-profile')}`, '--dump-dom', `file:///${harness.replaceAll('\\', '/')}`],
  { encoding: 'utf8', timeout: 60000, maxBuffer: 10 * 1024 * 1024, windowsHide: true });
if (result.error) throw result.error;
const match = result.stdout.match(/<pre id="result">([^<]+)<\/pre>/);
if (!match) throw new Error(`No GPU result: ${result.stderr.slice(-1500)}`);
const report = JSON.parse(match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&gt;', '>').replaceAll('&lt;', '<'));
fs.writeFileSync(path.join(buildDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
