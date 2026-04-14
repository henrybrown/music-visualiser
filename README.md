# Music Visualiser

Real-time audio frequency visualiser built with React, the Web Audio API, and a custom spring-physics animation engine.

## Architecture

### Rendering Pipeline

The animation engine combines `requestAnimationFrame` with the Web Animations API to get custom spring physics with GPU-composited output.

Each animated element gets a WAAPI animation created via `element.animate()`, which is immediately paused. These paused animations act as GPU-backed interpolation targets -- the engine never plays them. A single RAF loop runs the spring physics simulation and writes each spring's current progress into the corresponding animation's `currentTime`:

```
audio FFT data
  -> updateEntityContext()       // new audio level for bar N
    -> spring.setTarget(level)   // retarget the spring
      -> RAF tick                // physics: force, velocity, position
        -> animation.currentTime // scrub the paused animation
          -> GPU composites      // browser renders on compositor thread
```

This avoids per-frame `element.style.transform` writes, which force layout and paint on the main thread. With 128 bars animating simultaneously, the difference matters.

The RAF loop is self-managing -- it starts when any spring target changes and stops when all springs settle.

### Spring Physics

Each animated element is driven by a damped harmonic oscillator:

```
springForce  = -stiffness * (current - target)
dampingForce = -damping * velocity
acceleration = (springForce + dampingForce) / mass
```

Three presets control the feel:

| Preset   | Stiffness | Damping | Mass | Character                        |
|----------|-----------|---------|------|----------------------------------|
| Extreme  | 30        | 3       | 1    | Heavy overshoot, slow settle     |
| Bouncy   | 40        | 5       | 1    | Visible bounce, moderate settle  |
| Stiff    | 120       | 20      | 1    | Quick response, minimal overshoot|

A cushion zone increases damping when a spring drops below a configurable threshold, preventing bars from bouncing through zero:

```typescript
if (cushion && current < cushion.threshold) {
  damping = damping * cushion.dampingMultiplier;
}
```

### Entity-Context Model

The engine uses a generic entity-context system. It has no knowledge of audio.

Each entity (e.g. `bar-0`) owns one or more elements (the bar div, its cap div). Each element declares spring animation definitions with a `trackContext` function that derives a target value from the entity's context:

```typescript
const animations: Record<string, SpringAnimationDefinition> = {
  updateHeight: {
    keyframes: [{ transform: "scaleY(0)" }, { transform: "scaleY(10)" }],
    springConfig: SPRING_CONFIGS[springMode],
    options: { duration: 1000 },
    trackContext: (context) => (context.audioLevel as number) ?? 0.1,
    clampRange: { min: 0 },
    cushion: { threshold: 0.1, dampingMultiplier: 4.0 },
  },
};
```

When `updateEntityContext("bar-0", { audioLevel: 0.7 })` is called, the engine runs each spring's `trackContext` against the new context to derive a target value, retargets the spring, and restarts the RAF loop if idle.

### Audio Pipeline

```
Audio element
  -> MediaElementSourceNode
    -> BiquadFilterNode x 5 (parametric EQ)
      -> AnalyserNode (FFT)
        -> getByteFrequencyData()
```

The audio-visualizer controller runs two concurrent RAF loops:

- **Audio loop** -- samples FFT data at a configurable rate (100ms-2000ms), maps frequency bins to bars using logarithmic spacing, applies a proportional change threshold to filter noise, and pushes audio levels into entity contexts.
- **Glow loop** -- samples at ~60fps for the glow effect layer, bypassing the threshold for immediate visual response.

## Project Structure

```
src/
  animations/                          # Spring animation engine
    spring-animation.ts                # Spring physics (createSpring, configs)
    web-animation-engine.ts            # Engine core (register, context, RAF loop)
    animation-types.ts                 # SpringAnimationDefinition type
    use-animation-registration.ts      # React hook for element registration
    animation-engine-context.tsx       # React context provider
    index.ts

  music-visualiser/                    # Visualiser application
    audio-analysis.ts                  # Web Audio API / FFT / EQ
    audio-visualizer-controller.ts     # Audio-to-engine bridge (RAF loops)
    use-audio-visualizer.ts            # React hook wrapping the controller
    visualizer-display.tsx             # Bar components with spring definitions
    equalizer-components.tsx           # Draggable EQ overlay (SVG)
    control-panel.tsx                  # Settings drawer
    music-visualiser-demo.tsx          # Main app component
```

## Getting Started

```bash
npm install
npm run dev
```

Requires a `.wav` file at `public/sample_audio_for_animation_demo.wav`. Royalty-free music from [Pixabay](https://pixabay.com/music/) works.

## Controls

- **Space** -- play / pause
- **32 / 64 / 128** -- bar density (subdivides frequency bands)
- **EQ overlay** -- drag control nodes to shape frequency response
- **Eye toggle** -- show/hide EQ curve
- **Settings gear** -- spring mode, audio refresh rate, change threshold, smoothing, dB range, color theme

## Technology

- React 18 + TypeScript
- Vite
- Web Audio API (AnalyserNode, BiquadFilterNode)
- Web Animations API (paused animations as GPU interpolation targets)
- requestAnimationFrame (spring physics simulation)
- CSS Modules
