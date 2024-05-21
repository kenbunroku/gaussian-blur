import { plane } from "../utils/geometry";
import {
  createShader,
  createRenderTarget,
  deleteRenderTarget,
  useShader,
  unuseShader,
  createTexture,
  loadImage,
} from "../utils/webglUtils";
import { WebGLMath } from "../utils/math";
import { WebGLOrbitCamera } from "../utils/camera";
import { Pane } from "tweakpane";

// shaders
import normalVert from "../shaders/normal.vert";
import normalFrag from "../shaders/normal.frag";
import brightFrag from "../shaders/bright.frag";
import blurVert from "../shaders/blur.vert";
import blurFrag from "../shaders/blur.frag";
import resultVert from "../shaders/result.vert";
import resultFrag from "../shaders/result.frag";
import downsampleFrag from "../shaders/dual_kawase/downsample.frag";
import upsampleFrag from "../shaders/dual_kawase/upsample.frag";

let gl, canvas, camera;
const m4 = WebGLMath.Mat4;
const v3 = WebGLMath.Vec3;
const timeInfo = {
  start: 0,
  prev: 0,
  delta: 0,
  elapsed: 0,
};

const renderSpec = {
  width: 0,
  height: 0,
  aspect: 1,
  array: new Float32Array(3),
  halfWidth: 0,
  halfHeight: 0,
  halfArray: new Float32Array(3),
  quarterWidth: 0,
  quarterHeight: 0,
  quarterArray: new Float32Array(3),
};
renderSpec.setSize = function (w, h) {
  console.log(w);
  renderSpec.width = w;
  renderSpec.height = h;
  renderSpec.aspect = renderSpec.width / renderSpec.height;
  renderSpec.array[0] = renderSpec.width;
  renderSpec.array[1] = renderSpec.height;
  renderSpec.array[2] = renderSpec.aspect;

  renderSpec.halfWidth = Math.floor(w / 2);
  renderSpec.halfHeight = Math.floor(h / 2);
  renderSpec.halfArray[0] = renderSpec.halfWidth;
  renderSpec.halfArray[1] = renderSpec.halfHeight;
  renderSpec.halfArray[2] = renderSpec.halfWidth / renderSpec.halfHeight;

  renderSpec.quarterWidth = Math.floor(w / 4);
  renderSpec.quarterHeight = Math.floor(h / 4);
  renderSpec.quarterArray[0] = renderSpec.quarterWidth;
  renderSpec.quarterArray[1] = renderSpec.quarterHeight;
  renderSpec.quarterArray[2] =
    renderSpec.quarterWidth / renderSpec.quarterHeight;
};

const cameraOption = {
  distance: 4.0,
  min: 1.0,
  max: 10.0,
  move: 2.0,
};
let mvp;

const params = {
  blur: "Kawase",
  toneScale: 0.5,
  minBright: 0.2,
  offset: 3.0,
};

const SAMPLE_COUNT = 15;
let offsetH = new Array(SAMPLE_COUNT);
let weightH = new Array(SAMPLE_COUNT);
let offsetV = new Array(SAMPLE_COUNT);
let weightV = new Array(SAMPLE_COUNT);

let sceneStandBy = false;

