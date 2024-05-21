precision mediump float;

uniform sampler2D texture;
uniform float minBright;

varying vec2 vTextureCoord;

void main() {
  vec3 texel = max((texture2D(texture, vTextureCoord) - minBright).rgb, vec3(0.0));
  gl_FragColor = vec4(texel, 1.0);
}
