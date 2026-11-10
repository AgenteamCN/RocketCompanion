/**
 * HemisphereSkyShader.ts
 * GLSL fragment evaluator for Category 1: Upper-Hemisphere Equirectangular Skyboxes
 * (e.g. Woods_Sky_D, CHN_Sky3, Farmstead_Sky_T7, ForbiddenTemple_Beach_Clouds_01).
 *
 * Maps the entire texture V range [0.02, 0.995] onto the upper hemisphere (elev >= 0),
 * and synthesizes the lower hemisphere via multi-tap azimuthal horizon-ring sampling
 * blended smoothly into the deep ground color.
 */

export const HEMISPHERE_SKY_GLSL = /* glsl */ `
  vec3 evaluateHemisphereSky(vec3 dir, float elev, float bw, float u) {
    // 1. Sample the horizon ring (v near bottom of upper hemisphere texture) for seamless ground continuity
    vec3 horizonRingCol;
    if (uUseTexture > 0.5) {
      float vHorizon = 0.035;
      vec3 h0 = texture2D(uSkyMap, vec2(u, vHorizon)).rgb;
      vec3 h1 = texture2D(uSkyMap, vec2(u + 0.035, vHorizon)).rgb;
      vec3 h2 = texture2D(uSkyMap, vec2(u - 0.035, vHorizon)).rgb;
      vec3 h3 = texture2D(uSkyMap, vec2(u + 0.08, vHorizon)).rgb;
      vec3 h4 = texture2D(uSkyMap, vec2(u - 0.08, vHorizon)).rgb;
      horizonRingCol = (h0 * 0.36 + (h1 + h2) * 0.22 + (h3 + h4) * 0.10) * uExposure;
      horizonRingCol = applySkyContrastBalance(horizonRingCol, uContrastBalance, uContrastMidpoint);
    } else {
      horizonRingCol = uHorizonColor;
    }

    // 2. Upper hemisphere sky color (Texture vs Procedural)
    vec3 skyCol;
    if (uUseTexture > 0.5) {
      float clampedY = clamp(max(0.0, elev), 0.0, 1.0);
      float theta = asin(clampedY);
      float rawV = clamp(theta * INV_HALF_PI, 0.001, 0.999);
      float stretchedV = pow(rawV, 1.0 / max(0.2, uUpperVerticalStretch));
      // Avoid v < 0.015 where the bottom row of the texture has a bright horizon border artifact
      float v = clamp(stretchedV, 0.02, 0.995);
      vec4 texel = texture2D(uSkyMap, vec2(u, v));
      skyCol = texel.rgb * uExposure;
      skyCol = applySkyContrastBalance(skyCol, uContrastBalance, uContrastMidpoint);
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

    // 4. Lower hemisphere (elev < 0): extend smoothed horizon ring downward into deep ground color
    vec3 lowerCol = uGroundColor;
    if (uGroundSampleHorizon > 0.5) {
      float downDist = max(0.0, -elev);
      float gradRange = max(0.01, uGroundGradientRange);
      float downFactor = smoothstep(0.0, gradRange, downDist);
      vec3 topGroundCol = mix(uGroundColor, horizonEdgeTarget, uGroundHorizonStrength);
      lowerCol = mix(topGroundCol, uGroundColor, downFactor);
    }

    lowerCol = applyAuxiliaryLowerOobNormal(lowerCol, horizonRingCol, dir, elev, bw);

    // 5. Smooth transition from lower ground hemisphere (elev < 0) to upper sky hemisphere (elev > 0)
    float skyMask = smoothstep(-bw, bw, elev);
    return mix(lowerCol, upperWithHaze, skyMask);
  }
`;