const normal = {};
const bright = {};
const blur = {};
const dualKawaseBlur = {};
const result = {};
async function createScene() {
  const img = await loadImage("sakura.jpg");

  normal.texture = createTexture(gl, img);
  const geom = plane(2.0, 2.0, [1.0, 0.0, 0.0, 1.0]);
  normal.program = createShader(
    gl,
    normalVert,
    normalFrag,
    ["texture", "mvpMatrix"],
    ["position", "textureCoord"]
  );
  // Create and bind position buffer
  normal.positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normal.positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(geom.position),
    gl.STATIC_DRAW
  );
  // Create and bind texture coordinate buffer
  normal.coordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normal.coordBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(geom.texCoord),
    gl.STATIC_DRAW
  );

  /* Bright effect */
  bright.program = createShader(
    gl,
    resultVert,
    brightFrag,
    ["texture", "minBright"],
    ["position", "textureCoord"]
  );
  bright.positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bright.positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(geom.position),
    gl.STATIC_DRAW
  );
  bright.coordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bright.coordBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(geom.texCoord),
    gl.STATIC_DRAW
  );

  /* Kawase Blur effect */
  blur.program = createShader(
    gl,
    blurVert,
    blurFrag,
    [
      "texture",
      "uResolution",
      "isVertical",
      "offsetsH",
      "weightsH",
      "offsetsV",
      "weightsV",
    ],
    ["position", "textureCoord"]
  );
  blur.positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, blur.positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(geom.position),
    gl.STATIC_DRAW
  );
  blur.coordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, blur.coordBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(geom.texCoord),
    gl.STATIC_DRAW
  );

  /* Dual Kawase Blur */
  // downsample
  dualKawaseBlur.downsampleProgram = createShader(
    gl,
    blurVert,
    downsampleFrag,
    ["texture", "uResolution", "uOffset"],
    ["position", "textureCoord"]
  );
  dualKawaseBlur.downsamplePositionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, dualKawaseBlur.downsamplePositionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(geom.position),
    gl.STATIC_DRAW
  );
  dualKawaseBlur.downsampleCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, dualKawaseBlur.downsampleCoordBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(geom.texCoord),
    gl.STATIC_DRAW
  );

  // upsample
  dualKawaseBlur.upsampleProgram = createShader(
    gl,
    blurVert,
    upsampleFrag,
    ["texture", "uResolution", "uOffset"],
    ["position", "textureCoord"]
  );
  dualKawaseBlur.upsamplePositionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, dualKawaseBlur.upsamplePositionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(geom.position),
    gl.STATIC_DRAW
  );
  dualKawaseBlur.upsampleCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, dualKawaseBlur.upsampleCoordBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(geom.texCoord),
    gl.STATIC_DRAW
  );

  /* result */
  result.program = createShader(
    gl,
    resultVert,
    resultFrag,
    ["originalTexture", "bloomTexture", "toneScale"],
    ["position", "textureCoord"]
  );
  result.positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, result.positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(geom.position),
    gl.STATIC_DRAW
  );
  result.coordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, result.coordBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(geom.texCoord),
    gl.STATIC_DRAW
  );

  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  // Sampling
  {
    const offsetTmp = new Array(SAMPLE_COUNT);
    let total = 0;

    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const p = (i - (SAMPLE_COUNT - 1) * 0.5) * 0.0006;
      offsetTmp[i] = p;
      weightH[i] = Math.exp((-p * p) / 2) / Math.sqrt(Math.PI * 2);
      total += weightH[i];
    }
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      weightH[i] /= total;
    }
    const tmp = [];
    for (const key in offsetTmp) {
      tmp.push(offsetTmp[key], 0);
    }
    offsetH = new Float32Array(tmp);
  }

  {
    const offsetTmp = new Array(SAMPLE_COUNT);
    let total = 0;

    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const p = (i - (SAMPLE_COUNT - 1) * 0.5) * 0.0006;
      offsetTmp[i] = p;
      weightV[i] = Math.exp((-p * p) / 2) / Math.sqrt(Math.PI * 2);
      total += weightV[i];
    }
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      weightV[i] /= total;
    }
    const tmp = [];
    for (const key in offsetTmp) {
      tmp.push(0, offsetTmp[key]);
    }
    offsetV = new Float32Array(tmp);
  }
}

function initScene() {}

