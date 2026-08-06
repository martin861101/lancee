import { AbsoluteFill, Sequence } from 'remotion'
import { DashboardIntro, DashboardOutro } from './DashboardIntro'
import { DashboardScene } from './DashboardScene'
import { dashboardTourScenes } from './scenes'

export const DASHBOARD_TOUR_FPS = 30
export const DASHBOARD_TOUR_INTRO_FRAMES = 72
export const DASHBOARD_TOUR_SCENE_FRAMES = 64
export const DASHBOARD_TOUR_SCENE_INTERVAL = 54
export const DASHBOARD_TOUR_OUTRO_FRAMES = 78
export const DASHBOARD_TOUR_FIRST_SCENE = 60
export const DASHBOARD_TOUR_OUTRO_START =
  DASHBOARD_TOUR_FIRST_SCENE +
  (dashboardTourScenes.length - 1) * DASHBOARD_TOUR_SCENE_INTERVAL +
  DASHBOARD_TOUR_SCENE_FRAMES -
  12
export const DASHBOARD_TOUR_DURATION = DASHBOARD_TOUR_OUTRO_START + DASHBOARD_TOUR_OUTRO_FRAMES

export const DashboardTour = () => (
  <AbsoluteFill
    style={{
      overflow: 'hidden',
      background:
        'radial-gradient(circle at 82% 18%, rgba(54, 102, 211, 0.15), transparent 30%), radial-gradient(circle at 16% 88%, rgba(95, 60, 181, 0.12), transparent 34%), #070d16',
    }}
  >
    <Sequence durationInFrames={DASHBOARD_TOUR_INTRO_FRAMES} premountFor={DASHBOARD_TOUR_FPS}>
      <DashboardIntro durationInFrames={DASHBOARD_TOUR_INTRO_FRAMES} />
    </Sequence>

    {dashboardTourScenes.map((scene, index) => (
      <Sequence
        key={scene.file}
        from={DASHBOARD_TOUR_FIRST_SCENE + index * DASHBOARD_TOUR_SCENE_INTERVAL}
        durationInFrames={DASHBOARD_TOUR_SCENE_FRAMES}
        premountFor={DASHBOARD_TOUR_FPS}
      >
        <DashboardScene
          scene={scene}
          index={index}
          total={dashboardTourScenes.length}
          durationInFrames={DASHBOARD_TOUR_SCENE_FRAMES}
        />
      </Sequence>
    ))}

    <Sequence
      from={DASHBOARD_TOUR_OUTRO_START}
      durationInFrames={DASHBOARD_TOUR_OUTRO_FRAMES}
      premountFor={DASHBOARD_TOUR_FPS}
    >
      <DashboardOutro durationInFrames={DASHBOARD_TOUR_OUTRO_FRAMES} />
    </Sequence>
  </AbsoluteFill>
)
