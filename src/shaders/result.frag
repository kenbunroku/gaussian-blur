precision mediump float;

uniform sampler2D originalTexture;
uniform sampler2D bloomTexture;
uniform float toneScale;

varying vec2 vTextureCoord;

void main() {
  vec4 texel = vec4(0.0);
  vec2 flippedCoord = vec2(vTextureCoord.x, 1.0 - vTextureCoord.y);
  texel = texture2D(originalTexture, flippedCoord) * toneScale;
  texel += texture2D(bloomTexture, vTextureCoord);
  gl_FragColor = texel;
}