function renderKawaseBlur() {
  // vertical blur
  gl.bindFramebuffer(gl.FRAMEBUFFER, renderSpec.wFullRT1.frameBuffer);
  useShader(gl, blur.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, blur.positionBuffer);
  gl.vertexAttribPointer(
    blur.program.attributes.position,
    3,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.enableVertexAttribArray(blur.program.attributes.position);
  gl.bindBuffer(gl.ARRAY_BUFFER, blur.coordBuffer);
  gl.vertexAttribPointer(
    blur.program.attributes.textureCoord,
    2,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.enableVertexAttribArray(blur.program.attributes.textureCoord);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, renderSpec.wFullRT0.texture);
  gl.uniform1i(blur.program.uniforms.texture, 0);
  gl.uniform1i(blur.program.uniforms.isVertical, true);
  gl.uniform2fv(blur.program.uniforms.offsetsV, offsetV);
  gl.uniform1fv(blur.program.uniforms.weightsV, weightV);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  unuseShader(gl, blur.program);

  // horizontal blur
  gl.bindFramebuffer(gl.FRAMEBUFFER, renderSpec.wFullRT0.frameBuffer);
  useShader(gl, blur.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, blur.positionBuffer);
  gl.vertexAttribPointer(
    blur.program.attributes.position,
    3,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.enableVertexAttribArray(blur.program.attributes.position);
  gl.bindBuffer(gl.ARRAY_BUFFER, blur.coordBuffer);
  gl.vertexAttribPointer(
    blur.program.attributes.textureCoord,
    2,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.enableVertexAttribArray(blur.program.attributes.textureCoord);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, renderSpec.wFullRT1.texture);
  gl.uniform1i(blur.program.uniforms.texture, 0);
  gl.uniform1i(blur.program.uniforms.isVertical, false);
  gl.uniform2fv(blur.program.uniforms.offsetsH, offsetH);
  gl.uniform1fv(blur.program.uniforms.weightsH, weightH);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  unuseShader(gl, blur.program);
}

function renderDualKawaseBlur() {
  // downsample
  gl.bindFramebuffer(gl.FRAMEBUFFER, renderSpec.wHalfRT.frameBuffer);
  useShader(gl, dualKawaseBlur.downsampleProgram);
  gl.bindBuffer(gl.ARRAY_BUFFER, dualKawaseBlur.downsamplePositionBuffer);
  gl.vertexAttribPointer(
    dualKawaseBlur.downsampleProgram.attributes.position,
    3,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.enableVertexAttribArray(
    dualKawaseBlur.downsampleProgram.attributes.position
  );
  gl.bindBuffer(gl.ARRAY_BUFFER, dualKawaseBlur.downsampleCoordBuffer);
  gl.vertexAttribPointer(
    dualKawaseBlur.downsampleProgram.attributes.textureCoord,
    2,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.enableVertexAttribArray(
    dualKawaseBlur.downsampleProgram.attributes.textureCoord
  );
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, renderSpec.wFullRT0.texture);
  gl.uniform1i(dualKawaseBlur.downsampleProgram.uniforms.texture, 0);
  gl.uniform2fv(dualKawaseBlur.downsampleProgram.uniforms.uResolution, [
    renderSpec.array[0],
    renderSpec.array[1],
  ]);
  gl.uniform1f(
    dualKawaseBlur.downsampleProgram.uniforms.uOffset,
    params.offset
  );
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // downsample again
  gl.bindFramebuffer(gl.FRAMEBUFFER, renderSpec.wQuarterRT.frameBuffer);
  gl.bindBuffer(gl.ARRAY_BUFFER, dualKawaseBlur.downsamplePositionBuffer);
  gl.vertexAttribPointer(
    dualKawaseBlur.downsampleProgram.attributes.position,
    3,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.enableVertexAttribArray(
    dualKawaseBlur.downsampleProgram.attributes.position
  );
  gl.bindBuffer(gl.ARRAY_BUFFER, dualKawaseBlur.downsampleCoordBuffer);
  gl.vertexAttribPointer(
    dualKawaseBlur.downsampleProgram.attributes.textureCoord,
    2,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.enableVertexAttribArray(
    dualKawaseBlur.downsampleProgram.attributes.textureCoord
  );
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, renderSpec.wHalfRT.texture);
  gl.uniform1i(dualKawaseBlur.downsampleProgram.uniforms.texture, 0);
  gl.uniform2fv(dualKawaseBlur.downsampleProgram.uniforms.uResolution, [
    renderSpec.halfArray[0],
    renderSpec.halfArray[1],
  ]);
  gl.uniform1f(
    dualKawaseBlur.downsampleProgram.uniforms.uOffset,
    params.offset
  );
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  unuseShader(gl, dualKawaseBlur.downsampleProgram);

  // upsample
  gl.bindFramebuffer(gl.FRAMEBUFFER, renderSpec.wHalfRT.frameBuffer);
  useShader(gl, dualKawaseBlur.upsampleProgram);
  gl.bindBuffer(gl.ARRAY_BUFFER, dualKawaseBlur.upsamplePositionBuffer);
  gl.vertexAttribPointer(
    dualKawaseBlur.upsampleProgram.attributes.position,
    3,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.enableVertexAttribArray(
    dualKawaseBlur.upsampleProgram.attributes.position
  );
  gl.bindBuffer(gl.ARRAY_BUFFER, dualKawaseBlur.upsampleCoordBuffer);
  gl.vertexAttribPointer(
    dualKawaseBlur.upsampleProgram.attributes.textureCoord,
    2,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.enableVertexAttribArray(
    dualKawaseBlur.upsampleProgram.attributes.textureCoord
  );
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, renderSpec.wQuarterRT.texture);
  gl.uniform1i(dualKawaseBlur.upsampleProgram.uniforms.texture, 0);
  gl.uniform2fv(dualKawaseBlur.upsampleProgram.uniforms.uResolution, [
    renderSpec.quarterArray[0],
    renderSpec.quarterArray[1],
  ]);
  gl.uniform1f(dualKawaseBlur.upsampleProgram.uniforms.uOffset, params.offset);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // upsample again
  gl.bindFramebuffer(gl.FRAMEBUFFER, renderSpec.wFullRT0.frameBuffer);
  gl.bindBuffer(gl.ARRAY_BUFFER, dualKawaseBlur.upsamplePositionBuffer);
  gl.vertexAttribPointer(
    dualKawaseBlur.upsampleProgram.attributes.position,
    3,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.enableVertexAttribArray(
    dualKawaseBlur.upsampleProgram.attributes.position
  );
  gl.bindBuffer(gl.ARRAY_BUFFER, dualKawaseBlur.upsampleCoordBuffer);
  gl.vertexAttribPointer(
    dualKawaseBlur.upsampleProgram.attributes.textureCoord,
    2,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.enableVertexAttribArray(
    dualKawaseBlur.upsampleProgram.attributes.textureCoord
  );
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, renderSpec.wHalfRT.texture);
  gl.uniform1i(dualKawaseBlur.upsampleProgram.uniforms.texture, 0);
  gl.uniform2fv(dualKawaseBlur.upsampleProgram.uniforms.uResolution, [
    renderSpec.halfArray[0],
    renderSpec.halfArray[1],
  ]);
  gl.uniform1f(dualKawaseBlur.upsampleProgram.uniforms.uOffset, params.offset);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  unuseShader(gl, dualKawaseBlur.upsampleProgram);
}

function renderScene() {
  const v = camera.update();
  const fovy = 45;
  const aspect = renderSpec.aspect;
  const near = 0.1;
  const far = 10.0;
  const p = m4.perspective(fovy, aspect, near, far);
  const vp = m4.multiply(p, v);
  const m = m4.identity();
  mvp = m4.multiply(m, vp);

  // normal
  gl.bindFramebuffer(gl.FRAMEBUFFER, renderSpec.mainRT.frameBuffer);
  gl.viewport(0, 0, renderSpec.width, renderSpec.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  useShader(gl, normal.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, normal.positionBuffer);
  gl.vertexAttribPointer(
    normal.program.attributes.position,
    3,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.enableVertexAttribArray(normal.program.attributes.position);
  gl.bindBuffer(gl.ARRAY_BUFFER, normal.coordBuffer);
  gl.vertexAttribPointer(
    normal.program.attributes.textureCoord,
    2,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.enableVertexAttribArray(normal.program.attributes.textureCoord);
  gl.uniformMatrix4fv(normal.program.uniforms.mvpMatrix, false, mvp);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, normal.texture);
  gl.uniform1i(normal.program.uniforms.texture, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  unuseShader(gl, normal.program);

  // bright
  gl.bindFramebuffer(gl.FRAMEBUFFER, renderSpec.wFullRT0.frameBuffer);
  useShader(gl, bright.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, bright.positionBuffer);
  gl.vertexAttribPointer(
    bright.program.attributes.position,
    3,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.enableVertexAttribArray(bright.program.attributes.position);
  gl.bindBuffer(gl.ARRAY_BUFFER, bright.coordBuffer);
  gl.vertexAttribPointer(
    bright.program.attributes.textureCoord,
    2,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.enableVertexAttribArray(bright.program.attributes.textureCoord);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, renderSpec.mainRT.texture);
  gl.uniform1i(bright.program.uniforms.texture, 0);
  gl.uniform1f(bright.program.uniforms.minBright, params.minBright);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  unuseShader(gl, bright.program);

  // blur
  if (params.blur === "Kawase") {
    renderKawaseBlur();
  } else {
    renderDualKawaseBlur();
  }

  // display
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, renderSpec.width, renderSpec.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  useShader(gl, result.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, result.positionBuffer);
  gl.vertexAttribPointer(
    result.program.attributes.position,
    3,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.enableVertexAttribArray(result.program.attributes.position);
  gl.bindBuffer(gl.ARRAY_BUFFER, result.coordBuffer);
  gl.vertexAttribPointer(
    result.program.attributes.textureCoord,
    2,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.enableVertexAttribArray(result.program.attributes.textureCoord);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, renderSpec.mainRT.texture);
  gl.uniform1i(result.program.uniforms.originalTexture, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, renderSpec.wFullRT0.texture);
  gl.uniform1i(result.program.uniforms.bloomTexture, 1);
  gl.uniform1f(result.program.uniforms.toneScale, params.toneScale);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  unuseShader(gl, result.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
}
function render() {
  renderScene();
}

let animating = true;
function animate() {
  const curdate = new Date();
  timeInfo.elapsed = (curdate - timeInfo.start) / 1000.0;
  timeInfo.delta = (curdate - timeInfo.prev) / 1000.0;
  timeInfo.prev = curdate;

  if (animating) requestAnimationFrame(animate);
  render();
}

function setViewports() {
  renderSpec.setSize(gl.canvas.width, gl.canvas.height);

  gl.clearColor(0.02, 0.0, 0.05, 1.0);
  gl.clearDepth(1.0);
  gl.viewport(0, 0, renderSpec.width, renderSpec.height);

  const rtfunc = function (rtname, rtw, rth) {
    const rt = renderSpec[rtname];
    // if (rt) deleteRenderTarget(rt);
    renderSpec[rtname] = createRenderTarget(gl, rtw, rth);
  };
  rtfunc("mainRT", renderSpec.width, renderSpec.height);
  rtfunc("wFullRT0", renderSpec.width, renderSpec.height);
  rtfunc("wFullRT1", renderSpec.width, renderSpec.height);
  rtfunc("wHalfRT", renderSpec.halfWidth, renderSpec.halfHeight);
  rtfunc("wQuarterRT", renderSpec.quarterWidth, renderSpec.quarterHeight);
}

function onResize(e) {
  makeCanvasFullScreen(document.getElementById("webgl"));
  setViewports();

  console.log(renderSpec);

  if (sceneStandBy) {
    render();
  }
}

function makeCanvasFullScreen(canvas) {
  const b = document.body;
  const d = document.documentElement;
  // const fullw = Math.max(
  //   b.clientWidth,
  //   b.scrollWidth,
  //   d.scrollWidth,
  //   d.clientWidth
  // );
  // const fullh = Math.max(
  //   b.clientHeight,
  //   b.scrollHeight,
  //   d.scrollHeight,
  //   d.clientHeight
  // );
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener("load", async function (e) {
  canvas = document.getElementById("webgl");
  camera = new WebGLOrbitCamera(canvas, cameraOption);
  try {
    makeCanvasFullScreen(canvas);
    gl = canvas.getContext("experimental-webgl");
  } catch (e) {
    alert("WebGL not supported." + e);
    console.error(e);
    return;
  }

  window.addEventListener("resize", onResize);

  setViewports();
  await createScene();
  createDebugPane();
  initScene();

  timeInfo.start = new Date();
  timeInfo.prev = timeInfo.start;
  animate();
});

function createDebugPane() {
  const pane = new Pane();
  pane.addBinding(params, "blur", {
    options: {
      Kawase: "Kawase",
      DualKawase: "Dual Kawase",
    },
  });
  pane.addBinding(params, "toneScale", { min: 0.0, max: 1.0, step: 0.01 });
  pane.addBinding(params, "minBright", { min: 0.0, max: 1.0, step: 0.01 });
  const dualKawase = pane.addFolder({
    title: "Only for Dual Kawase Blur",
  });
  dualKawase.addBinding(params, "offset", { min: 0.0, max: 10.0, step: 0.1 });
}
