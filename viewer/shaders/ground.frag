uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uLineColor;
uniform float uScale;
uniform float uFadeStart;
uniform float uFadeEnd;

varying vec3 vWorldPos;

// Anti-aliased checkerboard
float checker(vec2 p) {
  vec2 q = floor(p);
  return mod(q.x + q.y, 2.0);
}

// Smooth grid lines on top of checker
float gridLines(vec2 p, float thickness) {
  vec2 f = abs(fract(p) - 0.5);
  float d = min(f.x, f.y);
  // AA via fwidth
  float fw = fwidth(d);
  return 1.0 - smoothstep(thickness - fw, thickness + fw, d);
}

void main() {
  vec2 coord = vWorldPos.xz / uScale;

  // Checkerboard
  float c = checker(coord);
  vec3 baseColor = mix(uColor1, uColor2, c);

  // Subtle grid lines at tile boundaries
  float lines = gridLines(coord, 0.02);
  baseColor = mix(baseColor, uLineColor, lines * 0.5);

  // Distance fade (radial from origin)
  float dist = length(vWorldPos.xz);
  float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);

  // Additional depth-based fade using camera distance heuristic
  float heightFade = 1.0 - smoothstep(0.0, 2.0, abs(vWorldPos.y - 0.0));

  float alpha = fade * 0.88;

  gl_FragColor = vec4(baseColor, alpha);
}
