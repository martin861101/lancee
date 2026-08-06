import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from 'remotion'

const fade = (frame: number, durationInFrames: number) =>
  interpolate(frame, [0, 18, durationInFrames - 18, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

export const DashboardIntro = ({ durationInFrames }: { durationInFrames: number }) => {
  const frame = useCurrentFrame()
  const opacity = fade(frame, durationInFrames)
  const rise = interpolate(frame, [0, 24], [34, 0], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        opacity,
        color: '#f7f9ff',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: 720,
          height: 720,
          borderRadius: 999,
          background: 'rgba(64, 119, 255, 0.2)',
          filter: 'blur(150px)',
          transform: `translateY(${rise * 0.3}px)`,
        }}
      />
      <div style={{ position: 'relative', textAlign: 'center', transform: `translateY(${rise}px)` }}>
        <Interactive.Div
          name="Intro eyebrow"
          style={{
            marginBottom: 28,
            color: '#73a4ff',
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
          }}
        >
          Lancee workspace
        </Interactive.Div>
        <Interactive.Div
          name="Intro title"
          style={{ fontSize: 92, fontWeight: 760, letterSpacing: '-0.055em', lineHeight: 0.98 }}
        >
          One place to run your work.
        </Interactive.Div>
        <Interactive.Div
          name="Intro subtitle"
          style={{ marginTop: 30, color: '#97a4b9', fontSize: 27, letterSpacing: '-0.01em' }}
        >
          A tour of every page in the dashboard
        </Interactive.Div>
      </div>
    </AbsoluteFill>
  )
}

export const DashboardOutro = ({ durationInFrames }: { durationInFrames: number }) => {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, 16, durationInFrames - 14, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const scale = interpolate(frame, [0, durationInFrames], [0.97, 1.015], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        opacity,
        color: '#f7f9ff',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: 620,
          height: 620,
          borderRadius: 999,
          background: 'rgba(117, 74, 255, 0.18)',
          filter: 'blur(150px)',
        }}
      />
      <div style={{ position: 'relative', textAlign: 'center', transform: `scale(${scale})` }}>
        <Interactive.Div
          name="Outro title"
          style={{ fontSize: 86, fontWeight: 760, letterSpacing: '-0.055em', lineHeight: 1 }}
        >
          Ready for what’s next.
        </Interactive.Div>
        <Interactive.Div
          name="Outro subtitle"
          style={{ marginTop: 28, color: '#97a4b9', fontSize: 28 }}
        >
          Lancee — the workspace for independent work
        </Interactive.Div>
      </div>
    </AbsoluteFill>
  )
}
