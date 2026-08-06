import {
  AbsoluteFill,
  Easing,
  Img,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion'
import type { DashboardTourScene } from './scenes'

type DashboardSceneProps = {
  scene: DashboardTourScene
  index: number
  total: number
  durationInFrames: number
}

export const DashboardScene = ({ scene, index, total, durationInFrames }: DashboardSceneProps) => {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, 10, durationInFrames - 10, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const scale = interpolate(frame, [0, durationInFrames], [1.014, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const labelOffset = interpolate(frame, [0, 18], [26, 0], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const progress = ((index + 1) / total) * 100

  return (
    <AbsoluteFill
      style={{
        opacity,
        color: '#f7f9ff',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 28,
          top: 90,
          width: 1496,
          height: 935,
          borderRadius: 28,
          background: '#0c1522',
          boxShadow: '0 38px 100px rgba(0, 0, 0, 0.48)',
          overflow: 'hidden',
          transform: `scale(${scale})`,
          transformOrigin: '50% 50%',
        }}
      >
        <Img
          src={staticFile(`dashboard-tour/${scene.file}`)}
          style={{ width: 1496, height: 935, objectFit: 'cover' }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            border: '1px solid rgba(132, 164, 214, 0.24)',
            borderRadius: 28,
            pointerEvents: 'none',
          }}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          left: 1582,
          right: 62,
          top: 204,
          transform: `translateX(${labelOffset}px)`,
        }}
      >
        <Interactive.Div
          name={`${scene.name} page number`}
          style={{ color: '#5674a8', fontSize: 76, fontWeight: 760, letterSpacing: '-0.06em' }}
        >
          {String(index + 1).padStart(2, '0')}
        </Interactive.Div>
        <div style={{ width: 42, height: 4, margin: '30px 0 36px', borderRadius: 20, background: '#4f86ff' }} />
        <Interactive.Div
          name={`${scene.name} title`}
          style={{ fontSize: 50, fontWeight: 740, letterSpacing: '-0.045em', lineHeight: 1.04 }}
        >
          {scene.name}
        </Interactive.Div>
        <Interactive.Div
          name={`${scene.name} description`}
          style={{ marginTop: 20, color: '#94a2b8', fontSize: 23, lineHeight: 1.42 }}
        >
          {scene.description}
        </Interactive.Div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 1582,
          right: 62,
          bottom: 78,
        }}
      >
        <div style={{ marginBottom: 14, color: '#65738a', fontSize: 15, fontWeight: 700, letterSpacing: '0.16em' }}>
          LANCEE / WORKSPACE TOUR
        </div>
        <div style={{ height: 3, overflow: 'hidden', borderRadius: 10, background: '#1b2637' }}>
          <div style={{ width: `${progress}%`, height: '100%', borderRadius: 10, background: '#4f86ff' }} />
        </div>
      </div>
    </AbsoluteFill>
  )
}
