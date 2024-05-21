precision mediump float;

uniform sampler2D texture;
varying vec2 vTextureCoord;

void main() {
  vec4 texel = texture2D(texture, vTextureCoord);
  gl_FragColor = texel;
}
