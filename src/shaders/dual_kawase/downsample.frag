// https://www.shadertoy.com/view/3td3W8
precision highp float;

uniform vec2 uResolution;
uniform float uOffset;
uniform sampler2D texture;

varying vec2 vTextureCoord;

void main() {
  vec2 uv = vec2(gl_FragCoord.xy / (uResolution.xy / 2.0));
  vec2 halfpixel = 0.5 / (uResolution.xy / 2.0);
  float offset = uOffset;

  vec4 sum = texture2D(texture, uv) * 4.0;
  sum += texture2D(texture, uv - halfpixel.xy * offset);
  sum += texture2D(texture, uv + halfpixel.xy * offset);
  sum += texture2D(texture, uv + vec2(halfpixel.x, -halfpixel.y) * offset);
  sum += texture2D(texture, uv - vec2(halfpixel.x, -halfpixel.y) * offset);

  gl_FragColor = sum / 8.0;
}
