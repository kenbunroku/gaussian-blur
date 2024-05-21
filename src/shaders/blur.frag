precision mediump float;

uniform sampler2D texture;

#define SAMPLE_COUNT 15
uniform vec2 offsetsH[SAMPLE_COUNT];
uniform float weightsH[SAMPLE_COUNT];
uniform vec2 offsetsV[SAMPLE_COUNT];
uniform float weightsV[SAMPLE_COUNT];

uniform bool isVertical;

varying vec2 vTextureCoord;

void main() {
  vec4 color = vec4(0.0);
  if(isVertical) {
    for(int i = 0; i < SAMPLE_COUNT; i++) {
      color += texture2D(texture, vTextureCoord + offsetsV[i]) * weightsV[i];
    }
  } else {
    for(int i = 0; i < SAMPLE_COUNT; i++) {
      color += texture2D(texture, vTextureCoord + offsetsH[i]) * weightsH[i];
    }
  }
  gl_FragColor = vec4(color.rgb, 1.0);
}
