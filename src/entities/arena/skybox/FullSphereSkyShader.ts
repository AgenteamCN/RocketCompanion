/**
 * FullSphereSkyShader.ts
 * GLSL fragment evaluator for Category 2: Full-Sphere (360°×180°) Equirectangular Skyboxes
 * (e.g. Screaming Brain Studios CC0 Cloudy Skyboxes 01–25 in WebP).
 *
 * In these textures:
 * - Upper hemisphere (sky & clouds) occupies v in [0.5, 1.0].
 * - Horizon line sits at v = 0.5.
 * - Lower hemisphere (water/ground cloud reflection & dark nadir fade) occupies v in [0.0, 0.5].
 *
 * Features dedicated lower-hemisphere controls:
 * - `uFullSphereLowerVOffset`: vertical V-offset crop on the lower hemisphere texture (skips bright horizon water reflections).
 * - `uFullSphereLowerVerticalStretch`: stretches or compresses the lower hemisphere reflection band.
 * - `uFullSphereLowerCutoffElev` & `uFullSphereLowerFadeRange`: smoothly cuts off the lower texture at a configurable downward angle and fades into solid deep ground color (`uGroundColor`), making the bottom feel grounded.
 * - `uFullSphereLowerDimming`: dims the lower hemisphere texture relative to the upper sky.
 * - `uFullSphereLowerSampleHorizon`: optional override to use the classic azimuthal horizon-ring gradient instead of the lower half of the texture.
 */

export const FULL_SPHERE_SKY_GLSL = /* glsl */ `
  vec3 evaluateFullSphereSky(vec3 dir, float elev, float bw, float u) {
    // 1. Sample horizon ring at v = 0.515 (just above equator seam) for haze/normal/fallback continuity
    vec3 horizonRingCol;
    if (uUseTexture > 0.5) {
      float vEquator = 0.515;
      vec3 h0 = texture2D(uSkyMap, vec2(u, vEquator)).rgb;
      vec3 h1 = texture2D(uSkyMap, vec2(u + 0.035, vEquator)).rgb;
      vec3 h2 = texture2D(uSkyMap, vec2(u - 0.035, vEquator)).rgb;
      vec3 h3 = texture2D(uSkyMap, vec2(u + 0.08, vEquator)).rgb;
      vec3 h4 = texture2D(uSkyMap, vec2(u - 0.08, vEquator)).rgb;
      horizonRingCol = (h0 * 0.36 + (h1 + h2) * 0.22 + (h3 + h4) * 0.10) * uExposure;
      horizonRingCol = applySkyContrastBalance(horizonRingCol, uContrastBalance, uContrastMidpoint);
    } else {
      horizonRingCol = uHorizonColor;
    }

    // 2. Upper hemisphere sky color (maps elev in [0, 1] -> v in [0.5, 1.0])
    vec3 skyCol;
    if (uUseTexture > 0.5) {
      float clampedUpY = clamp(max(0.0, elev), 0.0, 1.0);
      float thetaUp = asin(clampedUpY);
      float normUp = clamp(thetaUp * INV_HALF_PI, 0.0, 1.0);
      float stretchedUp = pow(normUp, 1.0 / max(0.2, uUpperVerticalStretch));
      float vUp = clamp(0.5 + 0.498 * stretchedUp, 0.501, 0.998);
      vec3 texUp = texture2D(uSkyMap, vec2(u, vUp)).rgb * uExposure;
      skyCol = applySkyContrastBalance(texUp, uContrastBalance, uContrastMidpoint);
    } else {
      float h = max(0.0, elev);
      skyCol = mix(uHorizonColor, uMiddleColor, smoothstep(0.0, 0.22, h));
      skyCol = mix(skyCol, uZenithColor, pow(smoothstep(0.10, 0.88, h), 0.65));
    }

    skyCol = applyAuxiliaryUpperSkyLayers(skyCol, dir, elev, bw);

    // 3. Apply horizon haze band near elev == 0
    float hazeFactor = (1.0 - smoothstep(0.0, bw * 2.5, abs(elev))) * uHorizonHazeStrength;
    vec3 upperWithHaze = mix(skyCol, uHorizonColor, clamp(hazeFactor, 0.0, 1.0));
    vec3 horizonEdgeTarget = mix(horizonRingCol, uHorizonColor, clamp(uHorizonHazeStrength, 0.0, 1.0));

    // 4. Lower hemisphere (elev < 0):
    // Either sample the lower half of the 360x180 panorama (with V-offset crop & smooth ground cutoff)
    // OR use the horizon-ring gradient mode if toggled by the user.
    vec3 lowerCol = uGroundColor;
    if (uUseTexture > 0.5 && uFullSphereLowerSampleHorizon < 0.5) {
      float downDist = clamp(max(0.0, -elev), 0.0, 1.0);
      float thetaDown = asin(downDist); // [0, PI/2]
      float normDown = clamp(thetaDown * INV_HALF_PI, 0.0, 1.0); // 0 at horizon, 1 at nadir
      float stretchedDown = pow(normDown, 1.0 / max(0.2, uFullSphereLowerVerticalStretch));

      // Apply vertical V-offset crop to skip bright water/mirror reflection near v=0.5 if desired
      float vOffset = clamp(uFullSphereLowerVOffset, 0.0, 0.48);
      float vDown = clamp(0.5 - vOffset - stretchedDown * (0.498 - vOffset), 0.002, 0.499);
      vec3 texDown = texture2D(uSkyMap, vec2(u, vDown)).rgb * uExposure;
      texDown = applySkyContrastBalance(texDown, uContrastBalance, uContrastMidpoint);

      // Apply lower-hemisphere dimming so ground reflections don't overpower the arena floor
      texDown *= clamp(1.0 - uFullSphereLowerDimming, 0.0, 1.5);

      // Blend horizon haze at the top of the lower hemisphere
      texDown = mix(texDown, uHorizonColor, clamp(hazeFactor, 0.0, 1.0));

      // Smoothly cut off and fade the lower hemisphere texture into solid deep ground color (uGroundColor)
      float cutoffStart = clamp(uFullSphereLowerCutoffElev, 0.0, 1.0);
      float fadeSpan = max(0.01, uFullSphereLowerFadeRange);
      float groundFade = smoothstep(cutoffStart, cutoffStart + fadeSpan, downDist);
      lowerCol = mix(texDown, uGroundColor, groundFade);
    } else if (uGroundSampleHorizon > 0.5) {
      float downDist = max(0.0, -elev);
      float gradRange = max(0.01, uGroundGradientRange);
      float downFactor = smoothstep(0.0, gradRange, downDist);
      vec3 topGroundCol = mix(uGroundColor, horizonEdgeTarget, uGroundHorizonStrength);
      lowerCol = mix(topGroundCol, uGroundColor, downFactor);
    }

    lowerCol = applyAuxiliaryLowerOobNormal(lowerCol, horizonRingCol, dir, elev, bw);

    // 5. Smooth transition across the horizon band [-bw, +bw]
    float skyMask = smoothstep(-bw, bw, elev);
    return mix(lowerCol, upperWithHaze, skyMask);
  }
`;
